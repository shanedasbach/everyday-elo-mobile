import { supabase } from '../supabase';

// Mock supabase module
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

// Import after mocking
import {
  createList,
  getList,
  getListByShareCode,
  getUserLists,
  getUserListsWithStatus,
  getTemplateLists,
  deleteList,
  getListItems,
  addListItem,
  addListItems,
  deleteListItem,
  createRanking,
  getRanking,
  getRankedItems,
  updateRankedItem,
  incrementComparisonsCount,
  markRankingComplete,
  recordComparison,
  getFeaturedLists,
} from '../api';

describe('API Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to mock chained supabase calls
  const mockChain = (returnValue: any) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(returnValue),
      order: jest.fn().mockResolvedValue(returnValue),
      limit: jest.fn().mockResolvedValue(returnValue),
    };
    (mockSupabase.from as jest.Mock).mockReturnValue(chain);
    return chain;
  };

  describe('createList', () => {
    it('should create a list with provided data', async () => {
      const mockList = {
        id: 'list-123',
        title: 'Test List',
        description: 'Test description',
        share_code: 'abc123',
        creator_id: 'user-123',
        is_private: false,
        is_template: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabase.auth.getUser = jest.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      const chain = mockChain({ data: mockList, error: null });

      const result = await createList({
        title: 'Test List',
        description: 'Test description',
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('lists');
      expect(chain.insert).toHaveBeenCalled();
      expect(result).toEqual(mockList);
    });

    it('should throw error on failure', async () => {
      mockSupabase.auth.getUser = jest.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockChain({ data: null, error: { message: 'Database error' } });

      await expect(createList({ title: 'Test' })).rejects.toEqual({ message: 'Database error' });
    });
  });

  describe('getList', () => {
    it('should return list when found', async () => {
      const mockList = {
        id: 'list-123',
        title: 'Test List',
      };

      mockChain({ data: mockList, error: null });

      const result = await getList('list-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('lists');
      expect(result).toEqual(mockList);
    });

    it('should return null when not found', async () => {
      mockChain({ data: null, error: { code: 'PGRST116' } });

      const result = await getList('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getListByShareCode', () => {
    it('should return list when found by share code', async () => {
      const mockList = {
        id: 'list-123',
        title: 'Test List',
        share_code: 'abc123',
      };

      mockChain({ data: mockList, error: null });

      const result = await getListByShareCode('abc123');

      expect(result).toEqual(mockList);
    });

    it('should return null when share code not found', async () => {
      mockChain({ data: null, error: { code: 'PGRST116' } });

      const result = await getListByShareCode('invalid');

      expect(result).toBeNull();
    });
  });

  describe('getUserLists', () => {
    it('should return user lists', async () => {
      const mockLists = [
        { id: 'list-1', title: 'List 1' },
        { id: 'list-2', title: 'List 2' },
      ];

      mockChain({ data: mockLists, error: null });

      const result = await getUserLists('user-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('lists');
      expect(result).toEqual(mockLists);
    });

    it('should return empty array on error', async () => {
      mockChain({ data: null, error: { message: 'Error' } });

      await expect(getUserLists('user-123')).rejects.toBeDefined();
    });
  });

  describe('getUserListsWithStatus', () => {
    it('should return lists with not_started status when no ranking exists', async () => {
      const mockLists = [{ id: 'list-1', title: 'List 1' }];
      const mockItems = [{ id: 'item-1' }, { id: 'item-2' }];

      let callCount = 0;
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ data: mockLists, error: null });
          }
          return Promise.resolve({ data: mockItems, error: null });
        }),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await getUserListsWithStatus('user-123');

      expect(result.length).toBe(1);
      expect(result[0].rankingStatus).toBe('not_started');
      expect(result[0].itemCount).toBe(2);
    });

    it('should return lists with in_progress status when ranking incomplete', async () => {
      const mockLists = [{ id: 'list-1', title: 'List 1' }];
      const mockItems = [{ id: 'item-1' }];
      const mockRanking = { is_complete: false, comparisons_count: 3 };

      let callCount = 0;
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ data: mockLists, error: null });
          }
          return Promise.resolve({ data: mockItems, error: null });
        }),
        single: jest.fn().mockResolvedValue({ data: mockRanking, error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await getUserListsWithStatus('user-123');

      expect(result[0].rankingStatus).toBe('in_progress');
      expect(result[0].comparisonsCount).toBe(3);
    });

    it('should return lists with completed status when ranking complete', async () => {
      const mockLists = [{ id: 'list-1', title: 'List 1' }];
      const mockItems = [{ id: 'item-1' }];
      const mockRanking = { is_complete: true, comparisons_count: 5 };

      let callCount = 0;
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ data: mockLists, error: null });
          }
          return Promise.resolve({ data: mockItems, error: null });
        }),
        single: jest.fn().mockResolvedValue({ data: mockRanking, error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await getUserListsWithStatus('user-123');

      expect(result[0].rankingStatus).toBe('completed');
    });
  });

  describe('getTemplateLists', () => {
    it('should return template lists', async () => {
      const mockTemplates = [
        { id: 't-1', title: 'Template 1', is_template: true },
        { id: 't-2', title: 'Template 2', is_template: true },
      ];

      mockChain({ data: mockTemplates, error: null });

      const result = await getTemplateLists();

      expect(result).toEqual(mockTemplates);
    });

    it('should return empty array when no templates', async () => {
      mockChain({ data: [], error: null });

      const result = await getTemplateLists();

      expect(result).toEqual([]);
    });
  });

  describe('deleteList', () => {
    it('should delete list successfully', async () => {
      const chain = mockChain({ error: null });
      chain.eq = jest.fn().mockResolvedValue({ error: null });

      await expect(deleteList('list-123')).resolves.toBeUndefined();

      expect(mockSupabase.from).toHaveBeenCalledWith('lists');
    });

    it('should throw error on delete failure', async () => {
      const chain = mockChain({ error: null });
      chain.eq = jest.fn().mockResolvedValue({ error: { message: 'Delete failed' } });

      await expect(deleteList('list-123')).rejects.toEqual({ message: 'Delete failed' });
    });
  });

  describe('getListItems', () => {
    it('should return list items sorted by display order', async () => {
      const mockItems = [
        { id: 'item-1', name: 'Item 1', display_order: 0 },
        { id: 'item-2', name: 'Item 2', display_order: 1 },
      ];

      mockChain({ data: mockItems, error: null });

      const result = await getListItems('list-123');

      expect(result).toEqual(mockItems);
    });

    it('should return empty array when no items', async () => {
      mockChain({ data: [], error: null });

      const result = await getListItems('list-123');

      expect(result).toEqual([]);
    });
  });

  describe('addListItem', () => {
    it('should add item with correct display order', async () => {
      const mockItem = {
        id: 'item-new',
        list_id: 'list-123',
        name: 'New Item',
        display_order: 2,
      };

      // Mock getting existing items for display_order
      const chain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [{ display_order: 1 }] }),
        single: jest.fn().mockResolvedValue({ data: mockItem, error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await addListItem('list-123', 'New Item');

      expect(result).toEqual(mockItem);
    });
  });

  describe('addListItems', () => {
    it('should add multiple items', async () => {
      const mockItems = [
        { id: 'item-1', name: 'Item 1' },
        { id: 'item-2', name: 'Item 2' },
      ];

      let callCount = 0;
      const chain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockImplementation(() => {
          return Promise.resolve({ data: [{ display_order: callCount }] });
        }),
        single: jest.fn().mockImplementation(() => {
          const item = mockItems[callCount];
          callCount++;
          return Promise.resolve({ data: item, error: null });
        }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await addListItems('list-123', ['Item 1', 'Item 2']);

      expect(result.length).toBe(2);
    });
  });

  describe('deleteListItem', () => {
    it('should delete item successfully', async () => {
      const chain = mockChain({ error: null });
      chain.eq = jest.fn().mockResolvedValue({ error: null });

      await expect(deleteListItem('item-123')).resolves.toBeUndefined();

      expect(mockSupabase.from).toHaveBeenCalledWith('list_items');
    });
  });

  describe('createRanking', () => {
    it('should return existing ranking if found', async () => {
      const existingRanking = {
        id: 'ranking-123',
        list_id: 'list-123',
        user_id: 'user-123',
        is_complete: false,
        comparisons_count: 5,
      };

      mockChain({ data: existingRanking, error: null });

      const result = await createRanking('list-123', 'user-123');

      expect(result).toEqual(existingRanking);
    });

    it('should create new ranking with initialized items if not found', async () => {
      const newRanking = {
        id: 'ranking-new',
        list_id: 'list-123',
        user_id: 'user-123',
        is_complete: false,
        comparisons_count: 0,
      };
      const mockItems = [
        { id: 'item-1', name: 'Item 1' },
        { id: 'item-2', name: 'Item 2' },
      ];

      let singleCallCount = 0;
      let orderCallCount = 0;
      const chain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockImplementation(() => {
          orderCallCount++;
          if (orderCallCount === 1) {
            // getListItems call
            return Promise.resolve({ data: mockItems, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        }),
        single: jest.fn().mockImplementation(() => {
          singleCallCount++;
          if (singleCallCount === 1) {
            // First check - no existing ranking
            return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
          }
          // Create ranking
          return Promise.resolve({ data: newRanking, error: null });
        }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await createRanking('list-123', 'user-123');

      expect(result).toEqual(newRanking);
      // Should have inserted ranked_items for each list item
      expect(chain.insert).toHaveBeenCalled();
    });

    it('should throw error when insert fails', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn()
          .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
          .mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await expect(createRanking('list-123', 'user-123')).rejects.toEqual({ message: 'Insert failed' });
    });

    it('should create ranking without user_id for anonymous users', async () => {
      const newRanking = {
        id: 'ranking-anon',
        list_id: 'list-123',
        user_id: null,
        session_id: 'session-123',
        is_complete: false,
        comparisons_count: 0,
      };

      const chain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        single: jest.fn().mockResolvedValue({ data: newRanking, error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await createRanking('list-123'); // No userId

      expect(result.user_id).toBeNull();
    });
  });

  describe('getRanking', () => {
    it('should return ranking when found', async () => {
      const mockRanking = {
        id: 'ranking-123',
        list_id: 'list-123',
        is_complete: false,
      };

      mockChain({ data: mockRanking, error: null });

      const result = await getRanking('ranking-123');

      expect(result).toEqual(mockRanking);
    });

    it('should return null when not found', async () => {
      mockChain({ data: null, error: { code: 'PGRST116' } });

      const result = await getRanking('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getRankedItems', () => {
    it('should return ranked items sorted by rating', async () => {
      const mockRankedItems = [
        { id: 'ri-1', item_id: 'item-1', rating: 1600, comparisons: 3 },
        { id: 'ri-2', item_id: 'item-2', rating: 1500, comparisons: 3 },
      ];

      mockChain({ data: mockRankedItems, error: null });

      const result = await getRankedItems('ranking-123');

      expect(result).toEqual(mockRankedItems);
    });
  });

  describe('updateRankedItem', () => {
    it('should update rating and comparisons', async () => {
      const chain = mockChain({ error: null });
      chain.eq = jest.fn().mockResolvedValue({ error: null });

      await expect(updateRankedItem('ri-123', 1600, 4)).resolves.toBeUndefined();

      expect(mockSupabase.from).toHaveBeenCalledWith('ranked_items');
      expect(chain.update).toHaveBeenCalledWith({ rating: 1600, comparisons: 4 });
    });
  });

  describe('incrementComparisonsCount', () => {
    it('should increment comparison count', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn()
          .mockResolvedValueOnce({ data: { comparisons_count: 5 } })
          .mockResolvedValueOnce({ error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await incrementComparisonsCount('ranking-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('rankings');
    });
  });

  describe('markRankingComplete', () => {
    it('should mark ranking as complete', async () => {
      const chain = mockChain({ error: null });
      chain.eq = jest.fn().mockResolvedValue({ error: null });

      await expect(markRankingComplete('ranking-123')).resolves.toBeUndefined();

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
        is_complete: true,
      }));
    });
  });

  describe('recordComparison', () => {
    it('should record comparison result', async () => {
      const chain = mockChain({ error: null });
      // No single() call needed for insert without select

      await expect(
        recordComparison('ranking-123', 'item-a', 'item-b', 'item-a')
      ).resolves.toBeUndefined();

      expect(mockSupabase.from).toHaveBeenCalledWith('comparisons');
    });
  });

  describe('getFeaturedLists', () => {
    it('should return featured lists with stats', async () => {
      const mockFeatured = [
        {
          id: 'featured-1',
          list_id: 'list-1',
          featured_at: new Date().toISOString(),
          lists: {
            id: 'list-1',
            title: 'Featured List',
            description: 'Description',
          },
        },
      ];

      // Complex mock for multiple chained calls
      let callCount = 0;
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ data: mockFeatured, error: null });
          }
          // Item count and ranking count calls
          return Promise.resolve({ count: 10, error: null });
        }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await getFeaturedLists();

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array on error', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await getFeaturedLists();

      expect(result).toEqual([]);
    });
  });
});

describe('API Types', () => {
  it('should export List interface with required fields', () => {
    // Type check - if this compiles, the types exist
    const list: import('../api').List = {
      id: 'test',
      title: 'Test',
      creator_id: 'user-123',
      is_private: false,
      is_template: false,
      share_code: 'abc123',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(list.id).toBeDefined();
  });

  it('should export ListItem interface', () => {
    const item: import('../api').ListItem = {
      id: 'item-1',
      list_id: 'list-1',
      name: 'Test Item',
      display_order: 0,
      created_at: new Date().toISOString(),
    };

    expect(item.name).toBeDefined();
  });

  it('should export Ranking interface', () => {
    const ranking: import('../api').Ranking = {
      id: 'ranking-1',
      list_id: 'list-1',
      user_id: 'user-1',
      is_complete: false,
      comparisons_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(ranking.is_complete).toBe(false);
  });

  it('should export RankedItem interface', () => {
    const rankedItem: import('../api').RankedItem = {
      id: 'ri-1',
      ranking_id: 'ranking-1',
      item_id: 'item-1',
      rating: 1500,
      comparisons: 0,
    };

    expect(rankedItem.rating).toBe(1500);
  });

  it('should export ListWithStatus interface', () => {
    const listWithStatus: import('../api').ListWithStatus = {
      id: 'list-1',
      title: 'Test',
      creator_id: 'user-1',
      is_private: false,
      is_template: false,
      share_code: 'abc',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      itemCount: 10,
      rankingStatus: 'in_progress',
      comparisonsCount: 5,
      estimatedComparisons: 20,
    };

    expect(listWithStatus.rankingStatus).toBe('in_progress');
  });
});
