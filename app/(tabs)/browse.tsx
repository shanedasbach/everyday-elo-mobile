import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import {
  getTemplateLists,
  getFeaturedLists,
  getFollowedListsFeed,
  FeaturedList,
  FollowedListFeedEntry,
  List,
} from '../../lib/api';
import { templates as fallbackTemplates, Template } from '../../lib/templates';
import { useAuth } from '../../lib/auth-context';

type Tab = 'for-you' | 'following';

export default function BrowseScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('for-you');
  const [templates, setTemplates] = useState<Template[]>(fallbackTemplates);
  const [featuredLists, setFeaturedLists] = useState<FeaturedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feed, setFeed] = useState<FollowedListFeedEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const supabaseTemplates = await getTemplateLists();
      if (supabaseTemplates.length > 0) {
        setTemplates(
          supabaseTemplates.map((list) => ({
            id: list.id,
            title: list.title,
            description: list.description,
            share_code: list.share_code,
            items: [],
          })),
        );
      }
      const featured = await getFeaturedLists();
      setFeaturedLists(featured);
    } catch (error) {
      console.log('Using offline data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const loadFeed = useCallback(async () => {
    if (!user) {
      setFeed([]);
      setFeedError(false);
      setFeedLoading(false);
      setFeedRefreshing(false);
      return;
    }
    try {
      setFeedError(false);
      const entries = await getFollowedListsFeed(user.id);
      setFeed(entries);
    } catch {
      // An empty feed and a failed fetch are different things to a user.
      setFeedError(true);
    } finally {
      setFeedLoading(false);
      setFeedRefreshing(false);
    }
  }, [user]);

  // Fetch lazily: only once the Following tab is actually opened.
  useEffect(() => {
    if (activeTab !== 'following') return;
    setFeedLoading(true);
    loadFeed();
  }, [activeTab, loadFeed]);

  const onRefreshFeed = () => {
    setFeedRefreshing(true);
    loadFeed();
  };

  const groupedFeatured = featuredLists.reduce((acc, list) => {
    const hour = new Date(list.featured_at).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    });
    if (!acc[hour]) acc[hour] = [];
    acc[hour].push(list);
    return acc;
  }, {} as Record<string, FeaturedList[]>);

  return (
    <View style={styles.root}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'for-you' && styles.tabActive]}
          onPress={() => setActiveTab('for-you')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'for-you' }}
        >
          <Text style={[styles.tabText, activeTab === 'for-you' && styles.tabTextActive]}>
            For You
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'following' && styles.tabActive]}
          onPress={() => setActiveTab('following')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'following' }}
        >
          <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>
            Following
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'for-you' ? (
        <ScrollView
          style={styles.container}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#3B82F6" size="large" />
            </View>
          ) : (
            <>
              {featuredLists.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🔥 Featured Lists</Text>
                  <Text style={styles.sectionSubtitle}>Fresh community picks</Text>

                  {Object.entries(groupedFeatured).slice(0, 2).map(([hour, lists]) => (
                    <View key={hour} style={styles.featuredGroup}>
                      <Text style={styles.featuredTime}>✨ Featured {hour}</Text>
                      {lists.map(list => (
                        <Link
                          key={list.id}
                          href={`/rank/${list.list_id}`}
                          asChild
                        >
                          <TouchableOpacity style={styles.featuredCard}>
                            <Text style={styles.featuredTitle}>{list.title}</Text>
                            {list.description && (
                              <Text style={styles.featuredDescription} numberOfLines={2}>
                                {list.description}
                              </Text>
                            )}
                            <View style={styles.featuredMeta}>
                              <Text style={styles.featuredStat}>📝 {list.item_count} items</Text>
                              <Text style={styles.featuredStat}>👥 {list.ranking_count} ranked</Text>
                            </View>
                            {list.creator_name && (
                              <Text style={styles.featuredCreator}>by {list.creator_name}</Text>
                            )}
                          </TouchableOpacity>
                        </Link>
                      ))}
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📋 Templates</Text>
                <Text style={styles.sectionSubtitle}>Quick start with curated lists</Text>

                {templates.map((template) => (
                  <Link
                    key={template.id}
                    href={`/rank/${template.share_code || template.id}`}
                    asChild
                  >
                    <TouchableOpacity style={styles.card}>
                      <Text style={styles.cardTitle}>{template.title}</Text>
                      {template.description && (
                        <Text style={styles.cardDescription}>{template.description}</Text>
                      )}
                    </TouchableOpacity>
                  </Link>
                ))}
              </View>

              <View style={styles.createCard}>
                <Text style={styles.createTitle}>Create your own list</Text>
                <Text style={styles.createText}>Add your items, rank them, and share with friends</Text>
                <Link href="/(tabs)/create" asChild>
                  <TouchableOpacity style={styles.createButton}>
                    <Text style={styles.createButtonText}>+ New List</Text>
                  </TouchableOpacity>
                </Link>
              </View>

              <View style={styles.spacer} />
            </>
          )}
        </ScrollView>
      ) : !user ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Sign in to follow people</Text>
          <Text style={styles.emptyText}>
            Once you sign in and follow other users, their ranked lists will appear here.
          </Text>
        </View>
      ) : feedLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#3B82F6" size="large" />
        </View>
      ) : feedError ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Couldn&apos;t load your feed</Text>
          <Text style={styles.emptyText}>Check your connection and try again.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setFeedLoading(true);
              loadFeed();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading feed"
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : feed.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>No one to follow yet</Text>
          <Text style={styles.emptyText}>
            Once you follow other users, their ranked lists will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          refreshControl={
            <RefreshControl refreshing={feedRefreshing} onRefresh={onRefreshFeed} />
          }
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👥 From people you follow</Text>
            <Text style={styles.sectionSubtitle}>Recently updated rankings</Text>

            {feed.map((entry) => (
              <Link key={entry.ranking_id} href={`/rank/${entry.list_id}`} asChild>
                <TouchableOpacity style={styles.featuredCard}>
                  <Text style={styles.featuredTitle}>{entry.title}</Text>
                  {entry.description && (
                    <Text style={styles.featuredDescription} numberOfLines={2}>
                      {entry.description}
                    </Text>
                  )}
                  <View style={styles.featuredMeta}>
                    <Text style={styles.featuredStat}>
                      ⚖️ {entry.comparisons_count} comparisons
                    </Text>
                    <Text style={styles.featuredStat}>
                      🕒 {new Date(entry.updated_at).toLocaleDateString()}
                    </Text>
                  </View>
                  {(entry.creator_name || entry.creator_username) && (
                    <Text style={styles.featuredCreator}>
                      by {entry.creator_name || `@${entry.creator_username}`}
                    </Text>
                  )}
                </TouchableOpacity>
              </Link>
            ))}
          </View>
          <View style={styles.spacer} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: 64,
    alignItems: 'center',
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  featuredGroup: {
    marginBottom: 16,
  },
  featuredTime: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  featuredCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  featuredTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  featuredDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  featuredMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  featuredStat: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  featuredCreator: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  createCard: {
    backgroundColor: '#3B82F6',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  createTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  createText: {
    fontSize: 14,
    color: '#BFDBFE',
    textAlign: 'center',
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#3B82F6',
    fontWeight: '600',
    fontSize: 16,
  },
  spacer: {
    height: 32,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  retryButtonText: {
    color: '#3B82F6',
    fontWeight: '600',
    fontSize: 15,
  },
});
