import React from 'react';
import * as Haptics from 'expo-haptics';

jest.mock('react-native', () => require('./helpers/rnMock'));

import * as RN from './helpers/rnMock';
import { renderComponent, findByText, press } from './helpers/render';
import ItemActionMenu from '../ItemActionMenu';

function setup(overrides: Partial<React.ComponentProps<typeof ItemActionMenu>> = {}) {
  const onClose = jest.fn();
  const onAction = jest.fn();
  const props = {
    visible: true,
    onClose,
    itemName: 'Margherita',
    itemRank: 2,
    totalItems: 4,
    onAction,
    ...overrides,
  };
  const renderer = renderComponent(<ItemActionMenu {...props} />);
  return { renderer, root: renderer.root, onClose, onAction };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ItemActionMenu', () => {
  it('fires haptics, closes immediately, and dispatches the action after the delay', () => {
    const { root, onClose, onAction } = setup();
    press(findByText(root, RN.TouchableOpacity, 'Boost to Top'));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled(); // deferred behind setTimeout
    jest.runAllTimers();
    expect(onAction).toHaveBeenCalledWith('boost');
  });

  it('dispatches demote and remove actions', () => {
    const { root, onAction } = setup();
    press(findByText(root, RN.TouchableOpacity, 'Send to Bottom'));
    press(findByText(root, RN.TouchableOpacity, 'Remove Item'));
    jest.runAllTimers();
    expect(onAction).toHaveBeenNthCalledWith(1, 'demote');
    expect(onAction).toHaveBeenNthCalledWith(2, 'remove');
  });

  it('disables Boost when the item is already ranked #1', () => {
    const { root, onAction, onClose } = setup({ itemRank: 1 });
    const boost = findByText(root, RN.TouchableOpacity, 'Boost to Top');
    expect(boost.props.disabled).toBe(true);
    press(boost);
    jest.runAllTimers();
    expect(onAction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables Send to Bottom when the item is already last', () => {
    const { root, onAction } = setup({ itemRank: 4, totalItems: 4 });
    const demote = findByText(root, RN.TouchableOpacity, 'Send to Bottom');
    expect(demote.props.disabled).toBe(true);
    press(demote);
    jest.runAllTimers();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('closes when the overlay backdrop is pressed', () => {
    const { root, onClose } = setup();
    press(root.findAllByType(RN.Pressable)[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops propagation when the sheet itself is pressed', () => {
    const { root, onClose } = setup();
    const stopPropagation = jest.fn();
    press(root.findAllByType(RN.Pressable)[1], { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
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
