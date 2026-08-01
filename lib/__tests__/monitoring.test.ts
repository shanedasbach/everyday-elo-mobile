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
    expect(mod.initMonitoring()).toBe('enabled');
    expect(mod.isMonitoringEnabled()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://env@sentry.io/1', sendDefaultPii: false }),
    );
  });

  it('does not set tracesSampleRate — no tracing integration is registered', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://env@sentry.io/1';
    loadMonitoring(false).initMonitoring();
    const options = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(options).not.toHaveProperty('tracesSampleRate');
  });

  it('reports `development` and no-ops in dev even with a DSN', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://env@sentry.io/1';
    const mod = loadMonitoring(true);
    expect(mod.initMonitoring()).toBe('development');
    expect(mod.isMonitoringEnabled()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('reports `no-dsn` when no DSN is configured', () => {
    const mod = loadMonitoring(false);
    expect(mod.initMonitoring()).toBe('no-dsn');
    expect(mod.isMonitoringEnabled()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('is idempotent — a second call reports `already-initialized` and does not re-init', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://env@sentry.io/1';
    const mod = loadMonitoring(false);
    expect(mod.initMonitoring()).toBe('enabled');
    expect(mod.initMonitoring()).toBe('already-initialized');
    expect(mod.isMonitoringEnabled()).toBe(true);
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

  it('logs instead of dropping when monitoring is not active', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mod = loadMonitoring(false);
    const err = new Error('boom');
    mod.captureException(err);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('monitoring disabled'), err);
    consoleError.mockRestore();
  });
});
