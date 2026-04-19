import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { parseDeepLink, getRouteForDeepLink } from '../lib/deep-linking';
import {
  configureNotificationHandler,
  registerDeviceForUser,
  subscribeToNotificationTaps,
} from '../lib/notifications';

// Configure foreground handler once at module load — must be set before any
// notification is received.
configureNotificationHandler();

function useDeepLinkHandler() {
  useEffect(() => {
    // Handle URLs that open the app while it's in the background
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const result = parseDeepLink(url);
      const route = getRouteForDeepLink(result);
      if (route) {
        router.push(route as any);
      }
    });

    // Handle the URL that initially opened the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const result = parseDeepLink(url);
      const route = getRouteForDeepLink(result);
      if (route) {
        // Small delay to let the router mount before navigating
        setTimeout(() => router.push(route as any), 100);
      }
    });

    return () => subscription.remove();
  }, []);
}

function NotificationBridge() {
  const { user } = useAuth();

  // Subscribe to notification taps for the lifetime of the app.
  useEffect(() => {
    const unsubscribe = subscribeToNotificationTaps();
    return unsubscribe;
  }, []);

  // Register this device for the signed-in user so the backend can target them.
  useEffect(() => {
    if (!user) return;
    registerDeviceForUser(user.id).catch(() => {
      // Permission denied / simulator / offline — nothing user-facing to do.
    });
  }, [user?.id]);

  return null;
}

export default function RootLayout() {
  useDeepLinkHandler();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <NotificationBridge />
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#fff' },
            headerTintColor: '#111827',
            headerTitleStyle: { fontWeight: '600' },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/sign-in" options={{ title: 'Sign In', presentation: 'modal' }} />
          <Stack.Screen name="(auth)/sign-up" options={{ title: 'Sign Up', presentation: 'modal' }} />
          <Stack.Screen name="rank/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="list/[id]" options={{ title: 'List Details' }} />
          <Stack.Screen name="quick-add" options={{ title: 'Quick Add', presentation: 'modal' }} />
          <Stack.Screen name="share/[code]" options={{ title: 'Shared Ranking', headerShown: false }} />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
