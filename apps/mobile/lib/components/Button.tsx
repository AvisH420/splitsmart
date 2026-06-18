import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
}) {
  const t = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;
  const accentText = variant !== 'primary';

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  const variantStyle: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: t.colors.accent }
      : variant === 'secondary'
        ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.colors.accent }
        : { backgroundColor: 'transparent' };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isDisabled}
        style={[styles.base, variantStyle, isDisabled && styles.disabled, style]}
      >
        {loading ? (
          <ActivityIndicator color={accentText ? t.colors.accent : t.colors.onAccent} />
        ) : (
          <Text
            style={[styles.text, { color: accentText ? t.colors.accent : t.colors.onAccent }]}
          >
            {title}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  disabled: { opacity: 0.45 },
  text: { fontSize: 15, fontWeight: '600', letterSpacing: 0.2 },
});
