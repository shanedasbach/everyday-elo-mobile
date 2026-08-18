import { useState, useEffect, useCallback, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { followUser, unfollowUser, isFollowing } from '../lib/api';
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
} from '../lib/follow-state';

interface FollowButtonProps {
  currentUserId: string;
  targetUserId: string;
}

export default function FollowButton({ currentUserId, targetUserId }: FollowButtonProps) {
  const [state, setState] = useState<FollowState>(LOADING);
  const [busy, setBusy] = useState(false);
  // Cancels the latest read, whether the effect or the retry path started it.
  const cancelRead = useRef<(() => void) | null>(null);

  const load = useCallback(() => {
    cancelRead.current?.();
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    cancelRead.current = cancel;

    setState(LOADING);
    isFollowing(currentUserId, targetUserId)
      .then((result) => {
        if (!cancelled) setState(readSucceeded(result));
      })
      .catch(() => {
        // A failed read is an unknown relationship, not a negative one.
        if (!cancelled) setState(readFailed());
      });
    return cancel;
  }, [currentUserId, targetUserId]);

  useEffect(() => {
    load();
    // Reads the ref rather than closing over this call's canceller, so a retry
    // read started from `toggle` is guarded on unmount too.
    return () => cancelRead.current?.();
  }, [load]);

  const toggle = async () => {
    // An unknown state means retrying the read, not guessing at a write.
    if (state.status === 'unknown') {
      load();
      return;
    }
    if (!canToggle(state, busy)) return;

    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const wasFollowing = state.following;
    try {
      if (wasFollowing) {
        await unfollowUser(currentUserId, targetUserId);
      } else {
        await followUser(currentUserId, targetUserId);
      }
      setState(writeSucceeded(!wasFollowing));
    } catch {
      setState((prev) => writeFailed(prev));
    } finally {
      setBusy(false);
    }
  };

  if (currentUserId === targetUserId) return null;
  if (state.status === 'loading') {
    return (
      <ActivityIndicator
        accessibilityLabel="Loading follow state"
        size="small"
        color="#6B7280"
      />
    );
  }

  const error = followErrorMessage(state);
  const isFollowingNow = state.status === 'known' && state.following;
  const accessibilityLabel =
    state.status === 'unknown'
      ? 'Retry loading follow status'
      : isFollowingNow
        ? 'Unfollow'
        : 'Follow';

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[styles.button, isFollowingNow ? styles.following : styles.notFollowing]}
        onPress={toggle}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: isFollowingNow, busy }}
      >
        <Text
          style={[styles.label, isFollowingNow ? styles.followingLabel : styles.notFollowingLabel]}
        >
          {followLabel(state, busy)}
        </Text>
      </TouchableOpacity>
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-end',
  },
  error: {
    marginTop: 4,
    fontSize: 11,
    color: '#DC2626',
    textAlign: 'right',
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  notFollowing: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  following: {
    backgroundColor: '#fff',
    borderColor: '#D1D5DB',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  notFollowingLabel: {
    color: '#fff',
  },
  followingLabel: {
    color: '#374151',
  },
});
