import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

/**
 * Circular avatar: shows the profile photo when `uri` is set, otherwise the
 * person's initials on a tinted circle. Dark-mode aware.
 */
export function Avatar({
  name,
  uri,
  size = 36,
}: {
  name: string;
  uri?: string | null;
  size?: number;
}) {
  const t = useTheme();
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[dimension, { backgroundColor: t.colors.accentSubtle }]}
      />
    );
  }

  return (
    <View style={[dimension, styles.fallback, { backgroundColor: t.colors.accentSubtle }]}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: t.colors.accent }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/** First letters of up to two name words, uppercased. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
