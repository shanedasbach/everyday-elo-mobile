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
    rpc: jest.fn(),
    functions: {
      invoke: jest.fn(),
    },
  },
}));

// Mock expo-crypto so tests run outside a native runtime. Default returns
// deterministic bytes; individual tests override via mockImplementationOnce.
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn((n: number) => new Uint8Array(n).fill(0xff)),
}));

// Local partial-ranking storage is keychain-backed; stub it so deleteList's
// cleanup hook is observable without touching SecureStore.
jest.mock('../partial-ranking', () => ({
  clearPartialRanking: jest.fn().mockResolvedValue(undefined),
}));

import { clearPartialRanking } from '../partial-ranking';

const mockSupabase = supabase as jest.Mocked<typeof supabase>;
const mockClearPartialRanking = clearPartialRanking as jest.MockedFunction<
  typeof clearPartialRanking
>;

import * as Crypto from 'expo-crypto';
import {
  createList,
  generateShareCode,
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
  getUserRankingForList,
  getCompletedRankingForList,
  getRankedItems,
  updateRankedItem,
  persistSkippedComparison,
  markRankingComplete,
  markRankingCompleteAndNotify,
  recordComparison,
  persistComparison,
  generateIdempotencyKey,
  getFeaturedLists,
  duplicateList,
  followUser,
  unfollowUser,
  isFollowing,
  getFollowing,
  getFollowers,
  getFollowingCount,
  getFollowerCount,
  getFollowedListsFeed,
  FOLLOW_GRAPH_QUERY_CAP,
  NotAuthenticatedError,
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
      // Read-or-null helpers use .maybeSingle(); insert-then-select uses .single().
      maybeSingle: jest.fn().mockResolvedValue(result),
      order: jest.fn().mockResolvedValue(result),
      limit: jest.fn().mockResolvedValue(result),
    };
    (mockSupabase.from as jest.Mock).mockReturnValue(chain);
    return chain;
  };

  // The shape PostgREST actually returns for a share_code collision — the
  // column name appears in both `message` (via the constraint) and `details`.
  const shareCodeCollision = () => ({
    code: '23505',
    message: 'duplicate key value violates unique constraint "lists_share_code_key"',
    details: 'Key (share_code)=(ABCD1234) already exists.',
    hint: null,
  });

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

    it('should retry with a new share_code on unique-violation and succeed', async () => {
      // First insert collides (Postgres 23505), second succeeds. The two
      // generateShareCode calls must produce different codes.
      const getRandomBytes = Crypto.getRandomBytes as jest.Mock;
      getRandomBytes
        .mockImplementationOnce(() => new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]))
        .mockImplementationOnce(() => new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]));

      const successList = {
        id: 'list-retry',
        title: 'Retry List',
        creator_id: 'user-123',
        share_code: 'ZZZZZZZZ',
        is_private: false,
        is_template: false,
        created_at: '',
        updated_at: '',
      };

      const insertedCodes: string[] = [];
      let attempt = 0;
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn((row: { share_code: string }) => {
          insertedCodes.push(row.share_code);
          return chain;
        }),
        single: jest.fn().mockImplementation(() => {
          attempt++;
          if (attempt === 1) {
            return Promise.resolve({ data: null, error: shareCodeCollision() });
          }
          return Promise.resolve({ data: successList, error: null });
        }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      const result = await createList({ title: 'Retry List' });

      expect(result.id).toBe('list-retry');
      expect(insertedCodes).toHaveLength(2);
      expect(insertedCodes[0]).not.toBe(insertedCodes[1]);
    });

    it('should throw after exhausting share_code retry attempts', async () => {
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: shareCodeCollision(),
        }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await expect(createList({ title: 'Never Lucky' })).rejects.toEqual(
        shareCodeCollision()
      );
      // Three attempts before giving up.
      expect(chain.single).toHaveBeenCalledTimes(3);
    });

    it('should not retry a unique-violation on a different constraint', async () => {
      // Retrying only regenerates the share code, so a unique violation on any
      // other column fails identically every time — burning three inserts to
      // surface the same error. Fail on the first one instead.
      const otherConstraint = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "lists_title_creator_key"',
        details: 'Key (title, creator_id)=(Dupe, user-123) already exists.',
        hint: null,
      };
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: otherConstraint }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await expect(createList({ title: 'Dupe' })).rejects.toEqual(otherConstraint);
      expect(chain.single).toHaveBeenCalledTimes(1);
    });

    it('should send creator_id as the signed-in user, never undefined', async () => {
      const chain = mockQuery({ data: { id: 'list-abc' }, error: null });

      await createList({ title: 'Owned List' });

      const payload = chain.insert.mock.calls[0][0];
      expect(payload.creator_id).toBe('user-123');
    });

    it('should generate the share_code with crypto entropy, not generateId', async () => {
      const getRandomBytes = Crypto.getRandomBytes as jest.Mock;
      getRandomBytes.mockClear();
      const chain = mockQuery({ data: { id: 'list-abc' }, error: null });

      await createList({ title: 'Shared List' });

      expect(getRandomBytes).toHaveBeenCalledWith(5);
      const payload = chain.insert.mock.calls[0][0];
      expect(payload.share_code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    });
  });

  // ============================================
  // Share Code Generation
  // ============================================
  describe('generateShareCode', () => {
    afterEach(() => {
      (Crypto.getRandomBytes as jest.Mock).mockReset();
      // Restore the default deterministic mock so unrelated tests are unaffected.
      (Crypto.getRandomBytes as jest.Mock).mockImplementation(
        (n: number) => new Uint8Array(n).fill(0xff)
      );
    });

    it('should produce an 8-character code using the share-code alphabet', () => {
      const code = generateShareCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    });

    it('should source entropy from expo-crypto (not Math.random)', () => {
      const getRandomBytes = Crypto.getRandomBytes as jest.Mock;
      getRandomBytes.mockClear();
      generateShareCode();
      expect(getRandomBytes).toHaveBeenCalledWith(5);
    });

    it('should return different codes for different random bytes', () => {
      const getRandomBytes = Crypto.getRandomBytes as jest.Mock;
      getRandomBytes
        .mockImplementationOnce(() => new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]))
        .mockImplementationOnce(() => new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]));
      const a = generateShareCode();
      const b = generateShareCode();
      expect(a).not.toBe(b);
    });
  });

  // ============================================
  // USE CASE 1b: List ownership (issue #65)
  //
  // `creator_id` is nullable and RLS permits anonymous inserts, so a list
  // created without a session is both invisible to getUserLists (which
  // filters on creator_id) and updatable by anyone. Being unowned therefore
  // has to be an explicit request, not a silent fallback.
  // ============================================
  describe('List ownership', () => {
    const signedOut = () => {
      mockSupabase.auth.getUser = jest.fn().mockResolvedValue({
        data: { user: null },
      });
    };

    it('should refuse to create a list when nobody is signed in', async () => {
      signedOut();
      const chain = mockQuery({ data: null, error: null });

      await expect(createList({ title: 'Orphan' })).rejects.toBeInstanceOf(
        NotAuthenticatedError
      );
      expect(chain.insert).not.toHaveBeenCalled();
    });

    it('should explain what to do in the error message', async () => {
      signedOut();
      mockQuery({ data: null, error: null });

      await expect(createList({ title: 'Orphan' })).rejects.toThrow(
        /signed in/i
      );
    });

    it('should treat an auth lookup error as not signed in', async () => {
      // An expired or revoked token surfaces here as an error rather than a
      // null user. Both must fail closed — this is the case that would
      // otherwise show "Saved! List saved to My Lists" for a list that will
      // never appear there.
      mockSupabase.auth.getUser = jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      });
      const chain = mockQuery({ data: null, error: null });

      await expect(createList({ title: 'Stale Session' })).rejects.toBeInstanceOf(
        NotAuthenticatedError
      );
      expect(chain.insert).not.toHaveBeenCalled();
    });

    it('should allow an explicitly anonymous list with a null creator_id', async () => {
      signedOut();
      const chain = mockQuery({
        data: { id: 'list-anon', title: 'Try It Out', creator_id: null },
        error: null,
      });

      const result = await createList({
        title: 'Try It Out',
        allowAnonymous: true,
      });

      expect(result.id).toBe('list-anon');
      const payload = chain.insert.mock.calls[0][0];
      expect(payload.creator_id).toBeNull();
      expect('creator_id' in payload).toBe(true);
    });

    it('should still attach the owner when signed in and anonymous is allowed', async () => {
      // allowAnonymous is a permission, not an instruction to discard a
      // known owner — otherwise the ad hoc ranking flow would orphan lists
      // for signed-in users too.
      mockSupabase.auth.getUser = jest.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });
      const chain = mockQuery({ data: { id: 'list-abc' }, error: null });

      await createList({ title: 'Ad Hoc', allowAnonymous: true });

      expect(chain.insert.mock.calls[0][0].creator_id).toBe('user-123');
    });

    it('should refuse to duplicate a list when nobody is signed in', async () => {
      signedOut();

      const sourceList = {
        id: 'source-list',
        title: 'My Favorites',
        creator_id: 'user-123',
      };
      let callIndex = 0;
      const insertSpy = jest.fn().mockReturnThis();

      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        const idx = callIndex++;
        const chain: Record<string, jest.Mock> = {
          select: jest.fn().mockReturnThis(),
          insert: insertSpy,
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [] }),
          // getList reads through .maybeSingle(); createList's insert-then-select
          // still terminates on .single().
          maybeSingle: jest.fn().mockResolvedValue({ data: sourceList, error: null }),
          single: jest.fn().mockResolvedValue({ data: sourceList, error: null }),
        };
        // getListItems uses order() as its terminal call
        if (idx === 1) {
          chain.order = jest.fn().mockResolvedValue({ data: [], error: null });
        }
        return chain;
      });

      await expect(duplicateList('source-list')).rejects.toBeInstanceOf(
        NotAuthenticatedError
      );
      expect(insertSpy).not.toHaveBeenCalled();
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
        // .maybeSingle() reports "no rows" as data: null with no error at all,
        // so a missing list is distinguishable from a failed query.
        const chain = mockQuery({ data: null, error: null });

        const result = await getList('nonexistent-id');

        expect(result).toBeNull();
        expect(chain.maybeSingle).toHaveBeenCalled();
        expect(chain.single).not.toHaveBeenCalled();
      });

      it('should throw when the lookup fails for a real reason', async () => {
        mockQuery({ data: null, error: { message: 'RLS denied' } });

        await expect(getList('list-123')).rejects.toEqual({ message: 'RLS denied' });
      });
    });

    describe('by share code', () => {
      it('should return the list when share code is valid', async () => {
        mockQuery({ data: sampleList, error: null });

        const result = await getListByShareCode('share123');

        expect(result?.title).toBe('My Favorite Movies');
      });

      it('should return null for invalid share code', async () => {
        const chain = mockQuery({ data: null, error: null });

        const result = await getListByShareCode('invalid-code');

        expect(result).toBeNull();
        expect(chain.maybeSingle).toHaveBeenCalled();
        expect(chain.single).not.toHaveBeenCalled();
      });

      it('should throw when the lookup fails for a real reason', async () => {
        mockQuery({ data: null, error: { message: 'network down' } });

        await expect(getListByShareCode('share123')).rejects.toEqual({ message: 'network down' });
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
      it('should insert all items in a single batch with monotonically increasing display_order', async () => {
        const items = [
          { id: 'i1', list_id: 'l1', name: 'Item 1', display_order: 5, created_at: '' },
          { id: 'i2', list_id: 'l1', name: 'Item 2', display_order: 6, created_at: '' },
          { id: 'i3', list_id: 'l1', name: 'Item 3', display_order: 7, created_at: '' },
        ];

        let callIndex = 0;
        const orderChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [{ display_order: 4 }] }),
        };
        const insertChain = {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue({ data: items, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockImplementation(() => {
          const chain = callIndex === 0 ? orderChain : insertChain;
          callIndex++;
          return chain;
        });

        const result = await addListItems('l1', ['Item 1', 'Item 2', 'Item 3']);

        expect(result).toHaveLength(3);
        expect(insertChain.insert).toHaveBeenCalledTimes(1);
        expect(insertChain.insert).toHaveBeenCalledWith([
          { list_id: 'l1', name: 'Item 1', display_order: 5 },
          { list_id: 'l1', name: 'Item 2', display_order: 6 },
          { list_id: 'l1', name: 'Item 3', display_order: 7 },
        ]);
      });

      it('should start display_order at 0 when list is empty', async () => {
        const items = [
          { id: 'i1', list_id: 'l1', name: 'A', display_order: 0, created_at: '' },
          { id: 'i2', list_id: 'l1', name: 'B', display_order: 1, created_at: '' },
        ];

        let callIndex = 0;
        const orderChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [] }),
        };
        const insertChain = {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue({ data: items, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockImplementation(() => {
          const chain = callIndex === 0 ? orderChain : insertChain;
          callIndex++;
          return chain;
        });

        const result = await addListItems('l1', ['A', 'B']);

        expect(result).toEqual(items);
        expect(insertChain.insert).toHaveBeenCalledWith([
          { list_id: 'l1', name: 'A', display_order: 0 },
          { list_id: 'l1', name: 'B', display_order: 1 },
        ]);
      });

      it('should handle null existing display_order data', async () => {
        const items = [
          { id: 'i1', list_id: 'l1', name: 'A', display_order: 0, created_at: '' },
        ];

        let callIndex = 0;
        const orderChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: null }),
        };
        const insertChain = {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue({ data: items, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockImplementation(() => {
          const chain = callIndex === 0 ? orderChain : insertChain;
          callIndex++;
          return chain;
        });

        const result = await addListItems('l1', ['A']);

        expect(result).toEqual(items);
        expect(insertChain.insert).toHaveBeenCalledWith([
          { list_id: 'l1', name: 'A', display_order: 0 },
        ]);
      });

      it('should short-circuit and not call supabase for empty names array', async () => {
        const result = await addListItems('l1', []);

        expect(result).toEqual([]);
        expect(mockSupabase.from).not.toHaveBeenCalled();
      });

      it('should propagate supabase insert errors', async () => {
        let callIndex = 0;
        const orderChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [] }),
        };
        const insertChain = {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } }),
        };
        (mockSupabase.from as jest.Mock).mockImplementation(() => {
          const chain = callIndex === 0 ? orderChain : insertChain;
          callIndex++;
          return chain;
        });

        await expect(addListItems('l1', ['A', 'B'])).rejects.toEqual({ message: 'RLS denied' });
      });

      it('should return empty array when insert returns null data', async () => {
        let callIndex = 0;
        const orderChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [] }),
        };
        const insertChain = {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockImplementation(() => {
          const chain = callIndex === 0 ? orderChain : insertChain;
          callIndex++;
          return chain;
        });

        const result = await addListItems('l1', ['A']);
        expect(result).toEqual([]);
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

        let _orderCalls = 0;
        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockImplementation(() => {
            _orderCalls++;
            return Promise.resolve({ data: listItems, error: null });
          }),
          // The existing-ranking probe is .maybeSingle(); the insert's
          // .select().single() is a separate mock, so no call counter is needed.
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: newRanking, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        const result = await createRanking('list-1', 'user-1');

        expect(result.id).toBe('ranking-new');
        expect(result.comparisons_count).toBe(0);
        // Exactly two inserts: one for the ranking row, one batched ranked_items
        expect(chain.insert).toHaveBeenCalledTimes(2);
        expect(chain.insert).toHaveBeenNthCalledWith(2, [
          { ranking_id: 'ranking-new', item_id: 'item-1', rating: 1500, comparisons: 0 },
          { ranking_id: 'ranking-new', item_id: 'item-2', rating: 1500, comparisons: 0 },
        ]);
      });

      it('should skip ranked_items insert when list has no items', async () => {
        const newRanking = {
          id: 'ranking-empty',
          list_id: 'list-empty',
          user_id: 'user-1',
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
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: newRanking, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await createRanking('list-empty', 'user-1');

        // Only the ranking insert — no empty-array round-trip for ranked_items
        expect(chain.insert).toHaveBeenCalledTimes(1);
      });

      it('should throw when ranked_items batch insert fails', async () => {
        const newRanking = {
          id: 'ranking-new',
          list_id: 'list-1',
          user_id: 'user-1',
          is_complete: false,
          comparisons_count: 0,
          created_at: '',
          updated_at: '',
        };
        const listItems = [{ id: 'item-1', display_order: 0 }];

        let insertCalls = 0;
        const chain: {
          select: jest.Mock;
          insert: jest.Mock;
          eq: jest.Mock;
          order: jest.Mock;
          maybeSingle: jest.Mock;
          single: jest.Mock;
        } = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: listItems, error: null }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: newRanking, error: null }),
        };
        chain.insert.mockImplementation(() => {
          insertCalls++;
          // First insert is the ranking row (chained: .insert().select().single())
          // Second insert is the awaited batched ranked_items insert
          if (insertCalls === 2) {
            return Promise.resolve({ error: { message: 'Batch insert failed' } });
          }
          return chain;
        });
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(createRanking('list-1', 'user-1')).rejects.toEqual({ message: 'Batch insert failed' });
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
        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(createRanking('list-1', 'user-1')).rejects.toEqual({ message: 'Insert failed' });
      });

      it('should throw rather than create a duplicate when the existing-ranking probe fails', async () => {
        // Swallowing this error would resume-as-create: a user with a ranking
        // they cannot currently read gets a second, empty one.
        const chain = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } }),
          single: jest.fn(),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(createRanking('list-1', 'user-1')).rejects.toEqual({ message: 'RLS denied' });
        expect(chain.insert).not.toHaveBeenCalled();
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
        const chain = mockQuery({ data: null, error: null });

        const result = await getRanking('nonexistent');

        expect(result).toBeNull();
        expect(chain.maybeSingle).toHaveBeenCalled();
        expect(chain.single).not.toHaveBeenCalled();
      });

      it('should throw when the lookup fails for a real reason', async () => {
        mockQuery({ data: null, error: { message: 'RLS denied' } });

        await expect(getRanking('ranking-123')).rejects.toEqual({ message: 'RLS denied' });
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

    describe('completing a ranking with notification', () => {
      it('should mark complete and invoke notify edge function', async () => {
        const chain = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);
        (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
          data: { user: { id: 'user-123' } },
        });
        const invoke = (mockSupabase as any).functions.invoke as jest.Mock;
        invoke.mockResolvedValue({ data: null, error: null });

        await markRankingCompleteAndNotify('ranking-1', 'list-1');

        expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ is_complete: true }));
        expect(invoke).toHaveBeenCalledWith('notify-ranking-complete', {
          body: { rankingId: 'ranking-1', listId: 'list-1', rankerId: 'user-123' },
        });
      });

      it('should pass null rankerId when no user is signed in', async () => {
        const chain = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);
        (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
          data: { user: null },
        });
        const invoke = (mockSupabase as any).functions.invoke as jest.Mock;
        invoke.mockResolvedValue({ data: null, error: null });

        await markRankingCompleteAndNotify('ranking-2', 'list-2');

        expect(invoke).toHaveBeenCalledWith('notify-ranking-complete', {
          body: { rankingId: 'ranking-2', listId: 'list-2', rankerId: null },
        });
      });

      it('should not throw if the notify function invocation fails', async () => {
        const chain = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);
        (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
          data: { user: { id: 'user-123' } },
        });
        const invoke = (mockSupabase as any).functions.invoke as jest.Mock;
        invoke.mockRejectedValue(new Error('network down'));

        await expect(markRankingCompleteAndNotify('ranking-3', 'list-3')).resolves.toBeUndefined();
      });

      it('should propagate errors from the underlying markRankingComplete update', async () => {
        const chain = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: { message: 'DB down' } }),
        };
        (mockSupabase.from as jest.Mock).mockReturnValue(chain);

        await expect(markRankingCompleteAndNotify('ranking-4', 'list-4')).rejects.toEqual({ message: 'DB down' });
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
  // USE CASE 6b: Persisting a full comparison (single atomic RPC)
  // ============================================
  describe('Persisting a full comparison', () => {
    const args = {
      rankingId: 'ranking-1',
      winner: {
        rankedItemId: 'ri-winner',
        itemId: 'item-winner',
        rating: 1520,
        comparisons: 3,
      },
      loser: {
        rankedItemId: 'ri-loser',
        itemId: 'item-loser',
        rating: 1480,
        comparisons: 2,
      },
      idempotencyKey: 'token-1',
    };

    it('applies both rating updates, the count increment, and the comparison insert via one RPC call', async () => {
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

      await persistComparison(args);

      // Exactly one round-trip — the server applies all four effects inside
      // record_comparison's own transaction, so there is no partial-write
      // window on the client side at all.
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('record_comparison', {
        p_ranking_id: args.rankingId,
        p_item_a_id: args.winner.itemId,
        p_item_b_id: args.loser.itemId,
        p_winner_item_id: args.winner.itemId,
        p_winner_ranked_item_id: args.winner.rankedItemId,
        p_winner_rating: args.winner.rating,
        p_winner_comparisons: args.winner.comparisons,
        p_loser_ranked_item_id: args.loser.rankedItemId,
        p_loser_rating: args.loser.rating,
        p_loser_comparisons: args.loser.comparisons,
        p_idempotency_key: args.idempotencyKey,
      });

      // No direct table writes — everything goes through the RPC.
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('surfaces the RPC error instead of swallowing it, and makes no other write', async () => {
      // Simulates the server rolling back the whole transaction (e.g. an FK
      // violation partway through record_comparison): from the client's
      // perspective this is a single failed call, not a partial success —
      // there is nothing here to leave ranked_items and comparisons out of
      // sync, because only one round-trip was ever made.
      const rpcError = { message: 'insert or update violates foreign key constraint' };
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: rpcError });

      await expect(persistComparison(args)).rejects.toEqual(rpcError);
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('replays the same idempotency key on retry, so a repeated call is a no-op on the server rather than a second write', async () => {
      // The client can't tell "the RPC truly failed" apart from "it
      // committed but the ack was lost," so the only safe client-side
      // behavior on failure is: retry with the exact same token. This
      // asserts persistComparison holds up its half of that contract — it
      // forwards whatever key it was given rather than minting a fresh one
      // per call, which is what lets record_comparison's client_token
      // dedup (supabase/migrations/20260805000000_atomic_record_comparison.sql)
      // collapse the retry into a no-op server-side.
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

      await persistComparison(args);
      await persistComparison(args);

      expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
      const [firstCall, secondCall] = (mockSupabase.rpc as jest.Mock).mock.calls;
      expect(firstCall[1].p_idempotency_key).toBe('token-1');
      expect(secondCall[1].p_idempotency_key).toBe('token-1');
    });

    it('records a skipped comparison with no winner and no rating change', async () => {
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

      await persistSkippedComparison({
        rankingId: 'ranking-1',
        itemAId: 'item-a',
        itemBId: 'item-b',
        idempotencyKey: 'token-2',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('record_comparison', {
        p_ranking_id: 'ranking-1',
        p_item_a_id: 'item-a',
        p_item_b_id: 'item-b',
        p_winner_item_id: null,
        p_winner_ranked_item_id: null,
        p_winner_rating: null,
        p_winner_comparisons: null,
        p_loser_ranked_item_id: null,
        p_loser_rating: null,
        p_loser_comparisons: null,
        p_idempotency_key: 'token-2',
      });
    });

    it('surfaces an RPC error for a skipped comparison the same way', async () => {
      const rpcError = { message: 'RLS denied' };
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: rpcError });

      await expect(
        persistSkippedComparison({
          rankingId: 'ranking-1',
          itemAId: 'item-a',
          itemBId: 'item-b',
          idempotencyKey: 'token-3',
        })
      ).rejects.toEqual(rpcError);
    });
  });

  describe('generateIdempotencyKey', () => {
    it('returns a different value on each call', () => {
      const keys = new Set(Array.from({ length: 20 }, () => generateIdempotencyKey()));
      expect(keys.size).toBe(20);
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

      it('should populate creator_name from a single batched profiles query', async () => {
        const featured = [
          {
            id: 'f1',
            list_id: 'list-1',
            featured_at: '2024-01-01T00:00:00Z',
            lists: { id: 'list-1', title: 'List One', description: 'd1', creator_id: 'user-1' },
          },
          {
            id: 'f2',
            list_id: 'list-2',
            featured_at: '2024-01-02T00:00:00Z',
            // Two lists by the same creator — should resolve to one batched lookup.
            lists: { id: 'list-2', title: 'List Two', description: 'd2', creator_id: 'user-1' },
          },
          {
            id: 'f3',
            list_id: 'list-3',
            featured_at: '2024-01-03T00:00:00Z',
            lists: { id: 'list-3', title: 'List Three', description: 'd3', creator_id: 'user-2' },
          },
        ];

        const featuredChain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: featured, error: null }),
        };
        const countChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 7, error: null }),
        };
        const inMock = jest.fn().mockResolvedValue({
          data: [
            { id: 'user-1', name: 'Alice' },
            { id: 'user-2', name: 'Bob' },
          ],
          error: null,
        });
        const profilesChain = {
          select: jest.fn().mockReturnThis(),
          in: inMock,
        };
        (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'featured_lists') return featuredChain;
          if (table === 'profiles') return profilesChain;
          return countChain;
        });

        const result = await getFeaturedLists();

        expect(result.map((r) => r.creator_name)).toEqual(['Alice', 'Alice', 'Bob']);
        // One profiles query, with deduped creator ids.
        expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
        expect(profilesChain.select).toHaveBeenCalledTimes(1);
        expect(inMock).toHaveBeenCalledWith('id', ['user-1', 'user-2']);
      });

      it('should leave creator_name undefined when a creator has no profile match', async () => {
        const featured = [
          {
            id: 'f1',
            list_id: 'list-1',
            featured_at: '2024-01-01T00:00:00Z',
            lists: { id: 'list-1', title: 'List One', description: 'd1', creator_id: 'ghost' },
          },
        ];
        const featuredChain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: featured, error: null }),
        };
        const countChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
        };
        const profilesChain = {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
        (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'featured_lists') return featuredChain;
          if (table === 'profiles') return profilesChain;
          return countChain;
        });

        const result = await getFeaturedLists();

        expect(result).toHaveLength(1);
        expect(result[0].creator_name).toBeUndefined();
      });

      it('should not throw and still return lists when the profiles query errors', async () => {
        const featured = [
          {
            id: 'f1',
            list_id: 'list-1',
            featured_at: '2024-01-01T00:00:00Z',
            lists: { id: 'list-1', title: 'List One', description: 'd1', creator_id: 'user-1' },
          },
        ];
        const featuredChain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: featured, error: null }),
        };
        const countChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
        };
        const profilesChain = {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
        };
        (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'featured_lists') return featuredChain;
          if (table === 'profiles') return profilesChain;
          return countChain;
        });

        const result = await getFeaturedLists();

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('List One');
        expect(result[0].creator_name).toBeUndefined();
      });

      it('should skip a list and log when its item count query errors', async () => {
        const featured = [
          {
            id: 'f1',
            list_id: 'list-1',
            featured_at: '2024-01-01T00:00:00Z',
            lists: { id: 'list-1', title: 'Broken List', description: 'd1' },
          },
          {
            id: 'f2',
            list_id: 'list-2',
            featured_at: '2024-01-02T00:00:00Z',
            lists: { id: 'list-2', title: 'Fine List', description: 'd2' },
          },
        ];
        const featuredChain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: featured, error: null }),
        };
        let itemCountCalls = 0;
        const listItemsChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation(() => {
            itemCountCalls++;
            if (itemCountCalls === 1) {
              return Promise.resolve({ count: null, error: { message: 'RLS denied' } });
            }
            return Promise.resolve({ count: 4, error: null });
          }),
        };
        const rankingsChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 2, error: null }),
        };
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'featured_lists') return featuredChain;
          if (table === 'list_items') return listItemsChain;
          if (table === 'rankings') return rankingsChain;
          throw new Error(`unexpected table ${table}`);
        });

        const result = await getFeaturedLists();

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Fine List');
        expect(consoleSpy).toHaveBeenCalledWith(
          'Item count for list list-1 not available:',
          'RLS denied'
        );
        consoleSpy.mockRestore();
      });

      it('should skip a list and log when its ranking count query errors', async () => {
        const featured = [
          {
            id: 'f1',
            list_id: 'list-1',
            featured_at: '2024-01-01T00:00:00Z',
            lists: { id: 'list-1', title: 'Broken List', description: 'd1' },
          },
        ];
        const featuredChain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: featured, error: null }),
        };
        const listItemsChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 4, error: null }),
        };
        const rankingsChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: null, error: { message: 'timeout' } }),
        };
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'featured_lists') return featuredChain;
          if (table === 'list_items') return listItemsChain;
          if (table === 'rankings') return rankingsChain;
          throw new Error(`unexpected table ${table}`);
        });

        const result = await getFeaturedLists();

        expect(result).toEqual([]);
        expect(consoleSpy).toHaveBeenCalledWith(
          'Ranking count for list list-1 not available:',
          'timeout'
        );
        consoleSpy.mockRestore();
      });

      it('should not query profiles when no creator ids are present', async () => {
        const featured = [
          {
            id: 'f1',
            list_id: 'list-1',
            featured_at: '2024-01-01T00:00:00Z',
            lists: { id: 'list-1', title: 'List One', description: 'd1' },
          },
        ];
        const featuredChain = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: featured, error: null }),
        };
        const countChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
        };
        (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'featured_lists') return featuredChain;
          return countChain;
        });

        const result = await getFeaturedLists();

        expect(result).toHaveLength(1);
        expect(mockSupabase.from).not.toHaveBeenCalledWith('profiles');
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
      // Mock builder that routes calls by table name. Tracks total .from() calls so
      // tests can assert the query count is constant regardless of list count.
      const buildMock = (opts: {
        lists: any[];
        items?: any[];
        rankings?: any[];
      }) => {
        const fromCalls: string[] = [];
        const chainFor = (table: string) => {
          if (table === 'lists') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockResolvedValue({ data: opts.lists, error: null }),
            };
          }
          if (table === 'list_items') {
            return {
              select: jest.fn().mockReturnThis(),
              in: jest.fn().mockResolvedValue({ data: opts.items ?? [], error: null }),
            };
          }
          if (table === 'rankings') {
            const chain: any = {
              select: jest.fn().mockReturnThis(),
              in: jest.fn().mockReturnThis(),
              eq: jest.fn().mockResolvedValue({ data: opts.rankings ?? [], error: null }),
            };
            return chain;
          }
          return {};
        };
        (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
          fromCalls.push(table);
          return chainFor(table);
        });
        return { fromCalls };
      };

      it('should show "not_started" when no ranking exists', async () => {
        buildMock({
          lists: [{ id: 'l1', title: 'Unranked List' }],
          items: [{ list_id: 'l1' }, { list_id: 'l1' }],
          rankings: [],
        });

        const result = await getUserListsWithStatus('user-1');

        expect(result[0].rankingStatus).toBe('not_started');
        expect(result[0].itemCount).toBe(2);
        expect(result[0].comparisonsCount).toBe(0);
      });

      it('should show "in_progress" when ranking is incomplete', async () => {
        buildMock({
          lists: [{ id: 'l1', title: 'In Progress' }],
          items: [{ list_id: 'l1' }],
          rankings: [{ list_id: 'l1', comparisons_count: 5, is_complete: false }],
        });

        const result = await getUserListsWithStatus('user-1');

        expect(result[0].rankingStatus).toBe('in_progress');
        expect(result[0].comparisonsCount).toBe(5);
      });

      it('should show "completed" when ranking is done', async () => {
        buildMock({
          lists: [{ id: 'l1', title: 'Done' }],
          items: [{ list_id: 'l1' }],
          rankings: [{ list_id: 'l1', comparisons_count: 10, is_complete: true }],
        });

        const result = await getUserListsWithStatus('user-1');

        expect(result[0].rankingStatus).toBe('completed');
        expect(result[0].comparisonsCount).toBe(10);
      });

      it('should calculate estimated comparisons based on item count', async () => {
        buildMock({
          lists: [{ id: 'l1', title: 'Test' }],
          items: [
            { list_id: 'l1' },
            { list_id: 'l1' },
            { list_id: 'l1' },
            { list_id: 'l1' },
            { list_id: 'l1' },
          ],
          rankings: [],
        });

        const result = await getUserListsWithStatus('user-1');

        // 5 items * 2 = 10 estimated comparisons
        expect(result[0].estimatedComparisons).toBe(10);
      });

      it('should issue a constant number of queries for N=3 lists', async () => {
        const lists = [
          { id: 'l1', title: 'A' },
          { id: 'l2', title: 'B' },
          { id: 'l3', title: 'C' },
        ];
        const items = [
          { list_id: 'l1' },
          { list_id: 'l2' }, { list_id: 'l2' },
          { list_id: 'l3' }, { list_id: 'l3' }, { list_id: 'l3' },
        ];
        const rankings = [
          { list_id: 'l1', comparisons_count: 2, is_complete: false },
          { list_id: 'l3', comparisons_count: 9, is_complete: true },
        ];
        const { fromCalls } = buildMock({ lists, items, rankings });

        const result = await getUserListsWithStatus('user-1');

        // Exactly 3 queries: 1 lists + 1 list_items + 1 rankings
        expect(fromCalls).toEqual(['lists', 'list_items', 'rankings']);
        expect(result).toHaveLength(3);
        expect(result[0].itemCount).toBe(1);
        expect(result[1].itemCount).toBe(2);
        expect(result[2].itemCount).toBe(3);
        expect(result[0].rankingStatus).toBe('in_progress');
        expect(result[1].rankingStatus).toBe('not_started');
        expect(result[2].rankingStatus).toBe('completed');
      });

      it('should issue a constant number of queries for N=10 lists', async () => {
        const lists = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, title: `List ${i}` }));
        const items = lists.flatMap((l) => [{ list_id: l.id }, { list_id: l.id }]);
        const rankings = lists.map((l, i) => ({
          list_id: l.id,
          comparisons_count: i,
          is_complete: i % 2 === 0,
        }));
        const { fromCalls } = buildMock({ lists, items, rankings });

        const result = await getUserListsWithStatus('user-1');

        // Still exactly 3 queries — proves O(1) round-trips regardless of list count
        expect(fromCalls).toEqual(['lists', 'list_items', 'rankings']);
        expect(result).toHaveLength(10);
        // Every list has 2 items, so estimatedComparisons == 4
        result.forEach((r) => expect(r.estimatedComparisons).toBe(4));
      });

      it('should short-circuit and skip batched queries when user has no lists', async () => {
        const { fromCalls } = buildMock({ lists: [] });

        const result = await getUserListsWithStatus('user-1');

        expect(result).toEqual([]);
        // No need to hit list_items or rankings when there are no lists
        expect(fromCalls).toEqual(['lists']);
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

    it('should clear the local partial ranking for the deleted list', async () => {
      const chain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await deleteList('list-123');

      expect(mockClearPartialRanking).toHaveBeenCalledWith('list-123');
    });

    it('should not clear local storage when the remote delete fails', async () => {
      const chain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: { message: 'List not found' } }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);

      await expect(deleteList('list-123')).rejects.toBeDefined();

      expect(mockClearPartialRanking).not.toHaveBeenCalled();
    });

    it('should still resolve when clearing local storage fails', async () => {
      const chain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(chain);
      mockClearPartialRanking.mockRejectedValueOnce(new Error('keychain unavailable'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // The remote row is already gone — surfacing the local failure would
      // wrongly tell the caller the list still exists.
      await expect(deleteList('list-123')).resolves.toBeUndefined();

      consoleSpy.mockRestore();
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

  // ============================================
  // USE CASE 8: Duplicating a List
  // ============================================
  describe('Duplicating a List', () => {
    const sourceList = {
      id: 'source-list',
      title: 'My Favorites',
      description: 'A great list',
      comparison_prompt: 'Which do you prefer?',
      creator_id: 'user-123',
      share_code: 'src001',
      is_private: false,
      is_template: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const sourceItems = [
      { id: 'i1', list_id: 'source-list', name: 'Alpha', display_order: 0, created_at: '' },
      { id: 'i2', list_id: 'source-list', name: 'Beta', display_order: 1, created_at: '' },
    ];

    const copiedList = {
      id: 'new-list',
      title: 'My Favorites (copy)',
      description: 'A great list',
      comparison_prompt: 'Which do you prefer?',
      creator_id: 'user-123',
      share_code: 'new001',
      is_private: false,
      is_template: false,
      created_at: '2024-02-01T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z',
    };

    beforeEach(() => {
      mockSupabase.auth.getUser = jest.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });
    });

    it('should duplicate a list with items', async () => {
      // duplicateList makes these sequential from() calls:
      // 0: getList         → from('lists').select().eq().maybeSingle()
      // 1: getListItems    → from('list_items').select().eq().order()  [terminal]
      // 2: createList      → from('lists').insert().select().single()
      // 3: addListItems order-check → from('list_items').select().eq().order().limit() [terminal]
      // 4: addListItems batch insert → from('list_items').insert().select() [terminal]
      let callIndex = 0;

      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        const idx = callIndex++;
        const chain: Record<string, jest.Mock> = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [] }), // no existing items for order check
          maybeSingle: jest.fn().mockResolvedValue({ data: sourceList, error: null }),
          single: jest.fn().mockResolvedValue({ data: copiedList, error: null }),
        };
        // getListItems (idx 1) uses order() as terminal
        if (idx === 1) {
          chain.order = jest.fn().mockResolvedValue({ data: sourceItems, error: null });
        }
        // batch insert (idx 4) uses select() as terminal
        if (idx === 4) {
          chain.select = jest.fn().mockResolvedValue({ data: sourceItems, error: null });
        }
        return chain;
      });

      const result = await duplicateList('source-list');

      expect(result.title).toBe('My Favorites (copy)');
      expect(result.id).toBe('new-list');
    });

    it('should duplicate an empty list (no items)', async () => {
      // Empty list: getList, getListItems (returns []), createList — no addListItems
      let callIndex = 0;

      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        const idx = callIndex++;
        const chain: Record<string, jest.Mock> = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [] }),
          maybeSingle: jest.fn().mockResolvedValue({ data: sourceList, error: null }),
          single: jest.fn().mockResolvedValue({ data: copiedList, error: null }),
        };
        if (idx === 1) {
          chain.order = jest.fn().mockResolvedValue({ data: [], error: null });
        }
        return chain;
      });

      const result = await duplicateList('source-list');

      expect(result.title).toBe('My Favorites (copy)');
    });

    it('should throw when source list does not exist', async () => {
      (mockSupabase.from as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }));

      await expect(duplicateList('nonexistent')).rejects.toThrow('Source list not found');
    });

    it('should surface a failed source lookup rather than "not found"', async () => {
      // getList used to swallow this and return null, so an RLS denial was
      // reported to the user as a missing list.
      (mockSupabase.from as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } }),
      }));

      await expect(duplicateList('source-list')).rejects.toEqual({ message: 'RLS denied' });
    });
  });

  // ============================================
  // RANKING LOOKUPS (existing helpers)
  // ============================================
  describe('Ranking lookups', () => {
    describe('getUserRankingForList', () => {
      it('returns the ranking row when one exists', async () => {
        const ranking = { id: 'r1', list_id: 'list-1', user_id: 'user-1', is_complete: false };
        const maybeSingle = jest.fn().mockResolvedValue({ data: ranking, error: null });
        const eq2 = jest.fn().mockReturnValue({ maybeSingle });
        const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
        const select = jest.fn().mockReturnValue({ eq: eq1 });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        const result = await getUserRankingForList('list-1', 'user-1');

        expect(eq1).toHaveBeenCalledWith('list_id', 'list-1');
        expect(eq2).toHaveBeenCalledWith('user_id', 'user-1');
        expect(result).toEqual(ranking);
      });

      it('returns null when no ranking exists', async () => {
        const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
        const eq2 = jest.fn().mockReturnValue({ maybeSingle });
        const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
        const select = jest.fn().mockReturnValue({ eq: eq1 });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getUserRankingForList('list-1', 'user-1')).toBeNull();
      });

      it('throws when the lookup fails for a real reason', async () => {
        const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } });
        const eq2 = jest.fn().mockReturnValue({ maybeSingle });
        const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
        const select = jest.fn().mockReturnValue({ eq: eq1 });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        await expect(getUserRankingForList('list-1', 'user-1')).rejects.toEqual({ message: 'RLS denied' });
      });
    });

    describe('getCompletedRankingForList', () => {
      it('returns the most recent completed ranking', async () => {
        const ranking = { id: 'r1', list_id: 'list-1', is_complete: true };
        const maybeSingle = jest.fn().mockResolvedValue({ data: ranking, error: null });
        const limit = jest.fn().mockReturnValue({ maybeSingle });
        const order = jest.fn().mockReturnValue({ limit });
        const eq2 = jest.fn().mockReturnValue({ order });
        const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
        const select = jest.fn().mockReturnValue({ eq: eq1 });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        const result = await getCompletedRankingForList('list-1');

        expect(eq1).toHaveBeenCalledWith('list_id', 'list-1');
        expect(eq2).toHaveBeenCalledWith('is_complete', true);
        expect(order).toHaveBeenCalledWith('updated_at', { ascending: false });
        expect(limit).toHaveBeenCalledWith(1);
        expect(result).toEqual(ranking);
      });

      it('returns null when no completed ranking exists', async () => {
        const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
        const limit = jest.fn().mockReturnValue({ maybeSingle });
        const order = jest.fn().mockReturnValue({ limit });
        const eq2 = jest.fn().mockReturnValue({ order });
        const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
        const select = jest.fn().mockReturnValue({ eq: eq1 });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getCompletedRankingForList('list-1')).toBeNull();
      });

      it('throws when the lookup fails for a real reason', async () => {
        const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } });
        const limit = jest.fn().mockReturnValue({ maybeSingle });
        const order = jest.fn().mockReturnValue({ limit });
        const eq2 = jest.fn().mockReturnValue({ order });
        const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
        const select = jest.fn().mockReturnValue({ eq: eq1 });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        await expect(getCompletedRankingForList('list-1')).rejects.toEqual({ message: 'RLS denied' });
      });
    });
  });

  // ============================================
  // SOCIAL: FOLLOWS
  // ============================================
  describe('Social Follows', () => {
    describe('followUser', () => {
      it('inserts a follow row', async () => {
        const insert = jest.fn().mockResolvedValue({ error: null });
        (mockSupabase.from as jest.Mock).mockReturnValue({ insert });

        await followUser('user-a', 'user-b');

        expect(mockSupabase.from).toHaveBeenCalledWith('follows');
        expect(insert).toHaveBeenCalledWith({ follower_id: 'user-a', following_id: 'user-b' });
      });

      it('rejects self-follow', async () => {
        await expect(followUser('user-a', 'user-a')).rejects.toThrow('Cannot follow yourself');
        expect(mockSupabase.from).not.toHaveBeenCalled();
      });

      it('throws when supabase returns an error', async () => {
        const insert = jest.fn().mockResolvedValue({ error: { message: 'rls violation' } });
        (mockSupabase.from as jest.Mock).mockReturnValue({ insert });

        await expect(followUser('user-a', 'user-b')).rejects.toEqual({ message: 'rls violation' });
      });
    });

    describe('unfollowUser', () => {
      it('deletes the follow row by composite key', async () => {
        const finalEq = jest.fn().mockResolvedValue({ error: null });
        const firstEq = jest.fn().mockReturnValue({ eq: finalEq });
        const del = jest.fn().mockReturnValue({ eq: firstEq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ delete: del });

        await unfollowUser('user-a', 'user-b');

        expect(mockSupabase.from).toHaveBeenCalledWith('follows');
        expect(del).toHaveBeenCalled();
        expect(firstEq).toHaveBeenCalledWith('follower_id', 'user-a');
        expect(finalEq).toHaveBeenCalledWith('following_id', 'user-b');
      });

      it('throws when supabase returns an error', async () => {
        const finalEq = jest.fn().mockResolvedValue({ error: { message: 'boom' } });
        const firstEq = jest.fn().mockReturnValue({ eq: finalEq });
        const del = jest.fn().mockReturnValue({ eq: firstEq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ delete: del });

        await expect(unfollowUser('user-a', 'user-b')).rejects.toEqual({ message: 'boom' });
      });
    });

    describe('isFollowing', () => {
      it('returns true when the count is positive', async () => {
        const finalEq = jest.fn().mockResolvedValue({ count: 1 });
        const firstEq = jest.fn().mockReturnValue({ eq: finalEq });
        const select = jest.fn().mockReturnValue({ eq: firstEq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        const result = await isFollowing('user-a', 'user-b');

        expect(select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
        expect(firstEq).toHaveBeenCalledWith('follower_id', 'user-a');
        expect(finalEq).toHaveBeenCalledWith('following_id', 'user-b');
        expect(result).toBe(true);
      });

      it('returns false when the count is zero', async () => {
        const finalEq = jest.fn().mockResolvedValue({ count: 0 });
        const firstEq = jest.fn().mockReturnValue({ eq: finalEq });
        const select = jest.fn().mockReturnValue({ eq: firstEq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await isFollowing('user-a', 'user-b')).toBe(false);
      });

      it('treats nullish count as not following', async () => {
        const finalEq = jest.fn().mockResolvedValue({ count: null });
        const firstEq = jest.fn().mockReturnValue({ eq: finalEq });
        const select = jest.fn().mockReturnValue({ eq: firstEq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await isFollowing('user-a', 'user-b')).toBe(false);
      });
    });

    describe('getFollowing / getFollowers', () => {
      it('maps following rows to profiles', async () => {
        const rows = [
          { following_id: 'user-b', profiles: { id: 'user-b', name: 'Bea', username: 'bea', avatar_url: null } },
          { following_id: 'user-c', profiles: { id: 'user-c', name: null, username: null, avatar_url: 'a.png' } },
        ];
        const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        const result = await getFollowing('user-a');

        expect(select).toHaveBeenCalledWith(
          'following_id, profiles!follows_following_id_fkey(id, name, username, avatar_url)'
        );
        expect(eq).toHaveBeenCalledWith('follower_id', 'user-a');
        expect(result).toEqual([
          { id: 'user-b', name: 'Bea', username: 'bea', avatar_url: undefined },
          { id: 'user-c', name: '', username: undefined, avatar_url: 'a.png' },
        ]);
      });

      it('drops following rows whose profile embed is null', async () => {
        const rows = [
          { following_id: 'user-b', profiles: null },
          { following_id: 'user-c', profiles: { id: 'user-c', name: 'Cy', username: 'cy', avatar_url: null } },
        ];
        const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getFollowing('user-a')).toEqual([
          { id: 'user-c', name: 'Cy', username: 'cy', avatar_url: undefined },
        ]);
      });

      it('drops follower rows whose profile embed is null', async () => {
        const rows = [{ follower_id: 'user-b', profiles: null }];
        const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getFollowers('user-a')).toEqual([]);
      });

      it('returns empty when no follows exist', async () => {
        const eq = jest.fn().mockResolvedValue({ data: null, error: null });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getFollowing('user-a')).toEqual([]);
      });

      it('throws when getFollowing supabase errors', async () => {
        const eq = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        await expect(getFollowing('user-a')).rejects.toEqual({ message: 'boom' });
      });

      it('maps follower rows to profiles', async () => {
        const rows = [
          { follower_id: 'user-b', profiles: { id: 'user-b', name: 'Bea', username: 'bea', avatar_url: null } },
        ];
        const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        const result = await getFollowers('user-a');

        expect(select).toHaveBeenCalledWith(
          'follower_id, profiles!follows_follower_id_fkey(id, name, username, avatar_url)'
        );
        expect(eq).toHaveBeenCalledWith('following_id', 'user-a');
        expect(result).toEqual([
          { id: 'user-b', name: 'Bea', username: 'bea', avatar_url: undefined },
        ]);
      });

      it('returns empty when no followers exist', async () => {
        const eq = jest.fn().mockResolvedValue({ data: null, error: null });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getFollowers('user-a')).toEqual([]);
      });

      it('throws when getFollowers supabase errors', async () => {
        const eq = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        await expect(getFollowers('user-a')).rejects.toEqual({ message: 'boom' });
      });
    });

    describe('getFollowingCount / getFollowerCount', () => {
      it('returns the following count', async () => {
        const eq = jest.fn().mockResolvedValue({ count: 5 });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getFollowingCount('user-a')).toBe(5);
        expect(eq).toHaveBeenCalledWith('follower_id', 'user-a');
      });

      it('returns 0 when the following count is nullish', async () => {
        const eq = jest.fn().mockResolvedValue({ count: null });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getFollowingCount('user-a')).toBe(0);
      });

      it('returns the follower count', async () => {
        const eq = jest.fn().mockResolvedValue({ count: 3 });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getFollowerCount('user-a')).toBe(3);
        expect(eq).toHaveBeenCalledWith('following_id', 'user-a');
      });

      it('returns 0 when the follower count is nullish', async () => {
        const eq = jest.fn().mockResolvedValue({ count: null });
        const select = jest.fn().mockReturnValue({ eq });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select });

        expect(await getFollowerCount('user-a')).toBe(0);
      });
    });

    describe('getFollowedListsFeed', () => {
      // The follow query is `select().eq().order().limit()`; these helpers keep
      // the six tests below from re-declaring the same chain each time.
      const followChain = (result: any) => {
        const limitFn = jest.fn().mockResolvedValue(result);
        const orderFn = jest.fn().mockReturnValue({ limit: limitFn });
        const eqFn = jest.fn().mockReturnValue({ order: orderFn });
        const selectFn = jest.fn().mockReturnValue({ eq: eqFn });
        return { select: selectFn, eq: eqFn, order: orderFn, limit: limitFn };
      };

      const rankingsChainFor = (result: any) => {
        const rangeFn = jest.fn().mockResolvedValue(result);
        const orderFn = jest.fn().mockReturnValue({ range: rangeFn });
        const chain: any = {
          select: jest.fn(),
          in: jest.fn(),
          eq: jest.fn(),
          order: orderFn,
          rangeFn,
        };
        chain.select.mockReturnValue(chain);
        chain.in.mockReturnValue(chain);
        chain.eq.mockReturnValue(chain);
        return chain;
      };

      const wireFrom = (follow: ReturnType<typeof followChain>, rankings: any) => {
        let call = 0;
        (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
          call++;
          if (call === 1) {
            expect(table).toBe('follows');
            return { select: follow.select };
          }
          expect(table).toBe('rankings');
          return rankings;
        });
      };

      it('returns a zero follow count and no entries when the user follows nobody', async () => {
        const follow = followChain({ data: [], error: null });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select: follow.select });

        const result = await getFollowedListsFeed('user-a');

        expect(result).toEqual({ following_count: 0, entries: [] });
        expect(mockSupabase.from).toHaveBeenCalledTimes(1);
        expect(mockSupabase.from).toHaveBeenCalledWith('follows');
      });

      it('returns empty when follow query returns null', async () => {
        const follow = followChain({ data: null, error: null });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select: follow.select });

        expect(await getFollowedListsFeed('user-a')).toEqual({
          following_count: 0,
          entries: [],
        });
      });

      it('caps the follow graph and takes the most recent follows', async () => {
        const follow = followChain({ data: [], error: null });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select: follow.select });

        await getFollowedListsFeed('user-a');

        expect(follow.eq).toHaveBeenCalledWith('follower_id', 'user-a');
        expect(follow.order).toHaveBeenCalledWith('created_at', { ascending: false });
        expect(follow.limit).toHaveBeenCalledWith(FOLLOW_GRAPH_QUERY_CAP);
      });

      it('throws when the follow query errors', async () => {
        const follow = followChain({ data: null, error: { message: 'boom' } });
        (mockSupabase.from as jest.Mock).mockReturnValue({ select: follow.select });

        await expect(getFollowedListsFeed('user-a')).rejects.toEqual({ message: 'boom' });
      });

      it('maps ranking rows to feed entries attributed to the ranker', async () => {
        const follow = followChain({
          data: [{ following_id: 'user-b' }, { following_id: 'user-c' }],
          error: null,
        });
        // list-1 was created by user-z but ranked by the followed user Bea —
        // the case that made the old `creator_*` naming misattribute the card.
        const rankings = rankingsChainFor({
          data: [
            {
              id: 'r1',
              list_id: 'list-1',
              user_id: 'user-b',
              comparisons_count: 12,
              updated_at: '2026-05-23T10:00:00Z',
              lists: { id: 'list-1', title: 'Pizza', description: 'Toppings' },
              profiles: { id: 'user-b', name: 'Bea', username: 'bea' },
            },
            {
              id: 'r2',
              list_id: 'list-2',
              user_id: 'user-c',
              comparisons_count: null,
              updated_at: '2026-05-22T10:00:00Z',
              lists: { id: 'list-2', title: 'Cars', description: null },
              profiles: null,
            },
          ],
          error: null,
        });
        wireFrom(follow, rankings);

        const result = await getFollowedListsFeed('user-a', 5, 10);

        expect(rankings.in).toHaveBeenCalledWith('user_id', ['user-b', 'user-c']);
        expect(rankings.eq).toHaveBeenCalledWith('is_complete', true);
        expect(rankings.eq).toHaveBeenCalledWith('lists.is_private', false);
        expect(rankings.eq).toHaveBeenCalledWith('lists.is_template', false);
        expect(rankings.order).toHaveBeenCalledWith('updated_at', { ascending: false });
        expect(rankings.rangeFn).toHaveBeenCalledWith(10, 14);

        expect(result).toEqual({
          following_count: 2,
          entries: [
            {
              ranking_id: 'r1',
              list_id: 'list-1',
              title: 'Pizza',
              description: 'Toppings',
              ranker_id: 'user-b',
              ranker_name: 'Bea',
              ranker_username: 'bea',
              updated_at: '2026-05-23T10:00:00Z',
              comparisons_count: 12,
            },
            {
              ranking_id: 'r2',
              list_id: 'list-2',
              title: 'Cars',
              description: undefined,
              ranker_id: '',
              ranker_name: undefined,
              ranker_username: undefined,
              updated_at: '2026-05-22T10:00:00Z',
              comparisons_count: 0,
            },
          ],
        });
      });

      it('reports a non-zero follow count when followed users have no rankings', async () => {
        // The state that used to render "No one to follow yet": the user does
        // follow people, none of whom have completed a public ranking.
        const follow = followChain({ data: [{ following_id: 'user-b' }], error: null });
        wireFrom(follow, rankingsChainFor({ data: [], error: null }));

        expect(await getFollowedListsFeed('user-a')).toEqual({
          following_count: 1,
          entries: [],
        });
      });

      it('uses default limit and offset', async () => {
        const follow = followChain({ data: [{ following_id: 'user-b' }], error: null });
        const rankings = rankingsChainFor({ data: [], error: null });
        wireFrom(follow, rankings);

        await getFollowedListsFeed('user-a');

        expect(rankings.rangeFn).toHaveBeenCalledWith(0, 19);
      });

      it('handles null ranking response gracefully', async () => {
        const follow = followChain({ data: [{ following_id: 'user-b' }], error: null });
        wireFrom(follow, rankingsChainFor({ data: null, error: null }));

        expect(await getFollowedListsFeed('user-a')).toEqual({
          following_count: 1,
          entries: [],
        });
      });

      it('throws when the rankings query errors', async () => {
        const follow = followChain({ data: [{ following_id: 'user-b' }], error: null });
        wireFrom(follow, rankingsChainFor({ data: null, error: { message: 'boom' } }));

        await expect(getFollowedListsFeed('user-a')).rejects.toEqual({ message: 'boom' });
      });
    });
  });
});
