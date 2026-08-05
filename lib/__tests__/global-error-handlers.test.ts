/**
 * Tests for the global error/rejection backstop installed in app/_layout.tsx.
 *
 * Covers:
 * - ErrorUtils.setGlobalHandler is wrapped, not replaced — the previous
 *   handler still runs after reporting
 * - Fatal vs non-fatal errors are labelled distinctly
 * - Unhandled promise rejections are reported through the same funnel
 * - Missing ErrorUtils (unlikely, but not RN's guarantee) doesn't throw
 * - A second install call is a no-op
 */

const mockEnable = jest.fn();
jest.mock('promise/setimmediate/rejection-tracking', () => ({
  enable: (...args: unknown[]) => mockEnable(...args),
}));

describe('installGlobalErrorHandlers', () => {
  const originalErrorUtils = (global as { ErrorUtils?: unknown }).ErrorUtils;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (global as { ErrorUtils?: unknown }).ErrorUtils = originalErrorUtils;
    consoleErrorSpy.mockRestore();
    mockEnable.mockClear();
    jest.resetModules();
  });

  it('wraps ErrorUtils.setGlobalHandler: reports the error, then calls through to the previous handler', () => {
    const previousHandler = jest.fn();
    const setGlobalHandler = jest.fn();
    (global as { ErrorUtils?: unknown }).ErrorUtils = {
      getGlobalHandler: () => previousHandler,
      setGlobalHandler,
    };

    const { installGlobalErrorHandlers } = require('../global-error-handlers');
    installGlobalErrorHandlers();

    expect(setGlobalHandler).toHaveBeenCalledTimes(1);
    const wrapped = setGlobalHandler.mock.calls[0][0];
    const error = new Error('fatal');
    wrapped(error, true);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[unhandled:fatalError]', error);
    expect(previousHandler).toHaveBeenCalledWith(error, true);
  });

  it('labels a non-fatal error as "error"', () => {
    const previousHandler = jest.fn();
    const setGlobalHandler = jest.fn();
    (global as { ErrorUtils?: unknown }).ErrorUtils = {
      getGlobalHandler: () => previousHandler,
      setGlobalHandler,
    };

    const { installGlobalErrorHandlers } = require('../global-error-handlers');
    installGlobalErrorHandlers();

    const wrapped = setGlobalHandler.mock.calls[0][0];
    const error = new Error('non-fatal');
    wrapped(error, false);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[unhandled:error]', error);
  });

  it('installs promise rejection tracking that reports unhandled rejections', () => {
    (global as { ErrorUtils?: unknown }).ErrorUtils = undefined;

    const { installGlobalErrorHandlers } = require('../global-error-handlers');
    installGlobalErrorHandlers();

    expect(mockEnable).toHaveBeenCalledTimes(1);
    const options = mockEnable.mock.calls[0][0];
    const error = new Error('unhandled');
    options.onUnhandled(1, error);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[unhandled:unhandledRejection]', error);
    expect(() => options.onHandled(1)).not.toThrow();
  });

  it('does nothing to ErrorUtils when it is unavailable, but still installs rejection tracking', () => {
    (global as { ErrorUtils?: unknown }).ErrorUtils = undefined;

    const { installGlobalErrorHandlers } = require('../global-error-handlers');
    expect(() => installGlobalErrorHandlers()).not.toThrow();
    expect(mockEnable).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on a second call within the same module instance', () => {
    const setGlobalHandler = jest.fn();
    (global as { ErrorUtils?: unknown }).ErrorUtils = {
      getGlobalHandler: () => jest.fn(),
      setGlobalHandler,
    };

    const { installGlobalErrorHandlers } = require('../global-error-handlers');
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();

    expect(setGlobalHandler).toHaveBeenCalledTimes(1);
    expect(mockEnable).toHaveBeenCalledTimes(1);
  });
});
