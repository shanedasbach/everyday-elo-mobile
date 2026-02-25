import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

// Template data (same as web app)
const templates = [
  { id: '1', title: 'Top 10 Movies of All Time', description: 'Rank the greatest films ever made', code: 'movies' },
  { id: '2', title: 'Best Pizza Toppings', description: 'What goes on the perfect pizza?', code: 'pizza' },
  { id: '3', title: 'Best Marvel Movies', description: 'Rank the MCU', code: 'marvel' },
  { id: '4', title: 'Greatest Albums', description: 'The best music albums of all time', code: 'albums' },
  { id: '5', title: 'Best TV Shows', description: 'Peak television', code: 'tvshows' },
  { id: '6', title: 'Best Fast Food Chains', description: 'Where are you hitting the drive-thru?', code: 'fastfood' },
  { id: '7', title: 'Greatest Video Games', description: 'The games that defined generations', code: 'videogames' },
  { id: '8', title: 'Best Disney Movies', description: 'Animated classics and beyond', code: 'disney' },
];

export default function BrowseScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.emoji}>🏆</Text>
        <Text style={styles.title}>Everyday Elo</Text>
        <Text style={styles.subtitle}>Rank anything with rapid-fire comparisons</Text>
      </View>

      <Text style={styles.sectionTitle}>Templates</Text>
      
      {templates.map((template) => (
        <Link key={template.id} href={`/rank/${template.code}`} asChild>
          <TouchableOpacity style={styles.card}>
            <Text style={styles.cardTitle}>{template.title}</Text>
            <Text style={styles.cardDescription}>{template.description}</Text>
          </TouchableOpacity>
        </Link>
      ))}
      
      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    paddingHorizontal: 16,
    marginBottom: 12,
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
  spacer: {
    height: 32,
  },
});
