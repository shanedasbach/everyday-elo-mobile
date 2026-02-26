import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

export interface ActionItem {
  label: string;
  icon: string;
  onPress: () => void;
  destructive?: boolean;
}

interface ListActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  actions: ActionItem[];
}

export default function ListActionSheet({ visible, onClose, title, actions }: ListActionSheetProps) {
  const handleAction = (action: ActionItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    // Small delay to let the modal close smoothly
    setTimeout(() => action.onPress(), 150);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
          </View>
          
          <View style={styles.actions}>
            {actions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.actionButton, index < actions.length - 1 && styles.actionBorder]}
                onPress={() => handleAction(action)}
                activeOpacity={0.7}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text style={[styles.actionLabel, action.destructive && styles.destructiveLabel]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34, // Safe area
  },
  header: {
    padding: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  actions: {
    backgroundColor: '#fff',
    marginHorizontal: 8,
    borderRadius: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  actionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  actionLabel: {
    fontSize: 17,
    color: '#111827',
  },
  destructiveLabel: {
    color: '#EF4444',
  },
  cancelButton: {
    backgroundColor: '#fff',
    marginHorizontal: 8,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 17,
    color: '#3B82F6',
    fontWeight: '600',
  },
});
