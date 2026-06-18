import { Stack } from 'expo-router';
import { theme } from '../../lib/theme';
import { useInviteLink } from '../../lib/use-invite-link';

/**
 * Authenticated stack. The (tabs) group hosts the four bottom tabs (their own
 * headers via ScreenHeader, navigator header hidden). Group-detail and modal
 * screens push over the tabs and keep native headers until each is migrated to
 * ScreenHeader. Also the home for invite deep-link handling.
 */
export default function AppLayout() {
  useInviteLink();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: theme.colors.accent,
        headerTitleStyle: { color: theme.colors.textPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="groups/new"
        options={{ title: 'New Group', presentation: 'modal' }}
      />
      <Stack.Screen name="groups/[id]/index" options={{ title: 'Group' }} />
      <Stack.Screen
        name="groups/[id]/expense"
        options={{ title: 'New Expense', presentation: 'modal' }}
      />
      <Stack.Screen
        name="groups/[id]/expenses/[expenseId]"
        options={{ title: 'Expense' }}
      />
      <Stack.Screen name="groups/[id]/activity" options={{ title: 'Activity' }} />
      <Stack.Screen
        name="groups/[id]/members"
        options={{ title: 'Invite Member', presentation: 'modal' }}
      />
      <Stack.Screen
        name="groups/[id]/settle"
        options={{ title: 'Settle Up', presentation: 'modal' }}
      />
      <Stack.Screen
        name="groups/[id]/receipt"
        options={{ title: 'Scan Receipt', presentation: 'modal' }}
      />
    </Stack>
  );
}
