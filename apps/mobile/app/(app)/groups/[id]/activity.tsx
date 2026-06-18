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
import { useTheme, type Theme } from '../../../../lib/theme';
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
  const t = useTheme();
  const styles = makeStyles(t);
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
        <ActivityIndicator style={styles.center} size="large" color={t.colors.accent} />
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  center: { flex: 1 },
  error: {
    color: t.colors.negative,
    fontSize: t.typography.sizes.sm,
    padding: t.spacing.xl,
  },
  listContent: { padding: t.spacing.xl, paddingBottom: t.spacing.xxxl },
  emptyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: t.colors.textTertiary, fontSize: t.typography.sizes.base },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md },
  rail: { width: 40, alignItems: 'center', paddingBottom: t.spacing.lg },
  line: {
    position: 'absolute',
    top: 40,
    bottom: -t.spacing.lg,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: t.colors.hairline,
  },
  body: { flex: 1, gap: 2, paddingTop: t.spacing.xs },
  text: { fontSize: t.typography.sizes.base, color: t.colors.textPrimary },
  date: { fontSize: t.typography.sizes.xs, color: t.colors.textTertiary },
  amount: {
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
    paddingTop: t.spacing.xs,
  },
});
