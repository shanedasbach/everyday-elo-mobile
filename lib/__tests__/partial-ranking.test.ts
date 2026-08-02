/**
 * Tests for partial ranking persistence (save & exit flow for offline/template rankings).
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
    getAllKeys: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
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

const mockAsync = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockSecure = SecureStore as jest.Mocked<typeof SecureStore>;

const sampleItems: PartialRankedItem[] = [
  { itemId: 'a', name: 'Alpha', rating: 1520, comparisons: 2 },
  { itemId: 'b', name: 'Bravo', rating: 1480, comparisons: 2 },
];

/** Fixed clock so TTL boundaries are exact rather than wall-clock dependent. */
const NOW = Date.parse('2026-07-01T00:00:00.000Z');
const FRESH = new Date(NOW - 1000).toISOString();
const STALE = new Date(NOW - PARTIAL_RANKING_TTL_MS - 1).toISOString();

const LEGACY_INDEX_KEY = 'partial_ranking_index';
const LEGACY_MIGRATED_KEY = 'partial_rankings:legacy_migrated';

/**
 * In-memory stands-in for both backends. Storage consistency is a property of
 * what ends up stored, so the tests assert against real contents rather than
 * call sequences.
 */
let asyncStore: Map<string, string>;
let secureStore: Map<string, string>;

type Overrides = Partial<{
  comparisons: number;
  items: unknown;
  updatedAt: string;
}>;

function payload(listId: string, overrides: Overrides = {}): string {
  return JSON.stringify({
    version: 1,
    listId,
    comparisons: overrides.comparisons ?? 2,
    items: overrides.items ?? sampleItems,
    updatedAt: overrides.updatedAt ?? FRESH,
  });
}

/** A record written by the current build. */
function seed(listId: string, overrides: Overrides = {}): void {
  asyncStore.set(`partial_ranking_${listId}`, payload(listId, overrides));
}

/** A record written by a SecureStore-era build. */
function seedLegacy(listId: string, overrides: Overrides = {}): void {
  secureStore.set(`partial_ranking_${listId}`, payload(listId, overrides));
}

beforeEach(() => {
  jest.clearAllMocks();
  asyncStore = new Map();
  secureStore = new Map();

  mockAsync.setItem.mockImplementation(async (key: string, value: string) => {
    asyncStore.set(key, value);
  });
  mockAsync.getItem.mockImplementation(async (key: string) => asyncStore.get(key) ?? null);
  mockAsync.removeItem.mockImplementation(async (key: string) => {
    asyncStore.delete(key);
  });
  mockAsync.getAllKeys.mockImplementation(async () => Array.from(asyncStore.keys()));

  mockSecure.setItemAsync.mockImplementation(async (key: string, value: string) => {
    secureStore.set(key, value);
  });
  mockSecure.getItemAsync.mockImplementation(async (key: string) => secureStore.get(key) ?? null);
  mockSecure.deleteItemAsync.mockImplementation(async (key: string) => {
    secureStore.delete(key);
  });
});

describe('partial-ranking', () => {
  describe('savePartialRanking', () => {
    it('writes a versioned payload to AsyncStorage under a namespaced key', async () => {
      await savePartialRanking('movies', sampleItems, 4);

      const value = asyncStore.get('partial_ranking_movies');
      expect(value).toBeDefined();
      const parsed = JSON.parse(value!);
      expect(parsed.version).toBe(1);
      expect(parsed.listId).toBe('movies');
      expect(parsed.comparisons).toBe(4);
      expect(parsed.items).toEqual(sampleItems);
      expect(typeof parsed.updatedAt).toBe('string');
      expect(Number.isNaN(Date.parse(parsed.updatedAt))).toBe(false);
    });

    it('never writes to SecureStore', async () => {
      await savePartialRanking('movies', sampleItems, 4);
      expect(mockSecure.setItemAsync).not.toHaveBeenCalled();
    });

    it('makes the list immediately enumerable without a separate index write', async () => {
      await savePartialRanking('movies', sampleItems, 4);
      expect(await listPartialRankingIds()).toEqual(['movies']);
      expect(mockAsync.setItem).toHaveBeenCalledTimes(1);
    });

    it('propagates a failed write so the caller can report it', async () => {
      mockAsync.setItem.mockRejectedValueOnce(new Error('quota'));
      await expect(savePartialRanking('movies', sampleItems, 4)).rejects.toThrow('quota');
    });

    it('stores a payload far larger than SecureStore accepts', async () => {
      // The regression this module's storage choice exists to fix: SecureStore
      // silently fails past ~2KB on Android.
      const many: PartialRankedItem[] = Array.from({ length: 200 }, (_, i) => ({
        itemId: `item-${i}`,
        name: `A reasonably long item name number ${i}`,
        rating: 1500 + i,
        comparisons: i,
      }));

      await savePartialRanking('big', many, 500);

      const value = asyncStore.get('partial_ranking_big')!;
      expect(value.length).toBeGreaterThan(2048);
      const result = await getPartialRanking('big', NOW);
      expect(result?.items).toEqual(many);
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
      asyncStore.set('partial_ranking_movies', 'not-json');
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the stored version is not supported', async () => {
      asyncStore.set(
        'partial_ranking_movies',
        JSON.stringify({ version: 99, listId: 'movies', comparisons: 1, items: [] })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the stored listId does not match', async () => {
      asyncStore.set(
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
      asyncStore.set('partial_ranking_movies', '"just a string"');
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the root payload is JSON null', async () => {
      asyncStore.set('partial_ranking_movies', 'null');
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
      asyncStore.set(
        'partial_ranking_movies',
        `{"version":1,"listId":"movies","comparisons":1e999,"items":[],"updatedAt":"${FRESH}"}`
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when updatedAt is missing', async () => {
      asyncStore.set(
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
      asyncStore.set(
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
      seed('movies', { updatedAt: STALE });
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

    it('returns null rather than rejecting when the read fails', async () => {
      // A transient storage error must not reject into the screen's load path.
      mockAsync.getItem.mockRejectedValue(new Error('storage unavailable'));
      expect(await getPartialRanking('movies', NOW)).toBeNull();
    });
  });

  describe('legacy SecureStore migration', () => {
    it('reads through to a legacy entry and carries it forward', async () => {
      seedLegacy('movies', { comparisons: 3 });

      const result = await getPartialRanking('movies', NOW);

      expect(result?.comparisons).toBe(3);
      expect(asyncStore.get('partial_ranking_movies')).toBeDefined();
      expect(secureStore.has('partial_ranking_movies')).toBe(false);
    });

    it('keeps the legacy copy when the forward write fails', async () => {
      // Blocking regression: deleting unconditionally destroyed the only
      // durable copy whenever AsyncStorage rejected.
      seedLegacy('movies', { comparisons: 3 });
      mockAsync.setItem.mockRejectedValue(new Error('quota'));

      const result = await getPartialRanking('movies', NOW);

      expect(result?.comparisons).toBe(3);
      expect(secureStore.has('partial_ranking_movies')).toBe(true);
      expect(mockSecure.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('prefers the AsyncStorage record and never touches the keychain', async () => {
      seed('movies', { comparisons: 7 });
      seedLegacy('movies', { comparisons: 1 });

      expect((await getPartialRanking('movies', NOW))?.comparisons).toBe(7);
      expect(mockSecure.getItemAsync).not.toHaveBeenCalled();
    });

    it('reclaims a legacy entry that cannot be parsed', async () => {
      secureStore.set('partial_ranking_movies', 'not-json');

      expect(await getPartialRanking('movies', NOW)).toBeNull();
      expect(secureStore.has('partial_ranking_movies')).toBe(false);
    });

    it('survives a keychain read error', async () => {
      mockSecure.getItemAsync.mockRejectedValue(new Error('keychain locked'));
      expect(await getPartialRanking('movies', NOW)).toBeNull();
    });

    it('tolerates a keychain delete error after a successful forward write', async () => {
      seedLegacy('movies');
      mockSecure.deleteItemAsync.mockRejectedValue(new Error('keychain locked'));

      expect(await getPartialRanking('movies', NOW)).not.toBeNull();
      expect(asyncStore.has('partial_ranking_movies')).toBe(true);
    });

    it('skips the keychain entirely once the sweep has completed', async () => {
      asyncStore.set(LEGACY_MIGRATED_KEY, '1');

      expect(await getPartialRanking('movies', NOW)).toBeNull();
      expect(mockSecure.getItemAsync).not.toHaveBeenCalled();
    });

    it('still falls back when the migration flag cannot be read', async () => {
      seedLegacy('movies');
      mockAsync.getItem.mockRejectedValue(new Error('storage unavailable'));

      expect(await getPartialRanking('movies', NOW)).not.toBeNull();
    });
  });

  describe('clearPartialRanking', () => {
    it('deletes the stored entry for the given list', async () => {
      seed('movies');
      await clearPartialRanking('movies');
      expect(mockAsync.removeItem).toHaveBeenCalledWith('partial_ranking_movies');
      expect(asyncStore.has('partial_ranking_movies')).toBe(false);
    });

    it('drops a lingering legacy entry so a cleared ranking cannot resurrect', async () => {
      seed('movies');
      seedLegacy('movies');

      await clearPartialRanking('movies');

      expect(secureStore.has('partial_ranking_movies')).toBe(false);
      expect(await getPartialRanking('movies', NOW)).toBeNull();
    });

    it('stops the list being enumerated', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      await savePartialRanking('pizza', sampleItems, 1);

      await clearPartialRanking('movies');

      expect(await listPartialRankingIds()).toEqual(['pizza']);
    });

    it('leaves other lists untouched', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      await clearPartialRanking('pizza');

      expect(await listPartialRankingIds()).toEqual(['movies']);
    });

    it('still clears AsyncStorage when the keychain delete fails', async () => {
      seed('movies');
      mockSecure.deleteItemAsync.mockRejectedValue(new Error('keychain locked'));

      await clearPartialRanking('movies');

      expect(asyncStore.has('partial_ranking_movies')).toBe(false);
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
      seed('movies', { comparisons: 5, updatedAt: STALE });
      expect(await hasPartialRanking('movies', NOW)).toBe(false);
    });
  });

  describe('listPartialRankingIds', () => {
    it('is empty when nothing has been written', async () => {
      expect(await listPartialRankingIds()).toEqual([]);
    });

    it('ignores keys outside the record namespace', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      asyncStore.set('supabase_session', 'unrelated');
      asyncStore.set(LEGACY_MIGRATED_KEY, '1');
      asyncStore.set('partial_ranking_', 'empty list id');

      expect(await listPartialRankingIds()).toEqual(['movies']);
    });

    it('is empty when the key scan fails', async () => {
      mockAsync.getAllKeys.mockRejectedValue(new Error('storage unavailable'));
      expect(await listPartialRankingIds()).toEqual([]);
    });
  });

  describe('prunePartialRankings', () => {
    it('reclaims expired records and leaves fresh ones alone', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      seed('pizza', { updatedAt: STALE });

      const pruned = await prunePartialRankings(NOW);

      expect(pruned).toEqual(['pizza']);
      expect(asyncStore.has('partial_ranking_pizza')).toBe(false);
      expect(asyncStore.has('partial_ranking_movies')).toBe(true);
      expect(await listPartialRankingIds()).toEqual(['movies']);
    });

    it('reclaims a record whose payload no longer parses', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      asyncStore.set('partial_ranking_movies', 'not-json');

      expect(await prunePartialRankings(NOW)).toEqual(['movies']);
      expect(asyncStore.has('partial_ranking_movies')).toBe(false);
    });

    it('reclaims a record that was never reachable through the old index', async () => {
      // The drift the removed index made possible: a payload present but
      // unindexed was permanently unprunable. A key scan cannot miss it.
      seed('written-by-an-older-build', { updatedAt: STALE });

      expect(await prunePartialRankings(NOW)).toEqual(['written-by-an-older-build']);
    });

    it('writes nothing when every record is still fresh', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      mockAsync.setItem.mockClear();
      mockAsync.removeItem.mockClear();

      expect(await prunePartialRankings(NOW)).toEqual([]);
      expect(mockAsync.setItem).not.toHaveBeenCalled();
      expect(mockAsync.removeItem).not.toHaveBeenCalled();
    });

    it('is a no-op on empty storage', async () => {
      expect(await prunePartialRankings(NOW)).toEqual([]);
      expect(mockAsync.removeItem).not.toHaveBeenCalled();
    });

    it('tolerates a failed delete', async () => {
      seed('movies', { updatedAt: STALE });
      mockAsync.removeItem.mockRejectedValue(new Error('storage unavailable'));

      expect(await prunePartialRankings(NOW)).toEqual(['movies']);
    });

    it('falls back to the current clock when no timestamp is given', async () => {
      seed('movies', {
        updatedAt: new Date(Date.now() - PARTIAL_RANKING_TTL_MS - 1000).toISOString(),
      });

      expect(await prunePartialRankings()).toEqual(['movies']);
    });

    it('does not read through to the keychain', async () => {
      seed('movies', { updatedAt: STALE });
      await prunePartialRankings(NOW);
      expect(mockSecure.getItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('reconcilePartialRankings', () => {
    it('clears a record whose list no longer exists', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      await savePartialRanking('deleted-list', sampleItems, 3);

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.orphaned).toEqual(['deleted-list']);
      expect(asyncStore.has('partial_ranking_deleted-list')).toBe(false);
      expect(asyncStore.has('partial_ranking_movies')).toBe(true);
      expect(await listPartialRankingIds()).toEqual(['movies']);
    });

    it('adopts a legacy record for a known list', async () => {
      seedLegacy('movies');

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.adopted).toEqual(['movies']);
      expect(asyncStore.has('partial_ranking_movies')).toBe(true);
      expect(secureStore.has('partial_ranking_movies')).toBe(false);
    });

    it('adopts a legacy record listed only in the legacy index', async () => {
      // A list deleted since the last launch: not in the known set, so the
      // known set alone would leave its keychain entry stranded forever.
      seedLegacy('deleted-list');
      secureStore.set(LEGACY_INDEX_KEY, JSON.stringify(['deleted-list']));

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.adopted).toEqual(['deleted-list']);
      expect(result.orphaned).toEqual(['deleted-list']);
      expect(secureStore.has('partial_ranking_deleted-list')).toBe(false);
      expect(asyncStore.has('partial_ranking_deleted-list')).toBe(false);
    });

    it('adopts and then immediately prunes an expired legacy record', async () => {
      seedLegacy('movies', { updatedAt: STALE });

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.adopted).toEqual(['movies']);
      expect(result.expired).toEqual(['movies']);
      expect(asyncStore.has('partial_ranking_movies')).toBe(false);
      expect(await listPartialRankingIds()).toEqual([]);
    });

    it('does not adopt a known list that has no stored record', async () => {
      const result = await reconcilePartialRankings(['movies', 'pizza'], NOW);

      expect(result.adopted).toEqual([]);
      expect(await listPartialRankingIds()).toEqual([]);
    });

    it('leaves an already-migrated record alone', async () => {
      await savePartialRanking('movies', sampleItems, 2);
      seedLegacy('movies', { comparisons: 99 });

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.adopted).toEqual([]);
      expect((await getPartialRanking('movies', NOW))?.comparisons).toBe(2);
    });

    it('retires the legacy index and stops sweeping once drained', async () => {
      seedLegacy('movies');
      secureStore.set(LEGACY_INDEX_KEY, JSON.stringify(['movies']));

      await reconcilePartialRankings(['movies'], NOW);

      expect(secureStore.has(LEGACY_INDEX_KEY)).toBe(false);
      expect(asyncStore.get(LEGACY_MIGRATED_KEY)).toBe('1');

      mockSecure.getItemAsync.mockClear();
      await reconcilePartialRankings(['movies'], NOW);
      expect(mockSecure.getItemAsync).not.toHaveBeenCalled();
    });

    it('keeps sweeping when a forward write failed, so nothing is stranded', async () => {
      seedLegacy('movies');
      mockAsync.setItem.mockRejectedValue(new Error('quota'));

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.adopted).toEqual(['movies']);
      expect(secureStore.has('partial_ranking_movies')).toBe(true);
      expect(asyncStore.has(LEGACY_MIGRATED_KEY)).toBe(false);
    });

    it('keeps sweeping when the legacy index cannot be read', async () => {
      mockSecure.getItemAsync.mockRejectedValue(new Error('keychain locked'));

      await reconcilePartialRankings(['movies'], NOW);

      expect(asyncStore.has(LEGACY_MIGRATED_KEY)).toBe(false);
    });

    it('ignores a corrupt legacy index', async () => {
      secureStore.set(LEGACY_INDEX_KEY, 'not-json');
      seedLegacy('movies');

      const result = await reconcilePartialRankings(['movies'], NOW);

      expect(result.adopted).toEqual(['movies']);
    });

    it('ignores a legacy index that is not an array', async () => {
      secureStore.set(LEGACY_INDEX_KEY, JSON.stringify({ movies: true }));

      const result = await reconcilePartialRankings([], NOW);

      expect(result.adopted).toEqual([]);
      expect(asyncStore.get(LEGACY_MIGRATED_KEY)).toBe('1');
    });

    it('drops non-string entries from the legacy index', async () => {
      secureStore.set(LEGACY_INDEX_KEY, JSON.stringify(['movies', 42, null]));
      seedLegacy('movies');

      const result = await reconcilePartialRankings([], NOW);

      expect(result.adopted).toEqual(['movies']);
    });

    it('keeps template records when template ids are in the known set', async () => {
      await savePartialRanking('movies', sampleItems, 2);

      const result = await reconcilePartialRankings(['some-user-list', 'movies'], NOW);

      expect(result.orphaned).toEqual([]);
      expect(asyncStore.has('partial_ranking_movies')).toBe(true);
    });

    it('falls back to the current clock when no timestamp is given', async () => {
      await savePartialRanking('movies', sampleItems, 2);

      const result = await reconcilePartialRankings(['movies']);

      expect(result.expired).toEqual([]);
      expect(asyncStore.has('partial_ranking_movies')).toBe(true);
    });

    it('clears everything when the known set is empty', async () => {
      await savePartialRanking('movies', sampleItems, 2);

      const result = await reconcilePartialRankings([], NOW);

      expect(result.orphaned).toEqual(['movies']);
      expect(asyncStore.has('partial_ranking_movies')).toBe(false);
    });

    it('tolerates a failed write of the completion flag', async () => {
      mockAsync.setItem.mockRejectedValue(new Error('quota'));

      await expect(reconcilePartialRankings([], NOW)).resolves.toEqual({
        adopted: [],
        orphaned: [],
        expired: [],
      });
    });
  });
});
