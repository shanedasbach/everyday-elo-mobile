// Tests for lib/monitoring.ts — Sentry crash-reporting wiring.
// The real SDK and expo-constants are mocked so no network calls or native
// modules are touched. `__DEV__` is set per-load because the module reads it at
// import time.

const mockConstantsState: { expoConfig: { extra: Record<string, unknown> } | null } = {
  expoConfig: { extra: {} },
};

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstantsState;
  },
}));

import * as Sentry from '@sentry/react-native';

type MonitoringModule = typeof import('../monitoring');

/** Load a fresh copy of the module with a chosen `__DEV__` value. */
function loadMonitoring(dev: boolean): MonitoringModule {
  let mod!: MonitoringModule;
  jest.isolateModules(() => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = dev;
    mod = require('../monitoring');
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  mockConstantsState.expoConfig = { extra: {} };
});

describe('getSentryDsn', () => {
  it('prefers the EXPO_PUBLIC_SENTRY_DSN env var', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://env@sentry.io/1';
    mockConstantsState.expoConfig = { extra: { sentryDsn: 'https://extra@sentry.io/2' } };
    expect(loadMonitoring(false).getSentryDsn()).toBe('https://env@sentry.io/1');
  });

  it('falls back to expoConfig.extra.sentryDsn when no env var', () => {
    mockConstantsState.expoConfig = { extra: { sentryDsn: 'https://extra@sentry.io/2' } };
    expect(loadMonitoring(false).getSentryDsn()).toBe('https://extra@sentry.io/2');
  });

  it('returns undefined when no DSN is configured anywhere', () => {
    expect(loadMonitoring(false).getSentryDsn()).toBeUndefined();
  });

  it('returns undefined when expoConfig is null', () => {
    mockConstantsState.expoConfig = null;
    expect(loadMonitoring(false).getSentryDsn()).toBeUndefined();
  });
});

describe('initMonitoring', () => {
  it('calls Sentry.init with the DSN when configured and not in dev', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://env@sentry.io/1';
    const mod = loadMonitoring(false);
    expect(mod.initMonitoring()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://env@sentry.io/1', tracesSampleRate: 0.1 }),
    );
  });

  it('no-ops in development even with a DSN', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://env@sentry.io/1';
    const mod = loadMonitoring(true);
    expect(mod.initMonitoring()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('no-ops when no DSN is configured', () => {
    const mod = loadMonitoring(false);
    expect(mod.initMonitoring()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('is idempotent — a second call does not re-init', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://env@sentry.io/1';
    const mod = loadMonitoring(false);
    expect(mod.initMonitoring()).toBe(true);
    expect(mod.initMonitoring()).toBe(false);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });
});

describe('captureException', () => {
  it('forwards to Sentry once monitoring is initialized', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://env@sentry.io/1';
    const mod = loadMonitoring(false);
    mod.initMonitoring();
    const err = new Error('boom');
    mod.captureException(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('no-ops when monitoring was never initialized', () => {
    const mod = loadMonitoring(false);
    mod.captureException(new Error('boom'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
