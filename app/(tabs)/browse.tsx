import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { getTemplateLists, List } from '../../lib/api';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTemplates = async () => {
    try {
      const supabaseTemplates = await getTemplateLists();
      if (supabaseTemplates.length > 0) {
        setTemplates(supabaseTemplates as Template[]);
      }
    } catch (error) {
      console.log('Using offline templates');
      // Keep fallback templates
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadTemplates();
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.sectionTitle}>Popular Templates</Text>
      <Text style={styles.sectionSubtitle}>Quick start with curated lists</Text>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#3B82F6" />
        </View>
      ) : (
        templates.map((template) => (
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
        ))
      )}
      
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
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
    marginTop: 24,
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
