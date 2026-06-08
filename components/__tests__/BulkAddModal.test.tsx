import React from 'react';
import * as Haptics from 'expo-haptics';

jest.mock('react-native', () => require('./helpers/rnMock'));

import * as RN from './helpers/rnMock';
import { renderComponent, findByText, press, changeText } from './helpers/render';
import BulkAddModal from '../BulkAddModal';

function setup(overrides: Partial<React.ComponentProps<typeof BulkAddModal>> = {}) {
  const onClose = jest.fn();
  const onAdd = jest.fn();
  const props = {
    visible: true,
    onClose,
    onAdd,
    existingItems: [] as string[],
    ...overrides,
  };
  const renderer = renderComponent(<BulkAddModal {...props} />);
  return { renderer, root: renderer.root, onClose, onAdd };
}

const textarea = (root: ReturnType<typeof setup>['root']) =>
  root.findAllByType(RN.TextInput)[0];

type TextNode = { props: { style?: { color?: string }; children?: unknown } };
function errorText(root: ReturnType<typeof setup>['root']): string {
  const box = (root.findAllByType(RN.Text) as TextNode[]).find(
    (node) => node.props.style?.color === '#DC2626',
  );
  return box ? String(box.props.children) : '';
}

beforeEach(() => {
  jest.clearAllMocks();
  RN.Platform.OS = 'ios';
});

describe('BulkAddModal', () => {
  it('errors when no non-empty lines are entered', () => {
    const { root, onAdd } = setup();
    changeText(textarea(root), '   \n  \n');
    press(findByText(root, RN.TouchableOpacity, 'Add'));
    expect(errorText(root)).toBe('Please enter at least one item');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('parses newline-separated lines, trimming and skipping blanks', () => {
    const { root, onAdd, onClose } = setup();
    changeText(textarea(root), '  Apple \n\nBanana\n  Cherry  \n');
    press(findByText(root, RN.TouchableOpacity, 'Add'));
    expect(onAdd).toHaveBeenCalledWith(['Apple', 'Banana', 'Cherry']);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('flags duplicates against existing items (case-insensitive)', () => {
    const { root, onAdd } = setup({ existingItems: ['Apple', 'Pear'] });
    changeText(textarea(root), 'apple\nPEAR\nMango');
    press(findByText(root, RN.TouchableOpacity, 'Add'));
    expect(errorText(root)).toBe('Already exists: apple, PEAR');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('truncates the duplicate list with an ellipsis past three', () => {
    const { root } = setup({ existingItems: ['a', 'b', 'c', 'd'] });
    changeText(textarea(root), 'a\nb\nc\nd');
    press(findByText(root, RN.TouchableOpacity, 'Add'));
    expect(errorText(root)).toBe('Already exists: a, b, c...');
  });

  it('flags duplicates within the input itself', () => {
    const { root, onAdd } = setup();
    changeText(textarea(root), 'Kiwi\nkiwi\nLime');
    press(findByText(root, RN.TouchableOpacity, 'Add'));
    expect(errorText(root)).toBe('Some items are duplicated');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows the live item count in the Add label and clears errors on edit', () => {
    const { root } = setup();
    expect(findByText(root, RN.TouchableOpacity, 'Add')).toBeTruthy();
    changeText(textarea(root), 'One\nTwo');
    expect(findByText(root, RN.TouchableOpacity, 'Add (2)')).toBeTruthy();
  });

  it('resets and closes on Cancel and on backdrop press', () => {
    const { root, onClose } = setup();
    changeText(textarea(root), 'Draft');
    press(findByText(root, RN.TouchableOpacity, 'Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(textarea(root).props.value).toBe('');
    press(root.findAllByType(RN.Pressable)[0]);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('uses the height keyboard behavior on Android', () => {
    RN.Platform.OS = 'android';
    const { root } = setup();
    expect(root.findAllByType(RN.KeyboardAvoidingView)[0].props.behavior).toBe('height');
  });
});
