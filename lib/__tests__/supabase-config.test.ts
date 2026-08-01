import { resolveSupabaseConfig } from '../supabase-config';

describe('resolveSupabaseConfig', () => {
  const validEnv = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-123',
  };

  it('returns the config when both env vars are present', () => {
    expect(resolveSupabaseConfig(validEnv)).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key-123',
    });
  });

  it('throws naming the URL var when it is missing', () => {
    const env = { EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-123' };
    expect(() => resolveSupabaseConfig(env)).toThrow('EXPO_PUBLIC_SUPABASE_URL');
    expect(() => resolveSupabaseConfig(env)).toThrow('.env.example');
  });

  it('throws naming the anon key var when it is missing', () => {
    const env = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    };
    expect(() => resolveSupabaseConfig(env)).toThrow('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('lists both vars when both are missing', () => {
    expect(() => resolveSupabaseConfig({})).toThrow(
      'Missing EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY'
    );
  });

  it('treats empty-string values as missing', () => {
    const env = {
      EXPO_PUBLIC_SUPABASE_URL: '',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
    };
    expect(() => resolveSupabaseConfig(env)).toThrow('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('defaults to process.env when no argument is given', () => {
    const original = {
      url: process.env.EXPO_PUBLIC_SUPABASE_URL,
      key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    };
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://from-process.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'process-anon-key';
    try {
      expect(resolveSupabaseConfig()).toEqual({
        supabaseUrl: 'https://from-process.supabase.co',
        supabaseAnonKey: 'process-anon-key',
      });
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = original.url;
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = original.key;
    }
  });
});
