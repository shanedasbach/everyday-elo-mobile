/**
 * Comprehensive tests for the ELO ranking algorithm
 * 
 * Use cases covered:
 * 1. Calculating match predictions (expected scores)
 * 2. Updating ratings after comparisons
 * 3. Initializing items for ranking
 * 4. Getting sorted rankings
 * 5. Selecting pairs for comparison
 * 6. Estimating comparisons needed
 * 7. Determining ranking stability
 */

import {
  EloItem,
  expectedScore,
  calculateNewRatings,
  applyComparison,
  initializeItems,
  getRankedItems,
  selectNextPair,
  estimateComparisonsNeeded,
  isRankingStable,
  K_FACTOR,
  DEFAULT_RATING,
} from '../elo';

describe('ELO Ranking System', () => {
  
  // ============================================
  // USE CASE 1: Match Predictions
  // ============================================
  describe('Match Predictions (expectedScore)', () => {
    describe('when items have equal ratings', () => {
      it('should predict 50/50 chance for equally rated items', () => {
        const score = expectedScore(1500, 1500);
        expect(score).toBe(0.5);
      });

      it('should work at any equal rating level', () => {
        expect(expectedScore(1000, 1000)).toBe(0.5);
        expect(expectedScore(2000, 2000)).toBe(0.5);
        expect(expectedScore(1234, 1234)).toBe(0.5);
      });
    });

    describe('when one item is clearly better', () => {
      it('should favor the higher-rated item', () => {
        const favorite = expectedScore(1700, 1500);
        const underdog = expectedScore(1500, 1700);
        
        expect(favorite).toBeGreaterThan(0.5);
        expect(underdog).toBeLessThan(0.5);
        expect(favorite + underdog).toBeCloseTo(1.0);
      });

      it('should strongly favor items with 400+ point advantage', () => {
        // 400 point difference is ~10:1 odds in ELO
        const score = expectedScore(1900, 1500);
        expect(score).toBeGreaterThan(0.9);
      });
    });

    describe('probability symmetry', () => {
      it('should have complementary probabilities', () => {
        // If A vs B gives 0.7, then B vs A should give 0.3
        const aVsB = expectedScore(1600, 1400);
        const bVsA = expectedScore(1400, 1600);
        expect(aVsB + bVsA).toBeCloseTo(1.0);
      });
    });
  });

  // ============================================
  // USE CASE 2: Rating Updates After Comparison
  // ============================================
  describe('Rating Updates (calculateNewRatings)', () => {
    const createItem = (id: string, rating: number, comparisons = 0): EloItem => ({
      id,
      name: id,
      rating,
      comparisons,
    });

    describe('when the favorite wins', () => {
      it('should make small adjustments (expected outcome)', () => {
        const winner = createItem('favorite', 1600);
        const loser = createItem('underdog', 1400);
        
        const { winnerRating, loserRating } = calculateNewRatings(winner, loser);
        
        // Winner gains less because it was expected
        expect(winnerRating).toBeGreaterThan(1600);
        expect(winnerRating - 1600).toBeLessThan(K_FACTOR / 2);
        
        // Loser loses
        expect(loserRating).toBeLessThan(1400);
      });
    });

    describe('when the underdog wins', () => {
      it('should make large adjustments (surprising outcome)', () => {
        // Note: winner/loser parameters are actual outcome, not ratings
        const winner = createItem('underdog', 1400);
        const loser = createItem('favorite', 1600);
        
        const { winnerRating, loserRating } = calculateNewRatings(winner, loser);
        
        // Underdog gains more for the upset
        expect(winnerRating - 1400).toBeGreaterThan(K_FACTOR / 2);
        
        // Favorite loses more
        expect(1600 - loserRating).toBeGreaterThan(K_FACTOR / 2);
      });
    });

    describe('when items are evenly matched', () => {
      it('should adjust by half the K-factor', () => {
        const winner = createItem('a', 1500);
        const loser = createItem('b', 1500);
        
        const { winnerRating, loserRating } = calculateNewRatings(winner, loser);
        
        expect(winnerRating).toBeCloseTo(1500 + K_FACTOR / 2, 0);
        expect(loserRating).toBeCloseTo(1500 - K_FACTOR / 2, 0);
      });
    });

    describe('rating conservation', () => {
      it('should conserve total rating points', () => {
        const testCases = [
          { winnerRating: 1500, loserRating: 1500 },
          { winnerRating: 1800, loserRating: 1200 },
          { winnerRating: 1400, loserRating: 1600 },
        ];

        testCases.forEach(({ winnerRating: wr, loserRating: lr }) => {
          const winner = createItem('w', wr);
          const loser = createItem('l', lr);
          const { winnerRating, loserRating } = calculateNewRatings(winner, loser);
          expect(winnerRating + loserRating).toBeCloseTo(wr + lr);
        });
      });
    });

    describe('custom K-factor', () => {
      it('should allow custom K-factor for different volatility', () => {
        const winner = createItem('w', 1500);
        const loser = createItem('l', 1500);
        
        const lowK = calculateNewRatings(winner, loser, 16);
        const highK = calculateNewRatings(winner, loser, 64);
        
        // Higher K = bigger changes
        expect(highK.winnerRating - 1500).toBeGreaterThan(lowK.winnerRating - 1500);
      });
    });
  });

  // ============================================
  // USE CASE 3: Apply Comparison to Item List
  // ============================================
  describe('Apply Comparison (applyComparison)', () => {
    const createItems = (): EloItem[] => [
      { id: 'pizza', name: 'Pizza', rating: 1500, comparisons: 0 },
      { id: 'burger', name: 'Burger', rating: 1500, comparisons: 0 },
      { id: 'taco', name: 'Taco', rating: 1500, comparisons: 0 },
    ];

    describe('determining winner and loser', () => {
      it('should update ratings when first item wins', () => {
        const items = createItems();
        const updated = applyComparison(items, 'pizza', 'burger');
        
        const pizza = updated.find(i => i.id === 'pizza')!;
        const burger = updated.find(i => i.id === 'burger')!;
        
        expect(pizza.rating).toBeGreaterThan(1500);
        expect(burger.rating).toBeLessThan(1500);
        expect(pizza.comparisons).toBe(1);
        expect(burger.comparisons).toBe(1);
      });

      it('should update ratings when second item wins', () => {
        const items = createItems();
        const updated = applyComparison(items, 'burger', 'pizza');
        
        const pizza = updated.find(i => i.id === 'pizza')!;
        const burger = updated.find(i => i.id === 'burger')!;
        
        expect(burger.rating).toBeGreaterThan(1500);
        expect(pizza.rating).toBeLessThan(1500);
      });
    });

    describe('not affecting uninvolved items', () => {
      it('should leave other items unchanged', () => {
        const items = createItems();
        const updated = applyComparison(items, 'pizza', 'burger');
        
        const taco = updated.find(i => i.id === 'taco')!;
        
        expect(taco.rating).toBe(1500);
        expect(taco.comparisons).toBe(0);
      });
    });

    describe('comparison count tracking', () => {
      it('should accumulate comparisons correctly', () => {
        let items = createItems();
        
        // First comparison
        items = applyComparison(items, 'pizza', 'burger');
        expect(items.find(i => i.id === 'pizza')!.comparisons).toBe(1);
        
        // Second comparison
        items = applyComparison(items, 'pizza', 'taco');
        expect(items.find(i => i.id === 'pizza')!.comparisons).toBe(2);
      });
    });

    describe('error handling', () => {
      it('should throw error for invalid winner ID', () => {
        const items = createItems();
        expect(() => applyComparison(items, 'invalid', 'burger')).toThrow('Invalid winner or loser ID');
      });

      it('should throw error for invalid loser ID', () => {
        const items = createItems();
        expect(() => applyComparison(items, 'pizza', 'invalid')).toThrow('Invalid winner or loser ID');
      });
    });

    describe('immutability', () => {
      it('should not mutate original array', () => {
        const items = createItems();
        const originalRating = items[0].rating;
        
        applyComparison(items, 'pizza', 'burger');
        
        expect(items[0].rating).toBe(originalRating);
      });
    });
  });

  // ============================================
  // USE CASE 4: Initialize Items for Ranking
  // ============================================
  describe('Initialize Items (initializeItems)', () => {
    describe('converting names to ELO items', () => {
      it('should create items with default ratings', () => {
        const names = ['Pizza', 'Burger', 'Taco'];
        const items = initializeItems(names);
        
        expect(items).toHaveLength(3);
        items.forEach((item, i) => {
          expect(item.name).toBe(names[i]);
          expect(item.rating).toBe(DEFAULT_RATING);
          expect(item.comparisons).toBe(0);
          expect(item.id).toBeDefined();
        });
      });

      it('should generate unique IDs', () => {
        const items = initializeItems(['A', 'B', 'C']);
        const ids = items.map(i => i.id);
        const uniqueIds = new Set(ids);
        
        expect(uniqueIds.size).toBe(3);
      });

      it('should handle empty list', () => {
        const items = initializeItems([]);
        expect(items).toHaveLength(0);
      });

      it('should handle single item', () => {
        const items = initializeItems(['Lonely']);
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe('Lonely');
      });
    });
  });

  // ============================================
  // USE CASE 5: Get Sorted Rankings
  // ============================================
  describe('Get Ranked Items (getRankedItems)', () => {
    const createItems = (): EloItem[] => [
      { id: '1', name: 'Burger', rating: 1400, comparisons: 3 },
      { id: '2', name: 'Pizza', rating: 1600, comparisons: 3 },
      { id: '3', name: 'Taco', rating: 1500, comparisons: 2 },
    ];

    it('should sort items by rating descending', () => {
      const items = createItems();
      const ranked = getRankedItems(items);
      
      expect(ranked[0].name).toBe('Pizza');  // 1600
      expect(ranked[1].name).toBe('Taco');   // 1500
      expect(ranked[2].name).toBe('Burger'); // 1400
    });

    it('should not mutate original array', () => {
      const items = createItems();
      const originalFirst = items[0].name;
      
      getRankedItems(items);
      
      expect(items[0].name).toBe(originalFirst);
    });

    it('should handle empty array', () => {
      expect(getRankedItems([])).toHaveLength(0);
    });

    it('should handle ties', () => {
      const items = [
        { id: '1', name: 'First', rating: 1500, comparisons: 1 },
        { id: '2', name: 'Second', rating: 1500, comparisons: 1 },
      ];
      
      const ranked = getRankedItems(items);
      expect(ranked).toHaveLength(2);
      // Both have same rating - order is implementation-defined
    });
  });

  // ============================================
  // USE CASE 6: Select Next Comparison Pair
  // ============================================
  describe('Select Next Pair (selectNextPair)', () => {
    describe('prioritizing under-compared items', () => {
      it('should prefer items with fewer comparisons', () => {
        const items: EloItem[] = [
          { id: '1', name: 'Many', rating: 1500, comparisons: 10 },
          { id: '2', name: 'Few', rating: 1500, comparisons: 1 },
          { id: '3', name: 'Some', rating: 1500, comparisons: 5 },
        ];
        
        // Run multiple times to check the item with fewest comparisons is included
        let fewIncluded = false;
        for (let i = 0; i < 10; i++) {
          const pair = selectNextPair(items);
          if (pair?.some(p => p.name === 'Few')) {
            fewIncluded = true;
            break;
          }
        }
        
        expect(fewIncluded).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should return null for empty list', () => {
        expect(selectNextPair([])).toBeNull();
      });

      it('should return null for single item', () => {
        const items = [{ id: '1', name: 'Lonely', rating: 1500, comparisons: 0 }];
        expect(selectNextPair(items)).toBeNull();
      });

      it('should find pair with exactly two items', () => {
        const items: EloItem[] = [
          { id: '1', name: 'A', rating: 1500, comparisons: 0 },
          { id: '2', name: 'B', rating: 1500, comparisons: 0 },
        ];
        
        const pair = selectNextPair(items);
        expect(pair).toHaveLength(2);
      });
    });

    describe('returns valid pairs', () => {
      it('should return two different items', () => {
        const items: EloItem[] = [
          { id: '1', name: 'A', rating: 1500, comparisons: 0 },
          { id: '2', name: 'B', rating: 1500, comparisons: 0 },
          { id: '3', name: 'C', rating: 1500, comparisons: 0 },
        ];
        
        const pair = selectNextPair(items);
        expect(pair![0].id).not.toBe(pair![1].id);
      });

      it('should return items from the original list', () => {
        const items: EloItem[] = [
          { id: '1', name: 'A', rating: 1500, comparisons: 0 },
          { id: '2', name: 'B', rating: 1600, comparisons: 1 },
        ];
        
        const pair = selectNextPair(items);
        const itemIds = items.map(i => i.id);
        
        expect(itemIds).toContain(pair![0].id);
        expect(itemIds).toContain(pair![1].id);
      });
    });

    describe('comparison balance', () => {
      it('should eventually compare all items', () => {
        let items: EloItem[] = [
          { id: '1', name: 'A', rating: 1500, comparisons: 0 },
          { id: '2', name: 'B', rating: 1500, comparisons: 0 },
          { id: '3', name: 'C', rating: 1500, comparisons: 0 },
        ];
        
        const seenPairs = new Set<string>();
        
        for (let i = 0; i < 20; i++) {
          const pair = selectNextPair(items);
          if (!pair) break;
          
          const pairKey = [pair[0].id, pair[1].id].sort().join('-');
          seenPairs.add(pairKey);
          
          // Simulate comparison
          items = items.map(item => {
            if (pair.find(p => p.id === item.id)) {
              return { ...item, comparisons: item.comparisons + 1 };
            }
            return item;
          });
        }
        
        // Should have seen all 3 possible pairs: 1-2, 1-3, 2-3
        expect(seenPairs.size).toBe(3);
      });
    });
  });

  // ============================================
  // USE CASE 7: Estimate Comparisons Needed
  // ============================================
  describe('Estimate Comparisons Needed (estimateComparisonsNeeded)', () => {
    it('should return 2x the item count', () => {
      expect(estimateComparisonsNeeded(5)).toBe(10);
      expect(estimateComparisonsNeeded(10)).toBe(20);
      expect(estimateComparisonsNeeded(15)).toBe(30);
    });

    it('should handle small lists', () => {
      expect(estimateComparisonsNeeded(2)).toBe(4);
      expect(estimateComparisonsNeeded(1)).toBe(2);
    });

    it('should handle zero items', () => {
      expect(estimateComparisonsNeeded(0)).toBe(0);
    });
  });

  // ============================================
  // USE CASE 8: Determine Ranking Stability
  // ============================================
  describe('Ranking Stability (isRankingStable)', () => {
    describe('minimum comparison requirements', () => {
      it('should be unstable when items have too few comparisons', () => {
        const items: EloItem[] = [
          { id: '1', name: 'A', rating: 1600, comparisons: 1 },
          { id: '2', name: 'B', rating: 1500, comparisons: 1 },
          { id: '3', name: 'C', rating: 1400, comparisons: 1 },
        ];
        
        expect(isRankingStable(items)).toBe(false);
      });

      it('should be stable when all items have 2+ comparisons', () => {
        const items: EloItem[] = [
          { id: '1', name: 'A', rating: 1700, comparisons: 2 },
          { id: '2', name: 'B', rating: 1500, comparisons: 2 },
          { id: '3', name: 'C', rating: 1300, comparisons: 2 },
        ];
        
        expect(isRankingStable(items)).toBe(true);
      });

      it('should be unstable if any item has < 2 comparisons', () => {
        const items: EloItem[] = [
          { id: '1', name: 'A', rating: 1600, comparisons: 5 },
          { id: '2', name: 'B', rating: 1500, comparisons: 1 }, // Not enough
          { id: '3', name: 'C', rating: 1400, comparisons: 5 },
        ];
        
        expect(isRankingStable(items)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty list', () => {
        expect(isRankingStable([])).toBe(true);
      });

      it('should handle single item', () => {
        const items = [{ id: '1', name: 'A', rating: 1500, comparisons: 0 }];
        // Single item can't be compared, so technically unstable
        expect(isRankingStable(items)).toBe(false);
      });

      it('should handle two items', () => {
        const items: EloItem[] = [
          { id: '1', name: 'A', rating: 1600, comparisons: 2 },
          { id: '2', name: 'B', rating: 1400, comparisons: 2 },
        ];
        expect(isRankingStable(items)).toBe(true);
      });
    });
  });

  // ============================================
  // INTEGRATION: Full Ranking Flow
  // ============================================
  describe('Full Ranking Flow', () => {
    it('should converge to stable rankings after sufficient comparisons', () => {
      // Simulate ranking 4 food items where true order is: Pizza > Taco > Burger > Salad
      const names = ['Pizza', 'Taco', 'Burger', 'Salad'];
      let items = initializeItems(names);
      
      expect(items.every(i => i.rating === DEFAULT_RATING)).toBe(true);
      
      // Simulated user preferences (higher = better)
      const trueRank: Record<string, number> = {
        Pizza: 4,
        Taco: 3,
        Burger: 2,
        Salad: 1,
      };
      
      // Run comparisons until stable
      let iterations = 0;
      const maxIterations = 50;
      
      while (!isRankingStable(items) && iterations < maxIterations) {
        const pair = selectNextPair(items);
        if (!pair) break;
        
        // Determine winner based on true ranking
        const winnerId = trueRank[pair[0].name] > trueRank[pair[1].name]
          ? pair[0].id
          : pair[1].id;
        const loserId = pair[0].id === winnerId ? pair[1].id : pair[0].id;
        
        items = applyComparison(items, winnerId, loserId);
        iterations++;
      }
      
      // Verify final order - top and bottom should be correct
      // Middle items may vary due to randomness in pair selection
      const finalOrder = getRankedItems(items);
      // Pizza should be near the top (index 0 or 1)
      const pizzaIndex = finalOrder.findIndex(i => i.name === 'Pizza');
      expect(pizzaIndex).toBeLessThanOrEqual(1);
      // Salad should be near the bottom (index 2 or 3)
      const saladIndex = finalOrder.findIndex(i => i.name === 'Salad');
      expect(saladIndex).toBeGreaterThanOrEqual(2);
    });

    it('should handle ties/close matchups gracefully', () => {
      // Items that are truly equal
      let items = initializeItems(['A', 'B']);
      
      // Alternating wins should keep them close
      const aId = items[0].id;
      const bId = items[1].id;
      
      items = applyComparison(items, aId, bId);
      items = applyComparison(items, bId, aId);
      items = applyComparison(items, aId, bId);
      items = applyComparison(items, bId, aId);
      
      const a = items.find(i => i.id === aId)!;
      const b = items.find(i => i.id === bId)!;
      
      // Ratings should be close (within reason)
      expect(Math.abs(a.rating - b.rating)).toBeLessThan(50);
    });
  });
});
