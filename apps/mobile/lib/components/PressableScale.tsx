import { useRef, type ReactNode } from 'react';
import { Animated, Pressable, type ViewStyle } from 'react-native';

/**
 * A Pressable whose content springs down slightly on press — the standard
 * tactile feedback for cards and rows across the app.
 */
export function PressableScale({
  children,
  onPress,
  style,
  scaleTo = 0.97,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  scaleTo?: number;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => spring(scaleTo)}
      onPressOut={() => spring(1)}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
