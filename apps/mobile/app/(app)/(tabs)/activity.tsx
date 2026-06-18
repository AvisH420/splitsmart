import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { AnimatedListItem } from '../../../lib/components/AnimatedListItem';
import { AnimatedScreen } from '../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../lib/components/Avatar';
import { GlassCard } from '../../../lib/components/GlassCard';
import { GradientBackground } from '../../../lib/components/GradientBackground';
import { PressableScale } from '../../../lib/components/PressableScale';
import { ScreenHeader } from '../../../lib/components/ScreenHeader';
import { formatMoney } from '../../../lib/format';
import { listActivity } from '../../../lib/repositories/activity';
import { listGroups } from '../../../lib/repositories/groups';
import { useTheme, type Theme } from '../../../lib/theme';
import type { ActivityItem } from '../../../lib/types';

type FeedItem = ActivityItem & { groupId: string; groupName: string };

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

export default function GlobalActivityScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
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
            <View style={styles.empty}>
              <Feather name="activity" size={40} color={t.colors.textTertiary} />
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptyBody}>
                Expenses and settlements across your groups will show up here.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const d = describe(item);
            return (
              <AnimatedListItem index={index}>
                <PressableScale onPress={() => router.push(`/groups/${item.groupId}`)}>
                  <GlassCard style={styles.row}>
                    <Avatar name={d.name} uri={item.avatarUrl} size={40} />
                    <View style={styles.body}>
                      <Text style={styles.text}>{d.text}</Text>
                      <Text style={styles.meta}>
                        {item.groupName} - {new Date(item.at).toLocaleDateString()}
                      </Text>
                    </View>
                    {d.amount ? <Text style={styles.amount}>{d.amount}</Text> : null}
                  </GlassCard>
                </PressableScale>
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
  listContent: {
    padding: t.spacing.xl,
    gap: t.spacing.md,
    paddingBottom: t.spacing.xxxl * 2,
  },
  emptyContent: { flexGrow: 1, justifyContent: 'center', padding: t.spacing.xl },
  empty: { alignItems: 'center', gap: t.spacing.md },
  emptyTitle: {
    fontSize: t.typography.sizes.lg,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
  },
  emptyBody: {
    fontSize: t.typography.sizes.base,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    padding: t.spacing.md,
  },
  body: { flex: 1, gap: 2 },
  text: { fontSize: t.typography.sizes.base, color: t.colors.textPrimary },
  meta: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
  amount: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
  },
});
