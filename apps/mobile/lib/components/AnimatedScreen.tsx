import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

/**
 * Wraps a screen's content and plays an entrance on mount.
 * - 'screen' (default): fade in + slide up a few px (timing, calm).
 * - 'modal': spring up from further below with a slight overshoot, for sheets.
 */
export function AnimatedScreen({
  children,
  style,
  variant = 'screen',
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  variant?: 'screen' | 'modal';
}) {
  const isModal = variant === 'modal';
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(isModal ? 48 : 20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: isModal ? 220 : 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      isModal
        ? Animated.spring(translateY, {
            toValue: 0,
            tension: 60,
            friction: 12,
            useNativeDriver: true,
          })
        : Animated.timing(translateY, {
            toValue: 0,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
    ]).start();
  }, [opacity, translateY, isModal]);

  return (
    <Animated.View style={[{ flex: 1, opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
