import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { getUserListsWithStatus, ListWithStatus, deleteList } from '../../lib/api';

export default function MyListsScreen() {
  const { user } = useAuth();
  const [lists, setLists] = useState<ListWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLists = useCallback(async () => {
    if (!user) {
      setLists([]);
      setLoading(false);
      return;
    }

    try {
      const userLists = await getUserListsWithStatus(user.id);
      setLists(userLists);
    } catch (error) {
      console.error('Failed to load lists:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadLists();
    }, [loadLists])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadLists();
  };

  const handleDelete = async (listId: string) => {
    try {
      await deleteList(listId);
      setLists(lists.filter(l => l.id !== listId));
    } catch (error) {
      console.error('Failed to delete list:', error);
    }
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔒</Text>
          <Text style={styles.emptyTitle}>Sign in to see your lists</Text>
          <Text style={styles.emptyText}>Create an account to save and manage your rankings</Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity style={styles.signInButton}>
              <Text style={styles.signInButtonText}>Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (lists.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>No lists yet</Text>
          <Text style={styles.emptyText}>Create your first list and start ranking!</Text>
          <Link href="/(tabs)/create" asChild>
            <TouchableOpacity style={styles.signInButton}>
              <Text style={styles.signInButtonText}>Create List</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.content}>
        {lists.map((list) => {
          const statusConfig = {
            not_started: {
              label: 'Not Started',
              bg: '#F3F4F6',
              text: '#6B7280',
              action: 'Start Ranking',
            },
            in_progress: {
              label: 'In Progress',
              bg: '#FEF3C7',
              text: '#D97706',
              action: 'Continue',
            },
            completed: {
              label: 'Completed',
              bg: '#D1FAE5',
              text: '#059669',
              action: 'View Results',
            },
          }[list.rankingStatus];

          const progress = list.estimatedComparisons > 0
            ? Math.min(100, Math.round((list.comparisonsCount / list.estimatedComparisons) * 100))
            : 0;

          return (
            <View key={list.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{list.title}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                    <Text style={[styles.statusText, { color: statusConfig.text }]}>
                      {statusConfig.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>
                  {list.itemCount} items • Created {new Date(list.created_at).toLocaleDateString()}
                </Text>
              </View>

              {list.rankingStatus === 'in_progress' && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressText}>{list.comparisonsCount} comparisons</Text>
                    <Text style={styles.progressText}>{progress}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                </View>
              )}

              <Link href={`/rank/${list.id}`} asChild>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>{statusConfig.action}</Text>
                </TouchableOpacity>
              </Link>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  signInButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  signInButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#6B7280',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 2,
  },
  actionButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
