/**
 * Tests for Supabase env-var validation (issue #54).
 *
 * `lib/supabase.ts` calls `getSupabaseConfig()` at module load, so the module
 * is required with valid env vars present (set in beforeEach), then the guard
 * is exercised directly by removing a var and calling the function again.
 */

jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const ORIGINAL_ENV = process.env;

describe('getSupabaseConfig', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-123',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns the config when both env vars are present', () => {
    const { getSupabaseConfig } = require('../supabase');
    expect(getSupabaseConfig()).toEqual({
      url: 'https://example.supabase.co',
      anonKey: 'anon-key-123',
    });
  });

  it('throws a helpful, named error when the URL is missing', () => {
    const { getSupabaseConfig } = require('../supabase');
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(() => getSupabaseConfig()).toThrow('EXPO_PUBLIC_SUPABASE_URL');
    expect(() => getSupabaseConfig()).toThrow('.env.example');
    expect(() => getSupabaseConfig()).not.toThrow('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('throws a helpful, named error when the anon key is missing', () => {
    const { getSupabaseConfig } = require('../supabase');
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => getSupabaseConfig()).toThrow('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(() => getSupabaseConfig()).toThrow('.env.example');
  });

  it('names both vars when both are missing', () => {
    const { getSupabaseConfig } = require('../supabase');
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => getSupabaseConfig()).toThrow(
      'Missing EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY'
    );
  });

  it('treats an empty string as missing', () => {
    const { getSupabaseConfig } = require('../supabase');
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
    expect(() => getSupabaseConfig()).toThrow('EXPO_PUBLIC_SUPABASE_URL');
  });
});
