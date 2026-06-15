import { Stack } from 'expo-router';

/**
 * Layout for the authenticated section. Headers are on here (the root
 * layout keeps its own header off) so the group/expense screens get titles
 * and a back button for free. Individual screens set their own title.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#1d9e75',
        headerTitleStyle: { color: '#111' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Groups' }} />
      <Stack.Screen name="groups/new" options={{ title: 'New Group', presentation: 'modal' }} />
      <Stack.Screen name="groups/[id]/index" options={{ title: 'Group' }} />
      <Stack.Screen
        name="groups/[id]/expense"
        options={{ title: 'New Expense', presentation: 'modal' }}
      />
      <Stack.Screen
        name="groups/[id]/members"
        options={{ title: 'Add Member', presentation: 'modal' }}
      />
      <Stack.Screen
        name="groups/[id]/settle"
        options={{ title: 'Settle Up', presentation: 'modal' }}
      />
    </Stack>
  );
}
