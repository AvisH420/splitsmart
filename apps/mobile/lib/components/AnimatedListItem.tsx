import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

/**
 * Staggered list-item entrance: each item fades in + rises a few px, delayed by
 * its index so a list cascades in on load. Delay is capped so long lists don't
 * crawl.
 */
export function AnimatedListItem({
  index,
  children,
  style,
}: {
  index: number;
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const delay = Math.min(index, 12) * 50;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, index]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
