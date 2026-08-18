import React from 'react';
import * as Haptics from 'expo-haptics';

jest.mock('react-native', () => require('./helpers/rnMock'));

import * as RN from './helpers/rnMock';
import { renderComponent, findByText, press } from './helpers/render';
import ListActionSheet, { type ActionItem } from '../ListActionSheet';

function setup(overrides: Partial<React.ComponentProps<typeof ListActionSheet>> = {}) {
  const onClose = jest.fn();
  const actions: ActionItem[] = overrides.actions ?? [
    { label: 'Edit', icon: '✏️', onPress: jest.fn() },
    { label: 'Share', icon: '🔗', onPress: jest.fn() },
    { label: 'Delete', icon: '🗑️', onPress: jest.fn(), destructive: true },
  ];
  const props = {
    visible: true,
    onClose,
    title: 'List options',
    actions,
    ...overrides,
  };
  const renderer = renderComponent(<ListActionSheet {...props} />);
  return { renderer, root: renderer.root, onClose, actions };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ListActionSheet', () => {
  it('renders the title and one row per action', () => {
    const { root } = setup();
    expect(findByText(root, RN.Text, 'List options')).toBeTruthy();
    expect(findByText(root, RN.TouchableOpacity, 'Edit')).toBeTruthy();
    expect(findByText(root, RN.TouchableOpacity, 'Delete')).toBeTruthy();
  });

  it('fires haptics, closes, then runs the action callback after the delay', () => {
    const { root, onClose, actions } = setup();
    press(findByText(root, RN.TouchableOpacity, 'Edit'));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(actions[0].onPress).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(actions[0].onPress).toHaveBeenCalledTimes(1);
  });

  it('runs callbacks in the order the rows were pressed', () => {
    const order: string[] = [];
    const actions: ActionItem[] = [
      { label: 'First', icon: '1️⃣', onPress: () => order.push('First') },
      { label: 'Second', icon: '2️⃣', onPress: () => order.push('Second') },
    ];
    const { root } = setup({ actions });
    press(findByText(root, RN.TouchableOpacity, 'Second'));
    press(findByText(root, RN.TouchableOpacity, 'First'));
    jest.runAllTimers();
    expect(order).toEqual(['Second', 'First']);
  });

  it('marks destructive actions with the destructive label color', () => {
    const { root } = setup();
    type TextNode = { props: { style?: unknown; children?: unknown } };
    const deleteLabel = (root.findAllByType(RN.Text) as TextNode[]).find(
      (node) => node.props.children === 'Delete',
    );
    const styles = deleteLabel?.props.style as Array<{ color?: string }>;
    expect(styles.some((s) => s && s.color === '#EF4444')).toBe(true);
  });

  it('closes on overlay press and stops propagation on the sheet', () => {
    const { root, onClose } = setup();
    press(root.findAllByType(RN.Pressable)[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
    const stopPropagation = jest.fn();
    press(root.findAllByType(RN.Pressable)[1], { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the Cancel button', () => {
    const { root, onClose } = setup();
    press(findByText(root, RN.TouchableOpacity, 'Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders no content while hidden', () => {
    const { root } = setup({ visible: false });
    expect(root.findByType(RN.Modal).props.visible).toBe(false);
    expect(root.findAllByType(RN.TouchableOpacity)).toHaveLength(0);
    expect(root.findAllByType(RN.Pressable)).toHaveLength(0);
  });
});
