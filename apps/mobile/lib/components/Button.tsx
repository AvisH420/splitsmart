import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import { theme } from '../theme';

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
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  const accentText = variant !== 'primary';

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isDisabled}
        style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
      >
        {loading ? (
          <ActivityIndicator
            color={accentText ? theme.colors.accent : theme.colors.white}
          />
        ) : (
          <Text style={[styles.text, accentText ? styles.textAccent : styles.textOnAccent]}>
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
    borderRadius: theme.radii.full,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.xxl - 4,
  },
  primary: { backgroundColor: theme.colors.accent },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  text: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
  },
  textOnAccent: { color: theme.colors.white },
  textAccent: { color: theme.colors.accent },
});
