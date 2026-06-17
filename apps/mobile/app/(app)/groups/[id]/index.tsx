import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Avatar } from '../../../../lib/components/Avatar';
import { computeBalances } from '../../../../lib/balances';
import { EXPENSE_CATEGORIES } from '../../../../lib/categories';
import { computeGroupSummary, type GroupSummary } from '../../../../lib/stats';
import { formatMoney } from '../../../../lib/format';
import {
  listExpenses,
  listParticipantsForGroup,
} from '../../../../lib/repositories/expenses';
import { getGroup } from '../../../../lib/repositories/groups';
import { listMembers } from '../../../../lib/repositories/members';
import { listSettlements } from '../../../../lib/repositories/settlements';
import type {
  Expense,
  ExpenseCategory,
  Group,
  GroupMemberWithProfile,
  MemberBalance,
} from '../../../../lib/types';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Client-side search/filter state (data is already loaded; no new queries).
  const [memberQuery, setMemberQuery] = useState('');
  const [expenseQuery, setExpenseQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | null>(null);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      m.profile.display_name.toLowerCase().includes(q)
    );
  }, [members, memberQuery]);

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
          const [g, mem, exp, parts, setl] = await Promise.all([
            getGroup(id),
            listMembers(id),
            listExpenses(id),
            listParticipantsForGroup(id),
            listSettlements(id),
          ]);
          if (!active) return;
          setGroup(g);
          setMembers(mem);
          setExpenses(exp);
          setBalances(computeBalances(mem, exp, parts, setl));
          setSummary(computeGroupSummary(mem, exp, parts, setl));
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

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }
  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  const nameFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile.display_name ?? 'Someone';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: group?.name ?? 'Group',
          headerRight: () => (
            <Pressable onPress={() => router.push(`/groups/${id}/activity`)} hitSlop={8}>
              <Text style={styles.action}>Activity</Text>
            </Pressable>
          ),
        }}
      />

      {/* Summary */}
      {summary ? (
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {formatMoney(summary.totalSpent)}
            </Text>
            <Text style={styles.summaryLabel}>Total spent</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.expenseCount}</Text>
            <Text style={styles.summaryLabel}>
              {summary.expenseCount === 1 ? 'Expense' : 'Expenses'}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {formatMoney(summary.totalSettled)}
            </Text>
            <Text style={styles.summaryLabel}>Settled</Text>
          </View>
        </View>
      ) : null}

      {/* Balances */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Balances</Text>
        <Pressable onPress={() => router.push(`/groups/${id}/settle`)}>
          <Text style={styles.action}>Settle up</Text>
        </Pressable>
      </View>
      {balances.map((b) => (
        <View key={b.userId} style={styles.row}>
          <Text style={styles.rowTitle}>{b.displayName}</Text>
          <Text
            style={[
              styles.balance,
              b.net > 0 ? styles.positive : b.net < 0 ? styles.negative : styles.zero,
            ]}
          >
            {b.net > 0
              ? `gets back ${formatMoney(b.net)}`
              : b.net < 0
                ? `owes ${formatMoney(-b.net)}`
                : 'settled up'}
          </Text>
        </View>
      ))}

      {/* Members */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Members ({members.length})</Text>
        <Pressable onPress={() => router.push(`/groups/${id}/members`)}>
          <Text style={styles.action}>+ Add</Text>
        </Pressable>
      </View>
      {members.length > 3 ? (
        <TextInput
          style={styles.search}
          placeholder="Search members"
          value={memberQuery}
          onChangeText={setMemberQuery}
          autoCapitalize="none"
        />
      ) : null}
      {filteredMembers.length === 0 ? (
        <Text style={styles.empty}>No members match “{memberQuery}”.</Text>
      ) : (
        filteredMembers.map((m) => (
          <View key={m.user_id} style={styles.row}>
            <Avatar name={m.profile.display_name} uri={m.profile.avatar_url} size={32} />
            <Text style={[styles.rowTitle, styles.rowTitleWithAvatar]}>
              {m.profile.display_name}
            </Text>
            <Text style={styles.rowMeta}>{m.role}</Text>
          </View>
        ))
      )}

      {/* Expenses */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Expenses ({expenses.length})</Text>
        <Pressable onPress={() => router.push(`/groups/${id}/expense`)}>
          <Text style={styles.action}>+ Add</Text>
        </Pressable>
      </View>
      {expenses.length === 0 ? (
        <Text style={styles.empty}>No expenses yet.</Text>
      ) : (
        <>
          <TextInput
            style={styles.search}
            placeholder="Search expenses"
            value={expenseQuery}
            onChangeText={setExpenseQuery}
            autoCapitalize="none"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <Pressable
              style={[styles.filterChip, categoryFilter === null && styles.filterChipActive]}
              onPress={() => setCategoryFilter(null)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  categoryFilter === null && styles.filterChipTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>
            {EXPENSE_CATEGORIES.map((c) => (
              <Pressable
                key={c.value}
                style={[
                  styles.filterChip,
                  categoryFilter === c.value && styles.filterChipActive,
                ]}
                onPress={() =>
                  setCategoryFilter((cur) => (cur === c.value ? null : c.value))
                }
              >
                <Text
                  style={[
                    styles.filterChipText,
                    categoryFilter === c.value && styles.filterChipTextActive,
                  ]}
                >
                  {c.icon} {c.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {filteredExpenses.length === 0 ? (
            <Text style={styles.empty}>No expenses match your filters.</Text>
          ) : (
            filteredExpenses.map((e) => (
              <Pressable
                key={e.id}
                style={styles.row}
                onPress={() => router.push(`/groups/${id}/expenses/${e.id}`)}
              >
                <View style={styles.expenseMain}>
                  <Text style={styles.rowTitle}>{e.title}</Text>
                  <Text style={styles.rowMeta}>{nameFor(e.paid_by)} paid</Text>
                </View>
                <Text style={styles.amount}>
                  {formatMoney(e.total_amount, e.currency)}
                </Text>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 40 },
  center: { flex: 1 },
  error: { color: '#c0392b', fontSize: 14, padding: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  action: { color: '#1d9e75', fontSize: 15, fontWeight: '600' },
  summaryCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#f3faf7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cce8dd',
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#1d9e75' },
  summaryLabel: { fontSize: 12, color: '#777' },
  rowChevron: { fontSize: 22, color: '#ccc', marginLeft: 8 },
  search: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  filterChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipActive: { backgroundColor: '#1d9e75', borderColor: '#1d9e75' },
  filterChipText: { fontSize: 13, color: '#333' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowTitleWithAvatar: { flex: 1, marginLeft: 12 },
  rowMeta: { fontSize: 13, color: '#999' },
  expenseMain: { flex: 1, gap: 2 },
  amount: { fontSize: 16, fontWeight: '600' },
  balance: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '500' },
  positive: { color: '#1d9e75' },
  negative: { color: '#c0392b' },
  zero: { color: '#999' },
  empty: { color: '#999', paddingHorizontal: 20, paddingVertical: 12 },
});
