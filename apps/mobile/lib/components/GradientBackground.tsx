import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { theme } from '../theme';

/**
 * Full-screen warm cream -> white vertical gradient. Wraps the root of every
 * screen, replacing plain View / SafeAreaView backgrounds.
 */
export function GradientBackground({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <LinearGradient
      colors={[theme.colors.backgroundStart, theme.colors.backgroundEnd]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.fill, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
