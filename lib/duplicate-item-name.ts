function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Returns the entry in `existing` that matches `candidate` after trimming
 * and lowercasing both, or `undefined` if there's no match.
 */
export function findDuplicateItemName(
  candidate: string,
  existing: string[]
): string | undefined {
  const normalized = normalize(candidate);
  return existing.find((item) => normalize(item) === normalized);
}

/**
 * Returns true if any two entries in `items` collide after trim+lowercase
 * normalization — for catching duplicates within a single pasted batch,
 * before any of it has been persisted to compare against.
 */
export function hasDuplicateWithinBatch(items: string[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = normalize(item);
    if (seen.has(normalized)) {
      return true;
    }
    seen.add(normalized);
  }
  return false;
}
