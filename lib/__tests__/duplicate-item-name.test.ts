import { findDuplicateItemName, hasDuplicateWithinBatch } from '../duplicate-item-name';

describe('findDuplicateItemName', () => {
  it('returns undefined when there is no match', () => {
    expect(findDuplicateItemName('Zebra', ['Apple', 'Banana'])).toBeUndefined();
  });

  it('returns undefined for an empty existing list', () => {
    expect(findDuplicateItemName('Apple', [])).toBeUndefined();
  });

  it('returns the matching entry for an exact match', () => {
    expect(findDuplicateItemName('Apple', ['Apple', 'Banana'])).toBe('Apple');
  });

  it('matches case-insensitively', () => {
    expect(findDuplicateItemName('apple', ['Apple', 'Banana'])).toBe('Apple');
    expect(findDuplicateItemName('APPLE', ['Apple', 'Banana'])).toBe('Apple');
  });

  it('ignores leading/trailing whitespace on the candidate', () => {
    expect(findDuplicateItemName('  Apple  ', ['Apple'])).toBe('Apple');
  });

  it('ignores leading/trailing whitespace on existing entries', () => {
    expect(findDuplicateItemName('Apple', ['  Apple  '])).toBe('  Apple  ');
  });

  it('returns the first matching entry when existing has duplicates', () => {
    expect(findDuplicateItemName('apple', ['Apple', 'APPLE'])).toBe('Apple');
  });
});

describe('hasDuplicateWithinBatch', () => {
  it('returns false for an empty batch', () => {
    expect(hasDuplicateWithinBatch([])).toBe(false);
  });

  it('returns false when every entry is unique', () => {
    expect(hasDuplicateWithinBatch(['Apple', 'Banana', 'Cherry'])).toBe(false);
  });

  it('returns true for an exact duplicate', () => {
    expect(hasDuplicateWithinBatch(['Apple', 'Apple'])).toBe(true);
  });

  it('returns true for a case-insensitive duplicate', () => {
    expect(hasDuplicateWithinBatch(['Apple', 'apple'])).toBe(true);
  });

  it('returns true for a duplicate that only matches after trimming', () => {
    expect(hasDuplicateWithinBatch(['Apple', '  apple  '])).toBe(true);
  });

  it('returns false for a single-item batch', () => {
    expect(hasDuplicateWithinBatch(['Apple'])).toBe(false);
  });
});
