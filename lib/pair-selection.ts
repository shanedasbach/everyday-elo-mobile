/**
 * Pair selection for Everyday Elo
 *
 * The single implementation of "which two items should the user compare next?".
 *
 * This lives apart from `lib/elo.ts` because it has two callers that need
 * different things from it: `selectNextPair` wants the chosen items, while the
 * rank screen wants their positions in its own state array. Both go through
 * `selectNextPairIndices` so the strategy itself exists in exactly one place.
 *
 * Strategy:
 *  1. Prefer the least-compared item that still has an unseen opponent.
 *  2. Among its opponents, prefer the closest rating (most informative).
 *  3. Pick randomly from the three closest, and randomize display order.
 */

/** The only fields pair selection reads off an item. */
export interface PairSelectionItem {
  rating: number;
  comparisons: number;
}

/**
 * Express mode skips lopsided matchups. A gap this wide or wider means the
 * outcome is near-certain, so the comparison teaches the ranking little.
 */
export const EXPRESS_MAX_RATING_GAP = 200;

/** How many of the closest-rated opponents to choose randomly between. */
const CANDIDATE_POOL_SIZE = 3;

export interface SelectPairOptions {
  /**
   * Whether the user has already been shown this matchup, by index into
   * `items`. Callers own their own identity scheme (row id, item id, name),
   * so this is a predicate rather than a set of keys.
   */
  isSeen?: (indexA: number, indexB: number) => boolean;
  /** Express mode: prefer matchups closer than `EXPRESS_MAX_RATING_GAP`. */
  skipObvious?: boolean;
  /** Injectable for deterministic tests. */
  random?: () => number;
}

/**
 * Choose the next pair, as indices into `items`.
 *
 * Returns null when there aren't two items to compare. Avoiding already-seen
 * matchups is a hard constraint; express mode is a soft preference applied
 * within the unseen pool, and is dropped rather than returning nothing.
 */
export function selectNextPairIndices(
  items: readonly PairSelectionItem[],
  options: SelectPairOptions = {}
): [number, number] | null {
  const { isSeen = () => false, skipObvious = false, random = Math.random } = options;

  if (items.length < 2) return null;

  // Least-compared first. Ties keep input order, and this order carries through
  // to the rating-distance sort below, so equidistant opponents are broken in
  // favour of the less-compared one.
  const byComparisons = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.comparisons - b.item.comparisons);

  type Ranked = (typeof byComparisons)[number];

  const opponentsOf = (subject: Ranked): Ranked[] =>
    byComparisons
      .filter((other) => other.index !== subject.index)
      .sort(
        (a, b) =>
          Math.abs(a.item.rating - subject.item.rating) -
          Math.abs(b.item.rating - subject.item.rating)
      );

  // Walk out from the least-compared item until one still has a matchup the
  // user hasn't seen. If every matchup has been seen, fall back to repeating
  // one for the least-compared item.
  let first = byComparisons[0];
  let pool = opponentsOf(first);

  for (const candidate of byComparisons) {
    const unseen = opponentsOf(candidate).filter(
      (other) => !isSeen(candidate.index, other.index)
    );
    if (unseen.length > 0) {
      first = candidate;
      pool = unseen;
      break;
    }
  }

  if (skipObvious && pool.length > 1) {
    const close = pool.filter(
      (other) => Math.abs(other.item.rating - first.item.rating) < EXPRESS_MAX_RATING_GAP
    );
    if (close.length > 0) {
      pool = close;
    }
  }

  const candidates = pool.slice(0, Math.min(CANDIDATE_POOL_SIZE, pool.length));
  const second = candidates[Math.floor(random() * candidates.length)];

  // Randomize order so there's no position bias.
  return random() > 0.5
    ? [first.index, second.index]
    : [second.index, first.index];
}
