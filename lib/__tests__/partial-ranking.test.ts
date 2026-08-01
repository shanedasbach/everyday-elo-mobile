/**
 * Tests for partial ranking persistence (save & exit flow for offline/template rankings).
 */

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import {
  savePartialRanking,
  getPartialRanking,
  clearPartialRanking,
  hasPartialRanking,
  listPartialRankingIds,
  prunePartialRankings,
  reconcilePartialRankings,
  PARTIAL_RANKING_TTL_MS,
  PartialRankedItem,
} from '../partial-ranking';

const mockStore = SecureStore as jest.Mocked<typeof SecureStore>;

const sampleItems: PartialRankedItem[] = [
  { itemId: 'a', name: 'Alpha', rating: 1520, comparisons: 2 },
  { itemId: 'b', name: 'Bravo', rating: 1480, comparisons: 2 },
];

/** Fixed clock so TTL boundaries are exact rather than wall-clock dependent. */
const NOW = Date.parse('2026-07-01T00:00:00.000Z');
const FRESH = new Date(NOW - 1000).toISOString();
const INDEX_KEY = 'partial_ranking_index';

/**
 * In-memory stand-in for SecureStore. Index consistency is a property of what
 * ends up stored, so the tests assert against real contents rather than call
 * sequences.
 */
let store: Map<string, string>;

function seed(
  listId: string,
  overrides: Partial<{ comparisons: number; items: unknown; updatedAt: string }> = {}
): void {
  store.set(
    `partial_ranking_${listId}`,
    JSON.stringify({
      version: 1,
      listId,
      comparisons: overrides.comparisons ?? 2,
      items: overrides.items ?? sampleItems,
      updatedAt: overrides.updatedAt ?? FRESH,
    })
  );
}

function storedIndex(): string[] | undefined {
  const raw = store.get(INDEX_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
}

beforeEach(() => {
  jest.clearAllMocks();
  store = new Map();
  mockStore.setItemAsync.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  mockStore.getItemAsync.mockImplementation(async (key: string) => store.get(key) ?? null);
  mockStore.deleteItemAsync.mockImplementation(async (key: string) => {
    store.delete(key);
  });
});

describe('partial-ranking', () => {
  describe('savePartialRanking', () => {
    it('writes a versioned payload under a namespaced key', async () => {
      await savePartialRanking('movies', sampleItems, 4);

      const value = store.get('partial_ranking_movies');
      expect(value).toBeDefined();
      const parsed = JSON.parse(value!);
      expect(parsed.version).toBe(1);
      expect(parsed.listId).toBe('movies');
      expect(parsed.comparisons).toBe(4);
      expect(parsed.items).toEqual(sampleItems);
      expect(typeof parsed.updatedAt).toBe('string');
      expect(Number.isNaN(Date.parse(parsed.updatedAt))).toBe(false);
    });

    it('records the list in the index', async () => {
      await savePartialRanking('movies', sampleItems, 4);
      expect(storedIndex()).toEqual(['movies']);
      expect(await listPartialRankingIds()).toEqual(['movies']);
    });

    it('does not duplicate an index entry when the same list is saved again', async () => {
      await savePartialRanking('movies', sampleItems, 4);
      await savePartialRanking('movies', sampleItems, 5);
      await savePartialRanking('pizza', sampleItems, 1);

      expect(storedIndex()).toEqual(['movies', 'pizza']);
    });

    it('ignores a corrupt index rather than throwing', async () => {
      store.set(INDEX_KEY, 'not-json');
      await savePartialRanking('movies', sampleItems, 4);
      expect(storedIndex()).toEqual(['movies']);
    });

    it('drops non-string entries when reading the index', async () => {
      store.set(INDEX_KEY, JSON.stringify(['movies', 42, null]));
      await savePartialRanking('pizza', sampleItems, 1);
      expect(storedIndex()).toEqual(['movies', 'pizza']);
    });

    it('ignores an index that is not an array', async () => {
      store.set(INDEX_KEY, JSON.stringify({ movies: true }));
      await savePartialRanking('movies', sampleItems, 4);
      expect(storedIndex()).toEqual(['movies']);
    });
  });

  describe('getPartialRanking', () => {
    it('returns null when nothing is stored', async () => {
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns the parsed payload when present and valid', async () => {
      seed('movies', { comparisons: 3 });

      const result = await getPartialRanking('movies', NOW);
      expect(result).not.toBeNull();
      expect(result?.comparisons).toBe(3);
      expect(result?.items).toEqual(sampleItems);
    });

    it('returns null when the payload is not valid JSON', async () => {
      store.set('partial_ranking_movies', 'not-json');
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the stored version is not supported', async () => {
      store.set(
        'partial_ranking_movies',
        JSON.stringify({ version: 99, listId: 'movies', comparisons: 1, items: [] })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the stored listId does not match', async () => {
      store.set(
        'partial_ranking_movies',
        JSON.stringify({ version: 1, listId: 'pizza', comparisons: 1, items: [] })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when items field is malformed', async () => {
      seed('movies', { comparisons: 1, items: 'nope' });
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the root payload is not an object', async () => {
      store.set('partial_ranking_movies', '"just a string"');
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the root payload is JSON null', async () => {
      store.set('partial_ranking_movies', 'null');
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when comparisons is not a number', async () => {
      seed('movies', { comparisons: 'lots' as unknown as number });
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when comparisons is negative', async () => {
      seed('movies', { comparisons: -1 });
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when comparisons is not finite', async () => {
      // JSON can't express NaN/Infinity literals, but very large exponents
      // (1e999) parse as Infinity — use that to hit the finite guard without
      // bypassing JSON.parse.
      store.set(
        'partial_ranking_movies',
        `{"version":1,"listId":"movies","comparisons":1e999,"items":[],"updatedAt":"${FRESH}"}`
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when updatedAt is missing', async () => {
      store.set(
        'partial_ranking_movies',
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: 2,
          items: sampleItems,
        })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when an item is missing required fields', async () => {
      seed('movies', { items: [{ itemId: 'a', name: 'Alpha', rating: 1520 }] });
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when an item has wrong field types', async () => {
      seed('movies', {
        items: [{ itemId: 'a', name: 'Alpha', rating: '1520', comparisons: 2 }],
      });
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when an item has negative comparisons', async () => {
      seed('movies', {
        items: [{ itemId: 'a', name: 'Alpha', rating: 1520, comparisons: -1 }],
      });
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when an item has a non-finite rating', async () => {
      // 1e999 parses to Infinity via valid JSON, exercising the finite guard.
      store.set(
        'partial_ranking_movies',
        `{"version":1,"listId":"movies","comparisons":2,"items":[{"itemId":"a","name":"Alpha","rating":1e999,"comparisons":2}],"updatedAt":"${FRESH}"}`
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when an item entry is null', async () => {
      seed('movies', { items: [null] });
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('treats a record older than the TTL as absent', async () => {
      seed('movies', {
        updatedAt: new Date(NOW - PARTIAL_RANKING_TTL_MS - 1).toISOString(),
      });
      expect(await getPartialRanking('movies', NOW)).toBeNull();
    });

    it('still returns a record sitting exactly on the TTL boundary', async () => {
      seed('movies', {
        updatedAt: new Date(NOW - PARTIAL_RANKING_TTL_MS).toISOString(),
      });
      expect(await getPartialRanking('movies', NOW)).not.toBeNull();
    });

    it('treats an unparseable updatedAt as expired', async () => {
      seed('movies', { updatedAt: 'sometime last year' });
      expect(await getPartialRanking('movies', NOW)).toBeNull();
    });
  });

  describe('clearPartialRanking', () => {
    it('deletes the stored entry for the given list', async () => {
      seed('movies');
      await clearPartialRanking('movies');
      expect(mockStore.deleteItemAsync).toHaveBeenCalledWith('partial_ranking_movies');
      expect(store.has('partial_ranking_movies')).toBe(false);
    });

    it('removes the list from the index', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      await savePartialRanking('pizza', sampleItems, 1);

      await clearPartialRanking('movies');

      expect(storedIndex()).toEqual(['pizza']);
    });

    it('drops the index key entirely once the last entry is cleared', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      await clearPartialRanking('movies');

      expect(store.has(INDEX_KEY)).toBe(false);
      expect(await listPartialRankingIds()).toEqual([]);
    });

    it('leaves the index untouched for a list it does not track', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      await clearPartialRanking('pizza');

      expect(storedIndex()).toEqual(['movies']);
    });
  });

  describe('hasPartialRanking', () => {
    it('is true when a saved ranking has at least one comparison', async () => {
      seed('movies', { comparisons: 2 });
      expect(await hasPartialRanking('movies', NOW)).toBe(true);
    });

    it('is false when a saved ranking has zero comparisons', async () => {
      seed('movies', { comparisons: 0 });
      expect(await hasPartialRanking('movies', NOW)).toBe(false);
    });

    it('is false when nothing is stored', async () => {
      expect(await hasPartialRanking('movies')).toBe(false);
    });

    it('is false for an expired ranking, so no stale resume is offered', async () => {
      seed('movies', {
        comparisons: 5,
        updatedAt: new Date(NOW - PARTIAL_RANKING_TTL_MS - 1).toISOString(),
      });
      expect(await hasPartialRanking('movies', NOW)).toBe(false);
    });
  });

  describe('listPartialRankingIds', () => {
    it('is empty when nothing has been written', async () => {
      expect(await listPartialRankingIds()).toEqual([]);
    });
  });

  describe('prunePartialRankings', () => {
    it('reclaims expired records and leaves fresh ones alone', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      await savePartialRanking('pizza', sampleItems, 3);
      seed('pizza', {
        updatedAt: new Date(NOW - PARTIAL_RANKING_TTL_MS - 1).toISOString(),
      });

      const pruned = await prunePartialRankings(NOW);

      expect(pruned).toEqual(['pizza']);
      expect(store.has('partial_ranking_pizza')).toBe(false);
      expect(store.has('partial_ranking_movies')).toBe(true);
      expect(storedIndex()).toEqual(['movies']);
    });

    it('reclaims a record whose payload no longer parses', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      store.set('partial_ranking_movies', 'not-json');

      expect(await prunePartialRankings(NOW)).toEqual(['movies']);
      expect(store.has('partial_ranking_movies')).toBe(false);
      expect(store.has(INDEX_KEY)).toBe(false);
    });

    it('drops an index entry whose payload has already vanished', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      store.delete('partial_ranking_movies');

      expect(await prunePartialRankings(NOW)).toEqual(['movies']);
      expect(await listPartialRankingIds()).toEqual([]);
    });

    it('rewrites nothing when every indexed record is still fresh', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      mockStore.setItemAsync.mockClear();

      expect(await prunePartialRankings(NOW)).toEqual([]);
      expect(mockStore.setItemAsync).not.toHaveBeenCalled();
      expect(storedIndex()).toEqual(['movies']);
    });

    it('is a no-op on an empty index', async () => {
      expect(await prunePartialRankings(NOW)).toEqual([]);
      expect(mockStore.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('falls back to the current clock when no timestamp is given', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      seed('movies', {
        updatedAt: new Date(Date.now() - PARTIAL_RANKING_TTL_MS - 1000).toISOString(),
      });

      expect(await prunePartialRankings()).toEqual(['movies']);
    });
  });

  describe('reconcilePartialRankings', () => {
    it('clears a record whose list no longer exists', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      await savePartialRanking('deleted-list', sampleItems, 3);

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.orphaned).toEqual(['deleted-list']);
      expect(store.has('partial_ranking_deleted-list')).toBe(false);
      expect(store.has('partial_ranking_movies')).toBe(true);
      expect(storedIndex()).toEqual(['movies']);
    });

    it('adopts a pre-index record so it becomes prunable', async () => {
      // Written by an older build: payload present, no index entry.
      seed('movies');

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.adopted).toEqual(['movies']);
      expect(storedIndex()).toEqual(['movies']);
      expect(store.has('partial_ranking_movies')).toBe(true);
    });

    it('adopts and then immediately prunes a pre-index record that is expired', async () => {
      seed('movies', {
        updatedAt: new Date(NOW - PARTIAL_RANKING_TTL_MS - 1).toISOString(),
      });

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.adopted).toEqual(['movies']);
      expect(result.expired).toEqual(['movies']);
      expect(store.has('partial_ranking_movies')).toBe(false);
      expect(await listPartialRankingIds()).toEqual([]);
    });

    it('does not adopt a known list that has no stored record', async () => {
      const result = await reconcilePartialRankings(['movies', 'pizza'], NOW);

      expect(result.adopted).toEqual([]);
      expect(await listPartialRankingIds()).toEqual([]);
    });

    it('keeps template records when template ids are included in the known set', async () => {
      await savePartialRanking('movies', sampleItems, 2);

      const result = await reconcilePartialRankings(['some-user-list', 'movies'], NOW);

      expect(result.orphaned).toEqual([]);
      expect(store.has('partial_ranking_movies')).toBe(true);
    });

    it('falls back to the current clock when no timestamp is given', async () => {
      await savePartialRanking('movies', sampleItems, 2);

      const result = await reconcilePartialRankings(['movies']);

      expect(result.expired).toEqual([]);
      expect(store.has('partial_ranking_movies')).toBe(true);
    });

    it('clears everything when the known set is empty', async () => {
      await savePartialRanking('movies', sampleItems, 2);

      const result = await reconcilePartialRankings([], NOW);

      expect(result.orphaned).toEqual(['movies']);
      expect(store.has('partial_ranking_movies')).toBe(false);
      expect(store.has(INDEX_KEY)).toBe(false);
    });
  });
});
