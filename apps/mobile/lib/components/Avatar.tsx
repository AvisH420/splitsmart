import { Image, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

/**
 * Circular avatar: shows the profile photo when `uri` is set, otherwise the
 * person's initials on a tinted circle. Used anywhere a member is named.
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
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimension]} />;
  }

  return (
    <View style={[styles.fallback, dimension]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
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
  image: { backgroundColor: theme.colors.accentSubtle },
  fallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: theme.colors.accent, fontWeight: '700' },
});
