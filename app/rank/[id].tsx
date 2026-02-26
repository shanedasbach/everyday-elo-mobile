import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { expectedScore, K_FACTOR } from '../../lib/elo';
import { useAuth } from '../../lib/auth-context';
import { 
  getList, 
  getListByShareCode, 
  getListItems, 
  createRanking, 
  getRankedItems,
  updateRankedItem,
  incrementComparisonsCount,
  markRankingComplete,
  recordComparison,
  List,
  ListItem,
  RankedItem,
} from '../../lib/api';

// Template data for offline/demo use
const templateData: Record<string, { title: string; items: string[] }> = {
  movies: {
    title: 'Top 10 Movies of All Time',
    items: ['The Godfather', 'The Shawshank Redemption', 'The Dark Knight', 'Pulp Fiction', 'Schindler\'s List', 'The Lord of the Rings: Return of the King', 'Fight Club', 'Forrest Gump', 'Inception', 'The Matrix'],
  },
  pizza: {
    title: 'Best Pizza Toppings',
    items: ['Pepperoni', 'Mushrooms', 'Sausage', 'Onions', 'Bacon', 'Extra cheese', 'Black olives', 'Green peppers', 'Pineapple', 'Jalapeños'],
  },
  marvel: {
    title: 'Best Marvel Movies',
    items: ['Avengers: Endgame', 'Avengers: Infinity War', 'Spider-Man: No Way Home', 'Black Panther', 'Guardians of the Galaxy', 'Iron Man', 'Thor: Ragnarok', 'Captain America: Civil War', 'The Avengers', 'Spider-Man: Homecoming'],
  },
  albums: {
    title: 'Greatest Albums',
    items: ['Abbey Road - The Beatles', 'Thriller - Michael Jackson', 'The Dark Side of the Moon - Pink Floyd', 'Rumours - Fleetwood Mac', 'Back in Black - AC/DC', 'Led Zeppelin IV', 'The Wall - Pink Floyd', 'Purple Rain - Prince', 'OK Computer - Radiohead', 'Nevermind - Nirvana'],
  },
  tvshows: {
    title: 'Best TV Shows',
    items: ['Breaking Bad', 'Game of Thrones', 'The Wire', 'The Sopranos', 'Friends', 'The Office', 'Stranger Things', 'The Crown', 'Chernobyl', 'Band of Brothers'],
  },
  fastfood: {
    title: 'Best Fast Food Chains',
    items: ['McDonald\'s', 'Chick-fil-A', 'Wendy\'s', 'Taco Bell', 'In-N-Out', 'Five Guys', 'Chipotle', 'Shake Shack', 'Popeyes', 'Burger King'],
  },
  videogames: {
    title: 'Greatest Video Games',
    items: ['The Legend of Zelda: Breath of the Wild', 'Red Dead Redemption 2', 'The Witcher 3', 'Minecraft', 'Grand Theft Auto V', 'Elden Ring', 'Super Mario Odyssey', 'God of War (2018)', 'The Last of Us', 'Skyrim'],
  },
  disney: {
    title: 'Best Disney Movies',
    items: ['The Lion King', 'Frozen', 'Toy Story', 'Finding Nemo', 'Moana', 'Aladdin', 'Beauty and the Beast', 'The Little Mermaid', 'Up', 'Coco'],
  },
};

interface LocalRankedItem {
  id: string;
  itemId: string;
  name: string;
  rating: number;
  comparisons: number;
}

export default function RankScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [listTitle, setListTitle] = useState('');
  const [rankingId, setRankingId] = useState<string | null>(null);
  const [rankedItems, setRankedItems] = useState<LocalRankedItem[]>([]);
  const [currentPair, setCurrentPair] = useState<[number, number] | null>(null);
  const [comparisons, setComparisons] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [useOfflineMode, setUseOfflineMode] = useState(false);

  useEffect(() => {
    loadList();
  }, [id]);

  const loadList = async () => {
    if (!id) return;

    // Check if it's a template code
    const template = templateData[id];
    if (template) {
      // Use offline mode for templates
      setUseOfflineMode(true);
      setListTitle(template.title);
      const items = template.items.map((name, index) => ({
        id: `local-${index}`,
        itemId: `local-${index}`,
        name,
        rating: 1500,
        comparisons: 0,
      }));
      setRankedItems(items);
      selectNextPair(items);
      setLoading(false);
      return;
    }

    // Try to load from Supabase
    try {
      let list = await getList(id);
      if (!list) {
        list = await getListByShareCode(id);
      }

      if (!list) {
        setLoading(false);
        return;
      }

      setListTitle(list.title);

      // Get or create ranking
      const ranking = await createRanking(list.id, user?.id);
      setRankingId(ranking.id);
      setComparisons(ranking.comparisons_count);

      if (ranking.is_complete) {
        setIsComplete(true);
      }

      // Get list items and ranked items
      const listItems = await getListItems(list.id);
      const rankedItemsData = await getRankedItems(ranking.id);

      // Map ranked items with names
      const items: LocalRankedItem[] = rankedItemsData.map(ri => {
        const listItem = listItems.find(li => li.id === ri.item_id);
        return {
          id: ri.id,
          itemId: ri.item_id,
          name: listItem?.name || 'Unknown',
          rating: ri.rating,
          comparisons: ri.comparisons,
        };
      });

      setRankedItems(items);
      
      if (!ranking.is_complete) {
        selectNextPair(items);
      }
    } catch (error) {
      console.error('Failed to load list:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectNextPair = (items: LocalRankedItem[]) => {
    if (items.length < 2) return;

    // Sort by comparisons (prioritize less-compared items)
    const sorted = [...items].map((item, index) => ({ ...item, originalIndex: index }))
      .sort((a, b) => a.comparisons - b.comparisons);
    
    const first = sorted[0];
    const others = sorted.filter((_, i) => i !== 0);
    
    // Pick opponent with similar rating
    others.sort((a, b) => 
      Math.abs(a.rating - first.rating) - Math.abs(b.rating - first.rating)
    );
    
    // Pick from top 3 closest
    const candidates = others.slice(0, Math.min(3, others.length));
    const second = candidates[Math.floor(Math.random() * candidates.length)];
    
    // Randomize order
    if (Math.random() > 0.5) {
      setCurrentPair([first.originalIndex, second.originalIndex]);
    } else {
      setCurrentPair([second.originalIndex, first.originalIndex]);
    }
  };

  const handleChoice = async (winnerIdx: number, loserIdx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const winner = rankedItems[winnerIdx];
    const loser = rankedItems[loserIdx];
    
    const expectedWinner = expectedScore(winner.rating, loser.rating);
    const expectedLoser = expectedScore(loser.rating, winner.rating);
    
    const newWinnerRating = Math.round(winner.rating + K_FACTOR * (1 - expectedWinner));
    const newLoserRating = Math.round(loser.rating + K_FACTOR * (0 - expectedLoser));

    // Update state
    const newItems = [...rankedItems];
    newItems[winnerIdx] = {
      ...winner,
      rating: newWinnerRating,
      comparisons: winner.comparisons + 1,
    };
    newItems[loserIdx] = {
      ...loser,
      rating: newLoserRating,
      comparisons: loser.comparisons + 1,
    };
    
    setRankedItems(newItems);
    setComparisons(comparisons + 1);

    // Update Supabase if online
    if (!useOfflineMode && rankingId) {
      try {
        await updateRankedItem(winner.id, newWinnerRating, winner.comparisons + 1);
        await updateRankedItem(loser.id, newLoserRating, loser.comparisons + 1);
        await incrementComparisonsCount(rankingId);
        await recordComparison(rankingId, winner.itemId, loser.itemId, winner.itemId);
      } catch (error) {
        console.error('Failed to save comparison:', error);
      }
    }
    
    // Check if complete
    if (newItems.every((item) => item.comparisons >= 2)) {
      setIsComplete(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      if (!useOfflineMode && rankingId) {
        try {
          await markRankingComplete(rankingId);
        } catch (error) {
          console.error('Failed to mark complete:', error);
        }
      }
    } else {
      selectNextPair(newItems);
    }
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

  if (!listTitle) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>List not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (isComplete) {
    const sorted = [...rankedItems].sort((a, b) => b.rating - a.rating);
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{listTitle}</Text>
          <View style={{ width: 60 }} />
        </View>
        
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>🏆 Your Rankings</Text>
          <Text style={styles.resultsSubtitle}>{comparisons} comparisons completed</Text>
        </View>
        
        <ScrollView style={styles.resultsList} contentContainerStyle={styles.resultsContent}>
          {sorted.map((item, index) => (
            <TouchableOpacity 
              key={item.id} 
              style={styles.resultItem}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // TODO: Navigate to item detail view
              }}
            >
              <View style={[styles.rankBadge, index === 0 && styles.goldBadge, index === 1 && styles.silverBadge, index === 2 && styles.bronzeBadge]}>
                <Text style={[styles.resultRank, index < 3 && styles.topThreeRank]}>#{index + 1}</Text>
              </View>
              <Text style={styles.resultName}>{item.name}</Text>
              <Text style={styles.resultRating}>{item.rating}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!currentPair) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  const [aIdx, bIdx] = currentPair;
  const itemA = rankedItems[aIdx];
  const itemB = rankedItems[bIdx];
  const estimated = Math.ceil(rankedItems.length * 2);
  const progressPercent = Math.min(100, (comparisons / estimated) * 100);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{listTitle}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>{comparisons} comparisons • ~{Math.max(0, estimated - comparisons)} left</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      <Text style={styles.question}>Which do you prefer?</Text>

      <View style={styles.cardsContainer}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => handleChoice(aIdx, bIdx)}
          activeOpacity={0.8}
        >
          <Text style={styles.cardText}>{itemA.name}</Text>
        </TouchableOpacity>

        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        <TouchableOpacity
          style={styles.card}
          onPress={() => handleChoice(bIdx, aIdx)}
          activeOpacity={0.8}
        >
          <Text style={styles.cardText}>{itemB.name}</Text>
        </TouchableOpacity>
      </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  closeButton: {
    fontSize: 20,
    color: '#6B7280',
    padding: 4,
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  progressContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  progressText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 2,
  },
  question: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  cardsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 16,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  vsContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  vsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 48,
  },
  resultsHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  resultsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  resultsSubtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  resultsList: {
    flex: 1,
  },
  resultsContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
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
  resultRank: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  topThreeRank: {
    color: '#111827',
  },
  resultName: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  resultRating: {
    fontSize: 14,
    color: '#9CA3AF',
    marginLeft: 8,
  },
});
