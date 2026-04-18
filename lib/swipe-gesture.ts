/**
 * Pure helpers for the rank screen's horizontal swipe-to-choose gesture.
 *
 * The UI layer (app/rank/[id].tsx) drives these functions from the
 * react-native-gesture-handler callbacks so the math stays testable.
 *
 * Model:
 * - A user can swipe either of the two head-to-head cards horizontally.
 * - Swiping a card to the right past the threshold picks that card.
 * - Swiping a card to the left past the threshold picks the opposing card.
 * - Haptic feedback fires exactly once per gesture, when the finger first
 *   crosses the threshold in either direction.
 * - Tap remains a fallback for users who do not discover the gesture.
 */

export const SWIPE_THRESHOLD = 80;
export const SWIPE_VELOCITY_THRESHOLD = 600;
export const SWIPE_COMMIT_DISTANCE = 400;

export type SwipeDirection = 'left' | 'right' | 'none';

/**
 * Which way did the pan go far enough (distance or velocity) to count as a
 * commit? Returns `'none'` if the user should snap back.
 */
export function resolveSwipe(
  translationX: number,
  velocityX: number,
): SwipeDirection {
  if (
    translationX > SWIPE_THRESHOLD ||
    velocityX > SWIPE_VELOCITY_THRESHOLD
  ) {
    return 'right';
  }
  if (
    translationX < -SWIPE_THRESHOLD ||
    velocityX < -SWIPE_VELOCITY_THRESHOLD
  ) {
    return 'left';
  }
  return 'none';
}

/**
 * Did the current drag just cross the haptic threshold? Callers track the
 * previous translation so we only fire haptics on the leading edge instead
 * of every frame.
 */
export function crossedHapticThreshold(
  prevTranslationX: number,
  nextTranslationX: number,
): boolean {
  const prevAbs = Math.abs(prevTranslationX);
  const nextAbs = Math.abs(nextTranslationX);
  return prevAbs < SWIPE_THRESHOLD && nextAbs >= SWIPE_THRESHOLD;
}

/**
 * Final X translation the card should animate to when committing a swipe.
 * Positive for right, negative for left. Used with Animated.timing so the
 * card glides off-screen before the next pair loads.
 */
export function commitTranslation(direction: 'left' | 'right'): number {
  return direction === 'right' ? SWIPE_COMMIT_DISTANCE : -SWIPE_COMMIT_DISTANCE;
}
