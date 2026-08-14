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
import * as SecureStore from 'expo-secure-store';
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
 * Persist the device's push token for the given user, keyed on
 * (user_id, device_id) rather than the token itself — the token is only
 * stable per app installation, not per physical device+account pairing, so
 * keying on it alone lets a stale row from a previous account outlive an
 * account switch on a shared device (#96).
 */
export async function savePushToken(
  userId: string,
  token: string,
  deviceId: string
): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        device_id: deviceId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' }
    );
  if (error) throw error;
}

/**
 * Remove this device's push-token row for the given user — call on sign-out
 * so we stop targeting this device.
 */
export async function removePushToken(userId: string, deviceId: string): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('device_id', deviceId);
  if (error) throw error;
}

/**
 * Delete any push_tokens row for this device owned by a *different* user.
 * Call before claiming a device for the signed-in user, so a device that
 * changed accounts reconciles even if the previous account's sign-out
 * cleanup silently failed (offline, dropped error) — the exact scenario
 * behind #96.
 *
 * Runs via the reconcile_device_ownership RPC (security definer) rather
 * than a client-side delete: this delete targets a row owned by someone
 * other than the caller, which this app's RLS mutation policies
 * (`using (auth.uid() = user_id)`) would otherwise filter down to zero rows.
 */
export async function reconcileDeviceOwnership(deviceId: string): Promise<void> {
  const { error } = await supabase.rpc('reconcile_device_ownership', {
    p_device_id: deviceId,
  });
  if (error) throw error;
}

const LAST_PUSH_TOKEN_KEY = 'last_push_token';
const DEVICE_ID_KEY = 'push_device_id';

/**
 * A random per-install device identifier, not cryptographically random —
 * it only needs to be unique per install, not unguessable, so Math.random is
 * fine here (unlike e.g. share-code generation, see #27).
 */
function generateDeviceId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Read this install's device id, generating and persisting one on first use.
 * Stable across sign-in/sign-out cycles, unlike the push token.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = generateDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

/**
 * Locally persist the most recently registered push token, so sign-out can
 * revoke it without re-deriving it via a fresh permission check + network
 * round-trip to Expo's push service.
 */
export async function persistLastPushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(LAST_PUSH_TOKEN_KEY, token);
}

/** Read the last push token persisted by {@link persistLastPushToken}, if any. */
export async function getPersistedPushToken(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_PUSH_TOKEN_KEY);
}

/** Clear the persisted push token — call once it has been revoked. */
export async function clearPersistedPushToken(): Promise<void> {
  await SecureStore.deleteItemAsync(LAST_PUSH_TOKEN_KEY);
}

/**
 * Register the current user's device for push notifications and persist the
 * token. Safe to call repeatedly. Returns the token or null.
 */
export async function registerDeviceForUser(userId: string): Promise<string | null> {
  const token = await registerForPushNotificationsAsync();
  if (!token) return null;
  await persistLastPushToken(token);
  const deviceId = await getOrCreateDeviceId();
  try {
    await reconcileDeviceOwnership(deviceId);
  } catch {
    // Non-fatal: proceed to claim this device for userId regardless — a
    // later sign-in on this device gets another chance to reconcile.
  }
  try {
    await savePushToken(userId, token, deviceId);
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
