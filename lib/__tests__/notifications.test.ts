/**
 * Tests for the push notifications module.
 *
 * Covers:
 * - Permission + token registration happy paths and fallback cases
 *   (simulator, denied permission, getExpoPushTokenAsync failure)
 * - Android channel creation only on Android
 * - Push token persistence (upsert) and removal
 * - Notification tap routing to the list screen
 * - Cold-start handling of a notification that launched the app
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { Platform } from 'react-native';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

const deviceMock: { isDevice: boolean } = { isDevice: true };
jest.mock('expo-device', () => ({
  get isDevice() {
    return deviceMock.isDevice;
  },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '../supabase';
import {
  configureNotificationHandler,
  ensureAndroidChannel,
  registerForPushNotificationsAsync,
  savePushToken,
  removePushToken,
  registerDeviceForUser,
  handleNotificationResponse,
  subscribeToNotificationTaps,
} from '../notifications';

describe('Notifications module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deviceMock.isDevice = true;
    Platform.OS = 'ios';
  });

  describe('configureNotificationHandler', () => {
    it('registers a foreground handler that shows banners', async () => {
      configureNotificationHandler();
      expect(Notifications.setNotificationHandler).toHaveBeenCalledTimes(1);
      const arg = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0];
      const result = await arg.handleNotification();
      expect(result).toEqual({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      });
    });
  });

  describe('ensureAndroidChannel', () => {
    it('creates a channel on Android', async () => {
      Platform.OS = 'android';
      (Notifications.setNotificationChannelAsync as jest.Mock).mockResolvedValue(undefined);

      await ensureAndroidChannel();

      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'rankings',
        expect.objectContaining({ name: 'Ranking updates' })
      );
    });

    it('is a no-op on iOS', async () => {
      Platform.OS = 'ios';
      await ensureAndroidChannel();
      expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    });
  });

  describe('registerForPushNotificationsAsync', () => {
    it('returns null on a simulator', async () => {
      deviceMock.isDevice = false;
      const token = await registerForPushNotificationsAsync();
      expect(token).toBeNull();
      expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    });

    it('returns the expo push token when permission is already granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: 'ExponentPushToken[abc]',
      });

      const token = await registerForPushNotificationsAsync();

      expect(token).toBe('ExponentPushToken[abc]');
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('requests permission when not yet granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: 'ExponentPushToken[xyz]',
      });

      const token = await registerForPushNotificationsAsync();

      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
      expect(token).toBe('ExponentPushToken[xyz]');
    });

    it('returns null when permission is denied', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

      const token = await registerForPushNotificationsAsync();

      expect(token).toBeNull();
      expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    });

    it('returns null when getExpoPushTokenAsync throws', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(new Error('no projectId'));

      const token = await registerForPushNotificationsAsync();

      expect(token).toBeNull();
    });
  });

  describe('savePushToken', () => {
    it('upserts the token with platform metadata', async () => {
      const upsert = jest.fn().mockResolvedValue({ error: null });
      (supabase.from as jest.Mock).mockReturnValue({ upsert });

      await savePushToken('user-1', 'tok-1');

      expect(supabase.from).toHaveBeenCalledWith('push_tokens');
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', token: 'tok-1', platform: 'ios' }),
        { onConflict: 'token' }
      );
    });

    it('throws when the upsert fails', async () => {
      const upsert = jest.fn().mockResolvedValue({ error: { message: 'db down' } });
      (supabase.from as jest.Mock).mockReturnValue({ upsert });

      await expect(savePushToken('u', 't')).rejects.toEqual({ message: 'db down' });
    });
  });

  describe('removePushToken', () => {
    it('deletes the row keyed by token', async () => {
      const eq = jest.fn().mockResolvedValue({ error: null });
      const del = jest.fn().mockReturnValue({ eq });
      (supabase.from as jest.Mock).mockReturnValue({ delete: del });

      await removePushToken('tok-1');

      expect(supabase.from).toHaveBeenCalledWith('push_tokens');
      expect(eq).toHaveBeenCalledWith('token', 'tok-1');
    });

    it('throws when the delete fails', async () => {
      const eq = jest.fn().mockResolvedValue({ error: { message: 'nope' } });
      (supabase.from as jest.Mock).mockReturnValue({ delete: jest.fn().mockReturnValue({ eq }) });

      await expect(removePushToken('tok')).rejects.toEqual({ message: 'nope' });
    });
  });

  describe('registerDeviceForUser', () => {
    it('returns null when no token is available', async () => {
      deviceMock.isDevice = false;

      const result = await registerDeviceForUser('user-1');

      expect(result).toBeNull();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('persists the token and returns it when registration succeeds', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'tok-ok' });
      const upsert = jest.fn().mockResolvedValue({ error: null });
      (supabase.from as jest.Mock).mockReturnValue({ upsert });

      const result = await registerDeviceForUser('user-1');

      expect(result).toBe('tok-ok');
      expect(upsert).toHaveBeenCalled();
    });

    it('still returns the token when persistence fails', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'tok-ok' });
      const upsert = jest.fn().mockResolvedValue({ error: { message: 'transient' } });
      (supabase.from as jest.Mock).mockReturnValue({ upsert });

      const result = await registerDeviceForUser('user-1');

      expect(result).toBe('tok-ok');
    });
  });

  describe('handleNotificationResponse', () => {
    const makeResponse = (data: unknown): Notifications.NotificationResponse =>
      ({
        notification: {
          request: { content: { data } },
        },
      } as any);

    it('navigates to the list when payload is a ranking_complete with a listId', () => {
      handleNotificationResponse(makeResponse({ type: 'ranking_complete', listId: 'list-42' }));
      expect(router.push).toHaveBeenCalledWith('/list/list-42');
    });

    it('ignores non-ranking notification types', () => {
      handleNotificationResponse(makeResponse({ type: 'something_else', listId: 'list-42' }));
      expect(router.push).not.toHaveBeenCalled();
    });

    it('ignores payloads without a listId', () => {
      handleNotificationResponse(makeResponse({ type: 'ranking_complete' }));
      expect(router.push).not.toHaveBeenCalled();
    });

    it('ignores null/empty payloads', () => {
      handleNotificationResponse(makeResponse(null));
      handleNotificationResponse(makeResponse('not-an-object'));
      expect(router.push).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToNotificationTaps', () => {
    it('registers a listener and returns an unsubscribe function', async () => {
      const remove = jest.fn();
      (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({ remove });
      (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(null);

      const unsubscribe = subscribeToNotificationTaps();
      unsubscribe();

      expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
      expect(remove).toHaveBeenCalled();
    });

    it('routes a cold-start notification to the list screen', async () => {
      const remove = jest.fn();
      (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({ remove });
      (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue({
        notification: {
          request: { content: { data: { type: 'ranking_complete', listId: 'list-cold' } } },
        },
      });

      subscribeToNotificationTaps();
      // Wait for the getLastNotificationResponseAsync promise to resolve.
      await Promise.resolve();
      await Promise.resolve();

      expect(router.push).toHaveBeenCalledWith('/list/list-cold');
    });

    it('does nothing when there is no cold-start notification', async () => {
      const remove = jest.fn();
      (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({ remove });
      (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(null);

      subscribeToNotificationTaps();
      await Promise.resolve();
      await Promise.resolve();

      expect(router.push).not.toHaveBeenCalled();
    });
  });
});
