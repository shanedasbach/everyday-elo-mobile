import { useState, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { followUser, unfollowUser, isFollowing } from '../lib/api';

interface FollowButtonProps {
  currentUserId: string;
  targetUserId: string;
}

export default function FollowButton({ currentUserId, targetUserId }: FollowButtonProps) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isFollowing(currentUserId, targetUserId)
      .then((result) => {
        if (!cancelled) setFollowing(result);
      })
      .catch(() => {
        if (!cancelled) setFollowing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, targetUserId]);

  const toggle = async () => {
    if (busy || following === null) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (following) {
        await unfollowUser(currentUserId, targetUserId);
        setFollowing(false);
      } else {
        await followUser(currentUserId, targetUserId);
        setFollowing(true);
      }
    } catch {
      // Surface failure by leaving state unchanged; the user can retry.
    } finally {
      setBusy(false);
    }
  };

  if (currentUserId === targetUserId) return null;
  if (following === null) {
    return (
      <ActivityIndicator
        accessibilityLabel="Loading follow state"
        size="small"
        color="#6B7280"
      />
    );
  }

  return (
    <TouchableOpacity
      style={[styles.button, following ? styles.following : styles.notFollowing]}
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={following ? 'Unfollow' : 'Follow'}
      accessibilityState={{ selected: following, busy }}
    >
      <Text style={[styles.label, following ? styles.followingLabel : styles.notFollowingLabel]}>
        {busy ? '…' : following ? 'Following' : 'Follow'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
