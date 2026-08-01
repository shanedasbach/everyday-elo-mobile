/**
 * Partial ranking persistence for offline/template rankings.
 *
 * Supabase-backed rankings save automatically after each comparison, but
 * template rankings ran purely in-memory and were lost on exit. This module
 * stores partial progress so users can save & exit and resume later from where
 * they left off.
 *
 * Storage is AsyncStorage rather than SecureStore: partial-ranking data is
 * non-sensitive, and a large list (many items, long names) can exceed
 * SecureStore's ~2KB Android value-size ceiling, silently failing the save.
 *
 * That move also removes the hand-rolled key index the SecureStore version
 * needed. Its whole rationale was that SecureStore exposes no `getAllKeys`, so
 * an entry written and then forgotten was unreachable forever. AsyncStorage
 * does expose `getAllKeys`, so enumeration is derived from storage itself and
 * cannot drift out of sync with the records it describes.
 *
 * Earlier builds wrote to SecureStore. Those entries are migrated forward on
 * read, and drained in bulk by {@link reconcilePartialRankings}.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'partial_ranking_';
const VERSION = 1;

/**
 * The index key written by the SecureStore-era builds. It is not a record, but
 * it does enumerate the list ids those builds wrote — which is exactly what the
 * legacy sweep needs, since SecureStore itself cannot be enumerated.
 */
const LEGACY_INDEX_KEY = 'partial_ranking_index';

/**
 * Set once the legacy sweep has drained SecureStore, after which reads stop
 * paying a keychain round-trip on every miss.
 *
 * Deliberately prefixed `partial_rankings:` rather than `partial_ranking_`, so
 * a key scan for records can never mistake this bookkeeping key for one.
 */
const LEGACY_MIGRATED_KEY = 'partial_rankings:legacy_migrated';

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

function listIdFor(key: string): string | null {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const listId = key.slice(KEY_PREFIX.length);
  return listId.length > 0 ? listId : null;
}

/**
 * Reads fail soft. A rejected read means "nothing usable here", which every
 * caller already handles, and is preferable to rejecting up into a screen's
 * load path where a transient storage error would surface as a crash.
 */
async function readRaw(listId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(keyFor(listId));
  } catch {
    return null;
  }
}

/** Returns whether the write actually landed, so callers can act on failure. */
async function writeRaw(listId: string, value: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(keyFor(listId), value);
    return true;
  } catch {
    return false;
  }
}

async function deleteRaw(listId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(listId));
  } catch {
    // Best effort — a failed delete leaves a record that pruning will retry.
  }
}

async function deleteLegacy(listId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(keyFor(listId));
  } catch {
    // Best effort — a failed delete just means we re-migrate next time.
  }
}

/** The list ids AsyncStorage currently holds a record for. */
async function storedListIds(): Promise<string[]> {
  let keys: readonly string[];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const key of keys) {
    const listId = listIdFor(key);
    if (listId !== null) ids.push(listId);
  }
  return ids;
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
 * Pure parse step, kept separate from storage so the same validation covers
 * both the AsyncStorage record and any legacy SecureStore value read during
 * migration.
 */
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
 * A record is stale once `updatedAt` is older than the TTL. An `updatedAt`
 * that won't parse is treated as stale too: it carries no evidence the record
 * is still current, and leaving it would make it permanently unprunable.
 */
function isExpired(record: PartialRanking, now: number): boolean {
  const updatedAt = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedAt)) return true;
  return now - updatedAt > PARTIAL_RANKING_TTL_MS;
}

async function legacyMigrationComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LEGACY_MIGRATED_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Outcome of one legacy entry, so a bulk sweep can tell when it is finished. */
interface LegacyMigration {
  record: PartialRanking | null;
  /** True when a SecureStore entry may still be sitting there afterwards. */
  remaining: boolean;
}

/**
 * Reads a legacy SecureStore entry, carries a valid one forward into
 * AsyncStorage, and reclaims the keychain slot.
 */
async function migrateLegacy(listId: string): Promise<LegacyMigration> {
  let legacyRaw: string | null;
  try {
    legacyRaw = await SecureStore.getItemAsync(keyFor(listId));
  } catch {
    // Can't tell whether anything is there; assume it is, so the sweep doesn't
    // declare itself complete over an entry it never actually read.
    return { record: null, remaining: true };
  }
  if (legacyRaw === null) return { record: null, remaining: false };

  const legacy = parsePartialRanking(legacyRaw, listId);
  if (!legacy) {
    // Unreadable and unrecoverable: it can never resume anything, so reclaim
    // the entry rather than re-reading it on every miss forever.
    await deleteLegacy(listId);
    return { record: null, remaining: false };
  }

  // Drop the legacy copy only once the forward write is confirmed. If
  // AsyncStorage rejects — device storage pressure, a corrupt RN database —
  // SecureStore still holds the only durable copy of an in-progress ranking,
  // and deleting it regardless would lose that ranking silently.
  const written = await writeRaw(listId, legacyRaw);
  if (written) await deleteLegacy(listId);
  return { record: legacy, remaining: !written };
}

async function readPartialRanking(
  listId: string
): Promise<PartialRanking | null> {
  const current = parsePartialRanking(await readRaw(listId), listId);
  if (current) return current;
  // Nothing usable in AsyncStorage. Fall back to a legacy SecureStore entry
  // unless the bulk sweep has already drained them, which bounds the extra
  // keychain round-trip to the pre-migration window.
  if (await legacyMigrationComplete()) return null;
  return (await migrateLegacy(listId)).record;
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
  // Unguarded on purpose: callers catch and report, and a save that silently
  // did nothing is the failure mode this module exists to remove.
  await AsyncStorage.setItem(keyFor(listId), JSON.stringify(payload));
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
  // Legacy copy first, so a rejected AsyncStorage delete still can't leave a
  // cleared ranking able to resurrect itself from SecureStore on the next read.
  await deleteLegacy(listId);
  await AsyncStorage.removeItem(keyFor(listId));
}

export async function hasPartialRanking(
  listId: string,
  now: number = Date.now()
): Promise<boolean> {
  const partial = await getPartialRanking(listId, now);
  return partial !== null && partial.comparisons > 0;
}

/** The list ids we currently hold a partial ranking for. */
export async function listPartialRankingIds(): Promise<string[]> {
  return storedListIds();
}

/**
 * Drops stored records that are expired or unreadable, reclaiming storage and
 * keeping resume prompts honest.
 *
 * Returns the list ids that were reclaimed.
 */
export async function prunePartialRankings(
  now: number = Date.now()
): Promise<string[]> {
  const pruned: string[] = [];
  for (const listId of await storedListIds()) {
    const record = parsePartialRanking(await readRaw(listId), listId);
    if (record && !isExpired(record, now)) continue;
    // Expired or corrupt — delete unconditionally. Deleting an absent key is a
    // no-op, so a record that vanished mid-sweep costs nothing.
    await deleteRaw(listId);
    pruned.push(listId);
  }
  return pruned;
}

/**
 * One-time drain of SecureStore entries written before the AsyncStorage move.
 *
 * Candidates come from the legacy index *plus* the caller's known ids, because
 * neither alone is sufficient: the index misses entries written before it
 * existed, and the known set misses entries for lists that have since been
 * deleted.
 *
 * The completion flag is only set once every candidate is confirmed drained,
 * so a failed forward-write never strands a valid ranking behind a flag that
 * disables the per-read fallback.
 */
async function sweepLegacy(knownListIds: string[]): Promise<string[]> {
  if (await legacyMigrationComplete()) return [];

  let legacyIndex: string[] = [];
  let indexRead = false;
  try {
    const raw = await SecureStore.getItemAsync(LEGACY_INDEX_KEY);
    indexRead = true;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        legacyIndex = parsed.filter((id): id is string => typeof id === 'string');
      }
    }
  } catch {
    // Unreadable index (corrupt, or a keychain error). Fall back to the known
    // ids alone, and don't claim the sweep is complete.
  }

  const adopted: string[] = [];
  let complete = indexRead;
  for (const listId of new Set([...legacyIndex, ...knownListIds])) {
    // Already carried forward — nothing legacy left to do for this list.
    if ((await readRaw(listId)) !== null) continue;
    const { record, remaining } = await migrateLegacy(listId);
    if (record) adopted.push(listId);
    if (remaining) complete = false;
  }

  if (complete) {
    try {
      await SecureStore.deleteItemAsync(LEGACY_INDEX_KEY);
      await AsyncStorage.setItem(LEGACY_MIGRATED_KEY, '1');
    } catch {
      // Leaving the flag unset only costs a repeat sweep next time.
    }
  }
  return adopted;
}

/**
 * Reconciles stored partial rankings against the lists that still exist.
 *
 * Two jobs, both of which need the caller to say what is real:
 *
 * 1. **Adoption.** Entries written by a SecureStore-era build are invisible to
 *    a key scan. Any candidate with a legacy payload and no forward record is
 *    migrated into AsyncStorage, making it readable and prunable from now on.
 * 2. **Orphan removal.** A stored list id that is no longer known — deleted
 *    remotely, or on another device — has its record cleared.
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
  // Adopt first: a legacy entry has to exist as a record before the orphan and
  // expiry passes can see it at all.
  const adopted = await sweepLegacy(knownListIds);

  const known = new Set(knownListIds);
  const orphaned: string[] = [];
  for (const listId of await storedListIds()) {
    if (known.has(listId)) continue;
    await deleteRaw(listId);
    orphaned.push(listId);
  }

  const expired = await prunePartialRankings(now);
  return { adopted, orphaned, expired };
}
