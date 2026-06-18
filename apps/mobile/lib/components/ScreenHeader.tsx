import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';

/**
 * Replaces the native navigation header. Large heavy title on the left, an
 * optional back chevron, and arbitrary right-side icon buttons. Subtle bottom
 * border. Screens set headerShown: false and render this at the top instead.
 */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
          <Feather name="chevron-left" size={26} color={theme.colors.textPrimary} />
        </Pressable>
      ) : null}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.surfaceBorder,
  },
  back: { marginLeft: -theme.spacing.sm },
  title: {
    flex: 1,
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.textPrimary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
});
