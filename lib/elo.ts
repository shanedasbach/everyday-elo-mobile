/**
 * Elo Rating System for Everyday Elo
 * 
 * Standard Elo with configurable K-factor.
 * Higher K = faster rating changes (good for fewer comparisons)
 */

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
 * Select next pair to compare
 * Strategy: Prioritize items with fewer comparisons, then similar ratings
 */
export function selectNextPair(items: EloItem[]): [EloItem, EloItem] | null {
  if (items.length < 2) return null;

  // Sort by comparisons (ascending) to prioritize less-compared items
  const sorted = [...items].sort((a, b) => a.comparisons - b.comparisons);
  
  // Take the least compared item
  const first = sorted[0];
  
  // Find an opponent with similar rating (for more informative comparisons)
  const others = items.filter((item) => item.id !== first.id);
  
  // Sort others by rating distance from first
  others.sort((a, b) => 
    Math.abs(a.rating - first.rating) - Math.abs(b.rating - first.rating)
  );
  
  // Pick randomly from top 3 closest (adds variety)
  const candidates = others.slice(0, Math.min(3, others.length));
  const second = candidates[Math.floor(Math.random() * candidates.length)];

  // Randomize order so there's no position bias
  return Math.random() > 0.5 ? [first, second] : [second, first];
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
