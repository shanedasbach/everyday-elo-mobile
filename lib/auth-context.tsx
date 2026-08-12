import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  registerForPushNotificationsAsync,
  removePushToken,
  getPersistedPushToken,
  clearPersistedPushToken,
} from './notifications';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    // Best-effort: unregister this device's push token so the backend stops
    // targeting it after sign-out. Failures here must not block sign-out.
    // Prefer the token persisted when it was first registered — re-deriving
    // it via registerForPushNotificationsAsync() means a fresh permission
    // check and a network round-trip to Expo's push service, which silently
    // drops the revocation if the device is offline.
    try {
      let token = await getPersistedPushToken();
      if (!token) {
        token = await registerForPushNotificationsAsync();
      }
      if (token) {
        await removePushToken(token);
        await clearPersistedPushToken();
      }
    } catch (error) {
      // Non-fatal — proceed with sign-out regardless, but keep this visible.
      console.error('Failed to revoke push token on sign-out:', error);
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
