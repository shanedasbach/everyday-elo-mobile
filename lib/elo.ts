/**
 * Elo Rating System for Everyday Elo
 * 
 * Standard Elo with configurable K-factor.
 * Higher K = faster rating changes (good for fewer comparisons)
 */

import { selectNextPairIndices } from './pair-selection';

export interface EloItem {
  id: string;
  name: string;
  rating: number;
  comparisons: number;
}

export interface ComparisonResult {
  winner: EloItem;
  loser: EloItem;
}

// Default starting rating
export const DEFAULT_RATING = 1500;

// K-factor: higher = more volatile ratings
// Using 32 for faster convergence with fewer comparisons
export const K_FACTOR = 32;

/**
 * Calculate expected score (probability of winning)
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate new ratings after a comparison
 */
export function calculateNewRatings(
  winner: EloItem,
  loser: EloItem,
  kFactor: number = K_FACTOR
): { winnerRating: number; loserRating: number } {
  const expectedWinner = expectedScore(winner.rating, loser.rating);
  const expectedLoser = expectedScore(loser.rating, winner.rating);

  // Winner gets 1, loser gets 0
  const winnerRating = winner.rating + kFactor * (1 - expectedWinner);
  const loserRating = loser.rating + kFactor * (0 - expectedLoser);

  return {
    winnerRating: Math.round(winnerRating),
    loserRating: Math.round(loserRating),
  };
}

/**
 * Apply a comparison result to items
 */
export function applyComparison(
  items: EloItem[],
  winnerId: string,
  loserId: string
): EloItem[] {
  const winner = items.find((item) => item.id === winnerId);
  const loser = items.find((item) => item.id === loserId);

  if (!winner || !loser) {
    throw new Error('Invalid winner or loser ID');
  }

  const { winnerRating, loserRating } = calculateNewRatings(winner, loser);

  return items.map((item) => {
    if (item.id === winnerId) {
      return { ...item, rating: winnerRating, comparisons: item.comparisons + 1 };
    }
    if (item.id === loserId) {
      return { ...item, rating: loserRating, comparisons: item.comparisons + 1 };
    }
    return item;
  });
}

/**
 * Initialize items with default ratings
 */
export function initializeItems(names: string[]): EloItem[] {
  return names.map((name, index) => ({
    id: `item-${index}-${Date.now()}`,
    name,
    rating: DEFAULT_RATING,
    comparisons: 0,
  }));
}

/**
 * Get items sorted by rating (highest first)
 */
export function getRankedItems(items: EloItem[]): EloItem[] {
  return [...items].sort((a, b) => b.rating - a.rating);
}

/**
 * Build an order-independent key for a pair of items, so that
 * pairKey(a, b) === pairKey(b, a).
 */
export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

/**
 * Select next pair to compare
 * Strategy: Prioritize items with fewer comparisons, then similar ratings,
 * while avoiding matchups the user has already been shown.
 *
 * `seenPairs` holds keys produced by `pairKey`. The least-compared item that
 * still has an unseen opponent is chosen first; only when every possible
 * matchup has been seen do we fall back to repeating one.
 *
 * The strategy itself lives in `lib/pair-selection.ts` — this is the
 * item-returning view of it, and the rank screen uses the index-returning one.
 */
export function selectNextPair(
  items: EloItem[],
  seenPairs: ReadonlySet<string> = new Set()
): [EloItem, EloItem] | null {
  const pair = selectNextPairIndices(items, {
    isSeen: (a, b) => seenPairs.has(pairKey(items[a].id, items[b].id)),
  });

  return pair && [items[pair[0]], items[pair[1]]];
}

/**
 * Estimate comparisons needed for stable ranking
 * Rule of thumb: ~2N comparisons for N items
 */
export function estimateComparisonsNeeded(itemCount: number): number {
  return Math.ceil(itemCount * 2);
}

/**
 * Check if ranking is reasonably stable
 * (all items have been compared at least twice)
 */
export function isRankingStable(items: EloItem[]): boolean {
  return items.every((item) => item.comparisons >= 2);
}
