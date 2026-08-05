import React from 'react';
import { act } from 'react-test-renderer';

jest.mock('react-native', () => require('../../../components/__tests__/helpers/rnMock'));

const mockBack = jest.fn();
const mockPush = jest.fn();
let searchParams: { id?: string } = { id: 'list-1' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => searchParams,
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, []),
}));

jest.mock('../../../lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../../../lib/api', () => ({
  getList: jest.fn(),
  getListByShareCode: jest.fn(),
  getListItems: jest.fn(),
  getRankedItems: jest.fn(),
  getUserRankingForList: jest.fn(),
  deleteList: jest.fn(),
  addListItem: jest.fn(),
  duplicateList: jest.fn(),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  isFollowing: jest.fn(),
}));

import * as RN from '../../../components/__tests__/helpers/rnMock';
import { renderComponent, textOf, press, changeText } from '../../../components/__tests__/helpers/render';
import {
  getList,
  getListByShareCode,
  getListItems,
  getRankedItems,
  getUserRankingForList,
  deleteList,
  duplicateList,
  addListItem,
  isFollowing,
} from '../../../lib/api';
import ListDetailScreen from '../[id]';

const mockGetList = getList as jest.MockedFunction<typeof getList>;
const mockGetListByShareCode = getListByShareCode as jest.MockedFunction<typeof getListByShareCode>;
const mockGetListItems = getListItems as jest.MockedFunction<typeof getListItems>;
const mockGetRankedItems = getRankedItems as jest.MockedFunction<typeof getRankedItems>;
const mockGetUserRankingForList = getUserRankingForList as jest.MockedFunction<typeof getUserRankingForList>;
const mockAddListItem = addListItem as jest.MockedFunction<typeof addListItem>;
const mockDeleteList = deleteList as jest.MockedFunction<typeof deleteList>;
const mockDuplicateList = duplicateList as jest.MockedFunction<typeof duplicateList>;
const mockIsFollowing = isFollowing as jest.MockedFunction<typeof isFollowing>;

let mockUseAuth = () => ({ user: { id: 'user-1' } as { id: string } | null });

const LIST = {
  id: 'list-1',
  title: 'Best Pizza Toppings',
  description: 'Ranked by the crew',
  creator_id: 'user-1',
  is_private: false,
  is_template: false,
  share_code: 'ABC123',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const ITEMS = [
  { id: 'item-1', list_id: 'list-1', name: 'Pepperoni', display_order: 0, created_at: '2026-01-01' },
  { id: 'item-2', list_id: 'list-1', name: 'Mushroom', display_order: 1, created_at: '2026-01-01' },
];

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ListActionSheet defers each action by 150ms (setTimeout) so its own close
// animation can finish first; tests exercising a sheet action need to wait
// that out with a real timer before the action's onPress actually fires.
async function waitForSheetAction() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 160));
  });
}

function findText(root: ReturnType<typeof renderComponent>['root'], text: string) {
  return root.findAllByType(RN.Text).find((n) => textOf(n).includes(text));
}

function findButton(root: ReturnType<typeof renderComponent>['root'], text: string) {
  const match = root.findAllByType(RN.TouchableOpacity).find((n) => textOf(n).includes(text));
  if (!match) throw new Error(`No button containing "${text}"`);
  return match;
}

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = { id: 'list-1' };
  mockUseAuth = () => ({ user: { id: 'user-1' } });
  mockIsFollowing.mockResolvedValue(false);
});

describe('ListDetailScreen', () => {
  it('shows a loading indicator while the fetch is in flight', () => {
    mockGetList.mockReturnValueOnce(new Promise(() => {}));
    const { root } = renderComponent(<ListDetailScreen />);
    expect(root.findByType(RN.ActivityIndicator)).toBeDefined();
  });

  it('shows a not-found state and goes back on tap', async () => {
    mockGetList.mockResolvedValueOnce(null);
    mockGetListByShareCode.mockResolvedValueOnce(null);
    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    expect(findText(root, 'List not found')).toBeDefined();
    press(findButton(root, '← Back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('falls back to share-code lookup when the id lookup misses', async () => {
    mockGetList.mockResolvedValueOnce(null);
    mockGetListByShareCode.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    expect(mockGetListByShareCode).toHaveBeenCalledWith('list-1');
    expect(findText(root, 'Best Pizza Toppings')).toBeDefined();
  });

  it('renders a not-started list for the owner with a Start Ranking CTA', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    expect(findText(root, 'Not Ranked')).toBeDefined();
    expect(findText(root, '2 items')).toBeDefined();
    // Owner viewing their own list never sees a FollowButton.
    expect(mockIsFollowing).not.toHaveBeenCalled();

    press(findButton(root, 'Start Ranking'));
    expect(mockPush).toHaveBeenCalledWith('/rank/list-1');

    press(findButton(root, '← Back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders an in-progress list for a non-owner with a follow affordance', async () => {
    mockUseAuth = () => ({ user: { id: 'other-user' } });
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce({
      id: 'ranking-1',
      list_id: 'list-1',
      user_id: 'other-user',
      is_complete: false,
      comparisons_count: 1,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    });
    mockGetRankedItems.mockResolvedValueOnce([
      { id: 'ri-1', ranking_id: 'ranking-1', item_id: 'item-1', rating: 1520, comparisons: 1 },
    ]);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    expect(findText(root, 'In Progress')).toBeDefined();
    expect(findButton(root, 'Continue Ranking')).toBeDefined();
    expect(mockIsFollowing).toHaveBeenCalledWith('other-user', 'user-1');
  });

  it('renders a completed ranking sorted by rating with rank badges', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce({
      id: 'ranking-1',
      list_id: 'list-1',
      user_id: 'user-1',
      is_complete: true,
      comparisons_count: 2,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    });
    mockGetRankedItems.mockResolvedValueOnce([
      { id: 'ri-1', ranking_id: 'ranking-1', item_id: 'item-1', rating: 1600, comparisons: 2 },
      { id: 'ri-2', ranking_id: 'ranking-1', item_id: 'item-2', rating: 1400, comparisons: 2 },
    ]);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    expect(findText(root, 'Ranked')).toBeDefined();
    expect(findText(root, '#1')).toBeDefined();
    expect(findText(root, '1600')).toBeDefined();
    expect(findButton(root, 'Rerank This List')).toBeDefined();
  });

  it('shares the list via the Share API', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    await act(async () => {
      press(findButton(root, 'Share List'));
      await Promise.resolve();
    });
    expect(RN.Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('ABC123') })
    );
  });

  it('opens the action sheet and deletes the list after confirming', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockDeleteList.mockResolvedValueOnce(undefined);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));

    const deleteAction = findButton(root, 'Delete List');
    press(deleteAction);
    await waitForSheetAction();

    expect(RN.Alert.alert).toHaveBeenCalledWith(
      'Delete List',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Delete' })])
    );

    const alertCall = (RN.Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2] as Array<{ text: string; onPress?: () => void }>;
    const confirmDelete = buttons.find((b) => b.text === 'Delete')!;

    await act(async () => {
      confirmDelete.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockDeleteList).toHaveBeenCalledWith('list-1');
    expect(mockBack).toHaveBeenCalled();
  });

  it('duplicates the list for a non-owner and navigates to the copy', async () => {
    mockUseAuth = () => ({ user: { id: 'other-user' } });
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockDuplicateList.mockResolvedValueOnce({ ...LIST, id: 'list-2' });

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));
    const duplicateAction = findButton(root, 'Duplicate List');
    press(duplicateAction);
    await waitForSheetAction();

    expect(mockDuplicateList).toHaveBeenCalledWith('list-1');
    expect(mockPush).toHaveBeenCalledWith('/list/list-2');
  });

  it('opens the add-item modal from the owner-only shortcut', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '+ Add Item'));

    const modal = root.findAllByType(RN.Modal).find((n) => n.props.visible === true);
    expect(modal).toBeDefined();
  });

  it('also opens the add-item modal from the action-sheet entry', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));
    // The owner-only "+ Add Item" header shortcut also matches a loose
    // substring search on "Add Item" — match the action sheet's icon+label
    // text exactly so this exercises getActions()'s onPress, not the
    // shortcut's.
    const addItemAction = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => textOf(n) === '➕Add Item')!;
    press(addItemAction);
    await waitForSheetAction();

    const modal = root.findAllByType(RN.Modal).find((n) => n.props.visible === true);
    expect(modal).toBeDefined();
  });

  it('adds a new item through the modal and appends it to the list', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockAddListItem.mockResolvedValueOnce({
      id: 'item-3',
      list_id: 'list-1',
      name: 'Olives',
      display_order: 2,
      created_at: '2026-01-01',
    });

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '+ Add Item'));
    changeText(root.findByType(RN.TextInput), 'Olives');

    const addButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Add item')!;
    await act(async () => {
      press(addButton);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddListItem).toHaveBeenCalledWith('list-1', 'Olives');
    expect(findText(root, 'Olives')).toBeDefined();
  });

  it('shows an inline error instead of failing when adding an item throws', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockAddListItem.mockRejectedValueOnce(new Error('boom'));

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '+ Add Item'));
    changeText(root.findByType(RN.TextInput), 'Olives');

    const addButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Add item')!;
    await act(async () => {
      press(addButton);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(RN.Alert.alert).toHaveBeenCalledWith('Error', 'Failed to add item');
  });

  it('prompts sign-in instead of duplicating when there is no signed-in user', async () => {
    mockUseAuth = () => ({ user: null });
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    // No user means loadList's `if (user)` branch is skipped entirely — a
    // queued getUserRankingForList value here would go unconsumed and leak
    // into the next test that calls it.

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));
    press(findButton(root, 'Duplicate List'));
    await waitForSheetAction();

    expect(RN.Alert.alert).toHaveBeenCalledWith('Sign In Required', 'Please sign in to duplicate lists');
    expect(mockDuplicateList).not.toHaveBeenCalled();
  });

  it('falls back to a not-found render when loading throws', async () => {
    mockGetList.mockRejectedValueOnce(new Error('network'));

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    expect(findText(root, 'List not found')).toBeDefined();
  });

  it('bulk-adds several items through the modal and appends all of them', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockAddListItem
      .mockResolvedValueOnce({ id: 'item-3', list_id: 'list-1', name: 'Olives', display_order: 2, created_at: '2026-01-01' })
      .mockResolvedValueOnce({ id: 'item-4', list_id: 'list-1', name: 'Anchovies', display_order: 3, created_at: '2026-01-01' });

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));
    press(findButton(root, 'Bulk Add Items'));
    await waitForSheetAction();

    changeText(root.findByType(RN.TextInput), 'Olives\nAnchovies');

    const bulkAddButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => (n.props.accessibilityLabel as string | undefined)?.startsWith('Add') && (n.props.accessibilityLabel as string).includes('items'))!;
    await act(async () => {
      press(bulkAddButton);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddListItem).toHaveBeenNthCalledWith(1, 'list-1', 'Olives');
    expect(mockAddListItem).toHaveBeenNthCalledWith(2, 'list-1', 'Anchovies');
    expect(findText(root, 'Olives')).toBeDefined();
    expect(findText(root, 'Anchovies')).toBeDefined();
  });

  it('offers "View My Ranking" ahead of "Duplicate List" for a non-owner who has already ranked it', async () => {
    mockUseAuth = () => ({ user: { id: 'other-user' } });
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce({
      id: 'ranking-1',
      list_id: 'list-1',
      user_id: 'other-user',
      is_complete: true,
      comparisons_count: 2,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    });
    mockGetRankedItems.mockResolvedValueOnce([]);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));
    expect(findButton(root, 'View My Ranking')).toBeDefined();
  });

  it('logs instead of throwing when the Share API rejects', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    (RN.Share.share as jest.Mock).mockRejectedValueOnce(new Error('cancelled'));

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    await act(async () => {
      press(findButton(root, 'Share List'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // No unhandled rejection and no user-facing alert — sharing failures are
    // logged only.
    expect(RN.Alert.alert).not.toHaveBeenCalled();
  });

  it('cancelling the delete confirmation leaves the list untouched', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));
    press(findButton(root, 'Delete List'));
    await waitForSheetAction();

    const [, , buttons] = (RN.Alert.alert as jest.Mock).mock.calls[0];
    const cancel = buttons.find((b: { text: string }) => b.text === 'Cancel');
    expect(cancel.onPress).toBeUndefined();

    expect(mockDeleteList).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows an error alert instead of crashing when deleting fails', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockDeleteList.mockRejectedValueOnce(new Error('boom'));

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));
    press(findButton(root, 'Delete List'));
    await waitForSheetAction();

    const [, , buttons] = (RN.Alert.alert as jest.Mock).mock.calls[0];
    const confirmDelete = buttons.find((b: { text: string }) => b.text === 'Delete')!;

    await act(async () => {
      confirmDelete.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(RN.Alert.alert).toHaveBeenCalledWith('Error', 'Failed to delete list');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows an error alert instead of crashing when duplicating fails', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockDuplicateList.mockRejectedValueOnce(new Error('quota exceeded'));

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));
    press(findButton(root, 'Duplicate List'));
    await waitForSheetAction();

    expect(RN.Alert.alert).toHaveBeenCalledWith('Error', 'quota exceeded');
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringMatching(/^\/list\//));
  });

  it('shows an error alert instead of crashing when a bulk add partially fails', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockAddListItem
      .mockResolvedValueOnce({ id: 'item-3', list_id: 'list-1', name: 'Olives', display_order: 2, created_at: '2026-01-01' })
      .mockRejectedValueOnce(new Error('boom'));

    const { root } = renderComponent(<ListDetailScreen />);
    await flush();

    press(findButton(root, '•••'));
    press(findButton(root, 'Bulk Add Items'));
    await waitForSheetAction();

    changeText(root.findByType(RN.TextInput), 'Olives\nAnchovies');
    const bulkAddButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => (n.props.accessibilityLabel as string | undefined)?.startsWith('Add') && (n.props.accessibilityLabel as string).includes('items'))!;

    await act(async () => {
      press(bulkAddButton);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(RN.Alert.alert).toHaveBeenCalledWith('Error', 'Failed to add items');
    // setItems only runs once the whole loop succeeds, so a failure partway
    // through means nothing from the batch reaches local state — even though
    // the first addListItem call already landed server-side.
    expect(findText(root, 'Olives')).toBeUndefined();
  });
});
