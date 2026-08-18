/**
 * The follow button's state machine, kept out of the component so it can be
 * unit-tested and coverage-gated under the existing `lib/__tests__` harness.
 *
 * The distinction that matters here is between "not following" and "we could
 * not read whether you are following". Collapsing the second into the first
 * renders a "Follow" button for a user who is already followed; tapping it
 * violates the `follows_unique` constraint, and the write error then has
 * nowhere to go.
 */

export type FollowState =
  /** The initial read is in flight. */
  | { status: 'loading' }
  /** The initial read failed. We do not know the follow relationship. */
  | { status: 'unknown' }
  /** The follow relationship is known. `writeFailed` marks a failed toggle. */
  | { status: 'known'; following: boolean; writeFailed: boolean };

export const LOADING: FollowState = { status: 'loading' };

export function readSucceeded(following: boolean): FollowState {
  return { status: 'known', following, writeFailed: false };
}

export function readFailed(): FollowState {
  return { status: 'unknown' };
}

/** A successful toggle clears any previous write failure. */
export function writeSucceeded(following: boolean): FollowState {
  return { status: 'known', following, writeFailed: false };
}

/**
 * A failed toggle leaves the relationship as it was but records the failure,
 * so the UI can say so instead of silently settling back to the old label.
 */
export function writeFailed(state: FollowState): FollowState {
  if (state.status !== 'known') return state;
  return { ...state, writeFailed: true };
}

/** A state in which the follow relationship is known. */
export type KnownFollowState = Extract<FollowState, { status: 'known' }>;

/** Tapping is meaningless while loading, while busy, or in an unknown state. */
export function canToggle(state: FollowState, busy: boolean): state is KnownFollowState {
  return !busy && state.status === 'known';
}

export function followLabel(state: FollowState, busy: boolean): string {
  if (busy) return '…';
  if (state.status === 'unknown') return 'Retry';
  if (state.status === 'loading') return '…';
  return state.following ? 'Following' : 'Follow';
}

/** User-visible failure text, or null when there is nothing to report. */
export function followErrorMessage(state: FollowState): string | null {
  if (state.status === 'unknown') return "Couldn't load follow status";
  if (state.status === 'known' && state.writeFailed) {
    return state.following ? "Couldn't unfollow — tap to retry" : "Couldn't follow — tap to retry";
  }
  return null;
}
