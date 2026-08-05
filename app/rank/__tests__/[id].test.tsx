import React from 'react';
import { act } from 'react-test-renderer';

jest.mock('react-native', () => require('../../../components/__tests__/helpers/rnMock'));

// PanGestureHandler is a host stub (like rnMock's primitives) rather than a
// bare pass-through, so its onGestureEvent/onHandlerStateChange props stay
// reachable from the rendered tree — tests that want to exercise the swipe
// path can invoke them directly instead of replaying real native gesture
// events, which react-test-renderer has no way to produce.
jest.mock('react-native-gesture-handler', () => {
  const ReactLib = require('react');
  const PanGestureHandler = (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    ReactLib.createElement('PanGestureHandler', props, props.children);
  PanGestureHandler.displayName = 'PanGestureHandler';
  return {
    PanGestureHandler,
    State: { END: 4 },
  };
});

const mockBack = jest.fn();
const mockReplace = jest.fn();
let searchParams: { id?: string } = { id: 'list-1' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => searchParams,
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('../../../lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../../lib/partial-ranking', () => ({
  savePartialRanking: jest.fn(),
  getPartialRanking: jest.fn().mockResolvedValue(null),
  clearPartialRanking: jest.fn(),
}));

jest.mock('../../../lib/api', () => ({
  getList: jest.fn(),
  getListByShareCode: jest.fn(),
  createRanking: jest.fn(),
  getListItems: jest.fn(),
  getRankedItems: jest.fn(),
  updateRankedItem: jest.fn(),
  markRankingComplete: jest.fn(),
  markRankingCompleteAndNotify: jest.fn(),
  persistComparison: jest.fn(),
  addListItem: jest.fn(),
  deleteListItem: jest.fn(),
}));

import * as RN from '../../../components/__tests__/helpers/rnMock';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { renderComponent, textOf, press, changeText } from '../../../components/__tests__/helpers/render';
import {
  getList,
  getListByShareCode,
  createRanking,
  getListItems,
  getRankedItems,
  updateRankedItem,
  persistComparison,
  markRankingCompleteAndNotify,
} from '../../../lib/api';
import { savePartialRanking } from '../../../lib/partial-ranking';
import RankScreen from '../[id]';

const mockGetList = getList as jest.MockedFunction<typeof getList>;
const mockGetListByShareCode = getListByShareCode as jest.MockedFunction<typeof getListByShareCode>;
const mockCreateRanking = createRanking as jest.MockedFunction<typeof createRanking>;
const mockGetListItems = getListItems as jest.MockedFunction<typeof getListItems>;
const mockMarkRankingCompleteAndNotify = markRankingCompleteAndNotify as jest.MockedFunction<
  typeof markRankingCompleteAndNotify
>;
const mockSavePartialRanking = savePartialRanking as jest.MockedFunction<typeof savePartialRanking>;
const mockGetRankedItems = getRankedItems as jest.MockedFunction<typeof getRankedItems>;
const mockUpdateRankedItem = updateRankedItem as jest.MockedFunction<typeof updateRankedItem>;
const mockPersistComparison = persistComparison as jest.MockedFunction<typeof persistComparison>;

const LIST = {
  id: 'list-1',
  title: 'Best Pizza Toppings',
  creator_id: 'user-1',
  is_private: false,
  is_template: false,
  share_code: 'ABC123',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const LIST_ITEMS = [
  { id: 'item-1', list_id: 'list-1', name: 'Pepperoni', display_order: 0, created_at: '2026-01-01' },
  { id: 'item-2', list_id: 'list-1', name: 'Mushroom', display_order: 1, created_at: '2026-01-01' },
];

function ranking(overrides: Partial<{ is_complete: boolean; comparisons_count: number }> = {}) {
  return {
    id: 'ranking-1',
    list_id: 'list-1',
    user_id: 'user-1',
    is_complete: false,
    comparisons_count: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

const RANKED_ITEMS = [
  { id: 'ri-1', ranking_id: 'ranking-1', item_id: 'item-1', rating: 1500, comparisons: 0 },
  { id: 'ri-2', ranking_id: 'ranking-1', item_id: 'item-2', rating: 1500, comparisons: 0 },
];

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ItemActionMenu defers each action by 150ms (setTimeout) so its own close
// animation can finish first.
async function waitForMenuAction() {
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
});

describe('RankScreen', () => {
  it('shows a loading indicator while the initial fetch is in flight', () => {
    mockGetList.mockReturnValueOnce(new Promise(() => {}));
    const { root } = renderComponent(<RankScreen />);
    expect(root.findByType(RN.ActivityIndicator)).toBeDefined();
  });

  it('shows a not-found state when neither id nor share-code lookup resolves', async () => {
    mockGetList.mockResolvedValueOnce(null);
    mockGetListByShareCode.mockResolvedValueOnce(null);
    const { root } = renderComponent(<RankScreen />);
    await flush();

    expect(findText(root, 'List not found')).toBeDefined();
  });

  it('renders the current pair and records a choice via persistComparison', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking());
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);
    mockPersistComparison.mockResolvedValueOnce(undefined);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    expect(findText(root, 'Pepperoni')).toBeDefined();
    expect(findText(root, 'Mushroom')).toBeDefined();
    expect(findText(root, '0 comparisons')).toBeDefined();

    await act(async () => {
      press(findButton(root, 'Pepperoni'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPersistComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        rankingId: 'ranking-1',
        winner: expect.objectContaining({ itemId: 'item-1' }),
        loser: expect.objectContaining({ itemId: 'item-2' }),
      })
    );
    expect(findText(root, '1 comparisons')).toBeDefined();
  });

  it('toggles express mode', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking());
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    const badge = findButton(root, 'Express');
    expect(badge.props.accessibilityLabel).toBe('Express mode off');

    press(badge);
    expect(badge.props.accessibilityLabel).toBe('Express mode on');
  });

  it('saves and exits to my-lists for a signed-in Supabase ranking', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking());
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    const saveExit = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Save and exit')!;
    press(saveExit);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/my-lists');
  });

  it('renders the results view directly when the ranking is already complete', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking({ is_complete: true, comparisons_count: 2 }));
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce([
      { id: 'ri-1', ranking_id: 'ranking-1', item_id: 'item-1', rating: 1550, comparisons: 2 },
      { id: 'ri-2', ranking_id: 'ranking-1', item_id: 'item-2', rating: 1450, comparisons: 2 },
    ]);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    expect(findText(root, 'Your Rankings')).toBeDefined();
    expect(findText(root, '#1')).toBeDefined();
    expect(findText(root, 'Pepperoni')).toBeDefined();
  });

  it('boosts an item from the results view via the item action menu', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking({ is_complete: true, comparisons_count: 2 }));
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce([
      { id: 'ri-1', ranking_id: 'ranking-1', item_id: 'item-1', rating: 1550, comparisons: 2 },
      { id: 'ri-2', ranking_id: 'ranking-1', item_id: 'item-2', rating: 1450, comparisons: 2 },
    ]);
    mockUpdateRankedItem.mockResolvedValueOnce(undefined);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    // Rank #2 (Mushroom), not the top item — "Boost to Top" is disabled for
    // whatever is already #1.
    press(findButton(root, 'Mushroom'));

    const boostButton = findButton(root, 'Boost to Top');
    press(boostButton);
    await waitForMenuAction();

    expect(mockUpdateRankedItem).toHaveBeenCalledWith('ri-2', 1650, 2);
  });

  it('skips the current pair without recording a comparison', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking());
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    const skip = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Skip this comparison')!;
    press(skip);

    expect(mockPersistComparison).not.toHaveBeenCalled();
    expect(findText(root, '0 comparisons')).toBeDefined();
  });

  it('falls back to a not-found render when the id lookup throws', async () => {
    mockGetList.mockRejectedValueOnce(new Error('network'));
    const { root } = renderComponent(<RankScreen />);
    await flush();

    expect(findText(root, 'List not found')).toBeDefined();
  });

  it('runs the offline/template path for a template id, persisting progress locally', async () => {
    searchParams = { id: 'pizza' };
    mockSavePartialRanking.mockResolvedValueOnce(undefined);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    expect(mockGetList).not.toHaveBeenCalled();
    expect(findText(root, 'Best Pizza Toppings')).toBeDefined();

    const chooseButtons = root
      .findAllByType(RN.TouchableOpacity)
      .filter((n) => (n.props.accessibilityLabel as string | undefined)?.startsWith('Choose '));
    expect(chooseButtons.length).toBe(2);

    await act(async () => {
      press(chooseButtons[0]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSavePartialRanking).toHaveBeenCalledWith(
      'pizza',
      expect.any(Array),
      1
    );
    // Offline rankings save progress after every comparison instead of one
    // network write per choice.
    expect(mockPersistComparison).not.toHaveBeenCalled();

    const saveExit = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Save and exit')!;
    await act(async () => {
      press(saveExit);
      await Promise.resolve();
    });
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/browse');
  });

  it('completes the ranking after every pair has been compared and notifies the list', async () => {
    const THREE_ITEMS = [
      ...LIST_ITEMS,
      { id: 'item-3', list_id: 'list-1', name: 'Sausage', display_order: 2, created_at: '2026-01-01' },
    ];
    const THREE_RANKED = [
      ...RANKED_ITEMS,
      { id: 'ri-3', ranking_id: 'ranking-1', item_id: 'item-3', rating: 1500, comparisons: 0 },
    ];
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking());
    mockGetListItems.mockResolvedValueOnce(THREE_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce(THREE_RANKED);
    mockPersistComparison.mockResolvedValue(undefined);
    mockMarkRankingCompleteAndNotify.mockResolvedValueOnce(undefined);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    // Three items have exactly three possible pairs; choosing the first
    // available card three times in a row (seenPairs rules out repeats)
    // compares every pair once, which is enough for every item to reach the
    // 2-comparison completion threshold.
    for (let i = 0; i < 3; i++) {
      const chooseButtons = root
        .findAllByType(RN.TouchableOpacity)
        .filter((n) => (n.props.accessibilityLabel as string | undefined)?.startsWith('Choose '));
      expect(chooseButtons.length).toBe(2);
      await act(async () => {
        press(chooseButtons[0]);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(findText(root, 'Your Rankings')).toBeDefined();
    expect(mockMarkRankingCompleteAndNotify).toHaveBeenCalledWith('ranking-1', 'list-1');
  });

  it('resolves a completed right-swipe on card A as choosing A, and a sub-threshold drag as a snap-back', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking());
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);
    mockPersistComparison.mockResolvedValueOnce(undefined);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    // selectNextPairIndices randomizes which item lands on card A vs B, so
    // read the rendered label instead of assuming a fixed assignment.
    const [handlerA] = root.findAllByType(PanGestureHandler);
    const cardAName = (
      root.findAllByType(RN.TouchableOpacity).find((n) => (n.props.accessibilityLabel as string | undefined)?.startsWith('Choose '))!
        .props.accessibilityLabel as string
    ).replace('Choose ', '');
    const cardAItemId = LIST_ITEMS.find((item) => item.name === cardAName)!.id;
    const onGestureEvent = handlerA.props.onGestureEvent as (e: unknown) => void;
    const onHandlerStateChange = handlerA.props.onHandlerStateChange as (e: unknown) => void;

    // Ignored: wrong state (not END).
    act(() => {
      onHandlerStateChange({ nativeEvent: { state: 0, translationX: 90, velocityX: 0 } });
    });
    expect(mockPersistComparison).not.toHaveBeenCalled();

    // Sub-threshold drag on release snaps back rather than committing.
    act(() => {
      onGestureEvent({ nativeEvent: { translationX: 30 } });
      onHandlerStateChange({ nativeEvent: { state: 4, translationX: 30, velocityX: 0 } });
    });
    expect(mockPersistComparison).not.toHaveBeenCalled();

    // Past-threshold right release on card A commits a choice for A.
    await act(async () => {
      onGestureEvent({ nativeEvent: { translationX: 90 } });
      onHandlerStateChange({ nativeEvent: { state: 4, translationX: 90, velocityX: 0 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPersistComparison).toHaveBeenCalledWith(
      expect.objectContaining({ winner: expect.objectContaining({ itemId: cardAItemId }) })
    );
  });

  it('adds a new item from the completed results view and reopens ranking for it', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking({ is_complete: true, comparisons_count: 2 }));
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);

    const { supabase } = require('../../../lib/supabase');
    const insertedRankedItem = { id: 'ri-3', ranking_id: 'ranking-1', item_id: 'item-3', rating: 1500, comparisons: 0 };
    const single = jest.fn().mockResolvedValue({ data: insertedRankedItem });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    const update = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({}) }));
    (supabase.from as jest.Mock).mockImplementation(() => ({ insert, update }));

    const { addListItem } = require('../../../lib/api');
    (addListItem as jest.Mock).mockResolvedValueOnce({
      id: 'item-3',
      list_id: 'list-1',
      name: 'Sausage',
      display_order: 2,
      created_at: '2026-01-01',
    });

    const { root } = renderComponent(<RankScreen />);
    await flush();

    const addButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Add item')!;
    press(addButton);
    changeText(root.findByType(RN.TextInput), 'Sausage');

    const modalAddButton = root
      .findAllByType(RN.TouchableOpacity)
      .filter((n) => n.props.accessibilityLabel === 'Add item')
      .pop()!;
    await act(async () => {
      press(modalAddButton);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(addListItem).toHaveBeenCalledWith('list-1', 'Sausage');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ ranking_id: 'ranking-1', item_id: 'item-3' })
    );
    // Adding an item to a completed ranking reopens it for comparison.
    expect(findText(root, 'Which do you prefer?')).toBeDefined();
  });

  it('demotes the top item from the results view via the item action menu', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking({ is_complete: true, comparisons_count: 2 }));
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce([
      { id: 'ri-1', ranking_id: 'ranking-1', item_id: 'item-1', rating: 1550, comparisons: 2 },
      { id: 'ri-2', ranking_id: 'ranking-1', item_id: 'item-2', rating: 1450, comparisons: 2 },
    ]);
    mockUpdateRankedItem.mockResolvedValueOnce(undefined);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    press(findButton(root, 'Pepperoni'));
    const demoteButton = findButton(root, 'Send to Bottom');
    press(demoteButton);
    await waitForMenuAction();

    expect(mockUpdateRankedItem).toHaveBeenCalledWith('ri-1', 1350, 2);
  });

  it('removes an item from the results view after confirming, via a direct supabase delete', async () => {
    mockGetList.mockResolvedValueOnce(LIST);
    mockCreateRanking.mockResolvedValueOnce(ranking({ is_complete: true, comparisons_count: 2 }));
    mockGetListItems.mockResolvedValueOnce(LIST_ITEMS);
    mockGetRankedItems.mockResolvedValueOnce([
      { id: 'ri-1', ranking_id: 'ranking-1', item_id: 'item-1', rating: 1550, comparisons: 2 },
      { id: 'ri-2', ranking_id: 'ranking-1', item_id: 'item-2', rating: 1450, comparisons: 2 },
    ]);

    const { supabase } = require('../../../lib/supabase');
    const eq = jest.fn().mockResolvedValue({});
    const del = jest.fn(() => ({ eq }));
    (supabase.from as jest.Mock).mockImplementation(() => ({ delete: del }));
    const { deleteListItem } = require('../../../lib/api');
    (deleteListItem as jest.Mock).mockResolvedValueOnce(undefined);

    const { root } = renderComponent(<RankScreen />);
    await flush();

    press(findButton(root, 'Mushroom'));
    const removeButton = findButton(root, 'Remove Item');
    press(removeButton);
    await waitForMenuAction();

    expect(RN.Alert.alert).toHaveBeenCalledWith(
      'Remove Item',
      expect.stringContaining('Mushroom'),
      expect.arrayContaining([expect.objectContaining({ text: 'Remove' })])
    );
    const [, , buttons] = (RN.Alert.alert as jest.Mock).mock.calls[0];
    const confirmRemove = buttons.find((b: { text: string }) => b.text === 'Remove');

    await act(async () => {
      await confirmRemove.onPress();
    });

    expect(supabase.from).toHaveBeenCalledWith('ranked_items');
    expect(eq).toHaveBeenCalledWith('id', 'ri-2');
    expect(deleteListItem).toHaveBeenCalledWith('item-2');
    expect(findText(root, 'Mushroom')).toBeUndefined();
  });
});
