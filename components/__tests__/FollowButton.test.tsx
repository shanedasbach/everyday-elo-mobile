import React from 'react';
import * as Haptics from 'expo-haptics';
import { act } from 'react-test-renderer';

jest.mock('react-native', () => require('./helpers/rnMock'));
jest.mock('../../lib/api', () => ({
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  isFollowing: jest.fn(),
}));

import * as RN from './helpers/rnMock';
import { renderComponent, findByText, press, invoke } from './helpers/render';
import { followUser, unfollowUser, isFollowing } from '../../lib/api';
import FollowButton from '../FollowButton';

const mockFollowUser = followUser as jest.MockedFunction<typeof followUser>;
const mockUnfollowUser = unfollowUser as jest.MockedFunction<typeof unfollowUser>;
const mockIsFollowing = isFollowing as jest.MockedFunction<typeof isFollowing>;

const CURRENT = 'user-1';
const TARGET = 'user-2';

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setup(overrides: Partial<React.ComponentProps<typeof FollowButton>> = {}) {
  const props = { currentUserId: CURRENT, targetUserId: TARGET, ...overrides };
  const renderer = renderComponent(<FollowButton {...props} />);
  return { renderer, root: renderer.root };
}

function errorText(root: ReturnType<typeof setup>['root']): string | undefined {
  const alert = root.findAll((node) => node.props.accessibilityRole === 'alert')[0];
  return alert ? String((alert.props as { children?: unknown }).children) : undefined;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FollowButton', () => {
  it('renders nothing when viewing your own profile', async () => {
    mockIsFollowing.mockResolvedValueOnce(false);
    const { renderer } = setup({ targetUserId: CURRENT });
    expect(renderer.toJSON()).toBeNull();
    await flush();
  });

  it('shows a loading indicator while the initial read is in flight', () => {
    mockIsFollowing.mockReturnValueOnce(new Promise(() => {}));
    const { root } = setup();
    const indicator = root.findByType(RN.ActivityIndicator);
    expect(indicator.props.accessibilityLabel).toBe('Loading follow state');
  });

  it('shows Follow and toggling calls followUser then flips to Following', async () => {
    mockIsFollowing.mockResolvedValueOnce(false);
    const { root } = setup();
    await flush();

    const button = findByText(root, RN.TouchableOpacity, 'Follow');
    expect(button.props.accessibilityLabel).toBe('Follow');
    expect(button.props.accessibilityState).toEqual({ selected: false, busy: false });

    mockFollowUser.mockResolvedValueOnce(undefined);
    press(button);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    await flush();

    expect(mockFollowUser).toHaveBeenCalledWith(CURRENT, TARGET);
    const following = findByText(root, RN.TouchableOpacity, 'Following');
    expect(following.props.accessibilityLabel).toBe('Unfollow');
    expect(following.props.accessibilityState).toEqual({ selected: true, busy: false });
  });

  it('shows Following and toggling calls unfollowUser then flips to Follow', async () => {
    mockIsFollowing.mockResolvedValueOnce(true);
    const { root } = setup();
    await flush();

    const button = findByText(root, RN.TouchableOpacity, 'Following');
    mockUnfollowUser.mockResolvedValueOnce(undefined);
    press(button);
    await flush();

    expect(mockUnfollowUser).toHaveBeenCalledWith(CURRENT, TARGET);
    expect(findByText(root, RN.TouchableOpacity, 'Follow')).toBeDefined();
    expect(errorText(root)).toBeUndefined();
  });

  it('disables the button and shows the busy label while a toggle is in flight', async () => {
    mockIsFollowing.mockResolvedValueOnce(false);
    const { root } = setup();
    await flush();

    let resolveFollow!: () => void;
    mockFollowUser.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFollow = resolve;
      }),
    );
    const button = findByText(root, RN.TouchableOpacity, 'Follow');
    press(button);

    const busyButton = root.findAllByType(RN.TouchableOpacity)[0];
    expect(busyButton.props.disabled).toBe(true);
    expect((busyButton.props.accessibilityState as { busy: boolean }).busy).toBe(true);

    // A second press while busy is a no-op — followUser is called only once.
    press(busyButton);
    expect(mockFollowUser).toHaveBeenCalledTimes(1);
    // Bypasses `press()`'s own disabled guard to prove toggle() itself
    // no-ops while busy, not just that the touchable is unreachable.
    invoke(busyButton, 'onPress');
    expect(mockFollowUser).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFollow();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(findByText(root, RN.TouchableOpacity, 'Following')).toBeDefined();
  });

  it('keeps the prior state and shows an error when following fails', async () => {
    mockIsFollowing.mockResolvedValueOnce(false);
    const { root } = setup();
    await flush();

    mockFollowUser.mockRejectedValueOnce(new Error('boom'));
    press(findByText(root, RN.TouchableOpacity, 'Follow'));
    await flush();

    expect(findByText(root, RN.TouchableOpacity, 'Follow')).toBeDefined();
    expect(errorText(root)).toBe("Couldn't follow — tap to retry");
  });

  it('keeps the prior state and shows an error when unfollowing fails', async () => {
    mockIsFollowing.mockResolvedValueOnce(true);
    const { root } = setup();
    await flush();

    mockUnfollowUser.mockRejectedValueOnce(new Error('boom'));
    press(findByText(root, RN.TouchableOpacity, 'Following'));
    await flush();

    expect(findByText(root, RN.TouchableOpacity, 'Following')).toBeDefined();
    expect(errorText(root)).toBe("Couldn't unfollow — tap to retry");
  });

  it('retries the read instead of writing when the state is unknown', async () => {
    mockIsFollowing.mockRejectedValueOnce(new Error('network'));
    const { root } = setup();
    await flush();

    const retry = findByText(root, RN.TouchableOpacity, 'Retry');
    expect(retry.props.accessibilityLabel).toBe('Retry loading follow status');
    expect(errorText(root)).toBe("Couldn't load follow status");

    mockIsFollowing.mockResolvedValueOnce(true);
    press(retry);
    await flush();

    expect(mockIsFollowing).toHaveBeenCalledTimes(2);
    expect(mockFollowUser).not.toHaveBeenCalled();
    expect(mockUnfollowUser).not.toHaveBeenCalled();
    expect(findByText(root, RN.TouchableOpacity, 'Following')).toBeDefined();
  });

  it('does not update state after unmount once a stale read resolves', async () => {
    let resolveRead!: (value: boolean) => void;
    mockIsFollowing.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    const { renderer } = setup();

    await act(async () => {
      renderer.unmount();
    });

    await act(async () => {
      resolveRead(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    // No React warning and nothing throws — the cancelled read is a no-op.
  });

  it('does not update state after unmount once a stale read rejects', async () => {
    let rejectRead!: (err: Error) => void;
    mockIsFollowing.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRead = reject;
      }),
    );
    const { renderer } = setup();

    await act(async () => {
      renderer.unmount();
    });

    await act(async () => {
      rejectRead(new Error('network'));
      await Promise.resolve();
      await Promise.resolve();
    });
    // No React warning and nothing throws — the cancelled read is a no-op.
  });
});
