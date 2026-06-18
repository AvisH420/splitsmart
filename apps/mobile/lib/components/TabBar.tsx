import { Feather } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

/** Route name -> tab label + icon. Routes not listed here are not shown. */
const TABS: Record<string, { label: string; icon: FeatherName }> = {
  index: { label: 'Groups', icon: 'home' },
  activity: { label: 'Activity', icon: 'activity' },
  assistant: { label: 'Assistant', icon: 'zap' },
  profile: { label: 'Profile', icon: 'user' },
};

/**
 * Floating frosted-glass pill tab bar (see docs/design-references/
 * whatsapp-navbar.jpg). Active tab gets an accentSubtle pill behind its
 * icon + label; inactive tabs render in textTertiary.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => TABS[r.name]);

  return (
    <View
      style={[styles.container, { bottom: Math.max(insets.bottom, theme.spacing.xl) }]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={30}
          tint="light"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {routes.map((route) => {
        const config = TABS[route.name];
        const isActive = state.routes[state.index]?.key === route.key;
        const color = isActive ? theme.colors.accent : theme.colors.textTertiary;
        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            onPress={() => navigation.navigate(route.name)}
          >
            <View style={[styles.pill, isActive && styles.pillActive]}>
              <Feather name={config.icon} size={20} color={color} />
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {config.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: theme.spacing.xl,
    right: theme.spacing.xl,
    flexDirection: 'row',
    backgroundColor: theme.colors.glassBackground,
    borderColor: theme.colors.glassBorder,
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  pill: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  pillActive: { backgroundColor: theme.colors.accentSubtle },
  label: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
  },
});
