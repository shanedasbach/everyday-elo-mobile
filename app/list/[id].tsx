import { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../lib/auth-context';
import ListActionSheet, { ActionItem } from '../../components/ListActionSheet';
import {
  getList,
  getListByShareCode,
  getListItems,
  getRankedItems,
  deleteList,
  List,
  ListItem,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';

interface RankedListItem extends ListItem {
  rating?: number;
  rank?: number;
}

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<RankedListItem[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [rankingStatus, setRankingStatus] = useState<'not_started' | 'in_progress' | 'completed'>('not_started');

  const loadList = useCallback(async () => {
    if (!id) return;

    try {
      // Try to load list by ID first, then by share code
      let listData = await getList(id);
      if (!listData) {
        listData = await getListByShareCode(id);
      }

      if (!listData) {
        setLoading(false);
        return;
      }

      setList(listData);
      setIsOwner(user?.id === listData.creator_id);

      // Get list items
      const listItems = await getListItems(listData.id);
      
      // Check if user has ranked this list
      if (user) {
        const { data: ranking } = await supabase
          .from('rankings')
          .select('*')
          .eq('list_id', listData.id)
          .eq('user_id', user.id)
          .single();

        if (ranking) {
          setRankingStatus(ranking.is_complete ? 'completed' : 'in_progress');
          
          // Get ranked items to show ratings
          const rankedItems = await getRankedItems(ranking.id);
          
          // Merge items with their ratings
          const itemsWithRatings: RankedListItem[] = listItems.map(item => {
            const ranked = rankedItems.find(r => r.item_id === item.id);
            return {
              ...item,
              rating: ranked?.rating,
            };
          });
          
          // Sort by rating if completed
          if (ranking.is_complete) {
            itemsWithRatings.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            itemsWithRatings.forEach((item, index) => {
              item.rank = index + 1;
            });
          }
          
          setItems(itemsWithRatings);
        } else {
          setRankingStatus('not_started');
          setItems(listItems);
        }
      } else {
        setItems(listItems);
      }
    } catch (error) {
      console.error('Failed to load list:', error);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [loadList])
  );

  const handleShare = async () => {
    if (!list) return;
    
    try {
      await Share.share({
        message: `Check out my list "${list.title}" on Everyday Elo!\n\nhttps://everyday-elo.app/list/${list.share_code}`,
      });
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const handleRerank = () => {
    if (!list) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/rank/${list.id}`);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete List',
      'Are you sure you want to delete this list? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!list) return;
            try {
              await deleteList(list.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (error) {
              console.error('Delete failed:', error);
              Alert.alert('Error', 'Failed to delete list');
            }
          },
        },
      ]
    );
  };

  const handleDuplicate = () => {
    // TODO: Implement duplicate functionality
    Alert.alert('Coming Soon', 'Duplicate list feature is coming soon!');
  };

  const getActions = (): ActionItem[] => {
    const actions: ActionItem[] = [
      { label: 'Share List', icon: '🔗', onPress: handleShare },
    ];

    if (isOwner) {
      actions.push(
        { label: rankingStatus === 'not_started' ? 'Start Ranking' : 'Rerank List', icon: '🔄', onPress: handleRerank },
        { label: 'Duplicate List', icon: '📋', onPress: handleDuplicate },
        { label: 'Delete List', icon: '🗑️', onPress: handleDelete, destructive: true },
      );
    } else {
      actions.push(
        { label: 'Duplicate List', icon: '📋', onPress: handleDuplicate },
      );
      
      if (rankingStatus !== 'not_started') {
        actions.splice(1, 0, { label: 'View My Ranking', icon: '🏆', onPress: handleRerank });
      }
    }

    return actions;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!list) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>List Not Found</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyTitle}>List not found</Text>
          <Text style={styles.emptyText}>This list may have been deleted or doesn't exist.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = {
    not_started: { label: 'Not Ranked', bg: '#F3F4F6', text: '#6B7280' },
    in_progress: { label: 'In Progress', bg: '#FEF3C7', text: '#D97706' },
    completed: { label: 'Ranked', bg: '#D1FAE5', text: '#059669' },
  }[rankingStatus];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{list.title}</Text>
        <TouchableOpacity onPress={() => setShowActions(true)} style={styles.menuButton}>
          <Text style={styles.menuButtonText}>•••</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.listInfo}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>{list.title}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Text style={[styles.statusText, { color: statusConfig.text }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
          
          {list.description && (
            <Text style={styles.listDescription}>{list.description}</Text>
          )}
          
          <Text style={styles.itemCount}>{items.length} items</Text>
        </View>

        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>
            {rankingStatus === 'completed' ? 'Your Rankings' : 'Items'}
          </Text>
          
          {items.map((item, index) => (
            <View key={item.id} style={styles.itemRow}>
              {rankingStatus === 'completed' && item.rank && (
                <View style={[
                  styles.rankBadge,
                  item.rank === 1 && styles.goldBadge,
                  item.rank === 2 && styles.silverBadge,
                  item.rank === 3 && styles.bronzeBadge,
                ]}>
                  <Text style={[styles.rankText, item.rank <= 3 && styles.topRankText]}>
                    #{item.rank}
                  </Text>
                </View>
              )}
              {rankingStatus !== 'completed' && (
                <View style={styles.bulletBadge}>
                  <Text style={styles.bulletText}>•</Text>
                </View>
              )}
              <Text style={styles.itemName}>{item.name}</Text>
              {rankingStatus === 'completed' && item.rating && (
                <Text style={styles.itemRating}>{item.rating}</Text>
              )}
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {rankingStatus === 'not_started' && (
            <TouchableOpacity style={styles.primaryButton} onPress={handleRerank}>
              <Text style={styles.primaryButtonText}>Start Ranking</Text>
            </TouchableOpacity>
          )}
          
          {rankingStatus === 'in_progress' && (
            <TouchableOpacity style={styles.primaryButton} onPress={handleRerank}>
              <Text style={styles.primaryButtonText}>Continue Ranking</Text>
            </TouchableOpacity>
          )}
          
          {rankingStatus === 'completed' && (
            <TouchableOpacity style={styles.secondaryButton} onPress={handleRerank}>
              <Text style={styles.secondaryButtonText}>Rerank This List</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>🔗 Share List</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ListActionSheet
        visible={showActions}
        onClose={() => setShowActions(false)}
        title="List Options"
        actions={getActions()}
      />
    </SafeAreaView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  menuButton: {
    paddingVertical: 4,
    paddingLeft: 8,
  },
  menuButtonText: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  listInfo: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  itemCount: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  itemsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  goldBadge: {
    backgroundColor: '#FEF3C7',
  },
  silverBadge: {
    backgroundColor: '#E5E7EB',
  },
  bronzeBadge: {
    backgroundColor: '#FED7AA',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  topRankText: {
    color: '#111827',
  },
  bulletBadge: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bulletText: {
    fontSize: 20,
    color: '#9CA3AF',
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  itemRating: {
    fontSize: 13,
    color: '#9CA3AF',
    marginLeft: 8,
  },
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  secondaryButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  shareButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
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
  },
});
