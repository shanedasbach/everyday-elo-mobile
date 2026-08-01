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
const INDEX_KEY = 'partial_ranking_index';
const VERSION = 1;

/**
 * How long an untouched partial ranking survives before pruning reclaims it.
 * A ranking abandoned for this long is treated as forgotten rather than
 * resumable, so it stops offering a stale resume prompt.
 */
export const PARTIAL_RANKING_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

/**
 * SecureStore exposes no `getAllKeys`, so an entry written and then forgotten
 * is unreachable forever. These helpers maintain our own index of the list ids
 * we have written, which is what makes pruning and orphan cleanup possible.
 */
async function readIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

async function writeIndex(listIds: string[]): Promise<void> {
  if (listIds.length === 0) {
    await SecureStore.deleteItemAsync(INDEX_KEY);
    return;
  }
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(listIds));
}

async function addToIndex(listId: string): Promise<void> {
  const index = await readIndex();
  if (index.includes(listId)) return;
  await writeIndex([...index, listId]);
}

async function removeFromIndex(listId: string): Promise<void> {
  const index = await readIndex();
  if (!index.includes(listId)) return;
  await writeIndex(index.filter(id => id !== listId));
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
  await addToIndex(listId);
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

/**
 * A record is stale once `updatedAt` is older than the TTL. An `updatedAt`
 * that won't parse is treated as stale too: it carries no evidence the record
 * is still current, and leaving it would make it permanently unprunable.
 */
function isExpired(record: PartialRanking, now: number): boolean {
  const updatedAt = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedAt)) return true;
  return now - updatedAt > PARTIAL_RANKING_TTL_MS;
}

async function readPartialRanking(
  listId: string
): Promise<PartialRanking | null> {
  const raw = await SecureStore.getItemAsync(keyFor(listId));
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
 * Reads a saved partial ranking, treating an expired record as absent so a
 * long-abandoned ranking never offers a resume prompt — whether or not
 * {@link prunePartialRankings} has run yet this session.
 */
export async function getPartialRanking(
  listId: string,
  now: number = Date.now()
): Promise<PartialRanking | null> {
  const record = await readPartialRanking(listId);
  if (!record) return null;
  if (isExpired(record, now)) return null;
  return record;
}

export async function clearPartialRanking(listId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(listId));
  await removeFromIndex(listId);
}

export async function hasPartialRanking(
  listId: string,
  now: number = Date.now()
): Promise<boolean> {
  const partial = await getPartialRanking(listId, now);
  return partial !== null && partial.comparisons > 0;
}

/** The list ids we currently hold a partial ranking for, per the index. */
export async function listPartialRankingIds(): Promise<string[]> {
  return readIndex();
}

/**
 * Drops indexed records that are expired, unreadable, or already gone,
 * reclaiming keychain entries and keeping the index honest.
 *
 * Returns the list ids that were reclaimed.
 */
export async function prunePartialRankings(
  now: number = Date.now()
): Promise<string[]> {
  const index = await readIndex();
  const pruned: string[] = [];
  const kept: string[] = [];

  for (const listId of index) {
    const record = await readPartialRanking(listId);
    if (record && !isExpired(record, now)) {
      kept.push(listId);
      continue;
    }
    // Expired, corrupt, or missing — delete unconditionally. Deleting an
    // absent key is a no-op, so this also reconciles an index entry whose
    // payload disappeared.
    await SecureStore.deleteItemAsync(keyFor(listId));
    pruned.push(listId);
  }

  if (pruned.length > 0) await writeIndex(kept);
  return pruned;
}

/**
 * Reconciles stored partial rankings against the lists that still exist.
 *
 * Two jobs, both of which need the caller to say what is real:
 *
 * 1. **Adoption.** Entries written before this index existed are invisible to
 *    {@link prunePartialRankings}. Any `knownListIds` entry that has a stored
 *    payload but no index row is adopted, making it prunable from now on.
 * 2. **Orphan removal.** An indexed list id that is no longer known — deleted
 *    remotely, or on another device — has its payload cleared.
 *
 * `knownListIds` must be the *complete* set of ids the caller considers live
 * (user lists plus template ids); anything omitted is treated as deleted.
 *
 * Expired records are pruned in the same pass.
 */
export async function reconcilePartialRankings(
  knownListIds: string[],
  now: number = Date.now()
): Promise<{ adopted: string[]; orphaned: string[]; expired: string[] }> {
  const known = new Set(knownListIds);
  const index = await readIndex();
  const indexed = new Set(index);

  const adopted: string[] = [];
  for (const listId of knownListIds) {
    if (indexed.has(listId)) continue;
    const raw = await SecureStore.getItemAsync(keyFor(listId));
    if (raw === null) continue;
    adopted.push(listId);
    indexed.add(listId);
  }

  const orphaned: string[] = [];
  const survivors: string[] = [];
  for (const listId of indexed) {
    if (known.has(listId)) {
      survivors.push(listId);
      continue;
    }
    await SecureStore.deleteItemAsync(keyFor(listId));
    orphaned.push(listId);
  }

  await writeIndex(survivors);
  const expired = await prunePartialRankings(now);
  return { adopted, orphaned, expired };
}
