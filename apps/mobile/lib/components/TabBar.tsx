import { Feather } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import type { ComponentProps } from 'react';
import { useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

const TABS: Record<string, { label: string; icon: FeatherName }> = {
  index: { label: 'Groups', icon: 'home' },
  activity: { label: 'Activity', icon: 'activity' },
  assistant: { label: 'Assistant', icon: 'zap' },
  profile: { label: 'Profile', icon: 'user' },
};

/**
 * Floating frosted-glass pill tab bar. The BlurView is the entire background
 * (tinted to the active scheme) with a warm wash, a hairline border and a soft
 * hovering shadow. Active tab: an accentSubtle pill with icon + label in
 * accent. Inactive: icon only in textTertiary. Icons spring on press.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const isIOS = Platform.OS === 'ios';

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: t.colors.glassBorder,
          bottom: Math.max(insets.bottom, t.spacing.md),
          ...(isIOS
            ? t.shadows.lg
            : { backgroundColor: t.colors.glassBackground, elevation: 10 }),
        },
      ]}
    >
      {isIOS ? (
        <>
          <BlurView
            intensity={40}
            tint={t.blurTint}
            style={[StyleSheet.absoluteFill, styles.clip]}
            pointerEvents="none"
          />
          <View
            style={[StyleSheet.absoluteFill, styles.clip, { backgroundColor: t.colors.tabBarTint }]}
            pointerEvents="none"
          />
        </>
      ) : null}

      {state.routes.map((route) => {
        const config = TABS[route.name];
        if (!config) return null;
        const isActive = state.routes[state.index]?.key === route.key;
        return (
          <TabItem
            key={route.key}
            label={config.label}
            icon={config.icon}
            active={isActive}
            theme={t}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isActive && !event.defaultPrevented) navigation.navigate(route.name);
            }}
          />
        );
      })}
    </View>
  );
}

function TabItem({
  label,
  icon,
  active,
  theme: t,
  onPress,
}: {
  label: string;
  icon: FeatherName;
  active: boolean;
  theme: Theme;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
  const color = active ? t.colors.accent : t.colors.textTertiary;

  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={() => spring(0.86)}
      onPressOut={() => spring(1)}
      hitSlop={6}
    >
      <Animated.View
        style={[
          styles.pill,
          active && { backgroundColor: t.colors.accentSubtle },
          active && styles.pillActive,
          { transform: [{ scale }] },
        ]}
      >
        <Feather name={icon} size={20} color={color} />
        {active ? (
          <Text style={[styles.label, { color }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : undefined,
  },
  clip: { borderRadius: 24 },
  tab: { flex: 1, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9999,
  },
  pillActive: { paddingHorizontal: 16 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
});
