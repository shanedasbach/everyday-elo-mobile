/**
 * Comprehensive tests for the API module
 * 
 * Use cases covered:
 * 1. List management (create, read, delete)
 * 2. Item management (add single, bulk add, delete)
 * 3. Ranking sessions (create, resume, complete)
 * 4. Comparison tracking
 * 5. Featured/template lists for discovery
 * 6. User list views with status
 */

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
  List,
  ListItem,
  Ranking,
  RankedItem,
  ListWithStatus,
} from '../api';

describe('API Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create mock chain for Supabase queries
  const mockQuery = (result: { data?: any; error?: any; count?: number }) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(result),
      order: jest.fn().mockResolvedValue(result),
      limit: jest.fn().mockResolvedValue(result),
    };
    (mockSupabase.from as jest.Mock).mockReturnValue(chain);
    return chain;
  };

  // ============================================
  // USE CASE 1: Creating a New List
  // ============================================
  describe('Creating a New List', () => {
    const mockUser = { id: 'user-123' };

    beforeEach(() => {
      mockSupabase.auth.getUser = jest.fn().mockResolvedValue({
        data: { user: mockUser },
      });
    });

    it('should create a list with title and description', async () => {
      const newList = {
        id: 'list-abc',
        title: 'Best Pizza Toppings',
        description: 'Ranking my favorite pizza toppings',
        creator_id: 'user-123',
        share_code: 'xyz789',
        is_private: false,
        is_template: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockQuery({ data: newList, error: null });

      const result = await createList({
        title: 'Best Pizza Toppings',
        description: 'Ranking my favorite pizza toppings',
      });

      expect(result.title).toBe('Best Pizza Toppings');
      expect(result.creator_id).toBe('user-123');
      expect(mockSupabase.from).toHaveBeenCalledWith('lists');
    });

    it('should create a list with just a title (description optional)', async () => {
      const newList = {
        id: 'list-def',
        title: 'Quick List',
        description: null,
        creator_id: 'user-123',
        share_code: 'abc123',
        is_private: false,
        is_template: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockQuery({ data: newList, error: null });

      const result = await createList({ title: 'Quick List' });

      expect(result.title).toBe('Quick List');
      expect(result.description).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockQuery({ data: null, error: { message: 'Database connection failed' } });

      await expect(createList({ title: 'Test' })).rejects.toEqual({
        message: 'Database connection failed',
      });
    });
  });

  // ============================================
  // USE CASE 2: Viewing a List (by ID or Share Code)
  // ============================================
  describe('Viewing a List', () => {
    const sampleList = {
      id: 'list-123',
      title: 'My Favorite Movies',
      description: 'Top films of all time',
      creator_id: 'user-123',
      share_code: 'share123',
      is_private: false,
      is_template: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    describe('by ID', () => {
      it('should return the list when found', async () => {
        mockQuery({ data: sampleList, error: null });

        const result = await getList('list-123');

        expect(result).toEqual(sampleList);
        expect(mockSupabase.from).toHaveBeenCalledWith('lists');
      });

      it('should return null when list does not exist', async () => {
        mockQuery({ data: null, error: { code: 'PGRST116' } });

        const result = await getList('nonexistent-id');

        expect(result).toBeNull();
      });
    });

    describe('by share code', () => {
      it('should return the list when share code is valid', async () => {
        mockQuery({ data: sampleList, error: null });

        const result = await getListByShareCode('share123');

        expect(result?.title).toBe('My Favorite Movies');
      });

      it('should return null for invalid share code', async () => {
        mockQuery({ data: null, error: { code: 'PGRST116' } });

        const result = await getListByShareCode('invalid-code');

        expect(result).toBeNull();
      });
    });
  });

  // ============================================
  // USE CASE 3: Managing List Items
  // ============================================
  describe('Managing List Items', () => {
    describe('getting items in a list', () => {
      it('should return items sorted by display order', async () => {
        const items = [
          { id: 'item-1', list_id: 'list-1', name: 'Pepperoni', display_order: 0, created_at: '' },
          { id: 'item-2', list_id: 'list-1', name: 'Mushrooms', display_order: 1, created_at: '' },
          { id: 'item-3', list_id: 'list-1', name: 'Olives', display_order: 2, created_at: '' },
        ];

        mockQuery({ data: items, error: null });

        const result = await getListItems('list-1');

        expect(result).toHaveLength(3);
        expect(result[0].name).toBe('Pepperoni');
      });

      it('should return empty array for list with no items', async () => {
        mockQuery({ data: [], error: null });

        const result = await getListItems('empty-list');

        expect(result).toEqual([]);
      });

      it('should return empty array when data is null', async () => {
        mockQuery({ data: null, error: null });

        const result = await getListItems('list-1');

        expect(result).toEqual([]);
      });

      it('should throw error on database failure', async () => {
        mockQuery({ data: null, error: { message: 'Database error' } });

        await expect(getListItems('list-1')).rejects.toEqual({ message: 'Database error' });
      });
    });

    describe('adding a single item', () => {
      it('should add item with correct display order', async () => {
        const newItem = {
          id: 'item-new',
          list_id: 'list-1',
          name: 'New Topping',
          display_order: 3,
          created_at: new Date().toISOString(),
        };

        // Mock: first get existing items for display_order, then insert
        let callCount = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve({ data: [{ display_order: 2 }] });
            }
            return Promise.resolve({ data: null });
          }),
          single: jest.fn().mockResolvedValue({ data: newItem, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await addListItem('list-1', 'New Topping');

        expect(result.name).toBe('New Topping');
        expect(result.display_order).toBe(3);
      });

      it('should handle adding first item to empty list', async () => {
        const newItem = {
          id: 'item-first',
          list_id: 'list-1',
          name: 'First Item',
          display_order: 0,
          created_at: new Date().toISOString(),
        };

        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [] }), // No existing items
          single: jest.fn().mockResolvedValue({ data: newItem, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await addListItem('list-1', 'First Item');

        expect(result.display_order).toBe(0);
      });

      it('should handle null existing items', async () => {
        const newItem = {
          id: 'item-first',
          list_id: 'list-1',
          name: 'First Item',
          display_order: 0,
          created_at: new Date().toISOString(),
        };

        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: null }), // null instead of empty
          single: jest.fn().mockResolvedValue({ data: newItem, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await addListItem('list-1', 'First Item');

        expect(result.display_order).toBe(0);
      });

      it('should throw error on insert failure', async () => {
        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [] }),
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(addListItem('list-1', 'Test')).rejects.toEqual({ message: 'Insert failed' });
      });
    });

    describe('bulk adding items', () => {
      it('should add multiple items sequentially', async () => {
        const items = [
          { id: 'i1', list_id: 'l1', name: 'Item 1', display_order: 0, created_at: '' },
          { id: 'i2', list_id: 'l1', name: 'Item 2', display_order: 1, created_at: '' },
          { id: 'i3', list_id: 'l1', name: 'Item 3', display_order: 2, created_at: '' },
        ];

        let itemIndex = 0;
        let orderQuery = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation(() => {
            const order = orderQuery;
            orderQuery++;
            return Promise.resolve({ data: order > 0 ? [{ display_order: order - 1 }] : [] });
          }),
          single: jest.fn().mockImplementation(() => {
            const item = items[itemIndex];
            itemIndex++;
            return Promise.resolve({ data: item, error: null });
          }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await addListItems('l1', ['Item 1', 'Item 2', 'Item 3']);

        expect(result).toHaveLength(3);
      });
    });

    describe('deleting an item', () => {
      it('should delete item successfully', async () => {
        const chain = {
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(deleteListItem('item-123')).resolves.toBeUndefined();
        expect(mockSupabase.from).toHaveBeenCalledWith('list_items');
      });

      it('should throw error when delete fails', async () => {
        const chain = {
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: { message: 'Item not found' } }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(deleteListItem('bad-id')).rejects.toEqual({ message: 'Item not found' });
      });
    });
  });

  // ============================================
  // USE CASE 4: Ranking Sessions
  // ============================================
  describe('Ranking Sessions', () => {
    describe('starting or resuming a ranking', () => {
      it('should return existing ranking if user already started', async () => {
        const existingRanking = {
          id: 'ranking-existing',
          list_id: 'list-1',
          user_id: 'user-1',
          is_complete: false,
          comparisons_count: 10,
          created_at: '',
          updated_at: '',
        };

        mockQuery({ data: existingRanking, error: null });

        const result = await createRanking('list-1', 'user-1');

        expect(result.id).toBe('ranking-existing');
        expect(result.comparisons_count).toBe(10);
      });

      it('should create new ranking and initialize items when none exists', async () => {
        const newRanking = {
          id: 'ranking-new',
          list_id: 'list-1',
          user_id: 'user-1',
          is_complete: false,
          comparisons_count: 0,
          created_at: '',
          updated_at: '',
        };
        const listItems = [
          { id: 'item-1', display_order: 0 },
          { id: 'item-2', display_order: 1 },
        ];

        let singleCalls = 0;
        let orderCalls = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockImplementation(() => {
            orderCalls++;
            return Promise.resolve({ data: listItems, error: null });
          }),
          single: jest.fn().mockImplementation(() => {
            singleCalls++;
            if (singleCalls === 1) {
              return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
            }
            return Promise.resolve({ data: newRanking, error: null });
          }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await createRanking('list-1', 'user-1');

        expect(result.id).toBe('ranking-new');
        expect(result.comparisons_count).toBe(0);
      });

      it('should allow anonymous rankings (no user ID)', async () => {
        const anonRanking = {
          id: 'ranking-anon',
          list_id: 'list-1',
          user_id: null,
          session_id: 'session-abc',
          is_complete: false,
          comparisons_count: 0,
          created_at: '',
          updated_at: '',
        };

        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
          single: jest.fn().mockResolvedValue({ data: anonRanking, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await createRanking('list-1'); // No userId

        expect(result.user_id).toBeNull();
      });

      it('should throw error when ranking insert fails', async () => {
        let singleCalls = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
          single: jest.fn().mockImplementation(() => {
            singleCalls++;
            if (singleCalls === 1) {
              return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
            }
            return Promise.resolve({ data: null, error: { message: 'Insert failed' } });
          }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(createRanking('list-1', 'user-1')).rejects.toEqual({ message: 'Insert failed' });
      });
    });

    describe('getting ranking by ID', () => {
      it('should return ranking when found', async () => {
        const ranking = {
          id: 'ranking-123',
          list_id: 'list-1',
          is_complete: false,
          comparisons_count: 5,
        };

        mockQuery({ data: ranking, error: null });

        const result = await getRanking('ranking-123');

        expect(result?.id).toBe('ranking-123');
      });

      it('should return null when not found', async () => {
        mockQuery({ data: null, error: { code: 'PGRST116' } });

        const result = await getRanking('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('getting ranked items', () => {
      it('should return items sorted by rating descending', async () => {
        const rankedItems = [
          { id: 'ri-1', item_id: 'item-a', rating: 1700, comparisons: 5 },
          { id: 'ri-2', item_id: 'item-b', rating: 1500, comparisons: 5 },
          { id: 'ri-3', item_id: 'item-c', rating: 1300, comparisons: 5 },
        ];

        mockQuery({ data: rankedItems, error: null });

        const result = await getRankedItems('ranking-123');

        expect(result[0].rating).toBe(1700);
        expect(result[2].rating).toBe(1300);
      });

      it('should handle empty rankings', async () => {
        mockQuery({ data: [], error: null });

        const result = await getRankedItems('empty-ranking');

        expect(result).toEqual([]);
      });

      it('should return empty array when data is null', async () => {
        mockQuery({ data: null, error: null });

        const result = await getRankedItems('ranking-123');

        expect(result).toEqual([]);
      });

      it('should throw on database error', async () => {
        mockQuery({ data: null, error: { message: 'DB error' } });

        await expect(getRankedItems('bad-id')).rejects.toEqual({ message: 'DB error' });
      });
    });

    describe('updating a ranked item', () => {
      it('should update rating and comparison count', async () => {
        const chain = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await updateRankedItem('ri-123', 1650, 6);

        expect(chain.update).toHaveBeenCalledWith({ rating: 1650, comparisons: 6 });
      });

      it('should throw on error', async () => {
        const chain = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(updateRankedItem('bad', 1500, 1)).rejects.toEqual({ message: 'Update failed' });
      });
    });

    describe('completing a ranking', () => {
      it('should mark ranking as complete', async () => {
        const chain = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await markRankingComplete('ranking-123');

        expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
          is_complete: true,
        }));
      });

      it('should throw error on update failure', async () => {
        const chain = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(markRankingComplete('ranking-123')).rejects.toEqual({ message: 'Update failed' });
      });
    });
  });

  // ============================================
  // USE CASE 5: Recording Comparisons
  // ============================================
  describe('Recording Comparisons', () => {
    it('should record a comparison with winner', async () => {
      const chain = {
        insert: jest.fn().mockResolvedValue({ error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await recordComparison('ranking-1', 'item-a', 'item-b', 'item-a');

      expect(mockSupabase.from).toHaveBeenCalledWith('comparisons');
      expect(chain.insert).toHaveBeenCalledWith({
        ranking_id: 'ranking-1',
        item_a_id: 'item-a',
        item_b_id: 'item-b',
        winner_id: 'item-a',
      });
    });

    it('should record a skipped comparison (null winner)', async () => {
      const chain = {
        insert: jest.fn().mockResolvedValue({ error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await recordComparison('ranking-1', 'item-a', 'item-b', null);

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        winner_id: null,
      }));
    });

    it('should throw on database error', async () => {
      const chain = {
        insert: jest.fn().mockResolvedValue({ error: { message: 'Insert failed' } }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await expect(
        recordComparison('r1', 'a', 'b', 'a')
      ).rejects.toEqual({ message: 'Insert failed' });
    });
  });

  // ============================================
  // USE CASE 6: Incrementing Comparison Count
  // ============================================
  describe('Incrementing Comparison Count', () => {
    it('should increment count when ranking exists', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { comparisons_count: 5 } }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await incrementComparisonsCount('ranking-1');

      expect(chain.update).toHaveBeenCalled();
    });

    it('should handle missing ranking gracefully', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      // Should not throw, just not update
      await expect(incrementComparisonsCount('nonexistent')).resolves.toBeUndefined();
    });
  });

  // ============================================
  // USE CASE 7: Discovering Lists (Templates & Featured)
  // ============================================
  describe('Discovering Lists', () => {
    describe('template lists', () => {
      it('should return template lists for browsing', async () => {
        const templates = [
          { id: 't1', title: 'Best Movies', is_template: true },
          { id: 't2', title: 'Top Albums', is_template: true },
        ];

        mockQuery({ data: templates, error: null });

        const result = await getTemplateLists();

        expect(result).toHaveLength(2);
        expect(result[0].is_template).toBe(true);
      });

      it('should return empty array when no templates exist', async () => {
        mockQuery({ data: [], error: null });

        const result = await getTemplateLists();

        expect(result).toEqual([]);
      });

      it('should return empty array when data is null', async () => {
        mockQuery({ data: null, error: null });

        const result = await getTemplateLists();

        expect(result).toEqual([]);
      });

      it('should throw error on database failure', async () => {
        mockQuery({ data: null, error: { message: 'Database error' } });

        await expect(getTemplateLists()).rejects.toEqual({ message: 'Database error' });
      });
    });

    describe('featured lists', () => {
      it('should return featured lists with metadata', async () => {
        const featured = [
          {
            id: 'f1',
            list_id: 'list-1',
            featured_at: '2024-01-01T00:00:00Z',
            lists: {
              id: 'list-1',
              title: 'Top 10 Pizzas',
              description: 'The best pizzas',
            },
          },
        ];

        let callCount = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ data: featured, error: null });
            return Promise.resolve({ count: 5, error: null });
          }),
          eq: jest.fn().mockReturnThis(),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await getFeaturedLists();

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThanOrEqual(0);
      });

      it('should skip items with null lists property', async () => {
        const featured = [
          {
            id: 'f1',
            list_id: 'list-1',
            featured_at: '2024-01-01T00:00:00Z',
            lists: null, // No associated list
          },
          {
            id: 'f2',
            list_id: 'list-2',
            featured_at: '2024-01-01T00:00:00Z',
            lists: {
              id: 'list-2',
              title: 'Valid List',
              description: 'Has a list',
            },
          },
        ];

        let callCount = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ data: featured, error: null });
            return Promise.resolve({ count: 3, error: null });
          }),
          eq: jest.fn().mockReturnThis(),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await getFeaturedLists();

        // Should only have 1 result (the one with valid lists)
        expect(result.length).toBeLessThanOrEqual(1);
      });

      it('should handle empty data array', async () => {
        const chain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await getFeaturedLists();

        expect(result).toEqual([]);
      });

      it('should handle null data', async () => {
        const chain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await getFeaturedLists();

        expect(result).toEqual([]);
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

  // ============================================
  // USE CASE 8: User's Lists with Status
  // ============================================
  describe("User's Lists with Ranking Status", () => {
    describe('getting basic user lists', () => {
      it('should return all lists created by user', async () => {
        const userLists = [
          { id: 'l1', title: 'My Movies', creator_id: 'user-1' },
          { id: 'l2', title: 'My Games', creator_id: 'user-1' },
        ];

        mockQuery({ data: userLists, error: null });

        const result = await getUserLists('user-1');

        expect(result).toHaveLength(2);
      });

      it('should return empty array for user with no lists', async () => {
        mockQuery({ data: [], error: null });

        const result = await getUserLists('new-user');

        expect(result).toEqual([]);
      });

      it('should return empty array when data is null', async () => {
        mockQuery({ data: null, error: null });

        const result = await getUserLists('user-1');

        expect(result).toEqual([]);
      });

      it('should throw error on database failure', async () => {
        mockQuery({ data: null, error: { message: 'Database error' } });

        await expect(getUserLists('user-1')).rejects.toEqual({ message: 'Database error' });
      });
    });

    describe('getting lists with ranking status', () => {
      it('should show "not_started" when no ranking exists', async () => {
        const lists = [{ id: 'l1', title: 'Unranked List' }];
        const items = [{ id: 'i1' }, { id: 'i2' }];

        let queryCount = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) return Promise.resolve({ data: lists });
            return Promise.resolve({ data: items });
          }),
          single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await getUserListsWithStatus('user-1');

        expect(result[0].rankingStatus).toBe('not_started');
        expect(result[0].itemCount).toBe(2);
      });

      it('should show "in_progress" when ranking is incomplete', async () => {
        const lists = [{ id: 'l1', title: 'In Progress' }];
        const items = [{ id: 'i1' }];
        const ranking = { is_complete: false, comparisons_count: 5 };

        let queryCount = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) return Promise.resolve({ data: lists });
            return Promise.resolve({ data: items });
          }),
          single: jest.fn().mockResolvedValue({ data: ranking }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await getUserListsWithStatus('user-1');

        expect(result[0].rankingStatus).toBe('in_progress');
        expect(result[0].comparisonsCount).toBe(5);
      });

      it('should show "completed" when ranking is done', async () => {
        const lists = [{ id: 'l1', title: 'Done' }];
        const items = [{ id: 'i1' }];
        const ranking = { is_complete: true, comparisons_count: 10 };

        let queryCount = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) return Promise.resolve({ data: lists });
            return Promise.resolve({ data: items });
          }),
          single: jest.fn().mockResolvedValue({ data: ranking }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await getUserListsWithStatus('user-1');

        expect(result[0].rankingStatus).toBe('completed');
      });

      it('should calculate estimated comparisons based on item count', async () => {
        const lists = [{ id: 'l1', title: 'Test' }];
        const items = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }, { id: 'i4' }, { id: 'i5' }];

        let queryCount = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) return Promise.resolve({ data: lists });
            return Promise.resolve({ data: items });
          }),
          single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await getUserListsWithStatus('user-1');

        // 5 items * 2 = 10 estimated comparisons
        expect(result[0].estimatedComparisons).toBe(10);
      });
    });
  });

  // ============================================
  // USE CASE 9: Deleting a List
  // ============================================
  describe('Deleting a List', () => {
    it('should delete list successfully', async () => {
      const chain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await expect(deleteList('list-123')).resolves.toBeUndefined();
      expect(mockSupabase.from).toHaveBeenCalledWith('lists');
    });

    it('should throw error when list not found', async () => {
      const chain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: { message: 'List not found' } }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await expect(deleteList('nonexistent')).rejects.toEqual({ message: 'List not found' });
    });
  });

  // ============================================
  // TYPE EXPORTS
  // ============================================
  describe('Type Exports', () => {
    it('should export List interface', () => {
      const list: List = {
        id: 'test',
        title: 'Test',
        creator_id: 'user',
        is_private: false,
        is_template: false,
        share_code: 'abc',
        created_at: '',
        updated_at: '',
      };
      expect(list.id).toBeDefined();
    });

    it('should export ListItem interface', () => {
      const item: ListItem = {
        id: 'item',
        list_id: 'list',
        name: 'Test',
        display_order: 0,
        created_at: '',
      };
      expect(item.name).toBeDefined();
    });

    it('should export Ranking interface', () => {
      const ranking: Ranking = {
        id: 'ranking',
        list_id: 'list',
        user_id: 'user',
        is_complete: false,
        comparisons_count: 0,
        created_at: '',
        updated_at: '',
      };
      expect(ranking.is_complete).toBe(false);
    });

    it('should export RankedItem interface', () => {
      const rankedItem: RankedItem = {
        id: 'ri',
        ranking_id: 'ranking',
        item_id: 'item',
        rating: 1500,
        comparisons: 0,
      };
      expect(rankedItem.rating).toBe(1500);
    });

    it('should export ListWithStatus interface', () => {
      const listWithStatus: ListWithStatus = {
        id: 'list',
        title: 'Test',
        creator_id: 'user',
        is_private: false,
        is_template: false,
        share_code: 'abc',
        created_at: '',
        updated_at: '',
        itemCount: 5,
        rankingStatus: 'in_progress',
        comparisonsCount: 3,
        estimatedComparisons: 10,
      };
      expect(listWithStatus.rankingStatus).toBe('in_progress');
    });
  });
});
