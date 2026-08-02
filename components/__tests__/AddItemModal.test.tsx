import React from 'react';
import * as Haptics from 'expo-haptics';

jest.mock('react-native', () => require('./helpers/rnMock'));

import * as RN from './helpers/rnMock';
import { renderComponent, findByText, press, changeText, invoke } from './helpers/render';
import AddItemModal from '../AddItemModal';

function setup(overrides: Partial<React.ComponentProps<typeof AddItemModal>> = {}) {
  const onClose = jest.fn();
  const onAdd = jest.fn();
  const props = {
    visible: true,
    onClose,
    onAdd,
    existingItems: [] as string[],
    ...overrides,
  };
  const renderer = renderComponent(<AddItemModal {...props} />);
  const root = renderer.root;
  return { renderer, root, onClose, onAdd };
}

const input = (root: ReturnType<typeof setup>['root']) =>
  root.findAllByType(RN.TextInput)[0];

beforeEach(() => {
  jest.clearAllMocks();
  RN.Platform.OS = 'ios';
});

describe('AddItemModal', () => {
  it('shows an error and does not add when the input is empty', () => {
    const { root, onAdd, onClose } = setup();
    press(findByText(root, RN.TouchableOpacity, 'Add'));
    expect(textOfError(root)).toBe('Please enter an item name');
    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('rejects a case-insensitive duplicate of an existing item', () => {
    const { root, onAdd } = setup({ existingItems: ['Pizza'] });
    changeText(input(root), 'pizza');
    press(findByText(root, RN.TouchableOpacity, 'Add'));
    expect(textOfError(root)).toBe('This item already exists');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('trims whitespace, fires haptics, and calls onAdd + onClose on success', () => {
    const { root, onAdd, onClose } = setup({ existingItems: ['Tacos'] });
    changeText(input(root), '  Burgers  ');
    press(findByText(root, RN.TouchableOpacity, 'Add'));
    expect(onAdd).toHaveBeenCalledWith('Burgers');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('clears the existing error as the user types', () => {
    const { root } = setup();
    press(findByText(root, RN.TouchableOpacity, 'Add')); // produce an error
    expect(textOfError(root)).toBe('Please enter an item name');
    changeText(input(root), 'A');
    expect(errorBox(root)).toBeUndefined();
  });

  it('resets state and calls onClose when Cancel is pressed', () => {
    const { root, onClose } = setup();
    changeText(input(root), 'Draft');
    press(findByText(root, RN.TouchableOpacity, 'Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(input(root).props.value).toBe('');
  });

  it('closes when the backdrop is pressed', () => {
    const { root, onClose } = setup();
    press(root.findAllByType(RN.Pressable)[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('adds via the keyboard submit handler', () => {
    const { root, onAdd } = setup();
    changeText(input(root), 'Sushi');
    invoke(input(root), 'onSubmitEditing');
    expect(onAdd).toHaveBeenCalledWith('Sushi');
  });

  it('uses the height keyboard behavior on Android', () => {
    RN.Platform.OS = 'android';
    const { root } = setup();
    const kav = root.findAllByType(RN.KeyboardAvoidingView)[0];
    expect(kav.props.behavior).toBe('height');
  });

  it('renders no content while hidden', () => {
    const { root } = setup({ visible: false });
    expect(root.findByType(RN.Modal).props.visible).toBe(false);
    expect(root.findAllByType(RN.TextInput)).toHaveLength(0);
    expect(root.findAllByType(RN.TouchableOpacity)).toHaveLength(0);
  });
});

// Helpers scoped to this component's error box markup.
type TextNode = { props: { style?: { color?: string }; children?: unknown } };

function errorBox(root: ReturnType<typeof setup>['root']): TextNode | undefined {
  return (root.findAllByType(RN.Text) as TextNode[]).find(
    (node) => node.props.style?.color === '#DC2626',
  );
}

function textOfError(root: ReturnType<typeof setup>['root']): string {
  const box = errorBox(root);
  return box ? String(box.props.children) : '';
}
