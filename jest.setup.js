// Jest setup for Everyday Elo Mobile - Unit Tests
// These are minimal mocks for running pure function tests.

// Tell React this is a valid act() environment so component tests rendered with
// react-test-renderer don't warn about un-acted state updates (see issue #48).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// react-test-renderer prints a deprecation banner on every create(). Suppress
// only that one message so it doesn't drown the test output; everything else
// still surfaces.
//
// Scoped two ways on purpose. It only installs for suites that actually
// render via react-test-renderer — matched by file extension, since any
// __tests__/*.tsx file may render a component or provider tree (components/
// and app/screen __tests__ alike, plus lib/__tests__/auth-context.test.tsx) —
// and it is always restored in afterAll, so the patch cannot outlive the
// file that needs it or surprise anyone who later spies on console.error.
const isRenderSuite = /[\\/]__tests__[\\/][^\\/]+\.tsx$/.test(
  expect.getState().testPath ?? '',
);

if (isRenderSuite) {
  let realConsoleError;
  beforeAll(() => {
    realConsoleError = console.error;
    console.error = (...args) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('react-test-renderer is deprecated')
      ) {
        return;
      }
      realConsoleError(...args);
    };
  });
  afterAll(() => {
    console.error = realConsoleError;
  });
}

// Mock expo-haptics so component tests can run under the `node` test
// environment without loading the native module (see issue #48). The
// feedback-type enums are stubbed to plain strings so call assertions
// can verify the right variant was requested.
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));
