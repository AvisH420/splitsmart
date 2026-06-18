import { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '../theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type FocusHandler = NonNullable<TextInputProps['onFocus']>;
type BlurHandler = NonNullable<TextInputProps['onBlur']>;

/**
 * Themed text field. Optional label above; border animates to the accent on
 * focus. Forwards all TextInput props. Dark-mode aware.
 */
export function Input({
  label,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label?: string }) {
  const t = useTheme();
  const focus = useRef(new Animated.Value(0)).current;

  const animate = (toValue: number) =>
    Animated.timing(focus, { toValue, duration: 150, useNativeDriver: false }).start();

  const borderColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [t.colors.surfaceBorder, t.colors.accent],
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
      {label ? (
        <Text style={[styles.label, { color: t.colors.textSecondary }]}>{label}</Text>
      ) : null}
      <AnimatedTextInput
        placeholderTextColor={t.colors.textTertiary}
        {...props}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.input,
          { backgroundColor: t.colors.surface, color: t.colors.textPrimary, borderColor },
          style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 13, fontWeight: '500', letterSpacing: 0.3 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
});
