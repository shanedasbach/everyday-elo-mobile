import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

// React Native defines `__DEV__` as a global; it is undefined under the plain
// Node jest environment, so guard the reference to avoid a ReferenceError.
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

let initialized = false;

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
 * Initialize Sentry crash reporting. No-ops (and reports false) when no DSN is
 * configured or when running in development, so local and test runs never emit
 * network calls. Idempotent — only the first effective call takes hold.
 */
export function initMonitoring(): boolean {
  if (initialized) return false;
  const dsn = getSentryDsn();
  if (!dsn || isDev) return false;
  Sentry.init({
    dsn,
    debug: isDev,
    tracesSampleRate: 0.1,
    enableAutoSessionTracking: true,
  });
  initialized = true;
  return true;
}

/**
 * Report a caught exception to Sentry. No-ops when monitoring was never
 * initialized (no DSN / dev), so callers — e.g. an ErrorBoundary — can wire to
 * this unconditionally.
 */
export function captureException(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}

/** Test-only hook to reset module state between cases. */
export function __resetMonitoringForTests(): void {
  initialized = false;
}
