import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../../lib/auth-context';
import { computeBalances } from '../../../lib/balances';
import { AnimatedListItem } from '../../../lib/components/AnimatedListItem';
import { AnimatedScreen } from '../../../lib/components/AnimatedScreen';
import { Button } from '../../../lib/components/Button';
import { GlassCard } from '../../../lib/components/GlassCard';
import { GradientBackground } from '../../../lib/components/GradientBackground';
import { PressableScale } from '../../../lib/components/PressableScale';
import { ScreenHeader } from '../../../lib/components/ScreenHeader';
import { Skeleton } from '../../../lib/components/Skeleton';
import { formatMoney } from '../../../lib/format';
import {
  listExpenses,
  listParticipantsForGroup,
  listPayersForGroup,
} from '../../../lib/repositories/expenses';
import { listGroups } from '../../../lib/repositories/groups';
import { listMembers } from '../../../lib/repositories/members';
import { listSettlements } from '../../../lib/repositories/settlements';
import { useTheme, type Theme } from '../../../lib/theme';
import type { Group } from '../../../lib/types';

type GroupStat = { memberCount: number; net: number };

export default function GroupsScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
  const router = useRouter();
  const { session, signOut } = useAuth();
  const currentUserId = session?.user?.id;
  const [groups, setGroups] = useState<Group[]>([]);
  const [stats, setStats] = useState<Record<string, GroupStat>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(null);
      (async () => {
        try {
          const data = await listGroups();
          if (!active) return;
          setGroups(data);
          setLoading(false);

          // One batched pass: derive each group's member count + the current
          // user's net balance (reusing the pure computeBalances helper).
          const entries = await Promise.all(
            data.map(async (g) => {
              const [mem, exp, parts, setl, pyrs] = await Promise.all([
                listMembers(g.id),
                listExpenses(g.id),
                listParticipantsForGroup(g.id),
                listSettlements(g.id),
                listPayersForGroup(g.id),
              ]);
              const balances = computeBalances(mem, exp, parts, setl, pyrs);
              const net = balances.find((b) => b.userId === currentUserId)?.net ?? 0;
              return [g.id, { memberCount: mem.length, net }] as const;
            })
          );
          if (!active) return;
          setStats(Object.fromEntries(entries));
        } catch (e) {
          if (active) {
            setError((e as Error).message);
            setLoading(false);
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [currentUserId])
  );

  return (
    <GradientBackground>
      <ScreenHeader
        title="Groups"
        right={
          <>
            <Pressable onPress={() => router.push('/groups/new')} hitSlop={8}>
              <Feather name="plus" size={22} color={t.colors.accent} />
            </Pressable>
            <Pressable onPress={() => router.push('/activity')} hitSlop={8}>
              <Feather name="bell" size={20} color={t.colors.accent} />
            </Pressable>
            <Pressable onPress={signOut} hitSlop={8}>
              <Feather name="log-out" size={20} color={t.colors.textSecondary} />
            </Pressable>
          </>
        }
      />

      {loading ? (
        <View style={styles.skeletonWrap}>
          <Skeleton height={84} radius={20} />
          <Skeleton height={84} radius={20} />
          <Skeleton height={84} radius={20} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <AnimatedScreen>
          <FlatList
            data={groups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={
              groups.length === 0 ? styles.emptyContent : styles.listContent
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="users" size={40} color={t.colors.textTertiary} />
                <Text style={styles.emptyTitle}>No groups yet</Text>
                <Text style={styles.emptyBody}>
                  Create a group to start splitting expenses with friends.
                </Text>
                <Button
                  title="Create a group"
                  onPress={() => router.push('/groups/new')}
                  style={styles.emptyButton}
                />
              </View>
            }
            renderItem={({ item, index }) => {
              const stat = stats[item.id];
              return (
                <AnimatedListItem index={index}>
                  <PressableScale onPress={() => router.push(`/groups/${item.id}`)}>
                    <GlassCard style={styles.row}>
                      {item.cover_url ? (
                        <Image source={{ uri: item.cover_url }} style={styles.thumb} />
                      ) : (
                        <View style={styles.accentBar} />
                      )}
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle}>{item.name}</Text>
                        {stat ? (
                          <Text style={styles.rowMeta}>
                            {stat.memberCount}{' '}
                            {stat.memberCount === 1 ? 'member' : 'members'}
                          </Text>
                        ) : null}
                      </View>
                      {stat ? (
                        stat.net === 0 ? (
                          <Text style={styles.settled}>Settled</Text>
                        ) : (
                          <Text
                            style={[
                              styles.net,
                              stat.net > 0 ? styles.positive : styles.negative,
                            ]}
                          >
                            {formatMoney(Math.abs(stat.net))}
                          </Text>
                        )
                      ) : null}
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
    error: {
      color: t.colors.negative,
      fontSize: t.typography.sizes.sm,
      padding: t.spacing.xl,
    },
    skeletonWrap: { padding: t.spacing.xl, gap: t.spacing.md },
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
    emptyButton: { marginTop: t.spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 18,
      paddingHorizontal: t.spacing.lg,
      paddingLeft: t.spacing.lg + 6,
      borderRadius: 20,
    },
    accentBar: {
      position: 'absolute',
      left: 0,
      top: 14,
      bottom: 14,
      width: 3,
      borderRadius: 2,
      backgroundColor: t.colors.accent,
    },
    thumb: {
      width: 40,
      height: 40,
      borderRadius: 8,
      marginRight: t.spacing.md,
      backgroundColor: t.colors.accentSubtle,
    },
    rowMain: { flex: 1, gap: 3 },
    rowTitle: {
      fontSize: 16,
      fontWeight: t.typography.weights.semibold,
      color: t.colors.textPrimary,
    },
    rowMeta: { fontSize: 12, color: t.colors.textTertiary },
    net: { fontSize: t.typography.sizes.md, fontWeight: t.typography.weights.bold },
    settled: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
    positive: { color: t.colors.positive },
    negative: { color: t.colors.negative },
  });
