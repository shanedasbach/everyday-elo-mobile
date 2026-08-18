import {
  selectNextPairIndices,
  EXPRESS_MAX_RATING_GAP,
  PairSelectionItem,
} from '../pair-selection';
import { pairKey, selectNextPair, EloItem } from '../elo';

/** Build items from [rating, comparisons] tuples, in array order. */
function items(...specs: [rating: number, comparisons: number][]): PairSelectionItem[] {
  return specs.map(([rating, comparisons]) => ({ rating, comparisons }));
}

/**
 * A `random()` that replays a fixed script. `selectNextPairIndices` draws
 * exactly twice: first to pick the opponent out of the candidate pool, then to
 * decide display order.
 */
function scriptedRandom(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** Draw the nearest opponent, and keep the pair in [subject, opponent] order. */
const pickNearest = () => scriptedRandom(0, 1);
/** Draw pool position `index` out of `poolSize` candidates, subject first. */
const pick = (index: number, poolSize: number) =>
  scriptedRandom(index / poolSize, 1);

describe('selectNextPairIndices', () => {
  describe('when there is nothing to compare', () => {
    it('returns null for an empty list', () => {
      expect(selectNextPairIndices([])).toBeNull();
    });

    it('returns null for a single item', () => {
      expect(selectNextPairIndices(items([1500, 0]))).toBeNull();
    });

    it('returns the only possible pair for exactly two items', () => {
      const pair = selectNextPairIndices(items([1500, 0], [1500, 0]));
      expect(pair).not.toBeNull();
      expect([...pair!].sort()).toEqual([0, 1]);
    });
  });

  describe('choosing who to compare', () => {
    it('picks the least-compared item first', () => {
      // index 2 has the fewest comparisons.
      const pair = selectNextPairIndices(
        items([1500, 9], [1500, 4], [1500, 0]),
        { random: pickNearest() }
      );
      expect(pair).toContain(2);
    });

    it('prefers the closest-rated opponent', () => {
      // Subject is index 0 (0 comparisons); index 2 is nearest in rating.
      const pair = selectNextPairIndices(
        items([1500, 0], [1900, 5], [1520, 5]),
        { random: pickNearest() }
      );
      expect(pair).toEqual(expect.arrayContaining([0, 2]));
    });

    it('breaks equal rating distance in favour of the less-compared opponent', () => {
      // Indices 1 and 2 are both 100 points from the subject, but index 2 has
      // been compared less, so it should be first in the pool.
      const pair = selectNextPairIndices(
        items([1500, 0], [1400, 8], [1600, 1]),
        { random: pick(0, 3) }
      );
      expect(pair).toEqual(expect.arrayContaining([0, 2]));
    });

    it('draws the opponent from the three closest', () => {
      // Subject index 0. Closest three are 1, 2, 3; index 4 is far away.
      const seen = new Set<number>();
      for (let draw = 0; draw < 3; draw++) {
        const pair = selectNextPairIndices(
          items([1500, 0], [1510, 5], [1520, 5], [1530, 5], [2500, 5]),
          { random: pick(draw, 3) }
        );
        pair!.forEach((i) => seen.add(i));
      }
      expect(seen).toEqual(new Set([0, 1, 2, 3]));
      expect(seen.has(4)).toBe(false);
    });
  });

  describe('randomizing display order', () => {
    it('puts the subject first when the second draw is high', () => {
      const pair = selectNextPairIndices(items([1500, 0], [1500, 5]), {
        random: scriptedRandom(0, 0.9),
      });
      expect(pair).toEqual([0, 1]);
    });

    it('puts the subject second when the second draw is low', () => {
      const pair = selectNextPairIndices(items([1500, 0], [1500, 5]), {
        random: scriptedRandom(0, 0.1),
      });
      expect(pair).toEqual([1, 0]);
    });
  });

  describe('avoiding matchups already seen', () => {
    it('moves to the next item when the least-compared one is exhausted', () => {
      // Index 0 is least-compared but has seen both opponents; index 1 is next.
      const seen = new Set(['0-1', '0-2']);
      const pair = selectNextPairIndices(
        items([1500, 0], [1500, 1], [1500, 2]),
        {
          isSeen: (a, b) => seen.has(`${Math.min(a, b)}-${Math.max(a, b)}`),
          random: pickNearest(),
        }
      );
      expect(pair).toEqual(expect.arrayContaining([1, 2]));
      expect(pair).not.toContain(0);
    });

    it('excludes seen opponents from the pool rather than the item itself', () => {
      // Index 0 has seen index 1 (its closest), so index 2 must be drawn.
      const seen = new Set(['0-1']);
      const pair = selectNextPairIndices(
        items([1500, 0], [1505, 5], [1600, 5]),
        {
          isSeen: (a, b) => seen.has(`${Math.min(a, b)}-${Math.max(a, b)}`),
          random: pick(0, 1),
        }
      );
      expect(pair).toEqual(expect.arrayContaining([0, 2]));
    });

    it('repeats a matchup only once every pair has been seen', () => {
      const pair = selectNextPairIndices(items([1500, 3], [1500, 3]), {
        isSeen: () => true,
        random: pickNearest(),
      });
      expect(pair).not.toBeNull();
      expect([...pair!].sort()).toEqual([0, 1]);
    });
  });

  describe('express mode', () => {
    it('skips lopsided matchups when it can', () => {
      // Index 0's closest opponent is 400 points away; index 3 is within range.
      const pair = selectNextPairIndices(
        items([1500, 0], [1900, 5], [2000, 5], [1550, 5]),
        { skipObvious: true, random: pick(0, 1) }
      );
      expect(pair).toEqual(expect.arrayContaining([0, 3]));
    });

    it('treats the gap as exclusive at the boundary', () => {
      // Exactly EXPRESS_MAX_RATING_GAP away is "obvious"; one under is not.
      const atBoundary = 1500 + EXPRESS_MAX_RATING_GAP;
      const pair = selectNextPairIndices(
        items([1500, 0], [atBoundary, 5], [atBoundary - 1, 5]),
        { skipObvious: true, random: pick(0, 1) }
      );
      expect(pair).toEqual(expect.arrayContaining([0, 2]));
    });

    it('falls back to a lopsided matchup when every opponent is far away', () => {
      const pair = selectNextPairIndices(
        items([1500, 0], [2400, 5], [2500, 5]),
        { skipObvious: true, random: pickNearest() }
      );
      expect(pair).not.toBeNull();
      expect(pair).toContain(0);
    });

    it('leaves a single-opponent pool alone', () => {
      const pair = selectNextPairIndices(items([1500, 0], [2500, 5]), {
        skipObvious: true,
        random: pickNearest(),
      });
      expect([...pair!].sort()).toEqual([0, 1]);
    });

    it('is off by default', () => {
      const lopsided = items([1500, 0], [2500, 5], [1550, 5]);
      const off = selectNextPairIndices(lopsided, { random: pick(1, 2) });
      expect(off).toEqual(expect.arrayContaining([0, 1]));
    });
  });

  it('does not mutate the caller’s array', () => {
    const original = items([1500, 9], [1400, 0], [1600, 3]);
    const snapshot = JSON.parse(JSON.stringify(original));
    selectNextPairIndices(original);
    expect(original).toEqual(snapshot);
  });
});

/**
 * The point of the extraction: `selectNextPair` and the rank screen must not be
 * able to drift apart. `selectNextPair` is now a view over the same function,
 * so pinning it to `selectNextPairIndices` guards that.
 */
describe('selectNextPair delegates to the shared strategy', () => {
  const eloItems: EloItem[] = [
    { id: 'a', name: 'A', rating: 1500, comparisons: 9 },
    { id: 'b', name: 'B', rating: 1480, comparisons: 0 },
    { id: 'c', name: 'C', rating: 1900, comparisons: 4 },
  ];

  it('returns the items at the indices the shared strategy chooses', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
    try {
      const expected = selectNextPairIndices(eloItems, { random: () => 0.9 });
      const pair = selectNextPair(eloItems);
      expect(pair).toEqual([eloItems[expected![0]], eloItems[expected![1]]]);
    } finally {
      spy.mockRestore();
    }
  });

  it('translates its seenPairs keys into the index-based predicate', () => {
    // Item 'b' is least-compared; block both of its matchups and it must be
    // passed over, exactly as the index-based form would.
    const seen = new Set([pairKey('b', 'a'), pairKey('b', 'c')]);
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
    try {
      const pair = selectNextPair(eloItems, seen);
      expect(pair!.map((i) => i.id).sort()).toEqual(['a', 'c']);
    } finally {
      spy.mockRestore();
    }
  });

  it('still returns null when there is no pair to make', () => {
    expect(selectNextPair([])).toBeNull();
    expect(selectNextPair([eloItems[0]])).toBeNull();
  });
});
