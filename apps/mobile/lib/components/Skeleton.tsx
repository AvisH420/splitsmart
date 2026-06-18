import { useEffect, useRef } from 'react';
import { Animated, type DimensionValue } from 'react-native';
import { useTheme } from '../theme';

/**
 * A pulsing placeholder block for loading states. Loops opacity with the
 * native driver (no library). Compose several to skeleton out a card.
 */
export function Skeleton({
  height,
  width = '100%',
  radius,
  style,
}: {
  height: number;
  width?: DimensionValue;
  radius?: number;
  style?: object;
}) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: radius ?? t.radii.md,
          backgroundColor: t.colors.surfaceBorder,
          opacity,
        },
        style,
      ]}
    />
  );
}
