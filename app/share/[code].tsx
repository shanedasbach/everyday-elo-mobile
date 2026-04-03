import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import {
  getListByShareCode,
  getListItems,
  getUserRankingForList,
  getCompletedRankingForList,
  getRankedItems,
  List,
  ListItem,
  Ranking,
  RankedItem,
} from '../../lib/api';

interface RankedDisplayItem {
  rank: number;
  name: string;
  rating: number;
  itemId: string;
}

interface SharedData {
  list: List;
  listItems: ListItem[];
  ranking: Ranking | null;
  rankedItems: RankedItem[];
}

export default function ShareScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();

  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    loadSharedRanking(code);
  }, [code]);

  async function loadSharedRanking(shareCode: string) {
    try {
      const list = await getListByShareCode(shareCode);
      if (!list) {
        setError('List not found');
        setLoading(false);
        return;
      }

      const listItems = await getListItems(list.id);

      // Prefer creator's ranking, fall back to most recent completed
      let ranking: Ranking | null = null;
      if (list.creator_id) {
        ranking = await getUserRankingForList(list.id, list.creator_id);
      }
      if (!ranking) {
        ranking = await getCompletedRankingForList(list.id);
      }

      let rankedItems: RankedItem[] = [];
      if (ranking) {
        rankedItems = await getRankedItems(ranking.id);
      }

      setData({ list, listItems, ranking, rankedItems });
    } catch (err) {
      console.error('Failed to load shared ranking:', err);
      setError('Failed to load shared ranking');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorTitle}>List not found</Text>
          <Text style={styles.errorText}>
            This shared ranking link is invalid or has expired.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/(tabs)/browse')}
          >
            <Text style={styles.primaryButtonText}>Browse Lists</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { list, listItems, ranking, rankedItems } = data;

  // Build sorted display list from ranked items + list item names
  const buildDisplayItems = (items: RankedItem[]): RankedDisplayItem[] => {
    return items
      .slice()
      .sort((a, b) => b.rating - a.rating)
      .map((ranked, index) => {
        const listItem = listItems.find((li) => li.id === ranked.item_id);
        return {
          rank: index + 1,
          name: listItem?.name ?? 'Unknown',
          rating: ranked.rating,
          itemId: ranked.item_id,
        };
      });
  };

  // No completed ranking yet — show item list with a prompt to rank
  if (!ranking || rankedItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {list.title}
          </Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          <View style={styles.listInfoCard}>
            <Text style={styles.listEmoji}>📋</Text>
            <Text style={styles.listTitle}>{list.title}</Text>
            {list.description ? (
              <Text style={styles.listDescription}>{list.description}</Text>
            ) : null}
            <Text style={styles.itemCountText}>
              {listItems.length} items waiting to be ranked
            </Text>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push(`/rank/${list.id}`)}
          >
            <Text style={styles.primaryButtonText}>Rank This Yourself</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const displayItems = buildDisplayItems(rankedItems);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {list.title}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* List info */}
        <View style={styles.listInfoCard}>
          <Text style={styles.listEmoji}>🏆</Text>
          <Text style={styles.listTitle}>{list.title}</Text>
          {list.description ? (
            <Text style={styles.listDescription}>{list.description}</Text>
          ) : null}
        </View>

        {/* Ranked items */}
        <View style={styles.rankingsCard}>
          <Text style={styles.sectionTitle}>Rankings</Text>
          {displayItems.map((item, index) => (
            <View
              key={item.itemId}
              style={[
                styles.rankRow,
                index === displayItems.length - 1 && styles.rankRowLast,
              ]}
            >
              <View
                style={[
                  styles.rankBadge,
                  item.rank === 1 && styles.goldBadge,
                  item.rank === 2 && styles.silverBadge,
                  item.rank === 3 && styles.bronzeBadge,
                ]}
              >
                <Text
                  style={[
                    styles.rankBadgeText,
                    item.rank <= 3 && styles.rankBadgeTextTop,
                  ]}
                >
                  #{item.rank}
                </Text>
              </View>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemRating}>{item.rating}</Text>
            </View>
          ))}
        </View>

        {/* CTAs */}
        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push(`/rank/${list.id}`)}
          >
            <Text style={styles.primaryButtonText}>Rank This Yourself</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/(tabs)/browse')}
          >
            <Text style={styles.secondaryButtonText}>Browse More Lists</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.branding}>Everyday Elo</Text>
      </ScrollView>
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
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
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
    width: 60,
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  listInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  listEmoji: {
    fontSize: 40,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  listDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  itemCountText: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  rankingsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rankRowLast: {
    borderBottomWidth: 0,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  rankBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  rankBadgeTextTop: {
    color: '#111827',
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
  ctaSection: {
    gap: 12,
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
    borderColor: '#E5E7EB',
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  branding: {
    textAlign: 'center',
    fontSize: 12,
    color: '#D1D5DB',
    marginBottom: 8,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  errorEmoji: {
    fontSize: 48,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  errorText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
