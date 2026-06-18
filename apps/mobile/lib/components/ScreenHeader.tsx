import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

/**
 * Replaces the native navigation header. An editorial serif title on the left,
 * an optional back chevron, and arbitrary right-side icon buttons, over a
 * hairline bottom border. Dark-mode aware.
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
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + t.spacing.sm,
          borderBottomColor: t.colors.hairline,
        },
      ]}
    >
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
          <Feather name="chevron-left" size={26} color={t.colors.textPrimary} />
        </Pressable>
      ) : null}
      <Text style={[styles.title, { color: t.colors.textPrimary }]} numberOfLines={1}>
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
    gap: 8,
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { marginLeft: -8 },
  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
