import {
  FollowState,
  LOADING,
  readSucceeded,
  readFailed,
  writeSucceeded,
  writeFailed,
  canToggle,
  followLabel,
  followErrorMessage,
} from '../follow-state';

describe('follow-state', () => {
  describe('read transitions', () => {
    it('starts in a loading state', () => {
      expect(LOADING).toEqual({ status: 'loading' });
    });

    it('resolves a successful read to a known relationship', () => {
      expect(readSucceeded(true)).toEqual({
        status: 'known',
        following: true,
        writeFailed: false,
      });
      expect(readSucceeded(false)).toEqual({
        status: 'known',
        following: false,
        writeFailed: false,
      });
    });

    it('resolves a failed read to unknown, not to "not following"', () => {
      const state = readFailed();
      expect(state).toEqual({ status: 'unknown' });
      // The regression this guards: collapsing a failed read into `following:
      // false` renders "Follow" for an already-followed user, whose next tap
      // then violates the follows_unique constraint.
      expect(state).not.toEqual(readSucceeded(false));
    });
  });

  describe('write transitions', () => {
    it('applies a successful follow', () => {
      expect(writeSucceeded(true)).toEqual({
        status: 'known',
        following: true,
        writeFailed: false,
      });
    });

    it('applies a successful unfollow', () => {
      expect(writeSucceeded(false)).toEqual({
        status: 'known',
        following: false,
        writeFailed: false,
      });
    });

    it('clears a previous write failure on success', () => {
      const failed = writeFailed(readSucceeded(false));
      expect(failed).toMatchObject({ writeFailed: true });
      expect(writeSucceeded(true)).toMatchObject({ writeFailed: false });
    });

    it('records a failed write without changing the relationship', () => {
      const state = writeFailed(readSucceeded(false));
      expect(state).toEqual({ status: 'known', following: false, writeFailed: true });
    });

    it('records a failed unfollow without changing the relationship', () => {
      const state = writeFailed(readSucceeded(true));
      expect(state).toEqual({ status: 'known', following: true, writeFailed: true });
    });

    it('ignores a write failure in loading or unknown states', () => {
      expect(writeFailed(LOADING)).toEqual(LOADING);
      expect(writeFailed(readFailed())).toEqual({ status: 'unknown' });
    });
  });

  describe('canToggle', () => {
    it('allows toggling only from a known state when not busy', () => {
      expect(canToggle(readSucceeded(false), false)).toBe(true);
      expect(canToggle(readSucceeded(true), false)).toBe(true);
    });

    it('blocks toggling while busy', () => {
      expect(canToggle(readSucceeded(false), true)).toBe(false);
    });

    it('blocks toggling while loading or unknown', () => {
      expect(canToggle(LOADING, false)).toBe(false);
      expect(canToggle(readFailed(), false)).toBe(false);
    });
  });

  describe('followLabel', () => {
    it('labels the known states', () => {
      expect(followLabel(readSucceeded(false), false)).toBe('Follow');
      expect(followLabel(readSucceeded(true), false)).toBe('Following');
    });

    it('shows an in-flight marker while busy', () => {
      expect(followLabel(readSucceeded(true), true)).toBe('…');
      expect(followLabel(LOADING, false)).toBe('…');
    });

    it('offers a retry when the read failed', () => {
      expect(followLabel(readFailed(), false)).toBe('Retry');
    });
  });

  describe('followErrorMessage', () => {
    it('reports nothing when there is nothing to report', () => {
      expect(followErrorMessage(LOADING)).toBeNull();
      expect(followErrorMessage(readSucceeded(true))).toBeNull();
      expect(followErrorMessage(readSucceeded(false))).toBeNull();
    });

    it('reports a failed read', () => {
      expect(followErrorMessage(readFailed())).toBe("Couldn't load follow status");
    });

    it('reports a failed follow', () => {
      expect(followErrorMessage(writeFailed(readSucceeded(false)))).toBe(
        "Couldn't follow — tap to retry"
      );
    });

    it('reports a failed unfollow', () => {
      expect(followErrorMessage(writeFailed(readSucceeded(true)))).toBe(
        "Couldn't unfollow — tap to retry"
      );
    });
  });

  describe('the silent-retry-loop regression from review round 1', () => {
    it('never leaves a failed write invisible', () => {
      // 1. The initial read fails on a flaky connection.
      let state: FollowState = readFailed();
      expect(followErrorMessage(state)).not.toBeNull();
      // 2. The button offers a retry rather than a misleading "Follow".
      expect(followLabel(state, false)).toBe('Retry');
      expect(canToggle(state, false)).toBe(false);

      // 3. A later read succeeds; the user taps and the write fails.
      state = writeFailed(readSucceeded(false));
      // 4. The failure is visible instead of settling back silently.
      expect(followErrorMessage(state)).toBe("Couldn't follow — tap to retry");
    });
  });
});
