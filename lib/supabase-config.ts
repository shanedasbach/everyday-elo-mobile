/**
 * Resolves and validates the Supabase environment configuration.
 *
 * Kept separate from supabase.ts so the validation logic can be unit-tested
 * in a plain Node environment without pulling in the React Native / Expo
 * runtime dependencies (expo-secure-store, react-native-url-polyfill).
 */
export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from the
 * given environment (defaults to process.env). Throws a descriptive error
 * naming the exact missing variable(s) instead of failing later with an
 * opaque network/URL error.
 */
export function resolveSupabaseConfig(
  env: Record<string, string | undefined> = process.env
): SupabaseConfig {
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(
        ' and '
      )} — copy .env.example to .env.local and fill in your Supabase project values.`
    );
  }

  return {
    supabaseUrl: supabaseUrl as string,
    supabaseAnonKey: supabaseAnonKey as string,
  };
}
