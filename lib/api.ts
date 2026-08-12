import { supabase } from './supabase';
import { clearPartialRanking } from './partial-ranking';
import { estimateComparisonsNeeded } from './elo';

// Types
export interface List {
  id: string;
  title: string;
  description?: string;
  comparison_prompt?: string;
  creator_id: string;
  is_private: boolean;
  is_template: boolean;
  share_code: string;
  created_at: string;
  updated_at: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export interface Ranking {
  id: string;
  list_id: string;
  user_id: string | null;
  session_id?: string;
  is_complete: boolean;
  comparisons_count: number;
  created_at: string;
  updated_at: string;
}

export interface RankedItem {
  id: string;
  ranking_id: string;
  item_id: string;
  rating: number;
  comparisons: number;
}

export interface ListWithStatus extends List {
  itemCount: number;
  rankingStatus: 'not_started' | 'in_progress' | 'completed';
  comparisonsCount: number;
  estimatedComparisons: number;
}

export interface Profile {
  id: string;
  name: string;
  username?: string;
  avatar_url?: string;
}

/**
 * One entry in the Following feed. Every identity field here describes the
 * **ranker** — the followed user whose completed ranking put this row in the
 * feed — not the person who created the list. The two are routinely different
 * (share codes mean anyone can rank anyone's list), so they do not share a
 * field prefix and the UI must not label this "by X" the way the For You tab
 * labels a list's actual creator.
 */
export interface FollowedListFeedEntry {
  ranking_id: string;
  list_id: string;
  title: string;
  description?: string;
  ranker_id: string;
  ranker_name?: string;
  ranker_username?: string;
  /**
   * Last time the ranking row changed, not when it was completed — `rankings`
   * has no completion timestamp. A months-old ranking that receives one more
   * comparison moves back to the top of the feed; the name reflects that.
   */
  updated_at: string;
  comparisons_count: number;
}

/**
 * The Following feed plus the size of the follow graph it was built from.
 *
 * `entries` is empty for two unrelated reasons — the user follows nobody, or
 * the people they follow have not completed a public ranking — and the UI has
 * to say different things in each case. `following_count` separates them
 * without a second round-trip, since the feed already reads the follow graph.
 */
export interface FollowedListsFeed {
  /**
   * Follow edges read while building this feed. Capped at
   * `FOLLOW_GRAPH_QUERY_CAP`, so it is a lower bound once the cap is reached.
   * Only its zero/non-zero distinction is load-bearing today.
   */
  following_count: number;
  entries: FollowedListFeedEntry[];
}

// Generate random ID
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Thrown when an operation needs an owner but no valid session is available.
 * Call sites can catch this specifically to prompt for sign-in rather than
 * showing a generic failure.
 */
export class NotAuthenticatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotAuthenticatedError';
  }
}

/**
 * Resolve the signed-in user's id, or null if there isn't one.
 *
 * `supabase.auth.getUser()` validates the stored token against the server, so
 * this returns null when a session has expired or been revoked even though the
 * in-memory auth context still holds a user. Anything that needs an owner must
 * go through here instead of reading `user?.id` optimistically — see
 * `createList`.
 */
async function getAuthenticatedUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

// ============================================
// LISTS
// ============================================

export async function createList(data: {
  title: string;
  description?: string;
  comparison_prompt?: string;
  is_private?: boolean;
  /**
   * Permit creating a list with no owner (`creator_id: null`).
   *
   * Only the "rank something without an account" flow should set this. An
   * unowned list never comes back from `getUserLists` (which filters on
   * creator_id) and, under the current RLS policy, is updatable by anyone —
   * so it has to be a deliberate choice at the call site, never a silent
   * fallback when the session turns out to be missing.
   */
  allowAnonymous?: boolean;
}): Promise<List> {
  const userId = await getAuthenticatedUserId();

  if (!userId && !data.allowAnonymous) {
    throw new NotAuthenticatedError(
      'You must be signed in to create a list. Please sign in and try again.'
    );
  }

  const { data: list, error } = await supabase
    .from('lists')
    .insert({
      title: data.title,
      description: data.description,
      comparison_prompt: data.comparison_prompt,
      // Explicitly null rather than undefined, so an unowned list is a stated
      // intent in the payload instead of an omitted column.
      creator_id: userId,
      is_private: data.is_private || false,
      share_code: generateId().slice(0, 8),
    })
    .select()
    .single();

  if (error) throw error;
  return list;
}

export async function getList(id: string): Promise<List | null> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getListByShareCode(code: string): Promise<List | null> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('share_code', code)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getUserLists(userId: string): Promise<List[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getUserListsWithStatus(userId: string): Promise<ListWithStatus[]> {
  const lists = await getUserLists(userId);
  if (lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);

  // Batch-fetch items and rankings for all lists in two queries, regardless of N.
  // Total round-trips: 1 lists + 1 items + 1 rankings.
  const [itemsRes, rankingsRes] = await Promise.all([
    supabase.from('list_items').select('list_id').in('list_id', listIds),
    supabase
      .from('rankings')
      .select('list_id, comparisons_count, is_complete')
      .in('list_id', listIds)
      .eq('user_id', userId),
  ]);

  const itemCounts = new Map<string, number>();
  for (const row of itemsRes.data || []) {
    const id = (row as any).list_id;
    itemCounts.set(id, (itemCounts.get(id) || 0) + 1);
  }

  const rankingsByList = new Map<string, { comparisons_count: number; is_complete: boolean }>();
  for (const row of rankingsRes.data || []) {
    const id = (row as any).list_id;
    rankingsByList.set(id, {
      comparisons_count: (row as any).comparisons_count,
      is_complete: (row as any).is_complete,
    });
  }

  return lists.map((list) => {
    const itemCount = itemCounts.get(list.id) || 0;
    const ranking = rankingsByList.get(list.id);
    let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
    let comparisonsCount = 0;

    if (ranking) {
      comparisonsCount = ranking.comparisons_count;
      status = ranking.is_complete ? 'completed' : 'in_progress';
    }

    return {
      ...list,
      itemCount,
      rankingStatus: status,
      comparisonsCount,
      estimatedComparisons: estimateComparisonsNeeded(itemCount),
    };
  });
}

export async function getTemplateLists(): Promise<List[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('is_template', true)
    .order('title');

  if (error) throw error;
  return data || [];
}

export interface FeaturedList {
  id: string;
  list_id: string;
  featured_at: string;
  title: string;
  description?: string;
  item_count: number;
  ranking_count: number;
  creator_name?: string;
}

export async function getFeaturedLists(): Promise<FeaturedList[]> {
  const { data, error } = await supabase
    .from('featured_lists')
    .select(`
      id,
      list_id,
      featured_at,
      lists (
        id,
        title,
        description,
        creator_id
      )
    `)
    .order('featured_at', { ascending: false })
    .limit(20);

  if (error) {
    console.log('Featured lists not available:', error.message);
    return [];
  }

  // Transform the data, tracking each list's creator so names can be
  // resolved in a single batched query afterwards (avoids a per-list round-trip).
  const featured: FeaturedList[] = [];
  const creatorIdByListId = new Map<string, string>();
  for (const item of data || []) {
    const list = item.lists as any;
    if (!list) continue;

    // Get item count
    const { count: itemCount, error: itemCountError } = await supabase
      .from('list_items')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', list.id);

    if (itemCountError) {
      console.log(`Item count for list ${list.id} not available:`, itemCountError.message);
      continue;
    }

    // Get ranking count
    const { count: rankingCount, error: rankingCountError } = await supabase
      .from('rankings')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', list.id);

    if (rankingCountError) {
      console.log(`Ranking count for list ${list.id} not available:`, rankingCountError.message);
      continue;
    }

    if (list.creator_id) {
      creatorIdByListId.set(list.id, list.creator_id);
    }

    featured.push({
      id: item.id,
      list_id: list.id,
      featured_at: item.featured_at,
      title: list.title,
      description: list.description,
      item_count: itemCount || 0,
      ranking_count: rankingCount || 0,
    });
  }

  // Resolve creator display names in a single batched query, then map onto
  // each featured list. Unresolved creators simply leave creator_name undefined.
  const creatorIds = Array.from(new Set(creatorIdByListId.values()));
  if (creatorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', creatorIds);

    if (profilesError) {
      console.log('Creator names not available:', profilesError.message);
    } else {
      const nameById = new Map<string, string>();
      for (const profile of profiles || []) {
        if (profile?.id && profile.name) {
          nameById.set(profile.id, profile.name);
        }
      }
      for (const entry of featured) {
        const creatorId = creatorIdByListId.get(entry.list_id);
        if (creatorId) {
          entry.creator_name = nameById.get(creatorId);
        }
      }
    }
  }

  return featured;
}

export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase
    .from('lists')
    .delete()
    .eq('id', id);

  if (error) throw error;

  // The list id is the only handle on its local partial ranking; once the row
  // is gone nothing can ever discover that key again, so clear it here.
  // Best-effort: the remote delete already succeeded, and failing the call
  // would tell the caller the list still exists.
  try {
    await clearPartialRanking(id);
  } catch (localError) {
    console.error('Failed to clear partial ranking for deleted list:', localError);
  }
}

// ============================================
// LIST ITEMS
// ============================================

export async function getListItems(listId: string): Promise<ListItem[]> {
  const { data, error } = await supabase
    .from('list_items')
    .select('*')
    .eq('list_id', listId)
    .order('display_order');

  if (error) throw error;
  return data || [];
}

export async function addListItem(listId: string, name: string): Promise<ListItem> {
  // Get current max order
  const { data: existing } = await supabase
    .from('list_items')
    .select('display_order')
    .eq('list_id', listId)
    .order('display_order', { ascending: false })
    .limit(1);

  const maxOrder = existing?.[0]?.display_order ?? -1;

  const { data, error } = await supabase
    .from('list_items')
    .insert({
      list_id: listId,
      name,
      display_order: maxOrder + 1,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addListItems(listId: string, names: string[]): Promise<ListItem[]> {
  if (names.length === 0) return [];

  const { data: existing } = await supabase
    .from('list_items')
    .select('display_order')
    .eq('list_id', listId)
    .order('display_order', { ascending: false })
    .limit(1);

  const maxOrder = existing?.[0]?.display_order ?? -1;

  const rows = names.map((name, i) => ({
    list_id: listId,
    name,
    display_order: maxOrder + 1 + i,
  }));

  const { data, error } = await supabase
    .from('list_items')
    .insert(rows)
    .select();

  if (error) throw error;
  return data || [];
}

export async function deleteListItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// RANKINGS
// ============================================

export async function createRanking(listId: string, userId?: string): Promise<Ranking> {
  // Check for existing ranking
  if (userId) {
    const { data: existing, error: existingError } = await supabase
      .from('rankings')
      .select('*')
      .eq('list_id', listId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return existing;
  }

  const { data: ranking, error } = await supabase
    .from('rankings')
    .insert({
      list_id: listId,
      user_id: userId || null,
      session_id: userId ? null : generateId(),
      is_complete: false,
      comparisons_count: 0,
    })
    .select()
    .single();

  if (error) throw error;

  // Initialize ranked items
  const items = await getListItems(listId);
  if (items.length > 0) {
    const rows = items.map((item) => ({
      ranking_id: ranking.id,
      item_id: item.id,
      rating: 1500,
      comparisons: 0,
    }));
    const { error: insertError } = await supabase.from('ranked_items').insert(rows);
    if (insertError) throw insertError;
  }

  return ranking;
}

export async function getRanking(id: string): Promise<Ranking | null> {
  const { data, error } = await supabase
    .from('rankings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getUserRankingForList(listId: string, userId: string): Promise<Ranking | null> {
  const { data, error } = await supabase
    .from('rankings')
    .select('*')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getCompletedRankingForList(listId: string): Promise<Ranking | null> {
  const { data, error } = await supabase
    .from('rankings')
    .select('*')
    .eq('list_id', listId)
    .eq('is_complete', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getRankedItems(rankingId: string): Promise<RankedItem[]> {
  const { data, error } = await supabase
    .from('ranked_items')
    .select('*')
    .eq('ranking_id', rankingId)
    .order('rating', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateRankedItem(
  id: string,
  rating: number,
  comparisons: number
): Promise<void> {
  const { error } = await supabase
    .from('ranked_items')
    .update({ rating, comparisons })
    .eq('id', id);

  if (error) throw error;
}

export async function incrementComparisonsCount(rankingId: string): Promise<void> {
  // Atomic increment via RPC — see supabase/migrations/20260523000000_increment_comparisons_count.sql.
  // A read-then-update would race when concurrent comparisons land on the same ranking.
  const { error } = await supabase.rpc('increment_comparisons_count', {
    p_ranking_id: rankingId,
  });

  if (error) throw error;
}

export async function markRankingComplete(rankingId: string): Promise<void> {
  const { error } = await supabase
    .from('rankings')
    .update({
      is_complete: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rankingId);

  if (error) throw error;
}

/**
 * Mark a ranking complete and notify the list creator that someone finished
 * ranking their list. Calls a Supabase Edge Function (`notify-ranking-complete`)
 * which is responsible for looking up push tokens and dispatching via Expo's
 * push service.
 *
 * The notification send is best-effort: a failure here must NOT prevent the
 * ranking from being marked complete, since that's the user-visible action.
 */
export async function markRankingCompleteAndNotify(
  rankingId: string,
  listId: string
): Promise<void> {
  await markRankingComplete(rankingId);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    // SECURITY: rankerId is sent as a convenience hint only. The edge function
    // MUST derive the authoritative ranker identity from auth.uid() on the
    // verified JWT — never trust this client-supplied value for authorization
    // or for deciding whose contacts to notify.
    await supabase.functions.invoke('notify-ranking-complete', {
      body: {
        rankingId,
        listId,
        rankerId: user?.id ?? null,
      },
    });
  } catch {
    // Swallow — the ranking is already marked complete and notifications are
    // not worth failing the user flow over.
  }
}

export async function recordComparison(
  rankingId: string,
  itemAId: string,
  itemBId: string,
  winnerId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('comparisons')
    .insert({
      ranking_id: rankingId,
      item_a_id: itemAId,
      item_b_id: itemBId,
      winner_id: winnerId,
    });

  if (error) throw error;
}

// One side of a comparison. Grouping the four fields per side keeps
// rankedItemId (a ranked_items row) and itemId (a list_items row) from being
// transposable at the call site — they are both strings, and swapping them
// would silently update the wrong row and record the wrong winner.
export interface ComparisonSide {
  rankedItemId: string;
  itemId: string;
  rating: number;
  comparisons: number;
}

export interface PersistComparisonArgs {
  rankingId: string;
  winner: ComparisonSide;
  loser: ComparisonSide;
  idempotencyKey: string;
}

// A fresh token identifying one logical comparison write. Callers generate
// this once per write and must reuse the same value across retries of that
// same write — record_comparison uses it to collapse a retried call into a
// no-op instead of double-applying the count increment and audit-log insert.
// Not a cryptographic UUID: uniqueness within this device's session is all
// the dedup constraint needs.
export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Applies both ranked_items updates, the comparisons_count increment, and
// the comparisons insert in a single database transaction — see
// supabase/migrations/20260805000000_atomic_record_comparison.sql. A partial
// failure can no longer leave ranked_items desynced from the comparisons
// audit log, because there is exactly one round-trip: either the server
// commits all four writes or none of them land.
//
// `winner`/`loser` are optional so this also serves persistSkippedComparison
// below, which has no rating change to make.
async function recordComparisonAtomic(args: {
  rankingId: string;
  itemAId: string;
  itemBId: string;
  winnerItemId: string | null;
  winner: { rankedItemId: string; rating: number; comparisons: number } | null;
  loser: { rankedItemId: string; rating: number; comparisons: number } | null;
  idempotencyKey: string;
}): Promise<void> {
  const { error } = await supabase.rpc('record_comparison', {
    p_ranking_id: args.rankingId,
    p_item_a_id: args.itemAId,
    p_item_b_id: args.itemBId,
    p_winner_item_id: args.winnerItemId,
    p_winner_ranked_item_id: args.winner?.rankedItemId ?? null,
    p_winner_rating: args.winner?.rating ?? null,
    p_winner_comparisons: args.winner?.comparisons ?? null,
    p_loser_ranked_item_id: args.loser?.rankedItemId ?? null,
    p_loser_rating: args.loser?.rating ?? null,
    p_loser_comparisons: args.loser?.comparisons ?? null,
    p_idempotency_key: args.idempotencyKey,
  });

  if (error) throw error;
}

export async function persistComparison(args: PersistComparisonArgs): Promise<void> {
  await recordComparisonAtomic({
    rankingId: args.rankingId,
    itemAId: args.winner.itemId,
    itemBId: args.loser.itemId,
    winnerItemId: args.winner.itemId,
    winner: {
      rankedItemId: args.winner.rankedItemId,
      rating: args.winner.rating,
      comparisons: args.winner.comparisons,
    },
    loser: {
      rankedItemId: args.loser.rankedItemId,
      rating: args.loser.rating,
      comparisons: args.loser.comparisons,
    },
    idempotencyKey: args.idempotencyKey,
  });
}

// A skipped matchup: recorded with a null winner and no rating change, via
// the same atomic path as a decided comparison.
export async function persistSkippedComparison(args: {
  rankingId: string;
  itemAId: string;
  itemBId: string;
  idempotencyKey: string;
}): Promise<void> {
  await recordComparisonAtomic({
    rankingId: args.rankingId,
    itemAId: args.itemAId,
    itemBId: args.itemBId,
    winnerItemId: null,
    winner: null,
    loser: null,
    idempotencyKey: args.idempotencyKey,
  });
}

// ============================================
// DUPLICATE LIST
// ============================================

export async function duplicateList(sourceListId: string): Promise<List> {
  // Get source list
  const source = await getList(sourceListId);
  if (!source) throw new Error('Source list not found');

  // Get source items
  const sourceItems = await getListItems(sourceListId);

  // Create new list
  const newList = await createList({
    title: `${source.title} (copy)`,
    description: source.description,
    comparison_prompt: source.comparison_prompt,
    is_private: source.is_private,
  });

  // Copy items
  if (sourceItems.length > 0) {
    await addListItems(newList.id, sourceItems.map(i => i.name));
  }

  return newList;
}

// ============================================
// SOCIAL: FOLLOWS
// ============================================
// Mirrors the web app store API (everyday-elo/src/lib/store/index.ts) against
// the shared `follows` table. RLS enforces that only the authenticated user
// can create/delete rows where follower_id = auth.uid().

export async function followUser(followerId: string, followingId: string): Promise<void> {
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself');
  }

  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId });

  if (error) throw error;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (error) throw error;
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  return (count ?? 0) > 0;
}

/** Shape of an embedded `profiles` row on a `follows` select. */
interface EmbeddedProfile {
  id: string;
  name: string | null;
  username?: string | null;
  avatar_url?: string | null;
}

interface FollowWithProfileRow {
  profiles: EmbeddedProfile | null;
}

/**
 * The embed is nullable in the type system even though the FK cascades on
 * delete, so drop rows with no profile rather than dereferencing through null
 * and failing the whole call.
 */
function toProfiles(rows: FollowWithProfileRow[] | null): Profile[] {
  return (rows || [])
    .filter((row) => row.profiles != null)
    .map((row) => ({
      id: row.profiles!.id,
      name: row.profiles!.name || '',
      username: row.profiles!.username ?? undefined,
      avatar_url: row.profiles!.avatar_url ?? undefined,
    }));
}

export async function getFollowing(userId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id, profiles!follows_following_id_fkey(id, name, username, avatar_url)')
    .eq('follower_id', userId);

  if (error) throw error;

  return toProfiles(data as unknown as FollowWithProfileRow[] | null);
}

export async function getFollowers(userId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, profiles!follows_follower_id_fkey(id, name, username, avatar_url)')
    .eq('following_id', userId);

  if (error) throw error;

  return toProfiles(data as unknown as FollowWithProfileRow[] | null);
}

export async function getFollowingCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);

  return count ?? 0;
}

export async function getFollowerCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId);

  return count ?? 0;
}

// ============================================
// SOCIAL: FOLLOWED LISTS FEED
// ============================================

/**
 * Most follow edges the feed will put into a single `.in(...)` filter.
 *
 * Every id goes into the PostgREST GET query string, so an unbounded follow
 * graph eventually produces a hard 414/431 from PostgREST or an intermediary
 * rather than a slow query. Capping keeps the feed working past that point at
 * the cost of covering only the most recent follows; the real fix is an RPC
 * that joins the graph server-side, which is a schema change and out of scope
 * here.
 */
export const FOLLOW_GRAPH_QUERY_CAP = 200;

/**
 * Recent completed rankings made by people the user follows, on lists that
 * are public (not private, not templates). Powers the "Following" tab on the
 * browse screen.
 *
 * Two round-trips: one to read the follow graph, one to fetch enriched
 * ranking rows with their list and ranker. Skips the second query entirely
 * when the user follows nobody.
 */
interface FeedRankingRow {
  id: string;
  list_id: string;
  updated_at: string;
  comparisons_count: number | null;
  lists: { title: string | null; description: string | null } | null;
  profiles: { id: string | null; name: string | null; username: string | null } | null;
}

export async function getFollowedListsFeed(
  userId: string,
  limit = 20,
  offset = 0
): Promise<FollowedListsFeed> {
  // Newest follows first, so a graph past the cap keeps the most recent ones.
  const { data: followData, error: followError } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .limit(FOLLOW_GRAPH_QUERY_CAP);

  if (followError) throw followError;

  const followingIds = ((followData || []) as unknown as { following_id: string }[]).map(
    (f) => f.following_id
  );
  if (followingIds.length === 0) return { following_count: 0, entries: [] };

  const { data: rankings, error: rankingsError } = await supabase
    .from('rankings')
    .select(`
      id,
      list_id,
      user_id,
      comparisons_count,
      updated_at,
      lists!inner(id, title, description, is_private, is_template),
      profiles!rankings_user_id_fkey(id, name, username)
    `)
    .in('user_id', followingIds)
    .eq('is_complete', true)
    .eq('lists.is_private', false)
    .eq('lists.is_template', false)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (rankingsError) throw rankingsError;

  // Every identity below comes from `profiles!rankings_user_id_fkey` — the
  // ranker. `lists.creator_id` is deliberately not surfaced: it is a different
  // person, and the previous struct mixed the two under one `creator_` prefix.
  const entries = ((rankings || []) as unknown as FeedRankingRow[]).map((r) => ({
    ranking_id: r.id,
    list_id: r.list_id,
    title: r.lists?.title || '',
    description: r.lists?.description || undefined,
    ranker_id: r.profiles?.id || '',
    ranker_name: r.profiles?.name || undefined,
    ranker_username: r.profiles?.username || undefined,
    updated_at: r.updated_at,
    comparisons_count: r.comparisons_count ?? 0,
  }));

  return { following_count: followingIds.length, entries };
}
