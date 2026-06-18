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
 * Floating frosted-glass pill tab bar (quality bar: docs/design-references/
 * whatsapp-navbar.jpg). On iOS the bar is transparent over a BlurView that
 * frosts the content scrolling beneath it, with a warm tint, a hairline border
 * and a soft floating shadow. Android uses a solid warm fill + elevation.
 * Active tab: accent icon + label over a soft accentSubtle pill. Inactive:
 * tertiary text, no fill.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === 'ios';

  return (
    <View
      style={[
        styles.container,
        isIOS ? styles.containerIOS : styles.containerAndroid,
        { bottom: Math.max(insets.bottom, theme.spacing.md) },
      ]}
    >
      {isIOS ? (
        <>
          <BlurView
            intensity={40}
            tint="light"
            style={[StyleSheet.absoluteFill, styles.clip]}
            pointerEvents="none"
          />
          <View
            style={[StyleSheet.absoluteFill, styles.clip, styles.tint]}
            pointerEvents="none"
          />
        </>
      ) : null}

      {state.routes.map((route) => {
        const config = TABS[route.name];
        if (!config) return null;
        const isActive = state.routes[state.index]?.key === route.key;
        const color = isActive ? theme.colors.accent : theme.colors.textTertiary;
        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isActive && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
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
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    flexDirection: 'row',
    borderRadius: theme.radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.glassBorder,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  containerIOS: {
    backgroundColor: 'transparent',
    ...theme.shadows.lg,
  },
  containerAndroid: {
    backgroundColor: theme.colors.glassBackground,
    elevation: 8,
  },
  clip: { borderRadius: theme.radii.xl },
  tint: { backgroundColor: theme.colors.tabBarTint },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  pill: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs + 1,
    borderRadius: theme.radii.full,
  },
  pillActive: { backgroundColor: theme.colors.accentSubtle },
  label: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
  },
});
