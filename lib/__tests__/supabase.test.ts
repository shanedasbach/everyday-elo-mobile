/**
 * Tests for the Supabase client configuration.
 *
 * Covers:
 * - The SecureStore-backed storage adapter (getItem/setItem/removeItem)
 *   delegates to expo-secure-store with the right key/value pairs
 * - createClient is called with the expected URL, anon key, and auth options
 */

// Env vars must be set before the supabase module loads — it reads them at
// module evaluation time.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-123';

jest.mock('react-native-url-polyfill/auto', () => ({}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const createClientMock: jest.Mock = jest.fn((..._args: unknown[]) => ({ __client: true }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import * as SecureStore from 'expo-secure-store';
import { supabase } from '../supabase';

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type AuthOptions = {
  storage: StorageAdapter;
  autoRefreshToken: boolean;
  persistSession: boolean;
  detectSessionInUrl: boolean;
};

const getCreateClientArgs = () => createClientMock.mock.calls[0];
const getAuthOptions = (): AuthOptions =>
  (getCreateClientArgs()[2] as { auth: AuthOptions }).auth;
const getAdapter = (): StorageAdapter => getAuthOptions().storage;

describe('supabase client configuration', () => {
  beforeEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.setItemAsync as jest.Mock).mockReset();
    (SecureStore.deleteItemAsync as jest.Mock).mockReset();
  });

  it('calls createClient exactly once when the module loads', () => {
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('passes the env URL and anon key to createClient', () => {
    const args = getCreateClientArgs();
    expect(args[0]).toBe('https://example.supabase.co');
    expect(args[1]).toBe('anon-key-123');
  });

  it('configures auth with autoRefreshToken, persistSession, and detectSessionInUrl=false', () => {
    const options = getAuthOptions();
    expect(options.autoRefreshToken).toBe(true);
    expect(options.persistSession).toBe(true);
    expect(options.detectSessionInUrl).toBe(false);
  });

  it('exposes the createClient result as the supabase export', () => {
    expect(supabase).toEqual({ __client: true });
  });

  describe('ExpoSecureStoreAdapter', () => {
    it('getItem delegates to SecureStore.getItemAsync and returns its result', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-value');

      const result = await getAdapter().getItem('my-key');

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('my-key');
      expect(result).toBe('stored-value');
    });

    it('getItem returns null when SecureStore has no value', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await getAdapter().getItem('missing-key');

      expect(result).toBeNull();
    });

    it('setItem delegates to SecureStore.setItemAsync with key and value', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      await getAdapter().setItem('my-key', 'my-value');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('my-key', 'my-value');
    });

    it('removeItem delegates to SecureStore.deleteItemAsync', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      await getAdapter().removeItem('my-key');

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('my-key');
    });
  });
});
