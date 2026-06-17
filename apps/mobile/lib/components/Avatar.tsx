import { Image, StyleSheet, Text, View } from 'react-native';

/**
 * Circular avatar: shows the profile photo when `uri` is set, otherwise the
 * person's initials on a tinted circle. Used anywhere a member is named
 * (member list, expense detail, activity feed, profile screen).
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
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>
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
  image: { backgroundColor: '#eee' },
  fallback: {
    backgroundColor: '#cce8dd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: '#1d9e75', fontWeight: '700' },
});
