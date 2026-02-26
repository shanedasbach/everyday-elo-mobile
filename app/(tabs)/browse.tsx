import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { getTemplateLists, getFeaturedLists, FeaturedList, List } from '../../lib/api';

// Simple template type that works for both API and offline data
interface Template {
  id: string;
  title: string;
  description?: string;
  share_code?: string;
}

// Fallback template data for offline use
const fallbackTemplates: Template[] = [
  { id: 'movies', title: 'Top 10 Movies of All Time', description: 'Rank the greatest films ever made', share_code: 'movies' },
  { id: 'pizza', title: 'Best Pizza Toppings', description: 'What goes on the perfect pizza?', share_code: 'pizza' },
  { id: 'marvel', title: 'Best Marvel Movies', description: 'Rank the MCU', share_code: 'marvel' },
  { id: 'albums', title: 'Greatest Albums', description: 'The best music albums of all time', share_code: 'albums' },
  { id: 'tvshows', title: 'Best TV Shows', description: 'Peak television', share_code: 'tvshows' },
  { id: 'fastfood', title: 'Best Fast Food Chains', description: 'Where are you hitting the drive-thru?', share_code: 'fastfood' },
  { id: 'videogames', title: 'Greatest Video Games', description: 'The games that defined generations', share_code: 'videogames' },
  { id: 'disney', title: 'Best Disney Movies', description: 'Animated classics and beyond', share_code: 'disney' },
];

export default function BrowseScreen() {
  const [templates, setTemplates] = useState<Template[]>(fallbackTemplates);
  const [featuredLists, setFeaturedLists] = useState<FeaturedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      // Load templates
      const supabaseTemplates = await getTemplateLists();
      if (supabaseTemplates.length > 0) {
        setTemplates(supabaseTemplates as Template[]);
      }
      
      // Load featured lists
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

  // Group featured lists by hour
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
          {/* Featured Lists Section */}
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

          {/* Templates Section */}
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
          
          {/* Create CTA */}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
});
