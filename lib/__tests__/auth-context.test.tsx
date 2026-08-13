/**
 * Tests for the auth provider's sign-out push-token revocation.
 *
 * Covers #96: sign-out revokes this device's push-token row keyed on
 * (user_id, device_id) rather than the token itself, and must not throw when
 * revocation fails.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const sessionUser = { id: 'user-1' };

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: sessionUser } } }),
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
  removePushToken: jest.fn(),
  getOrCreateDeviceId: jest.fn(),
  clearPersistedPushToken: jest.fn(),
}));

import { supabase } from '../supabase';
import { removePushToken, getOrCreateDeviceId, clearPersistedPushToken } from '../notifications';
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
    (getOrCreateDeviceId as jest.Mock).mockResolvedValue('device-1');
    (removePushToken as jest.Mock).mockResolvedValue(undefined);
  });

  it('removes this device row for the signed-in user and clears the local cache', async () => {
    const ctx = await renderAuth();
    await act(async () => {
      await ctx.signOut();
    });

    expect(getOrCreateDeviceId).toHaveBeenCalled();
    expect(removePushToken).toHaveBeenCalledWith('user-1', 'device-1');
    expect(clearPersistedPushToken).toHaveBeenCalled();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('does not call removePushToken when there is no signed-in user', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({ data: { session: null } });

    const ctx = await renderAuth();
    await act(async () => {
      await ctx.signOut();
    });

    expect(removePushToken).not.toHaveBeenCalled();
    expect(clearPersistedPushToken).toHaveBeenCalled();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('logs and still signs out when revocation throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (getOrCreateDeviceId as jest.Mock).mockRejectedValue(new Error('offline'));

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
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: new Error('boom') });

    const ctx = await renderAuth();
    await expect(
      act(async () => {
        await ctx.signOut();
      })
    ).rejects.toThrow('boom');
  });
});
