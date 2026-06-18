import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

/**
 * The warm foundation under every screen. A vertical linen gradient (lighter
 * at the top, as if lit from above) with a faint vignette layer for depth.
 * Responds to light/dark. Replaces plain View / SafeAreaView roots.
 */
export function GradientBackground({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <View style={styles.fill}>
      <LinearGradient
        colors={[t.colors.backgroundStart, t.colors.backgroundEnd]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Soft "light from above": transparent at top, faint warmth pooling low. */}
      <LinearGradient
        colors={['transparent', 'transparent', t.colors.vignette]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.fill, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
