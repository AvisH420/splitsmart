import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { AnimatedListItem } from '../../../../lib/components/AnimatedListItem';
import { AnimatedScreen } from '../../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../../lib/components/Avatar';
import { GradientBackground } from '../../../../lib/components/GradientBackground';
import { ScreenHeader } from '../../../../lib/components/ScreenHeader';
import { formatMoney } from '../../../../lib/format';
import { listActivity } from '../../../../lib/repositories/activity';
import { theme } from '../../../../lib/theme';
import type { ActivityItem } from '../../../../lib/types';

function describe(item: ActivityItem): { name: string; text: string; amount?: string } {
  switch (item.kind) {
    case 'expense':
      return {
        name: item.payerName,
        text: `${item.payerName} added "${item.title}"${item.edited ? ' (edited)' : ''}`,
        amount: formatMoney(item.amount, item.currency),
      };
    case 'settlement':
      return {
        name: item.fromName,
        text: item.recordedByName
          ? `${item.fromName} paid ${item.toName} (logged by ${item.recordedByName})`
          : `${item.fromName} paid ${item.toName}`,
        amount: formatMoney(item.amount),
      };
    case 'member_joined':
      return { name: item.name, text: `${item.name} joined the group` };
  }
}

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(null);
      listActivity(id)
        .then((data) => active && setItems(data))
        .catch((e) => active && setError(e.message))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [id])
  );

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Activity" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={theme.colors.accent} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <AnimatedScreen>
          <FlatList
            data={items}
            keyExtractor={(it) => `${it.kind}:${it.id}`}
            contentContainerStyle={
              items.length === 0 ? styles.emptyContent : styles.listContent
            }
            ListEmptyComponent={
              <Text style={styles.empty}>No activity yet.</Text>
            }
            renderItem={({ item, index }) => {
              const d = describe(item);
              const isLast = index === items.length - 1;
              return (
                <AnimatedListItem index={index}>
                  <View style={styles.row}>
                    <View style={styles.rail}>
                      {!isLast ? <View style={styles.line} /> : null}
                      <Avatar name={d.name} uri={item.avatarUrl} size={40} />
                    </View>
                    <View style={styles.body}>
                      <Text style={styles.text}>{d.text}</Text>
                      <Text style={styles.date}>{new Date(item.at).toLocaleString()}</Text>
                    </View>
                    {d.amount ? <Text style={styles.amount}>{d.amount}</Text> : null}
                  </View>
                </AnimatedListItem>
              );
            }}
          />
        </AnimatedScreen>
      )}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  error: {
    color: theme.colors.negative,
    fontSize: theme.typography.sizes.sm,
    padding: theme.spacing.xl,
  },
  listContent: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl },
  emptyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: theme.colors.textTertiary, fontSize: theme.typography.sizes.base },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  rail: { width: 40, alignItems: 'center', paddingBottom: theme.spacing.lg },
  line: {
    position: 'absolute',
    top: 40,
    bottom: -theme.spacing.lg,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: theme.colors.hairline,
  },
  body: { flex: 1, gap: 2, paddingTop: theme.spacing.xs },
  text: { fontSize: theme.typography.sizes.base, color: theme.colors.textPrimary },
  date: { fontSize: theme.typography.sizes.xs, color: theme.colors.textTertiary },
  amount: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    paddingTop: theme.spacing.xs,
  },
});
