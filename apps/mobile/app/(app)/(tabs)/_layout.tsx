import { Tabs } from 'expo-router';
import { TabBar } from '../../../lib/components/TabBar';

/**
 * The four top-level tabs (Groups, Activity, Assistant, Profile), rendered
 * with the custom floating glass TabBar. Each tab manages its own header via
 * ScreenHeader, so the navigator header is hidden. Group-detail and modal
 * screens live in the parent (app) stack and push over these tabs.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="assistant" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
