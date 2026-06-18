import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../theme';

/**
 * Frosted-glass surface for cards, modals and sheets. On iOS the content sits
 * over a BlurView for the frosted effect; on Android (where BlurView is not
 * effective) it falls back to the solid glassBackground colour.
 */
export function GlassCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return (
    <View style={[styles.card, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={20}
          tint="light"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.glassBackground,
    borderColor: theme.colors.glassBorder,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
});
