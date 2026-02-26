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

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
  existingItems: string[];
}

export default function AddItemModal({ visible, onClose, onAdd, existingItems }: AddItemModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const trimmed = name.trim();
    
    if (!trimmed) {
      setError('Please enter an item name');
      return;
    }

    // Check for duplicates
    if (existingItems.some(item => item.toLowerCase() === trimmed.toLowerCase())) {
      setError('This item already exists');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAdd(trimmed);
    setName('');
    setError('');
    onClose();
  };

  const handleClose = () => {
    setName('');
    setError('');
    onClose();
  };

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
            <Text style={styles.title}>Add Item</Text>
            <TouchableOpacity onPress={handleAdd}>
              <Text style={[styles.addText, !name.trim() && styles.addTextDisabled]}>
                Add
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            New item will need to be ranked against existing items
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(val) => {
              setName(val);
              setError('');
            }}
            placeholder="Item name..."
            placeholderTextColor="#9CA3AF"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleAdd}
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
  input: {
    marginHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
  },
});
