import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../lib/auth-context';

export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.emoji}>🏆</Text>
        <Text style={styles.title}>Everyday Elo</Text>
        <Text style={styles.subtitle}>Rank anything with rapid-fire comparisons</Text>
      </View>

      <View style={styles.buttonsContainer}>
        <Link href="/(tabs)/browse" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonEmoji}>🔍</Text>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>Browse</Text>
              <Text style={styles.buttonDescription}>Discover lists to rank</Text>
            </View>
          </TouchableOpacity>
        </Link>

        <Link href="/(tabs)/my-lists" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonEmoji}>📋</Text>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>My Lists</Text>
              <Text style={styles.buttonDescription}>View your saved lists</Text>
            </View>
          </TouchableOpacity>
        </Link>

        <Link href="/(tabs)/create" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonEmoji}>➕</Text>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>New List</Text>
              <Text style={styles.buttonDescription}>Create a custom list</Text>
            </View>
          </TouchableOpacity>
        </Link>

        <Link href="/quick-add" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonEmoji}>⚡</Text>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>Quick Add</Text>
              <Text style={styles.buttonDescription}>Add items to existing list</Text>
            </View>
          </TouchableOpacity>
        </Link>
      </View>

      {!user && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>Sign in to save your rankings</Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity style={styles.signInButton}>
              <Text style={styles.signInButtonText}>Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  buttonsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  buttonDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  signInButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
  },
  signInButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
