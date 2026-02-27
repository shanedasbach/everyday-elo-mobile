import {
  expectedScore,
  calculateNewRatings,
  applyComparison,
  initializeItems,
  getRankedItems,
  selectNextPair,
  estimateComparisonsNeeded,
  isRankingStable,
  DEFAULT_RATING,
  K_FACTOR,
  EloItem,
} from '../elo';

describe('Elo Rating System', () => {
  describe('Constants', () => {
    it('should have default rating of 1500', () => {
      expect(DEFAULT_RATING).toBe(1500);
    });

    it('should have K-factor of 32', () => {
      expect(K_FACTOR).toBe(32);
    });
  });

  describe('expectedScore', () => {
    it('should return 0.5 for equal ratings', () => {
      expect(expectedScore(1500, 1500)).toBe(0.5);
    });

    it('should return higher probability for higher-rated player', () => {
      const score = expectedScore(1600, 1400);
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThan(1);
    });

    it('should return lower probability for lower-rated player', () => {
      const score = expectedScore(1400, 1600);
      expect(score).toBeLessThan(0.5);
      expect(score).toBeGreaterThan(0);
    });

    it('should return ~0.76 for 200 point advantage', () => {
      const score = expectedScore(1600, 1400);
      expect(score).toBeCloseTo(0.76, 1);
    });

    it('should return ~0.24 for 200 point disadvantage', () => {
      const score = expectedScore(1400, 1600);
      expect(score).toBeCloseTo(0.24, 1);
    });

    it('should return ~0.91 for 400 point advantage', () => {
      const score = expectedScore(1800, 1400);
      expect(score).toBeCloseTo(0.91, 1);
    });

    it('should handle very large rating differences', () => {
      const score = expectedScore(2000, 1000);
      expect(score).toBeGreaterThan(0.99);
      expect(score).toBeLessThan(1);
    });

    it('should be symmetric (scores sum to 1)', () => {
      const scoreA = expectedScore(1600, 1400);
      const scoreB = expectedScore(1400, 1600);
      expect(scoreA + scoreB).toBeCloseTo(1, 10);
    });
  });

  describe('calculateNewRatings', () => {
    const createItem = (rating: number): EloItem => ({
      id: 'test',
      name: 'Test',
      rating,
      comparisons: 0,
    });

    it('should increase winner rating and decrease loser rating', () => {
      const winner = createItem(1500);
      const loser = createItem(1500);
      const { winnerRating, loserRating } = calculateNewRatings(winner, loser);

      expect(winnerRating).toBeGreaterThan(1500);
      expect(loserRating).toBeLessThan(1500);
    });

    it('should give larger gain to underdog winner', () => {
      const underdog = createItem(1400);
      const favorite = createItem(1600);
      const { winnerRating } = calculateNewRatings(underdog, favorite);

      const equalWinner = createItem(1500);
      const equalLoser = createItem(1500);
      const { winnerRating: equalWinnerRating } = calculateNewRatings(equalWinner, equalLoser);

      // Underdog winning should gain more than winning vs equal opponent
      expect(winnerRating - 1400).toBeGreaterThan(equalWinnerRating - 1500);
    });

    it('should give smaller loss to underdog loser', () => {
      const underdog = createItem(1400);
      const favorite = createItem(1600);
      const { loserRating: underdogLoss } = calculateNewRatings(favorite, underdog);

      const equalWinner = createItem(1500);
      const equalLoser = createItem(1500);
      const { loserRating: equalLoss } = calculateNewRatings(equalWinner, equalLoser);

      // Underdog losing should lose less than equal opponent losing
      expect(1400 - underdogLoss).toBeLessThan(1500 - equalLoss);
    });

    it('should round ratings to integers', () => {
      const winner = createItem(1500);
      const loser = createItem(1500);
      const { winnerRating, loserRating } = calculateNewRatings(winner, loser);

      expect(Number.isInteger(winnerRating)).toBe(true);
      expect(Number.isInteger(loserRating)).toBe(true);
    });

    it('should use custom K-factor when provided', () => {
      const winner = createItem(1500);
      const loser = createItem(1500);

      const { winnerRating: k32 } = calculateNewRatings(winner, loser, 32);
      const { winnerRating: k16 } = calculateNewRatings(winner, loser, 16);

      // Higher K should mean larger rating changes
      expect(k32 - 1500).toBeGreaterThan(k16 - 1500);
    });

    it('should conserve total rating points (approximately)', () => {
      const winner = createItem(1500);
      const loser = createItem(1500);
      const { winnerRating, loserRating } = calculateNewRatings(winner, loser);

      // Total should be approximately conserved (small rounding errors allowed)
      expect(winnerRating + loserRating).toBeCloseTo(3000, 0);
    });
  });

  describe('applyComparison', () => {
    const createItems = (): EloItem[] => [
      { id: 'a', name: 'Item A', rating: 1500, comparisons: 0 },
      { id: 'b', name: 'Item B', rating: 1500, comparisons: 0 },
      { id: 'c', name: 'Item C', rating: 1500, comparisons: 0 },
    ];

    it('should update winner and loser ratings', () => {
      const items = createItems();
      const result = applyComparison(items, 'a', 'b');

      const winnerResult = result.find(i => i.id === 'a');
      const loserResult = result.find(i => i.id === 'b');

      expect(winnerResult?.rating).toBeGreaterThan(1500);
      expect(loserResult?.rating).toBeLessThan(1500);
    });

    it('should increment comparison count for both items', () => {
      const items = createItems();
      const result = applyComparison(items, 'a', 'b');

      const winnerResult = result.find(i => i.id === 'a');
      const loserResult = result.find(i => i.id === 'b');

      expect(winnerResult?.comparisons).toBe(1);
      expect(loserResult?.comparisons).toBe(1);
    });

    it('should not modify uninvolved items', () => {
      const items = createItems();
      const result = applyComparison(items, 'a', 'b');

      const uninvolved = result.find(i => i.id === 'c');
      expect(uninvolved?.rating).toBe(1500);
      expect(uninvolved?.comparisons).toBe(0);
    });

    it('should return new array (immutable)', () => {
      const items = createItems();
      const result = applyComparison(items, 'a', 'b');

      expect(result).not.toBe(items);
      expect(result[0]).not.toBe(items[0]);
    });

    it('should throw error for invalid winner ID', () => {
      const items = createItems();
      expect(() => applyComparison(items, 'invalid', 'b')).toThrow('Invalid winner or loser ID');
    });

    it('should throw error for invalid loser ID', () => {
      const items = createItems();
      expect(() => applyComparison(items, 'a', 'invalid')).toThrow('Invalid winner or loser ID');
    });

    it('should handle multiple comparisons correctly', () => {
      let items = createItems();
      items = applyComparison(items, 'a', 'b');
      items = applyComparison(items, 'a', 'c');
      items = applyComparison(items, 'b', 'c');

      const a = items.find(i => i.id === 'a')!;
      const b = items.find(i => i.id === 'b')!;
      const c = items.find(i => i.id === 'c')!;

      // A won twice, B won once/lost once, C lost twice
      expect(a.rating).toBeGreaterThan(b.rating);
      expect(b.rating).toBeGreaterThan(c.rating);
      expect(a.comparisons).toBe(2);
      expect(b.comparisons).toBe(2);
      expect(c.comparisons).toBe(2);
    });
  });

  describe('initializeItems', () => {
    it('should create items with default rating', () => {
      const items = initializeItems(['A', 'B', 'C']);
      
      items.forEach(item => {
        expect(item.rating).toBe(DEFAULT_RATING);
      });
    });

    it('should set comparisons to 0', () => {
      const items = initializeItems(['A', 'B']);
      
      items.forEach(item => {
        expect(item.comparisons).toBe(0);
      });
    });

    it('should preserve item names', () => {
      const names = ['Pizza', 'Burgers', 'Tacos'];
      const items = initializeItems(names);
      
      expect(items.map(i => i.name)).toEqual(names);
    });

    it('should generate unique IDs', () => {
      const items = initializeItems(['A', 'B', 'C']);
      const ids = items.map(i => i.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(3);
    });

    it('should handle empty array', () => {
      const items = initializeItems([]);
      expect(items).toEqual([]);
    });

    it('should handle single item', () => {
      const items = initializeItems(['Solo']);
      expect(items.length).toBe(1);
      expect(items[0].name).toBe('Solo');
    });

    it('should handle items with special characters', () => {
      const names = ['Item #1', 'Item @2', 'Item & 3'];
      const items = initializeItems(names);
      
      expect(items.map(i => i.name)).toEqual(names);
    });
  });

  describe('getRankedItems', () => {
    it('should sort items by rating descending', () => {
      const items: EloItem[] = [
        { id: 'c', name: 'C', rating: 1400, comparisons: 2 },
        { id: 'a', name: 'A', rating: 1600, comparisons: 2 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 2 },
      ];

      const ranked = getRankedItems(items);

      expect(ranked[0].id).toBe('a');
      expect(ranked[1].id).toBe('b');
      expect(ranked[2].id).toBe('c');
    });

    it('should return new array (immutable)', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 0 },
      ];

      const ranked = getRankedItems(items);
      expect(ranked).not.toBe(items);
    });

    it('should handle items with equal ratings', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 0 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 0 },
      ];

      const ranked = getRankedItems(items);
      expect(ranked.length).toBe(2);
    });

    it('should handle empty array', () => {
      const ranked = getRankedItems([]);
      expect(ranked).toEqual([]);
    });
  });

  describe('selectNextPair', () => {
    it('should return null for empty array', () => {
      expect(selectNextPair([])).toBeNull();
    });

    it('should return null for single item', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 0 },
      ];
      expect(selectNextPair(items)).toBeNull();
    });

    it('should return two different items', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 0 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 0 },
      ];

      const pair = selectNextPair(items);
      expect(pair).not.toBeNull();
      expect(pair![0].id).not.toBe(pair![1].id);
    });

    it('should prioritize items with fewer comparisons', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 5 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 0 },
        { id: 'c', name: 'C', rating: 1500, comparisons: 3 },
      ];

      // Run multiple times to account for randomness
      let bIncluded = 0;
      for (let i = 0; i < 100; i++) {
        const pair = selectNextPair(items);
        if (pair![0].id === 'b' || pair![1].id === 'b') {
          bIncluded++;
        }
      }

      // Item B (0 comparisons) should be included most of the time
      expect(bIncluded).toBeGreaterThan(90);
    });

    it('should return array of exactly 2 items', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 0 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 0 },
        { id: 'c', name: 'C', rating: 1500, comparisons: 0 },
      ];

      const pair = selectNextPair(items);
      expect(pair!.length).toBe(2);
    });

    it('should work with just 2 items', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 0 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 0 },
      ];

      const pair = selectNextPair(items);
      expect(pair).not.toBeNull();
      expect(pair!.map(i => i.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('estimateComparisonsNeeded', () => {
    it('should return 2N for N items', () => {
      expect(estimateComparisonsNeeded(5)).toBe(10);
      expect(estimateComparisonsNeeded(10)).toBe(20);
    });

    it('should round up for odd calculations', () => {
      expect(estimateComparisonsNeeded(3)).toBe(6);
    });

    it('should handle zero items', () => {
      expect(estimateComparisonsNeeded(0)).toBe(0);
    });

    it('should handle one item', () => {
      expect(estimateComparisonsNeeded(1)).toBe(2);
    });
  });

  describe('isRankingStable', () => {
    it('should return true when all items have >= 2 comparisons', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 2 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 3 },
        { id: 'c', name: 'C', rating: 1500, comparisons: 2 },
      ];

      expect(isRankingStable(items)).toBe(true);
    });

    it('should return false when any item has < 2 comparisons', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 2 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 1 },
        { id: 'c', name: 'C', rating: 1500, comparisons: 2 },
      ];

      expect(isRankingStable(items)).toBe(false);
    });

    it('should return false when all items have 0 comparisons', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1500, comparisons: 0 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 0 },
      ];

      expect(isRankingStable(items)).toBe(false);
    });

    it('should return true for empty array', () => {
      expect(isRankingStable([])).toBe(true);
    });

    it('should return true when items have many comparisons', () => {
      const items: EloItem[] = [
        { id: 'a', name: 'A', rating: 1600, comparisons: 10 },
        { id: 'b', name: 'B', rating: 1500, comparisons: 8 },
      ];

      expect(isRankingStable(items)).toBe(true);
    });
  });

  describe('Full ranking workflow', () => {
    it('should produce meaningful rankings after multiple comparisons', () => {
      // Initialize items
      let items = initializeItems(['Pizza', 'Burger', 'Taco', 'Sushi']);

      // Simulate comparisons: Pizza > Burger > Taco > Sushi
      items = applyComparison(items, items.find(i => i.name === 'Pizza')!.id, items.find(i => i.name === 'Burger')!.id);
      items = applyComparison(items, items.find(i => i.name === 'Pizza')!.id, items.find(i => i.name === 'Taco')!.id);
      items = applyComparison(items, items.find(i => i.name === 'Pizza')!.id, items.find(i => i.name === 'Sushi')!.id);
      items = applyComparison(items, items.find(i => i.name === 'Burger')!.id, items.find(i => i.name === 'Taco')!.id);
      items = applyComparison(items, items.find(i => i.name === 'Burger')!.id, items.find(i => i.name === 'Sushi')!.id);
      items = applyComparison(items, items.find(i => i.name === 'Taco')!.id, items.find(i => i.name === 'Sushi')!.id);

      const ranked = getRankedItems(items);

      // Should reflect the preference order
      expect(ranked[0].name).toBe('Pizza');
      expect(ranked[1].name).toBe('Burger');
      expect(ranked[2].name).toBe('Taco');
      expect(ranked[3].name).toBe('Sushi');
    });

    it('should stabilize after sufficient comparisons', () => {
      let items = initializeItems(['A', 'B', 'C']);

      // Each item compared twice
      items = applyComparison(items, items[0].id, items[1].id);
      items = applyComparison(items, items[1].id, items[2].id);
      items = applyComparison(items, items[0].id, items[2].id);
      items = applyComparison(items, items[0].id, items[1].id);
      items = applyComparison(items, items[1].id, items[2].id);
      items = applyComparison(items, items[0].id, items[2].id);

      expect(isRankingStable(items)).toBe(true);
    });
  });
});
