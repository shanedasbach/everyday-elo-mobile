import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { createList, addListItems } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import BulkAddModal from '../../components/BulkAddModal';

export default function CreateScreen() {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  const handleBulkAdd = (newItems: string[]) => {
    setItems([...items, ...newItems]);
  };

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    if (items.includes(trimmed)) {
      Alert.alert('Duplicate', 'Item already exists');
      return;
    }
    setItems([...items, trimmed]);
    setNewItem('');
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const startRanking = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a title');
      return;
    }
    if (items.length < 2) {
      Alert.alert('Need More Items', 'Add at least 2 items to start ranking');
      return;
    }

    setLoading(true);
    try {
      // Create the list
      const list = await createList({ title: title.trim() });
      
      // Add items
      await addListItems(list.id, items);
      
      // Navigate to ranking
      router.replace(`/rank/${list.id}`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create list');
      setLoading(false);
    }
  };

  const saveForLater = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to save lists');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a title');
      return;
    }
    if (items.length < 2) {
      Alert.alert('Need More Items', 'Add at least 2 items to save');
      return;
    }

    setLoading(true);
    try {
      const list = await createList({ title: title.trim() });
      await addListItems(list.id, items);
      
      Alert.alert('Saved!', 'List saved to My Lists', [
        { text: 'OK', onPress: () => {
          setTitle('');
          setItems([]);
          router.push('/(tabs)/my-lists');
        }}
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save list');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <Text style={styles.label}>List Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Best Pizza Toppings"
          placeholderTextColor="#9CA3AF"
          editable={!loading}
        />

        <View style={styles.addItemsHeader}>
          <Text style={styles.label}>Add Items</Text>
          <TouchableOpacity onPress={() => setShowBulkAdd(true)} disabled={loading}>
            <Text style={[styles.bulkAddText, loading && styles.bulkAddTextDisabled]}>📋 Bulk Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, styles.addInput]}
            value={newItem}
            onChangeText={setNewItem}
            placeholder="Add item..."
            placeholderTextColor="#9CA3AF"
            onSubmitEditing={addItem}
            returnKeyType="done"
            editable={!loading}
          />
          <TouchableOpacity 
            style={[styles.addButton, (!newItem.trim() || loading) && styles.addButtonDisabled]} 
            onPress={addItem}
            disabled={!newItem.trim() || loading}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>

        {items.length > 0 && (
          <View style={styles.itemsContainer}>
            <Text style={styles.itemsCount}>Items ({items.length})</Text>
            {items.map((item, index) => (
              <View key={index} style={styles.item}>
                <Text style={styles.itemText}>{item}</Text>
                <TouchableOpacity onPress={() => removeItem(index)} disabled={loading}>
                  <Text style={[styles.removeButton, loading && styles.removeButtonDisabled]}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {items.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyText}>Add items to start building your list</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.startButton,
            (items.length < 2 || !title.trim() || loading) && styles.startButtonDisabled,
          ]}
          onPress={startRanking}
          disabled={items.length < 2 || !title.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.startButtonText}>
              Start Ranking {items.length >= 2 ? `(${items.length} items)` : ''}
            </Text>
          )}
        </TouchableOpacity>

        {user && (
          <TouchableOpacity
            style={[
              styles.saveButton,
              (items.length < 2 || !title.trim() || loading) && styles.saveButtonDisabled,
            ]}
            onPress={saveForLater}
            disabled={items.length < 2 || !title.trim() || loading}
          >
            <Text style={[
              styles.saveButtonText,
              (items.length < 2 || !title.trim() || loading) && styles.saveButtonTextDisabled,
            ]}>
              Save for Later
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <BulkAddModal
        visible={showBulkAdd}
        onClose={() => setShowBulkAdd(false)}
        onAdd={handleBulkAdd}
        existingItems={items}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
  },
  addItemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  bulkAddText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  bulkAddTextDisabled: {
    color: '#9CA3AF',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addInput: {
    flex: 1,
    marginBottom: 0,
  },
  addButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    borderRadius: 12,
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
  itemsContainer: {
    marginTop: 24,
  },
  itemsCount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 12,
  },
  item: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemText: {
    fontSize: 16,
    color: '#111827',
    flex: 1,
  },
  removeButton: {
    fontSize: 18,
    color: '#9CA3AF',
    padding: 4,
  },
  removeButtonDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  startButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  startButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  startButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  saveButtonDisabled: {
    backgroundColor: '#F9FAFB',
  },
  saveButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 16,
  },
  saveButtonTextDisabled: {
    color: '#9CA3AF',
  },
});
