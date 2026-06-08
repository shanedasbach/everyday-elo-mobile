/**
 * Tests for partial ranking persistence (save & exit flow for offline/template rankings).
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
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
  PartialRankedItem,
} from '../partial-ranking';

const mockAsync = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockSecure = SecureStore as jest.Mocked<typeof SecureStore>;

const sampleItems: PartialRankedItem[] = [
  { itemId: 'a', name: 'Alpha', rating: 1520, comparisons: 2 },
  { itemId: 'b', name: 'Bravo', rating: 1480, comparisons: 2 },
];

/** Drive getPartialRanking by stubbing the AsyncStorage value it reads. */
function storedInAsync(value: string | null) {
  mockAsync.getItem.mockResolvedValue(value);
}

describe('partial-ranking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: empty stores. Individual tests override as needed.
    mockAsync.getItem.mockResolvedValue(null);
    mockAsync.setItem.mockResolvedValue(undefined);
    mockAsync.removeItem.mockResolvedValue(undefined);
    mockSecure.getItemAsync.mockResolvedValue(null);
    mockSecure.deleteItemAsync.mockResolvedValue(undefined);
  });

  describe('savePartialRanking', () => {
    it('writes a versioned payload to AsyncStorage under a namespaced key', async () => {
      await savePartialRanking('movies', sampleItems, 4);

      expect(mockAsync.setItem).toHaveBeenCalledTimes(1);
      expect(mockSecure.setItemAsync).not.toHaveBeenCalled();
      const [key, value] = mockAsync.setItem.mock.calls[0];
      expect(key).toBe('partial_ranking_movies');
      const parsed = JSON.parse(value);
      expect(parsed.version).toBe(1);
      expect(parsed.listId).toBe('movies');
      expect(parsed.comparisons).toBe(4);
      expect(parsed.items).toEqual(sampleItems);
      expect(typeof parsed.updatedAt).toBe('string');
      expect(Number.isNaN(Date.parse(parsed.updatedAt))).toBe(false);
    });
  });

  describe('getPartialRanking', () => {
    it('returns null when nothing is stored', async () => {
      const result = await getPartialRanking('movies');
      expect(result).toBeNull();
    });

    it('returns the parsed payload when present and valid', async () => {
      storedInAsync(
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: 3,
          items: sampleItems,
          updatedAt: '2026-04-10T00:00:00.000Z',
        })
      );

      const result = await getPartialRanking('movies');
      expect(result).not.toBeNull();
      expect(result?.comparisons).toBe(3);
      expect(result?.items).toEqual(sampleItems);
      // A valid AsyncStorage hit must not touch SecureStore.
      expect(mockSecure.getItemAsync).not.toHaveBeenCalled();
    });

    it('returns null when the payload is not valid JSON', async () => {
      storedInAsync('not-json');
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the stored version is not supported', async () => {
      storedInAsync(
        JSON.stringify({ version: 99, listId: 'movies', comparisons: 1, items: [] })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the stored listId does not match', async () => {
      storedInAsync(
        JSON.stringify({ version: 1, listId: 'pizza', comparisons: 1, items: [] })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when items field is malformed', async () => {
      storedInAsync(
        JSON.stringify({ version: 1, listId: 'movies', comparisons: 1, items: 'nope' })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the root payload is not an object', async () => {
      storedInAsync('"just a string"');
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the root payload is JSON null', async () => {
      storedInAsync('null');
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when comparisons is not a number', async () => {
      storedInAsync(
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: 'lots',
          items: sampleItems,
          updatedAt: '2026-04-10T00:00:00.000Z',
        })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when comparisons is negative', async () => {
      storedInAsync(
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: -1,
          items: sampleItems,
          updatedAt: '2026-04-10T00:00:00.000Z',
        })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when comparisons is not finite', async () => {
      // JSON can't express NaN/Infinity literals, but very large exponents
      // (1e999) parse as Infinity — use that to hit the finite guard without
      // bypassing JSON.parse.
      storedInAsync(
        '{"version":1,"listId":"movies","comparisons":1e999,"items":[],"updatedAt":"2026-04-10T00:00:00.000Z"}'
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when updatedAt is missing', async () => {
      storedInAsync(
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
      storedInAsync(
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: 2,
          items: [{ itemId: 'a', name: 'Alpha', rating: 1520 }],
          updatedAt: '2026-04-10T00:00:00.000Z',
        })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when an item has wrong field types', async () => {
      storedInAsync(
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: 2,
          items: [{ itemId: 'a', name: 'Alpha', rating: '1520', comparisons: 2 }],
          updatedAt: '2026-04-10T00:00:00.000Z',
        })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when an item has negative comparisons', async () => {
      storedInAsync(
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: 2,
          items: [{ itemId: 'a', name: 'Alpha', rating: 1520, comparisons: -1 }],
          updatedAt: '2026-04-10T00:00:00.000Z',
        })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when an item has a non-finite rating', async () => {
      // 1e999 parses to Infinity via valid JSON, exercising the finite guard.
      storedInAsync(
        '{"version":1,"listId":"movies","comparisons":2,"items":[{"itemId":"a","name":"Alpha","rating":1e999,"comparisons":2}],"updatedAt":"2026-04-10T00:00:00.000Z"}'
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when an item entry is null', async () => {
      storedInAsync(
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: 2,
          items: [null],
          updatedAt: '2026-04-10T00:00:00.000Z',
        })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('round-trips a large payload that would exceed SecureStore 2KB ceiling', async () => {
      // Simulate AsyncStorage so save and get share one backing store.
      const backing = new Map<string, string>();
      mockAsync.setItem.mockImplementation(async (k: string, v: string) => {
        backing.set(k, v);
      });
      mockAsync.getItem.mockImplementation(async (k: string) => backing.get(k) ?? null);

      const bigItems: PartialRankedItem[] = Array.from({ length: 200 }, (_, i) => ({
        itemId: `item-${i}`,
        name: `A fairly long contender name number ${i} with extra padding`,
        rating: 1500 + i,
        comparisons: i % 7,
      }));

      await savePartialRanking('huge-list', bigItems, 350);

      const stored = backing.get('partial_ranking_huge-list')!;
      expect(stored.length).toBeGreaterThan(2048); // exceeds SecureStore's limit

      const result = await getPartialRanking('huge-list');
      expect(result?.items).toHaveLength(200);
      expect(result?.items).toEqual(bigItems);
      expect(result?.comparisons).toBe(350);
    });
  });

  describe('legacy SecureStore migration', () => {
    const legacyPayload = JSON.stringify({
      version: 1,
      listId: 'movies',
      comparisons: 5,
      items: sampleItems,
      updatedAt: '2026-04-10T00:00:00.000Z',
    });

    it('reads through to a legacy SecureStore entry and migrates it forward', async () => {
      mockAsync.getItem.mockResolvedValue(null);
      mockSecure.getItemAsync.mockResolvedValue(legacyPayload);

      const result = await getPartialRanking('movies');

      expect(result?.comparisons).toBe(5);
      expect(result?.items).toEqual(sampleItems);
      // Migrated into AsyncStorage and deleted from SecureStore.
      expect(mockAsync.setItem).toHaveBeenCalledWith(
        'partial_ranking_movies',
        legacyPayload
      );
      expect(mockSecure.deleteItemAsync).toHaveBeenCalledWith('partial_ranking_movies');
    });

    it('ignores an invalid legacy SecureStore entry without migrating it', async () => {
      mockAsync.getItem.mockResolvedValue(null);
      mockSecure.getItemAsync.mockResolvedValue('garbage');

      expect(await getPartialRanking('movies')).toBeNull();
      expect(mockAsync.setItem).not.toHaveBeenCalled();
      expect(mockSecure.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('does not consult SecureStore when AsyncStorage already has a valid entry', async () => {
      storedInAsync(legacyPayload);
      mockSecure.getItemAsync.mockResolvedValue(legacyPayload);

      await getPartialRanking('movies');
      expect(mockSecure.getItemAsync).not.toHaveBeenCalled();
    });

    it('returns null when a legacy SecureStore read throws', async () => {
      mockAsync.getItem.mockResolvedValue(null);
      mockSecure.getItemAsync.mockRejectedValue(new Error('keystore unavailable'));

      expect(await getPartialRanking('movies')).toBeNull();
    });
  });

  describe('clearPartialRanking', () => {
    it('removes the entry from AsyncStorage and any legacy SecureStore copy', async () => {
      await clearPartialRanking('movies');
      expect(mockAsync.removeItem).toHaveBeenCalledWith('partial_ranking_movies');
      expect(mockSecure.deleteItemAsync).toHaveBeenCalledWith('partial_ranking_movies');
    });
  });

  describe('hasPartialRanking', () => {
    it('is true when a saved ranking has at least one comparison', async () => {
      storedInAsync(
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: 2,
          items: sampleItems,
          updatedAt: '2026-04-10T00:00:00.000Z',
        })
      );
      expect(await hasPartialRanking('movies')).toBe(true);
    });

    it('is false when a saved ranking has zero comparisons', async () => {
      storedInAsync(
        JSON.stringify({
          version: 1,
          listId: 'movies',
          comparisons: 0,
          items: sampleItems,
          updatedAt: '2026-04-10T00:00:00.000Z',
        })
      );
      expect(await hasPartialRanking('movies')).toBe(false);
    });

    it('is false when nothing is stored', async () => {
      expect(await hasPartialRanking('movies')).toBe(false);
    });
  });
});
