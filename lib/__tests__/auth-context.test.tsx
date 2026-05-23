/**
 * Tests for the AuthProvider / useAuth context.
 *
 * Covers:
 * - Initial session load from supabase.auth.getSession sets user/session and clears loading
 * - onAuthStateChange callback updates session/user
 * - signIn / signUp / signOut delegate to supabase.auth and surface errors
 * - signOut unregisters the device push token (best-effort) and still succeeds when push fails
 * - useAuth throws when used outside AuthProvider
 * - The provider unsubscribes from auth changes on unmount
 */

// React 19 + react-test-renderer logs noisy "act not configured" warnings
// unless this global is set before React is imported. jest.setup.js sets it
// too, but ts-jest's module evaluation order can race with setupFilesAfterEnv
// for the very first transformed file — pin it here to be safe.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { useEffect } from 'react';
// react-test-renderer ships no type declarations in this project. The shape
// we use (create/act + the returned renderer's unmount) is stable, so we
// declare a minimal local typing rather than depending on @types/react-test-renderer.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  create: (element: React.ReactElement) => { unmount: () => void };
  act: (cb: () => void | Promise<void>) => Promise<void> | void;
};
const { create, act } = TestRenderer;
type ReactTestRenderer = ReturnType<typeof TestRenderer.create>;

// --- Mocks -----------------------------------------------------------------

const unsubscribeMock = jest.fn();
let storedAuthChangeCallback:
  | ((event: string, session: unknown) => void)
  | undefined;

const supabaseAuth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn((cb: (event: string, session: unknown) => void) => {
    storedAuthChangeCallback = cb;
    return { data: { subscription: { unsubscribe: unsubscribeMock } } };
  }),
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
};

jest.mock('../supabase', () => ({
  supabase: { auth: supabaseAuth },
}));

const registerForPushNotificationsAsync = jest.fn();
const removePushToken = jest.fn();
jest.mock('../notifications', () => ({
  registerForPushNotificationsAsync: (...args: unknown[]) =>
    registerForPushNotificationsAsync(...args),
  removePushToken: (...args: unknown[]) => removePushToken(...args),
}));

import { AuthProvider, useAuth } from '../auth-context';

// --- Helpers ---------------------------------------------------------------

type CapturedContext = ReturnType<typeof useAuth> | null;

const Consumer = ({ onContext }: { onContext: (ctx: CapturedContext) => void }) => {
  const ctx = useAuth();
  useEffect(() => {
    onContext(ctx);
  });
  return null;
};

const flush = async () => {
  // Allow microtasks (getSession promise) to resolve.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const renderProvider = async () => {
  let captured: CapturedContext = null;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <AuthProvider>
        <Consumer onContext={(c) => { captured = c; }} />
      </AuthProvider>,
    );
  });
  await flush();
  return {
    renderer,
    getCtx: () => {
      if (!captured) throw new Error('context not captured');
      return captured;
    },
  };
};

// --- Tests -----------------------------------------------------------------

describe('AuthProvider / useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storedAuthChangeCallback = undefined;
    supabaseAuth.getSession.mockResolvedValue({ data: { session: null } });
  });

  it('loads the initial session and clears loading', async () => {
    const user = { id: 'user-1', email: 'a@b.co' };
    const session = { access_token: 't', user };
    supabaseAuth.getSession.mockResolvedValue({ data: { session } });

    const { getCtx } = await renderProvider();
    const ctx = getCtx();

    expect(supabaseAuth.getSession).toHaveBeenCalledTimes(1);
    expect(ctx.session).toEqual(session);
    expect(ctx.user).toEqual(user);
    expect(ctx.loading).toBe(false);
  });

  it('treats a null initial session as signed-out', async () => {
    const { getCtx } = await renderProvider();
    const ctx = getCtx();

    expect(ctx.session).toBeNull();
    expect(ctx.user).toBeNull();
    expect(ctx.loading).toBe(false);
  });

  it('updates state when onAuthStateChange fires', async () => {
    const { getCtx } = await renderProvider();
    const newUser = { id: 'user-2' };
    const newSession = { access_token: 'new', user: newUser };

    await act(async () => {
      storedAuthChangeCallback?.('SIGNED_IN', newSession);
    });

    const ctx = getCtx();
    expect(ctx.session).toEqual(newSession);
    expect(ctx.user).toEqual(newUser);
  });

  it('clears user when onAuthStateChange fires with a null session', async () => {
    const user = { id: 'user-1' };
    supabaseAuth.getSession.mockResolvedValue({
      data: { session: { user } },
    });

    const { getCtx } = await renderProvider();
    expect(getCtx().user).toEqual(user);

    await act(async () => {
      storedAuthChangeCallback?.('SIGNED_OUT', null);
    });

    const ctx = getCtx();
    expect(ctx.session).toBeNull();
    expect(ctx.user).toBeNull();
  });

  it('unsubscribes from auth changes on unmount', async () => {
    const { renderer } = await renderProvider();

    await act(async () => {
      renderer.unmount();
    });

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  describe('signIn', () => {
    it('delegates to supabase.auth.signInWithPassword', async () => {
      supabaseAuth.signInWithPassword.mockResolvedValue({ error: null });
      const { getCtx } = await renderProvider();

      await act(async () => {
        await getCtx().signIn('a@b.co', 'pw');
      });

      expect(supabaseAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.co',
        password: 'pw',
      });
    });

    it('throws when supabase returns an error', async () => {
      supabaseAuth.signInWithPassword.mockResolvedValue({
        error: new Error('bad creds'),
      });
      const { getCtx } = await renderProvider();

      await expect(getCtx().signIn('a@b.co', 'pw')).rejects.toThrow('bad creds');
    });
  });

  describe('signUp', () => {
    it('delegates to supabase.auth.signUp', async () => {
      supabaseAuth.signUp.mockResolvedValue({ error: null });
      const { getCtx } = await renderProvider();

      await act(async () => {
        await getCtx().signUp('new@b.co', 'pw');
      });

      expect(supabaseAuth.signUp).toHaveBeenCalledWith({
        email: 'new@b.co',
        password: 'pw',
      });
    });

    it('throws when supabase returns an error', async () => {
      supabaseAuth.signUp.mockResolvedValue({
        error: new Error('weak password'),
      });
      const { getCtx } = await renderProvider();

      await expect(getCtx().signUp('a@b.co', 'pw')).rejects.toThrow('weak password');
    });
  });

  describe('signOut', () => {
    it('removes the device push token and signs out', async () => {
      registerForPushNotificationsAsync.mockResolvedValue('ExponentPushToken[abc]');
      removePushToken.mockResolvedValue(undefined);
      supabaseAuth.signOut.mockResolvedValue({ error: null });
      const { getCtx } = await renderProvider();

      await act(async () => {
        await getCtx().signOut();
      });

      expect(registerForPushNotificationsAsync).toHaveBeenCalled();
      expect(removePushToken).toHaveBeenCalledWith('ExponentPushToken[abc]');
      expect(supabaseAuth.signOut).toHaveBeenCalled();
    });

    it('skips push token removal when no token is available', async () => {
      registerForPushNotificationsAsync.mockResolvedValue(null);
      supabaseAuth.signOut.mockResolvedValue({ error: null });
      const { getCtx } = await renderProvider();

      await act(async () => {
        await getCtx().signOut();
      });

      expect(removePushToken).not.toHaveBeenCalled();
      expect(supabaseAuth.signOut).toHaveBeenCalled();
    });

    it('still signs out when push token cleanup throws', async () => {
      registerForPushNotificationsAsync.mockRejectedValue(new Error('push broke'));
      supabaseAuth.signOut.mockResolvedValue({ error: null });
      const { getCtx } = await renderProvider();

      await act(async () => {
        await getCtx().signOut();
      });

      expect(supabaseAuth.signOut).toHaveBeenCalled();
    });

    it('still signs out when removePushToken throws', async () => {
      registerForPushNotificationsAsync.mockResolvedValue('tok');
      removePushToken.mockRejectedValue(new Error('delete failed'));
      supabaseAuth.signOut.mockResolvedValue({ error: null });
      const { getCtx } = await renderProvider();

      await act(async () => {
        await getCtx().signOut();
      });

      expect(supabaseAuth.signOut).toHaveBeenCalled();
    });

    it('throws when supabase.auth.signOut returns an error', async () => {
      registerForPushNotificationsAsync.mockResolvedValue(null);
      supabaseAuth.signOut.mockResolvedValue({ error: new Error('network') });
      const { getCtx } = await renderProvider();

      await expect(getCtx().signOut()).rejects.toThrow('network');
    });
  });

  it('useAuth throws when called outside an AuthProvider', () => {
    let caught: unknown;
    const Probe = () => {
      try {
        useAuth();
      } catch (e) {
        caught = e;
      }
      return null;
    };

    // Suppress React's "An error occurred" noise — we expect a throw.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      act(() => {
        create(<Probe />);
      });
    } finally {
      errSpy.mockRestore();
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/must be used within an AuthProvider/);
  });
});
