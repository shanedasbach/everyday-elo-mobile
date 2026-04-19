/**
 * Tests for the swipe-gesture helpers used by the rank screen.
 *
 * These cover the pure decision logic that the UI layer drives from the
 * react-native-gesture-handler callbacks: when a swipe commits, when
 * haptics fire, and where the card animates off to.
 */

import {
  SWIPE_THRESHOLD,
  SWIPE_VELOCITY_THRESHOLD,
  SWIPE_COMMIT_DISTANCE,
  commitTranslation,
  crossedHapticThreshold,
  resolveSwipe,
} from '../swipe-gesture';

describe('resolveSwipe', () => {
  it('returns "none" when both translation and velocity are below threshold', () => {
    expect(resolveSwipe(0, 0)).toBe('none');
    expect(resolveSwipe(40, 100)).toBe('none');
    expect(resolveSwipe(-40, -100)).toBe('none');
  });

  it('returns "right" when translation exceeds the positive threshold', () => {
    expect(resolveSwipe(SWIPE_THRESHOLD + 1, 0)).toBe('right');
  });

  it('returns "left" when translation exceeds the negative threshold', () => {
    expect(resolveSwipe(-(SWIPE_THRESHOLD + 1), 0)).toBe('left');
  });

  it('returns "right" on a fast flick with small distance', () => {
    expect(resolveSwipe(10, SWIPE_VELOCITY_THRESHOLD + 1)).toBe('right');
  });

  it('returns "left" on a fast flick in the negative direction', () => {
    expect(resolveSwipe(-10, -(SWIPE_VELOCITY_THRESHOLD + 1))).toBe('left');
  });

  it('treats the exact threshold as not-yet-committed for distance', () => {
    expect(resolveSwipe(SWIPE_THRESHOLD, 0)).toBe('none');
    expect(resolveSwipe(-SWIPE_THRESHOLD, 0)).toBe('none');
  });

  it('treats the exact velocity threshold as not-yet-committed', () => {
    expect(resolveSwipe(0, SWIPE_VELOCITY_THRESHOLD)).toBe('none');
    expect(resolveSwipe(0, -SWIPE_VELOCITY_THRESHOLD)).toBe('none');
  });
});

describe('crossedHapticThreshold', () => {
  it('returns true when a drag first crosses the threshold rightward', () => {
    expect(crossedHapticThreshold(SWIPE_THRESHOLD - 5, SWIPE_THRESHOLD + 5)).toBe(true);
  });

  it('returns true when a drag first crosses the threshold leftward', () => {
    expect(crossedHapticThreshold(-(SWIPE_THRESHOLD - 5), -(SWIPE_THRESHOLD + 5))).toBe(true);
  });

  it('returns false if already past the threshold (no new crossing)', () => {
    expect(
      crossedHapticThreshold(SWIPE_THRESHOLD + 5, SWIPE_THRESHOLD + 20),
    ).toBe(false);
  });

  it('returns false if the drag is still under the threshold', () => {
    expect(crossedHapticThreshold(10, 40)).toBe(false);
  });

  it('returns false when drag recedes back below the threshold', () => {
    expect(
      crossedHapticThreshold(SWIPE_THRESHOLD + 20, SWIPE_THRESHOLD - 5),
    ).toBe(false);
  });

  it('returns true at the exact threshold boundary', () => {
    // prev < threshold, next === threshold should count as a crossing so the
    // haptic fires on the frame where the user "arrives" at the threshold.
    expect(crossedHapticThreshold(SWIPE_THRESHOLD - 1, SWIPE_THRESHOLD)).toBe(true);
  });
});

describe('commitTranslation', () => {
  it('returns a positive distance for a right commit', () => {
    expect(commitTranslation('right')).toBe(SWIPE_COMMIT_DISTANCE);
  });

  it('returns a negative distance for a left commit', () => {
    expect(commitTranslation('left')).toBe(-SWIPE_COMMIT_DISTANCE);
  });
});
