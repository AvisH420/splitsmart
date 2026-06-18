import { Stack } from 'expo-router';
import { useInviteLink } from '../../lib/use-invite-link';

/**
 * Authenticated stack. The (tabs) group hosts the four bottom tabs; group-detail
 * and modal screens push over the tabs. Every screen renders its own
 * ScreenHeader, so the native navigator header is hidden throughout. Also the
 * home for invite deep-link handling.
 */
export default function AppLayout() {
  useInviteLink();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="groups/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="groups/[id]/index" />
      <Stack.Screen name="groups/[id]/expense" options={{ presentation: 'modal' }} />
      <Stack.Screen name="groups/[id]/expenses/[expenseId]" />
      <Stack.Screen name="groups/[id]/activity" />
      <Stack.Screen name="groups/[id]/members" options={{ presentation: 'modal' }} />
      <Stack.Screen name="groups/[id]/settle" options={{ presentation: 'modal' }} />
      <Stack.Screen name="groups/[id]/receipt" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
