// Tests for lib/bootstrap.ts — the app-startup side effects.
//
// Issue #47 asks for a smoke test asserting `Sentry.init` is invoked at module
// load. Two things have to hold for that to be true in the shipped app: the
// bootstrap module must init on import, and app/_layout.tsx must import it.
// The second is checked against the file's source because app/ is outside the
// jest testMatch glob — without it, deleting the wiring leaves CI green.

import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

import * as Sentry from '@sentry/react-native';

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

/** Load a fresh copy of lib/bootstrap with a chosen `__DEV__` value. */
function loadBootstrap(dev: boolean): typeof import('../bootstrap') {
  let mod!: typeof import('../bootstrap');
  jest.isolateModules(() => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = dev;
    mod = require('../bootstrap');
  });
  return mod;
}

describe('lib/bootstrap', () => {
  it('initializes Sentry on import when a DSN is configured', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://env@sentry.io/1';
    const mod = loadBootstrap(false);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(mod.monitoringStatus).toBe('enabled');
  });

  it('imports cleanly with no DSN configured', () => {
    const mod = loadBootstrap(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(mod.monitoringStatus).toBe('no-dsn');
  });

  it('is wired into app/_layout.tsx, so the shipped app actually runs it', () => {
    const layout = readFileSync(join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/import\s+['"]\.\.\/lib\/bootstrap['"]/);
  });
});
