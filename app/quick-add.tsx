import { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../lib/auth-context';
import { getUserLists, addListItem, getListItems, List, ListItem } from '../lib/api';
import BulkAddModal from '../components/BulkAddModal';

export default function QuickAddScreen() {
  const { user } = useAuth();
  const [lists, setLists] = useState<List[]>([]);
  const [selectedList, setSelectedList] = useState<List | null>(null);
  const [existingItems, setExistingItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [addedItems, setAddedItems] = useState<string[]>([]);

  const loadLists = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const userLists = await getUserLists(user.id);
      setLists(userLists);
    } catch (error) {
      console.error('Failed to load lists:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadLists();
      setSelectedList(null);
      setAddedItems([]);
    }, [loadLists])
  );

  const handleSelectList = async (list: List) => {
    setSelectedList(list);
    
    // Load existing items for duplicate detection
    try {
      const items = await getListItems(list.id);
      setExistingItems(items.map(i => i.name));
    } catch (error) {
      console.error('Failed to load items:', error);
      setExistingItems([]);
    }
  };

  const handleAddItem = async () => {
    const trimmed = newItem.trim();
    if (!trimmed || !selectedList) return;

    // Check for duplicates
    if (existingItems.some(i => i.toLowerCase() === trimmed.toLowerCase()) ||
        addedItems.some(i => i.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate', 'This item already exists in the list');
      return;
    }

    setAdding(true);
    try {
      await addListItem(selectedList.id, trimmed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddedItems([...addedItems, trimmed]);
      setNewItem('');
    } catch (error) {
      console.error('Failed to add item:', error);
      Alert.alert('Error', 'Failed to add item');
    } finally {
      setAdding(false);
    }
  };

  const handleBulkAdd = async (names: string[]) => {
    if (!selectedList) return;

    setAdding(true);
    try {
      for (const name of names) {
        await addListItem(selectedList.id, name);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddedItems([...addedItems, ...names]);
    } catch (error) {
      console.error('Failed to add items:', error);
      Alert.alert('Error', 'Failed to add some items');
    } finally {
      setAdding(false);
    }
  };

  const handleDone = () => {
    if (addedItems.length > 0 && selectedList) {
      // Navigate to the list to rank the new items
      router.replace(`/list/${selectedList.id}`);
    } else {
      router.back();
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quick Add</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔒</Text>
          <Text style={styles.emptyTitle}>Sign in required</Text>
          <Text style={styles.emptyText}>Sign in to add items to your lists</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  // Step 1: Select a list
  if (!selectedList) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quick Add</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.content}>
          <Text style={styles.stepTitle}>Select a list</Text>
          <Text style={styles.stepSubtitle}>Choose which list to add items to</Text>

          {lists.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>No lists yet</Text>
              <Text style={styles.emptyText}>Create a list first, then come back to add items</Text>
              <TouchableOpacity 
                style={styles.createButton}
                onPress={() => router.push('/(tabs)/create')}
              >
                <Text style={styles.createButtonText}>Create List</Text>
              </TouchableOpacity>
            </View>
          ) : (
            lists.map(list => (
              <TouchableOpacity
                key={list.id}
                style={styles.listCard}
                onPress={() => handleSelectList(list)}
              >
                <Text style={styles.listTitle}>{list.title}</Text>
                {list.description && (
                  <Text style={styles.listDescription} numberOfLines={1}>{list.description}</Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step 2: Add items to selected list
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSelectedList(null)} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{selectedList.title}</Text>
        <TouchableOpacity onPress={handleDone} style={styles.doneButton}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle}>Add items</Text>
        
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={newItem}
            onChangeText={setNewItem}
            placeholder="Type an item..."
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
            onSubmitEditing={handleAddItem}
            editable={!adding}
          />
          <TouchableOpacity
            style={[styles.addButton, (!newItem.trim() || adding) && styles.addButtonDisabled]}
            onPress={handleAddItem}
            disabled={!newItem.trim() || adding}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.bulkAddLink}
          onPress={() => setShowBulkAdd(true)}
        >
          <Text style={styles.bulkAddText}>📋 Bulk add multiple items</Text>
        </TouchableOpacity>

        {addedItems.length > 0 && (
          <View style={styles.addedSection}>
            <Text style={styles.addedTitle}>Added ({addedItems.length})</Text>
            {addedItems.map((item, index) => (
              <View key={index} style={styles.addedItem}>
                <Text style={styles.addedItemIcon}>✓</Text>
                <Text style={styles.addedItemText}>{item}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BulkAddModal
        visible={showBulkAdd}
        onClose={() => setShowBulkAdd(false)}
        onAdd={handleBulkAdd}
        existingItems={[...existingItems, ...addedItems]}
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
  doneButton: {
    paddingVertical: 4,
    paddingLeft: 8,
  },
  doneButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  listDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  bulkAddLink: {
    paddingVertical: 12,
  },
  bulkAddText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  addedSection: {
    marginTop: 24,
  },
  addedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  addedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  addedItemIcon: {
    color: '#059669',
    fontWeight: '600',
    marginRight: 8,
  },
  addedItemText: {
    fontSize: 14,
    color: '#065F46',
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
    fontSize: 18,
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
  createButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
