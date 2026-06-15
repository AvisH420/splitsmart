import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { computeBalances } from '../../../../lib/balances';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <Stack.Screen options={{ title: group?.name ?? 'Group' }} />

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
      {members.map((m) => (
        <View key={m.user_id} style={styles.row}>
          <Text style={styles.rowTitle}>{m.profile.display_name}</Text>
          <Text style={styles.rowMeta}>{m.role}</Text>
        </View>
      ))}

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
        expenses.map((e) => (
          <View key={e.id} style={styles.row}>
            <View style={styles.expenseMain}>
              <Text style={styles.rowTitle}>{e.title}</Text>
              <Text style={styles.rowMeta}>{nameFor(e.paid_by)} paid</Text>
            </View>
            <Text style={styles.amount}>
              {formatMoney(e.total_amount, e.currency)}
            </Text>
          </View>
        ))
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowMeta: { fontSize: 13, color: '#999' },
  expenseMain: { flex: 1, gap: 2 },
  amount: { fontSize: 16, fontWeight: '600' },
  balance: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '500' },
  positive: { color: '#1d9e75' },
  negative: { color: '#c0392b' },
  zero: { color: '#999' },
  empty: { color: '#999', paddingHorizontal: 20, paddingVertical: 12 },
});
