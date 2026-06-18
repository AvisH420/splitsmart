import { Feather } from '@expo/vector-icons';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useAuth } from '../../../../lib/auth-context';
import { computeBalances } from '../../../../lib/balances';
import { EXPENSE_CATEGORIES } from '../../../../lib/categories';
import { AnimatedListItem } from '../../../../lib/components/AnimatedListItem';
import { AnimatedMoney } from '../../../../lib/components/AnimatedMoney';
import { AnimatedScreen } from '../../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../../lib/components/Avatar';
import { Button } from '../../../../lib/components/Button';
import { GlassCard } from '../../../../lib/components/GlassCard';
import { GradientBackground } from '../../../../lib/components/GradientBackground';
import { Input } from '../../../../lib/components/Input';
import { PressableScale } from '../../../../lib/components/PressableScale';
import { ScreenHeader } from '../../../../lib/components/ScreenHeader';
import { formatMoney } from '../../../../lib/format';
import {
  listExpenses,
  listParticipantsForGroup,
} from '../../../../lib/repositories/expenses';
import { getGroup } from '../../../../lib/repositories/groups';
import { listMembers } from '../../../../lib/repositories/members';
import { listMemories } from '../../../../lib/repositories/memories';
import { listSettlements } from '../../../../lib/repositories/settlements';
import { theme } from '../../../../lib/theme';
import type {
  Expense,
  ExpenseCategory,
  Group,
  GroupMemberWithProfile,
  GroupMemory,
  MemberBalance,
} from '../../../../lib/types';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [memories, setMemories] = useState<GroupMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expenseQuery, setExpenseQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | null>(null);

  const filteredExpenses = useMemo(() => {
    const q = expenseQuery.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        (q === '' || e.title.toLowerCase().includes(q)) &&
        (categoryFilter === null || e.category === categoryFilter)
    );
  }, [expenses, expenseQuery, categoryFilter]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(null);
      (async () => {
        try {
          const [g, mem, exp, parts, setl, mems] = await Promise.all([
            getGroup(id),
            listMembers(id),
            listExpenses(id),
            listParticipantsForGroup(id),
            listSettlements(id),
            listMemories(id),
          ]);
          if (!active) return;
          setGroup(g);
          setMembers(mem);
          setExpenses(exp);
          setBalances(computeBalances(mem, exp, parts, setl));
          setMemories(mems);
        } catch (e) {
          if (active) setError((e as Error).message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [id])
  );

  const nameFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile.display_name ?? 'Someone';
  const memoriesFor = (userId: string) =>
    memories.filter((m) => m.subject_user_id === userId);

  const myNet = balances.find((b) => b.userId === currentUserId)?.net ?? 0;
  const totalSpent = expenses.reduce((a, e) => a + e.total_amount, 0);

  const header = (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={group?.name ?? 'Group'}
        onBack={() => router.back()}
        right={
          <>
            <Pressable
              onPress={() => router.push({ pathname: '/assistant', params: { group_id: id } })}
              hitSlop={8}
            >
              <Feather name="zap" size={20} color={theme.colors.accent} />
            </Pressable>
            <Pressable onPress={() => router.push(`/groups/${id}/receipt`)} hitSlop={8}>
              <Feather name="camera" size={20} color={theme.colors.accent} />
            </Pressable>
            <Pressable onPress={() => router.push(`/groups/${id}/activity`)} hitSlop={8}>
              <Feather name="clock" size={20} color={theme.colors.accent} />
            </Pressable>
          </>
        }
      />
    </>
  );

  if (loading) {
    return (
      <GradientBackground>
        {header}
        <ActivityIndicator style={styles.center} size="large" color={theme.colors.accent} />
      </GradientBackground>
    );
  }
  if (error) {
    return (
      <GradientBackground>
        {header}
        <Text style={styles.error}>{error}</Text>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      {header}
      <AnimatedScreen>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Balance hero */}
            <GlassCard style={styles.hero}>
              <Text style={styles.heroLabel}>Your balance</Text>
              {myNet === 0 ? (
                <Text style={[styles.heroAmount, styles.neutral]}>All settled</Text>
              ) : (
                <AnimatedMoney
                  value={Math.abs(myNet)}
                  style={[styles.heroAmount, myNet > 0 ? styles.positive : styles.negative]}
                />
              )}
              {myNet !== 0 ? (
                <Text style={styles.heroSub}>
                  {myNet > 0 ? 'you are owed overall' : 'you owe overall'}
                </Text>
              ) : null}

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <AnimatedMoney value={totalSpent} style={styles.statValue} />
                  <Text style={styles.statLabel}>Total spent</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{expenses.length}</Text>
                  <Text style={styles.statLabel}>
                    {expenses.length === 1 ? 'Expense' : 'Expenses'}
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{members.length}</Text>
                  <Text style={styles.statLabel}>
                    {members.length === 1 ? 'Member' : 'Members'}
                  </Text>
                </View>
              </View>

              <Button
                title="Settle up"
                variant="secondary"
                onPress={() => router.push(`/groups/${id}/settle`)}
                style={styles.heroButton}
              />
            </GlassCard>

            {/* Balances */}
            <Text style={styles.sectionTitle}>Balances</Text>
            <GlassCard style={styles.listCard}>
              {balances.map((b, i) => (
                <View
                  key={b.userId}
                  style={[styles.listRow, i > 0 && styles.divider]}
                >
                  <Avatar
                    name={b.displayName}
                    uri={members.find((m) => m.user_id === b.userId)?.profile.avatar_url}
                    size={36}
                  />
                  <Text style={styles.rowName}>{b.displayName}</Text>
                  <View style={styles.balanceRight}>
                    <Text
                      style={[
                        styles.balanceAmount,
                        b.net > 0 ? styles.positive : b.net < 0 ? styles.negative : styles.neutral,
                      ]}
                    >
                      {b.net === 0 ? 'settled' : formatMoney(Math.abs(b.net))}
                    </Text>
                    {b.net !== 0 ? (
                      <Text style={styles.balanceLabel}>
                        {b.net > 0 ? 'owed' : 'owes'}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </GlassCard>

            {/* Members */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Members</Text>
              <Pressable
                onPress={() => router.push(`/groups/${id}/members`)}
                hitSlop={8}
                style={styles.sectionAction}
              >
                <Feather name="user-plus" size={16} color={theme.colors.accent} />
                <Text style={styles.actionText}>Invite</Text>
              </Pressable>
            </View>
            <GlassCard style={styles.listCard}>
              {members.map((m, i) => (
                <View
                  key={m.user_id}
                  style={[styles.listRow, i > 0 && styles.divider]}
                >
                  <Avatar name={m.profile.display_name} uri={m.profile.avatar_url} size={36} />
                  <Text style={styles.rowName}>{m.profile.display_name}</Text>
                  {memoriesFor(m.user_id).length > 0 ? (
                    <Pressable
                      onPress={() =>
                        router.push({ pathname: '/assistant', params: { group_id: id } })
                      }
                      hitSlop={8}
                    >
                      <Feather name="cpu" size={16} color={theme.colors.accentLight} />
                    </Pressable>
                  ) : null}
                  <Text style={styles.roleBadge}>{m.role}</Text>
                </View>
              ))}
            </GlassCard>

            {/* Expenses */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Expenses</Text>
              <Pressable
                onPress={() => router.push(`/groups/${id}/expense`)}
                hitSlop={8}
                style={styles.sectionAction}
              >
                <Feather name="plus" size={16} color={theme.colors.accent} />
                <Text style={styles.actionText}>Add</Text>
              </Pressable>
            </View>

            {expenses.length === 0 ? (
              <GlassCard style={styles.emptyCard}>
                <Feather name="file-text" size={32} color={theme.colors.textTertiary} />
                <Text style={styles.emptyTitle}>No expenses yet</Text>
                <Text style={styles.emptyBody}>
                  Add one manually, describe it to the assistant, or scan a receipt.
                </Text>
              </GlassCard>
            ) : (
              <>
                <Input
                  placeholder="Search expenses"
                  value={expenseQuery}
                  onChangeText={setExpenseQuery}
                  autoCapitalize="none"
                  style={styles.search}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                  keyboardShouldPersistTaps="handled"
                >
                  <FilterChip
                    label="All"
                    active={categoryFilter === null}
                    onPress={() => setCategoryFilter(null)}
                  />
                  {EXPENSE_CATEGORIES.map((c) => (
                    <FilterChip
                      key={c.value}
                      label={c.label}
                      active={categoryFilter === c.value}
                      onPress={() =>
                        setCategoryFilter((cur) => (cur === c.value ? null : c.value))
                      }
                    />
                  ))}
                </ScrollView>

                {filteredExpenses.length === 0 ? (
                  <Text style={styles.noMatch}>No expenses match your filters.</Text>
                ) : (
                  <View style={styles.expenseList}>
                    {filteredExpenses.map((e, i) => (
                      <AnimatedListItem key={e.id} index={i}>
                      <PressableScale
                        onPress={() => router.push(`/groups/${id}/expenses/${e.id}`)}
                      >
                        <GlassCard style={styles.expenseRow}>
                          <View style={styles.expenseMain}>
                            <Text style={styles.expenseTitle}>{e.title}</Text>
                            <Text style={styles.expenseMeta}>{nameFor(e.paid_by)} paid</Text>
                          </View>
                          <Text style={styles.expenseAmount}>
                            {formatMoney(e.total_amount, e.currency)}
                          </Text>
                        </GlassCard>
                      </PressableScale>
                      </AnimatedListItem>
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </AnimatedScreen>
    </GradientBackground>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.spacing.xl, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
  center: { flex: 1 },
  error: {
    color: theme.colors.negative,
    fontSize: theme.typography.sizes.sm,
    padding: theme.spacing.xl,
  },
  hero: { padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.xs },
  heroLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textSecondary,
  },
  heroAmount: {
    fontSize: theme.typography.sizes.display,
    fontWeight: theme.typography.weights.heavy,
  },
  heroSub: { fontSize: theme.typography.sizes.sm, color: theme.colors.textTertiary },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.hairline,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: '70%',
    backgroundColor: theme.colors.hairline,
  },
  statValue: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  statLabel: { fontSize: theme.typography.sizes.xs, color: theme.colors.textTertiary },
  heroButton: { marginTop: theme.spacing.lg, alignSelf: 'stretch' },
  sectionTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  actionText: {
    color: theme.colors.accent,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  listCard: { paddingHorizontal: theme.spacing.lg },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.hairline,
  },
  rowName: {
    flex: 1,
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textPrimary,
  },
  balanceRight: { alignItems: 'flex-end' },
  balanceAmount: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.bold,
  },
  balanceLabel: { fontSize: theme.typography.sizes.xs, color: theme.colors.textTertiary },
  roleBadge: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textTertiary,
    textTransform: 'capitalize',
  },
  positive: { color: theme.colors.positive },
  negative: { color: theme.colors.negative },
  neutral: { color: theme.colors.textSecondary },
  search: { marginBottom: theme.spacing.xs },
  filterRow: { flexDirection: 'row', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  filterChip: {
    backgroundColor: theme.colors.accentSubtle,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
  },
  filterChipActive: { backgroundColor: theme.colors.accent },
  filterChipText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.accent,
  },
  filterChipTextActive: { color: theme.colors.white },
  expenseList: { gap: theme.spacing.sm },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  expenseMain: { flex: 1, gap: 2 },
  expenseTitle: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  expenseMeta: { fontSize: theme.typography.sizes.sm, color: theme.colors.textTertiary },
  expenseAmount: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  noMatch: {
    color: theme.colors.textTertiary,
    fontSize: theme.typography.sizes.sm,
    paddingVertical: theme.spacing.sm,
  },
  emptyCard: { padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm },
  emptyTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  emptyBody: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
