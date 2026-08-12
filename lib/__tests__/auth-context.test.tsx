/**
 * Tests for the auth provider's sign-out push-token revocation.
 *
 * Covers issue #85: sign-out must prefer the token persisted at
 * registration time over re-deriving it via a fresh permission check, and
 * must not throw when revocation fails.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock('../notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(),
  removePushToken: jest.fn(),
  getPersistedPushToken: jest.fn(),
  clearPersistedPushToken: jest.fn(),
}));

import { supabase } from '../supabase';
import {
  registerForPushNotificationsAsync,
  removePushToken,
  getPersistedPushToken,
  clearPersistedPushToken,
} from '../notifications';
import { AuthProvider, useAuth } from '../auth-context';

function Consumer({ onReady }: { onReady: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth();
  onReady(ctx);
  return null;
}

async function renderAuth() {
  let ctx!: ReturnType<typeof useAuth>;
  await act(async () => {
    TestRenderer.create(
      <AuthProvider>
        <Consumer onReady={(c) => (ctx = c)} />
      </AuthProvider>
    );
    // Let the getSession().then(...) microtask settle.
    await Promise.resolve();
  });
  return ctx;
}

describe('AuthProvider signOut push-token revocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
  });

  it('uses the persisted token and clears it, without re-deriving one', async () => {
    (getPersistedPushToken as jest.Mock).mockResolvedValue('persisted-tok');

    const ctx = await renderAuth();
    await act(async () => {
      await ctx.signOut();
    });

    expect(registerForPushNotificationsAsync).not.toHaveBeenCalled();
    expect(removePushToken).toHaveBeenCalledWith('persisted-tok');
    expect(clearPersistedPushToken).toHaveBeenCalled();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('falls back to a fresh token when nothing is persisted', async () => {
    (getPersistedPushToken as jest.Mock).mockResolvedValue(null);
    (registerForPushNotificationsAsync as jest.Mock).mockResolvedValue('fresh-tok');

    const ctx = await renderAuth();
    await act(async () => {
      await ctx.signOut();
    });

    expect(registerForPushNotificationsAsync).toHaveBeenCalled();
    expect(removePushToken).toHaveBeenCalledWith('fresh-tok');
    expect(clearPersistedPushToken).toHaveBeenCalled();
  });

  it('does not call removePushToken when no token is available at all', async () => {
    (getPersistedPushToken as jest.Mock).mockResolvedValue(null);
    (registerForPushNotificationsAsync as jest.Mock).mockResolvedValue(null);

    const ctx = await renderAuth();
    await act(async () => {
      await ctx.signOut();
    });

    expect(removePushToken).not.toHaveBeenCalled();
    expect(clearPersistedPushToken).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('logs and still signs out when revocation throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (getPersistedPushToken as jest.Mock).mockRejectedValue(new Error('offline'));

    const ctx = await renderAuth();
    await act(async () => {
      await ctx.signOut();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to revoke push token on sign-out:',
      expect.any(Error)
    );
    expect(supabase.auth.signOut).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('throws when supabase.auth.signOut errors', async () => {
    (getPersistedPushToken as jest.Mock).mockResolvedValue(null);
    (registerForPushNotificationsAsync as jest.Mock).mockResolvedValue(null);
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: new Error('boom') });

    const ctx = await renderAuth();
    await expect(
      act(async () => {
        await ctx.signOut();
      })
    ).rejects.toThrow('boom');
  });
});
