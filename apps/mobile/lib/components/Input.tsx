import { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { theme } from '../theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type FocusHandler = NonNullable<TextInputProps['onFocus']>;
type BlurHandler = NonNullable<TextInputProps['onBlur']>;

/**
 * Themed text field. Shows an optional label above and animates its border
 * colour to the accent on focus. Forwards all TextInput props.
 */
export function Input({
  label,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label?: string }) {
  const focus = useRef(new Animated.Value(0)).current;

  const animate = (toValue: number) =>
    Animated.timing(focus, {
      toValue,
      duration: 150,
      useNativeDriver: false,
    }).start();

  const borderColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.surfaceBorder, theme.colors.accent],
  });

  const handleFocus: FocusHandler = (e) => {
    animate(1);
    onFocus?.(e);
  };
  const handleBlur: BlurHandler = (e) => {
    animate(0);
    onBlur?.(e);
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <AnimatedTextInput
        placeholderTextColor={theme.colors.textTertiary}
        {...props}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[styles.input, { borderColor }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.xs },
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textSecondary,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 11,
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textPrimary,
  },
});
