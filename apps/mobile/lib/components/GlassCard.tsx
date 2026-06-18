import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

/**
 * Frosted-glass surface for cards, modals and sheets. On iOS the container is
 * transparent over a BlurView (tinted to the scheme) with a faint warm wash and
 * a hairline border - so it frosts the background like architectural glass. On
 * Android it falls back to the solid warm surface fill. Dark-mode aware.
 */
export function GlassCard({
  children,
  style,
  intensity = 22,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  intensity?: number;
}) {
  const t = useTheme();
  const isIOS = Platform.OS === 'ios';
  return (
    <View
      style={[
        styles.card,
        { borderColor: t.colors.glassBorder, ...t.shadows.sm },
        isIOS ? styles.transparent : { backgroundColor: t.colors.glassBackground },
        style,
      ]}
    >
      {isIOS ? (
        <>
          <BlurView
            intensity={intensity}
            tint={t.blurTint}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.glassTint }]}
            pointerEvents="none"
          />
        </>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  transparent: { backgroundColor: 'transparent' },
});
