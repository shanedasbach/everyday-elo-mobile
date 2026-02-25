import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth-context';

export default function RootLayout() {
  return (
    <AuthProvider>
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
      </Stack>
    </AuthProvider>
  );
}
