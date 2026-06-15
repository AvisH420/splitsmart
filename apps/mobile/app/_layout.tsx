import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth-context';

/**
 * Declares the protected route tree. `Stack.Protected` only mounts a
 * group while its `guard` is true and, when the guard is false, redirects
 * away from it — so the signed-in/signed-out split is enforced by the
 * router itself (including deep links), with no manual navigation.
 *
 * While the persisted session is still being restored we show a spinner
 * instead of the stack, so we never flash the login screen at an
 * already-signed-in user.
 */
function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
