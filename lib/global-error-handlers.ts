import { reportUnhandledError } from './error-reporting';

// React error boundaries (componentDidCatch) only see errors thrown during
// render, in lifecycle methods, and in constructors. Errors thrown in async
// code, event handlers, and timer callbacks skip that entirely — RN's fatal
// handler and the default unhandled-rejection tracker log them, but neither
// funnels through a path production observability can pick up. This installs
// a backstop for both without changing what already catches its own errors.
let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  const errorUtils = (global as { ErrorUtils?: ErrorUtils }).ErrorUtils;
  if (errorUtils) {
    const previousHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      reportUnhandledError(error, { source: isFatal ? 'fatalError' : 'error' });
      previousHandler(error, isFatal);
    });
  }

  // Re-enabling replaces RN's own default tracker (installed at startup via
  // the same module) with this one — the intended override point, not a race.
  require('promise/setimmediate/rejection-tracking').enable({
    allRejections: true,
    onUnhandled: (_id: number, error: unknown) => {
      reportUnhandledError(error, { source: 'unhandledRejection' });
    },
    onHandled: () => {},
  });
}

interface ErrorUtils {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}
