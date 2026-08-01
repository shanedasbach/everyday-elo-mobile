import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

// React Native defines `__DEV__` as a global; it is undefined under the plain
// Node jest environment, so guard the reference to avoid a ReferenceError.
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

let initialized = false;

/**
 * Outcome of an `initMonitoring()` call.
 * - `enabled` — Sentry.init ran; crashes are being reported.
 * - `already-initialized` — an earlier call already enabled it.
 * - `no-dsn` — no DSN configured, so monitoring stays off.
 * - `development` — suppressed in dev so local runs emit no network calls.
 */
export type MonitoringStatus = 'enabled' | 'already-initialized' | 'no-dsn' | 'development';

/**
 * Resolve the Sentry DSN. Prefer the `EXPO_PUBLIC_SENTRY_DSN` env var (mirrors
 * how Supabase config is read in supabase.ts); fall back to `extra.sentryDsn`
 * so the DSN can also live in app.json / app.config. Returns undefined when no
 * DSN is configured.
 */
export function getSentryDsn(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { sentryDsn?: string } | undefined;
  return extra?.sentryDsn;
}

/**
 * Initialize Sentry crash reporting. No-ops when no DSN is configured or when
 * running in development, so local and test runs never emit network calls.
 * Idempotent — only the first effective call takes hold. The returned status
 * distinguishes the reasons it may not have; use `isMonitoringEnabled()` to ask
 * whether monitoring is currently running.
 *
 * No performance-tracing integration is registered, so `tracesSampleRate` is
 * deliberately unset — sampling with nothing to sample only costs a decision
 * per event. Tracing needs `Sentry.wrap()` on the root component plus
 * `reactNavigationIntegration()`, which is a separate change.
 */
export function initMonitoring(): MonitoringStatus {
  if (initialized) return 'already-initialized';
  // Dev is checked before the DSN: dev suppresses monitoring whether or not a
  // DSN is set, so `development` is the accurate reason in that case.
  if (isDev) return 'development';
  const dsn = getSentryDsn();
  if (!dsn) return 'no-dsn';
  Sentry.init({
    dsn,
    enableAutoSessionTracking: true,
    // The SDK attaches the reporter's IP address by default. State the posture
    // explicitly rather than inheriting it.
    sendDefaultPii: false,
  });
  initialized = true;
  return 'enabled';
}

/** Whether crash reporting is currently active. */
export function isMonitoringEnabled(): boolean {
  return initialized;
}

/**
 * Report a caught exception to Sentry. When monitoring is not active (no DSN /
 * dev) the error is logged instead of dropped, so a caller such as an
 * ErrorBoundary can wire to this unconditionally without losing errors during
 * local debugging.
 */
export function captureException(error: unknown): void {
  if (!initialized) {
    console.error('[monitoring] monitoring disabled, captured error:', error);
    return;
  }
  Sentry.captureException(error);
}
