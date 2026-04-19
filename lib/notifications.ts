/**
 * Push notifications module.
 *
 * Responsibilities:
 * - Request permission and register for an Expo push token
 * - Persist the push token to Supabase (push_tokens table) so the backend can
 *   target a user across devices
 * - Configure the foreground notification handler and Android channel
 * - Expose a listener that routes notification taps to the relevant list screen
 *
 * The notification payload shape we expect:
 *   { type: 'ranking_complete', listId: string, rankingId?: string }
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from './supabase';

export interface RankingNotificationData {
  type: 'ranking_complete';
  listId: string;
  rankingId?: string;
}

const ANDROID_CHANNEL_ID = 'rankings';

/**
 * Configure how notifications are displayed when the app is foregrounded.
 * Called once at app startup.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Create the Android notification channel. No-op on iOS.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Ranking updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3B82F6',
  });
}

/**
 * Request permission and return the Expo push token, or null if unavailable
 * (simulator, permission denied, or missing projectId).
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    return tokenResponse.data;
  } catch {
    return null;
  }
}

/**
 * Persist the device's push token for the given user. Uses an upsert so the
 * same device doesn't create duplicate rows if the token is refreshed.
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
  if (error) throw error;
}

/**
 * Remove a push token — call on sign-out so we stop targeting this device.
 */
export async function removePushToken(token: string): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('token', token);
  if (error) throw error;
}

/**
 * Register the current user's device for push notifications and persist the
 * token. Safe to call repeatedly. Returns the token or null.
 */
export async function registerDeviceForUser(userId: string): Promise<string | null> {
  const token = await registerForPushNotificationsAsync();
  if (!token) return null;
  try {
    await savePushToken(userId, token);
  } catch {
    // Non-fatal: the device is registered locally even if we failed to persist
    return token;
  }
  return token;
}

/**
 * Route a notification response to the relevant list screen.
 * Exported for testing.
 */
export function handleNotificationResponse(
  response: Notifications.NotificationResponse
): void {
  const data = response.notification.request.content.data as unknown;
  if (!data || typeof data !== 'object') return;
  const payload = data as Partial<RankingNotificationData>;
  if (payload.type === 'ranking_complete' && typeof payload.listId === 'string') {
    router.push(`/list/${payload.listId}`);
  }
}

/**
 * Subscribe to taps on notifications. Returns an unsubscribe function.
 * Also checks if the app was launched by tapping a notification (cold start)
 * and routes accordingly.
 */
export function subscribeToNotificationTaps(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse
  );

  // Handle the case where the app was opened from a notification (cold start).
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) handleNotificationResponse(response);
  });

  return () => subscription.remove();
}
