import { Stack } from 'expo-router';

/**
 * Layout for the unauthenticated section (login + signup). Its existence
 * lets the root layout reference this group as a single `(auth)` screen
 * inside `Stack.Protected`.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
