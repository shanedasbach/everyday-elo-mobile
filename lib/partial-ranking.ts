/**
 * Partial ranking persistence for offline/template rankings.
 *
 * Supabase-backed rankings save automatically after each comparison, but
 * template rankings ran purely in-memory and were lost on exit. This module
 * stores partial progress in SecureStore so users can save & exit and resume
 * later from where they left off.
 */
import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'partial_ranking_';
const VERSION = 1;

export interface PartialRankedItem {
  itemId: string;
  name: string;
  rating: number;
  comparisons: number;
}

export interface PartialRanking {
  version: number;
  listId: string;
  comparisons: number;
  items: PartialRankedItem[];
  updatedAt: string;
}

function keyFor(listId: string): string {
  return `${KEY_PREFIX}${listId}`;
}

export async function savePartialRanking(
  listId: string,
  items: PartialRankedItem[],
  comparisons: number
): Promise<void> {
  const payload: PartialRanking = {
    version: VERSION,
    listId,
    comparisons,
    items,
    updatedAt: new Date().toISOString(),
  };
  await SecureStore.setItemAsync(keyFor(listId), JSON.stringify(payload));
}

export async function getPartialRanking(
  listId: string
): Promise<PartialRanking | null> {
  const raw = await SecureStore.getItemAsync(keyFor(listId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PartialRanking;
    if (parsed.version !== VERSION || parsed.listId !== listId) return null;
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPartialRanking(listId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(listId));
}

export async function hasPartialRanking(listId: string): Promise<boolean> {
  const partial = await getPartialRanking(listId);
  return partial !== null && partial.comparisons > 0;
}
