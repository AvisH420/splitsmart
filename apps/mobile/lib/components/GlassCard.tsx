import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../theme';

/**
 * Frosted-glass surface for cards, modals and sheets.
 *
 * On iOS the container is transparent so a BlurView can actually frost the
 * warm gradient behind it; a faint warm tint + a top highlight hairline give
 * it body without going opaque. On Android (no real backdrop blur) it falls
 * back to the solid warm `glassBackground`.
 */
export function GlassCard({
  children,
  style,
  intensity = 24,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  intensity?: number;
}) {
  const isIOS = Platform.OS === 'ios';
  return (
    <View style={[styles.card, isIOS ? styles.cardIOS : styles.cardAndroid, style]}>
      {isIOS ? (
        <>
          <BlurView
            intensity={intensity}
            tint="light"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
        </>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.glassBorder,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  cardIOS: { backgroundColor: 'transparent' },
  cardAndroid: { backgroundColor: theme.colors.glassBackground },
  tint: { backgroundColor: theme.colors.glassTint },
});
