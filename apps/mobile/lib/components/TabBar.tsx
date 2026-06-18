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
 * Floating frosted-glass pill tab bar (see docs/design-references/
 * whatsapp-navbar.jpg). A strong BlurView background with a warm tint overlay,
 * a bright top edge, and a shadow that lifts it off the content. Inset from the
 * screen edges, clearing the home indicator. Active tab gets a rounded-rect
 * accentSubtle background with icon + label; inactive tabs are icon-only.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const t = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          bottom: Math.max(insets.bottom, 12),
          borderColor: t.colors.tabBarBorder,
          shadowColor: t.shadows.sm.shadowColor,
        },
      ]}
    >
      <BlurView
        intensity={55}
        tint={t.blurTint}
        style={[StyleSheet.absoluteFill, styles.clip]}
        pointerEvents="none"
      />
      <View
        style={[StyleSheet.absoluteFill, styles.clip, { backgroundColor: t.colors.tabBarTint }]}
        pointerEvents="none"
      />

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
          styles.itemInner,
          active && { backgroundColor: t.colors.accentSubtle },
          { transform: [{ scale }] },
        ]}
      >
        <Feather name={icon} size={active ? 24 : 22} color={color} />
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
    borderWidth: 0.5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(236,230,217,0.92)',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  clip: { borderRadius: 24 },
  tab: { flex: 1, alignItems: 'center' },
  itemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
});
