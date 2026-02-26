import { supabase } from './supabase';

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

// Generate random ID
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ============================================
// LISTS
// ============================================

export async function createList(data: {
  title: string;
  description?: string;
  comparison_prompt?: string;
  is_private?: boolean;
}): Promise<List> {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: list, error } = await supabase
    .from('lists')
    .insert({
      title: data.title,
      description: data.description,
      comparison_prompt: data.comparison_prompt,
      creator_id: user?.id,
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
    .single();

  if (error) return null;
  return data;
}

export async function getListByShareCode(code: string): Promise<List | null> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('share_code', code)
    .single();

  if (error) return null;
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
  const listsWithStatus: ListWithStatus[] = [];

  for (const list of lists) {
    const items = await getListItems(list.id);
    const itemCount = items.length;
    
    // Get user's ranking for this list
    const { data: ranking } = await supabase
      .from('rankings')
      .select('*')
      .eq('list_id', list.id)
      .eq('user_id', userId)
      .single();

    let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
    let comparisonsCount = 0;
    const estimatedComparisons = itemCount * 2;

    if (ranking) {
      comparisonsCount = ranking.comparisons_count;
      if (ranking.is_complete) {
        status = 'completed';
      } else {
        status = 'in_progress';
      }
    }

    listsWithStatus.push({
      ...list,
      itemCount,
      rankingStatus: status,
      comparisonsCount,
      estimatedComparisons,
    });
  }

  return listsWithStatus;
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

export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase
    .from('lists')
    .delete()
    .eq('id', id);

  if (error) throw error;
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
  const items: ListItem[] = [];
  for (let i = 0; i < names.length; i++) {
    const item = await addListItem(listId, names[i]);
    items.push(item);
  }
  return items;
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
    const { data: existing } = await supabase
      .from('rankings')
      .select('*')
      .eq('list_id', listId)
      .eq('user_id', userId)
      .single();

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
  for (const item of items) {
    await supabase.from('ranked_items').insert({
      ranking_id: ranking.id,
      item_id: item.id,
      rating: 1500,
      comparisons: 0,
    });
  }

  return ranking;
}

export async function getRanking(id: string): Promise<Ranking | null> {
  const { data, error } = await supabase
    .from('rankings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
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
  const { data: ranking } = await supabase
    .from('rankings')
    .select('comparisons_count')
    .eq('id', rankingId)
    .single();

  if (ranking) {
    await supabase
      .from('rankings')
      .update({ 
        comparisons_count: ranking.comparisons_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rankingId);
  }
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
