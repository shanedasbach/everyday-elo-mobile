/**
 * Partial ranking persistence for offline/template rankings.
 *
 * Supabase-backed rankings save automatically after each comparison, but
 * template rankings ran purely in-memory and were lost on exit. This module
 * stores partial progress so users can save & exit and resume later from where
 * they left off.
 *
 * Storage uses AsyncStorage rather than SecureStore: partial-ranking data is
 * non-sensitive and a large list (many items, long names) can exceed
 * SecureStore's ~2KB Android value-size ceiling, silently failing the save.
 * AsyncStorage has no such limit. Earlier builds wrote to SecureStore, so reads
 * fall through to it once and migrate the entry forward.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  await AsyncStorage.setItem(keyFor(listId), JSON.stringify(payload));
}

function isValidPartialItem(value: unknown): value is PartialRankedItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.itemId === 'string' &&
    typeof item.name === 'string' &&
    typeof item.rating === 'number' &&
    Number.isFinite(item.rating) &&
    typeof item.comparisons === 'number' &&
    Number.isFinite(item.comparisons) &&
    item.comparisons >= 0
  );
}

function parsePartialRanking(
  raw: string | null,
  listId: string
): PartialRanking | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== VERSION) return null;
    if (candidate.listId !== listId) return null;
    if (typeof candidate.comparisons !== 'number') return null;
    if (!Number.isFinite(candidate.comparisons)) return null;
    if (candidate.comparisons < 0) return null;
    if (!Array.isArray(candidate.items)) return null;
    if (!candidate.items.every(isValidPartialItem)) return null;
    if (typeof candidate.updatedAt !== 'string') return null;
    return {
      version: VERSION,
      listId,
      comparisons: candidate.comparisons,
      items: candidate.items,
      updatedAt: candidate.updatedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Read any legacy SecureStore entry, migrate a valid one into AsyncStorage,
 * and remove it from SecureStore so the migration runs at most once.
 */
async function migrateFromSecureStore(
  listId: string
): Promise<PartialRanking | null> {
  let legacyRaw: string | null;
  try {
    legacyRaw = await SecureStore.getItemAsync(keyFor(listId));
  } catch {
    return null;
  }
  const legacy = parsePartialRanking(legacyRaw, listId);
  if (!legacy) return null;
  // Carry the entry forward to AsyncStorage; clear the old copy regardless of
  // whether the write succeeds so a wedged SecureStore value isn't read forever.
  try {
    await AsyncStorage.setItem(keyFor(listId), legacyRaw as string);
  } catch {
    // If the forward-write fails, still return the parsed value so the caller
    // can resume; the next save will re-persist it.
  }
  try {
    await SecureStore.deleteItemAsync(keyFor(listId));
  } catch {
    // Best effort — a failed delete just means we re-migrate next time.
  }
  return legacy;
}

export async function getPartialRanking(
  listId: string
): Promise<PartialRanking | null> {
  const raw = await AsyncStorage.getItem(keyFor(listId));
  const current = parsePartialRanking(raw, listId);
  if (current) return current;
  // Nothing usable in AsyncStorage — fall through to any legacy SecureStore
  // entry written by an earlier build and migrate it forward.
  return migrateFromSecureStore(listId);
}

export async function clearPartialRanking(listId: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(listId));
  // Also drop any lingering legacy entry so a cleared ranking can't resurrect
  // from SecureStore on the next read.
  try {
    await SecureStore.deleteItemAsync(keyFor(listId));
  } catch {
    // Best effort.
  }
}

export async function hasPartialRanking(listId: string): Promise<boolean> {
  const partial = await getPartialRanking(listId);
  return partial !== null && partial.comparisons > 0;
}
