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
  PartialRankedItem,
} from '../partial-ranking';

const mockStore = SecureStore as jest.Mocked<typeof SecureStore>;

const sampleItems: PartialRankedItem[] = [
  { itemId: 'a', name: 'Alpha', rating: 1520, comparisons: 2 },
  { itemId: 'b', name: 'Bravo', rating: 1480, comparisons: 2 },
];

describe('partial-ranking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('savePartialRanking', () => {
    it('writes a versioned payload under a namespaced key', async () => {
      mockStore.setItemAsync.mockResolvedValue(undefined);

      await savePartialRanking('movies', sampleItems, 4);

      expect(mockStore.setItemAsync).toHaveBeenCalledTimes(1);
      const [key, value] = mockStore.setItemAsync.mock.calls[0];
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
      mockStore.getItemAsync.mockResolvedValue(null);
      const result = await getPartialRanking('movies');
      expect(result).toBeNull();
    });

    it('returns the parsed payload when present and valid', async () => {
      mockStore.getItemAsync.mockResolvedValue(
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
    });

    it('returns null when the payload is not valid JSON', async () => {
      mockStore.getItemAsync.mockResolvedValue('not-json');
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the stored version is not supported', async () => {
      mockStore.getItemAsync.mockResolvedValue(
        JSON.stringify({ version: 99, listId: 'movies', comparisons: 1, items: [] })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when the stored listId does not match', async () => {
      mockStore.getItemAsync.mockResolvedValue(
        JSON.stringify({ version: 1, listId: 'pizza', comparisons: 1, items: [] })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });

    it('returns null when items field is malformed', async () => {
      mockStore.getItemAsync.mockResolvedValue(
        JSON.stringify({ version: 1, listId: 'movies', comparisons: 1, items: 'nope' })
      );
      expect(await getPartialRanking('movies')).toBeNull();
    });
  });

  describe('clearPartialRanking', () => {
    it('deletes the stored entry for the given list', async () => {
      mockStore.deleteItemAsync.mockResolvedValue(undefined);
      await clearPartialRanking('movies');
      expect(mockStore.deleteItemAsync).toHaveBeenCalledWith('partial_ranking_movies');
    });
  });

  describe('hasPartialRanking', () => {
    it('is true when a saved ranking has at least one comparison', async () => {
      mockStore.getItemAsync.mockResolvedValue(
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
      mockStore.getItemAsync.mockResolvedValue(
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
      mockStore.getItemAsync.mockResolvedValue(null);
      expect(await hasPartialRanking('movies')).toBe(false);
    });
  });
});
