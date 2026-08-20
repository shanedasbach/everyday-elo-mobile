import React from 'react';
import { act } from 'react-test-renderer';

jest.mock('react-native', () => require('../../../components/__tests__/helpers/rnMock'));

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let searchParams: { code?: string } = { code: 'ABC123' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => searchParams,
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('../../../lib/api', () => ({
  getListByShareCode: jest.fn(),
  getListItems: jest.fn(),
  getUserRankingForList: jest.fn(),
  getCompletedRankingForList: jest.fn(),
  getRankedItems: jest.fn(),
}));

import * as RN from '../../../components/__tests__/helpers/rnMock';
import { renderComponent, textOf, press } from '../../../components/__tests__/helpers/render';
import {
  getListByShareCode,
  getListItems,
  getUserRankingForList,
  getCompletedRankingForList,
  getRankedItems,
} from '../../../lib/api';
import ShareScreen from '../[code]';

const mockGetListByShareCode = getListByShareCode as jest.MockedFunction<typeof getListByShareCode>;
const mockGetListItems = getListItems as jest.MockedFunction<typeof getListItems>;
const mockGetUserRankingForList = getUserRankingForList as jest.MockedFunction<typeof getUserRankingForList>;
const mockGetCompletedRankingForList = getCompletedRankingForList as jest.MockedFunction<typeof getCompletedRankingForList>;
const mockGetRankedItems = getRankedItems as jest.MockedFunction<typeof getRankedItems>;

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

const RANKING = {
  id: 'ranking-1',
  list_id: 'list-1',
  user_id: 'user-1',
  is_complete: true,
  comparisons_count: 2,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const RANKED_ITEMS = [
  { id: 'ri-1', ranking_id: 'ranking-1', item_id: 'item-1', rating: 1550, comparisons: 2 },
  { id: 'ri-2', ranking_id: 'ranking-1', item_id: 'item-2', rating: 1450, comparisons: 2 },
];

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = { code: 'ABC123' };
});

describe('ShareScreen', () => {
  it('shows an error immediately when the code param is missing', async () => {
    searchParams = {};
    const { root } = renderComponent(<ShareScreen />);
    await flush();

    expect(RN.Text.toString).toBeDefined();
    const texts = root.findAllByType(RN.Text).map((n) => textOf(n));
    expect(texts).toContain('List not found');
    expect(mockGetListByShareCode).not.toHaveBeenCalled();
  });

  it('shows a loading indicator while the fetch is in flight', () => {
    mockGetListByShareCode.mockReturnValueOnce(new Promise(() => {}));
    const { root } = renderComponent(<ShareScreen />);
    expect(root.findByType(RN.ActivityIndicator)).toBeDefined();
  });

  it('shows a not-found state and routes back to browse from it', async () => {
    mockGetListByShareCode.mockResolvedValueOnce(null);
    const { root } = renderComponent(<ShareScreen />);
    await flush();

    const texts = root.findAllByType(RN.Text).map((n) => textOf(n));
    expect(texts).toContain('List not found');

    const backButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => textOf(n).includes('Back'))!;
    press(backButton);
    expect(mockBack).toHaveBeenCalled();

    const browseButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => textOf(n).includes('Browse Lists'))!;
    press(browseButton);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/browse');
  });

  it('surfaces a failure state when loading throws', async () => {
    mockGetListByShareCode.mockRejectedValueOnce(new Error('network'));
    const { root } = renderComponent(<ShareScreen />);
    await flush();

    const texts = root.findAllByType(RN.Text).map((n) => textOf(n));
    expect(texts).toContain('List not found');
  });

  it('prompts to rank when there is no completed ranking yet', async () => {
    mockGetListByShareCode.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockGetCompletedRankingForList.mockResolvedValueOnce(null);

    const { root } = renderComponent(<ShareScreen />);
    await flush();

    const texts = root.findAllByType(RN.Text).map((n) => textOf(n));
    expect(texts).toContain('2 items waiting to be ranked');
    expect(mockGetRankedItems).not.toHaveBeenCalled();

    const rankButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => textOf(n).includes('Rank This Yourself'))!;
    press(rankButton);
    expect(mockPush).toHaveBeenCalledWith('/rank/list-1');

    const backButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => textOf(n).includes('Back'))!;
    press(backButton);
    expect(mockBack).toHaveBeenCalled();
  });

  it('falls back to the most recent completed ranking when the creator has none', async () => {
    mockGetListByShareCode.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockGetCompletedRankingForList.mockResolvedValueOnce(RANKING);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);

    const { root } = renderComponent(<ShareScreen />);
    await flush();

    expect(mockGetCompletedRankingForList).toHaveBeenCalledWith('list-1');
    const texts = root.findAllByType(RN.Text).map((n) => textOf(n));
    expect(texts).toContain('#1');
    expect(texts).toContain('Pepperoni');
    expect(texts).toContain('1550');
  });

  it('renders the sorted ranking and both CTAs when the creator has ranked it', async () => {
    mockGetListByShareCode.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(RANKING);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);

    const { root } = renderComponent(<ShareScreen />);
    await flush();

    expect(mockGetCompletedRankingForList).not.toHaveBeenCalled();
    const texts = root.findAllByType(RN.Text).map((n) => textOf(n));
    expect(texts).toContain('Pepperoni');
    expect(texts).toContain('Mushroom');

    const browseMore = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => textOf(n).includes('Browse More Lists'))!;
    press(browseMore);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/browse');

    const rankYourself = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => textOf(n).includes('Rank This Yourself'))!;
    press(rankYourself);
    expect(mockPush).toHaveBeenCalledWith('/rank/list-1');
  });

  it('navigates back from the header on the loaded ranking view', async () => {
    mockGetListByShareCode.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(RANKING);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);

    const { root } = renderComponent(<ShareScreen />);
    await flush();

    const backButton = root
      .findAllByType(RN.TouchableOpacity)
      .find((n) => textOf(n).includes('Back'))!;
    press(backButton);
    expect(mockBack).toHaveBeenCalled();
  });

  it('falls straight to the completed-ranking lookup for a list with no creator, and omits an absent description', async () => {
    const listWithoutCreator = { ...LIST, creator_id: '', description: undefined };
    mockGetListByShareCode.mockResolvedValueOnce(listWithoutCreator);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetCompletedRankingForList.mockResolvedValueOnce(RANKING);
    mockGetRankedItems.mockResolvedValueOnce(RANKED_ITEMS);

    const { root } = renderComponent(<ShareScreen />);
    await flush();

    expect(mockGetUserRankingForList).not.toHaveBeenCalled();
    expect(mockGetCompletedRankingForList).toHaveBeenCalledWith('list-1');
    const texts = root.findAllByType(RN.Text).map((n) => textOf(n));
    expect(texts).toContain('Pepperoni');
    expect(texts).not.toContain('Ranked by the crew');
  });

  it('labels a ranked item "Unknown" when its list item was deleted, and shows a bronze badge for third place', async () => {
    mockGetListByShareCode.mockResolvedValueOnce(LIST);
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(RANKING);
    mockGetRankedItems.mockResolvedValueOnce([
      ...RANKED_ITEMS,
      { id: 'ri-3', ranking_id: 'ranking-1', item_id: 'item-deleted', rating: 1400, comparisons: 2 },
    ]);

    const { root } = renderComponent(<ShareScreen />);
    await flush();

    const texts = root.findAllByType(RN.Text).map((n) => textOf(n));
    expect(texts).toContain('Unknown');
    expect(texts).toContain('#3');
  });

  it('omits an absent description from the not-yet-ranked prompt view', async () => {
    mockGetListByShareCode.mockResolvedValueOnce({ ...LIST, description: undefined });
    mockGetListItems.mockResolvedValueOnce(ITEMS);
    mockGetUserRankingForList.mockResolvedValueOnce(null);
    mockGetCompletedRankingForList.mockResolvedValueOnce(null);

    const { root } = renderComponent(<ShareScreen />);
    await flush();

    const texts = root.findAllByType(RN.Text).map((n) => textOf(n));
    expect(texts).toContain('2 items waiting to be ranked');
    expect(texts).not.toContain('Ranked by the crew');
  });
});
