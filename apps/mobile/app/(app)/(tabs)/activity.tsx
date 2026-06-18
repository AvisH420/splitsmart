import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../../lib/components/Avatar';
import { GlassCard } from '../../../lib/components/GlassCard';
import { GradientBackground } from '../../../lib/components/GradientBackground';
import { ScreenHeader } from '../../../lib/components/ScreenHeader';
import { formatMoney } from '../../../lib/format';
import { listActivity } from '../../../lib/repositories/activity';
import { listGroups } from '../../../lib/repositories/groups';
import { theme } from '../../../lib/theme';
import type { ActivityItem } from '../../../lib/types';

type FeedItem = ActivityItem & { groupId: string; groupName: string };

function describe(item: ActivityItem): { name: string; text: string; amount?: string } {
  switch (item.kind) {
    case 'expense':
      return {
        name: item.payerName,
        text: `${item.payerName} added “${item.title}”${item.edited ? ' (edited)' : ''}`,
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

export default function GlobalActivityScreen() {
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(null);
      (async () => {
        try {
          const groups = await listGroups();
          const perGroup = await Promise.all(
            groups.map((g) =>
              listActivity(g.id).then((list) =>
                list.map((i) => ({ ...i, groupId: g.id, groupName: g.name }))
              )
            )
          );
          if (!active) return;
          const merged = perGroup
            .flat()
            .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
            .slice(0, 50);
          setItems(merged);
        } catch (e) {
          if (active) setError((e as Error).message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <GradientBackground>
      <ScreenHeader title="Activity" />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={theme.colors.accent} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.kind}:${it.id}`}
          contentContainerStyle={
            items.length === 0 ? styles.emptyContent : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="activity" size={40} color={theme.colors.textTertiary} />
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptyBody}>
                Expenses and settlements across your groups will show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const d = describe(item);
            return (
              <Pressable onPress={() => router.push(`/groups/${item.groupId}`)}>
                <GlassCard style={styles.row}>
                  <Avatar name={d.name} uri={item.avatarUrl} size={40} />
                  <View style={styles.body}>
                    <Text style={styles.text}>{d.text}</Text>
                    <Text style={styles.meta}>
                      {item.groupName} · {new Date(item.at).toLocaleDateString()}
                    </Text>
                  </View>
                  {d.amount ? <Text style={styles.amount}>{d.amount}</Text> : null}
                </GlassCard>
              </Pressable>
            );
          }}
        />
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
  listContent: {
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xxxl * 2,
  },
  emptyContent: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl },
  empty: { alignItems: 'center', gap: theme.spacing.md },
  emptyTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  emptyBody: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  body: { flex: 1, gap: 2 },
  text: { fontSize: theme.typography.sizes.base, color: theme.colors.textPrimary },
  meta: { fontSize: theme.typography.sizes.sm, color: theme.colors.textTertiary },
  amount: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
});
