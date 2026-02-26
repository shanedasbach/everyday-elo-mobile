import { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Modal, 
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';

interface BulkAddModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (items: string[]) => void;
  existingItems: string[];
}

export default function BulkAddModal({ visible, onClose, onAdd, existingItems }: BulkAddModalProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const parseItems = (input: string): string[] => {
    return input
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  const handleAdd = () => {
    const items = parseItems(text);
    
    if (items.length === 0) {
      setError('Please enter at least one item');
      return;
    }

    // Check for duplicates with existing items
    const duplicates = items.filter(item => 
      existingItems.some(existing => 
        existing.toLowerCase() === item.toLowerCase()
      )
    );

    if (duplicates.length > 0) {
      setError(`Already exists: ${duplicates.slice(0, 3).join(', ')}${duplicates.length > 3 ? '...' : ''}`);
      return;
    }

    // Check for duplicates within the input
    const uniqueItems = [...new Set(items.map(i => i.toLowerCase()))];
    if (uniqueItems.length !== items.length) {
      setError('Some items are duplicated');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAdd(items);
    setText('');
    setError('');
    onClose();
  };

  const handleClose = () => {
    setText('');
    setError('');
    onClose();
  };

  const itemCount = parseItems(text).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Bulk Add Items</Text>
            <TouchableOpacity onPress={handleAdd}>
              <Text style={[styles.addText, itemCount === 0 && styles.addTextDisabled]}>
                Add{itemCount > 0 ? ` (${itemCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Paste or type items, one per line
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.textArea}
            value={text}
            onChangeText={(val) => {
              setText(val);
              setError('');
            }}
            placeholder="Pepperoni
Mushrooms
Extra cheese
..."
            placeholderTextColor="#9CA3AF"
            multiline
            autoFocus
            textAlignVertical="top"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  cancelText: {
    fontSize: 16,
    color: '#6B7280',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  addText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },
  addTextDisabled: {
    color: '#9CA3AF',
  },
  hint: {
    fontSize: 14,
    color: '#6B7280',
    padding: 16,
    paddingBottom: 8,
  },
  errorBox: {
    marginHorizontal: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
  },
  textArea: {
    marginHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    height: 200,
  },
});
