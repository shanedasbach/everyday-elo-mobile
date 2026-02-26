import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

export type ItemAction = 'boost' | 'demote' | 'remove';

interface ItemActionMenuProps {
  visible: boolean;
  onClose: () => void;
  itemName: string;
  itemRank: number;
  totalItems: number;
  onAction: (action: ItemAction) => void;
}

export default function ItemActionMenu({ 
  visible, 
  onClose, 
  itemName, 
  itemRank,
  totalItems,
  onAction 
}: ItemActionMenuProps) {
  const handleAction = (action: ItemAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    setTimeout(() => onAction(action), 150);
  };

  const canBoost = itemRank > 1;
  const canDemote = itemRank < totalItems;

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
            <Text style={styles.itemName} numberOfLines={2}>{itemName}</Text>
            <Text style={styles.itemRank}>Currently #{itemRank}</Text>
          </View>
          
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, !canBoost && styles.actionButtonDisabled]}
              onPress={() => canBoost && handleAction('boost')}
              disabled={!canBoost}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>🚀</Text>
              <View style={styles.actionTextContainer}>
                <Text style={[styles.actionLabel, !canBoost && styles.actionLabelDisabled]}>
                  Boost to Top
                </Text>
                <Text style={styles.actionDescription}>Move to #1 position</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, !canDemote && styles.actionButtonDisabled]}
              onPress={() => canDemote && handleAction('demote')}
              disabled={!canDemote}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>👇</Text>
              <View style={styles.actionTextContainer}>
                <Text style={[styles.actionLabel, !canDemote && styles.actionLabelDisabled]}>
                  Send to Bottom
                </Text>
                <Text style={styles.actionDescription}>Move to last position</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleAction('remove')}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>🗑️</Text>
              <View style={styles.actionTextContainer}>
                <Text style={[styles.actionLabel, styles.destructiveLabel]}>
                  Remove Item
                </Text>
                <Text style={styles.actionDescription}>Delete from list</Text>
              </View>
            </TouchableOpacity>
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
    paddingBottom: 34,
  },
  header: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  itemName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 4,
  },
  itemRank: {
    fontSize: 14,
    color: '#6B7280',
  },
  actions: {
    backgroundColor: '#fff',
    marginHorizontal: 8,
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  actionLabelDisabled: {
    color: '#9CA3AF',
  },
  actionDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
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
