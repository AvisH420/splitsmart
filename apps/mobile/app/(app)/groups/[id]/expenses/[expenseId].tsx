import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Avatar } from '../../../../../lib/components/Avatar';
import { categoryIcon, categoryLabel } from '../../../../../lib/categories';
import { formatMoney } from '../../../../../lib/format';
import {
  deleteExpense,
  getExpense,
  listParticipants,
} from '../../../../../lib/repositories/expenses';
import { listMembers } from '../../../../../lib/repositories/members';
import type {
  Expense,
  ExpenseParticipant,
  GroupMemberWithProfile,
} from '../../../../../lib/types';

const SPLIT_LABEL: Record<string, string> = {
  equal: 'Split equally',
  exact: 'Exact amounts',
  percentage: 'By percentage',
  shares: 'By shares',
};

export default function ExpenseDetailScreen() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId: string }>();
  const router = useRouter();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [participants, setParticipants] = useState<ExpenseParticipant[]>([]);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(null);
      (async () => {
        try {
          const [exp, parts, mem] = await Promise.all([
            getExpense(expenseId),
            listParticipants(expenseId),
            listMembers(id),
          ]);
          if (!active) return;
          setExpense(exp);
          setParticipants(parts);
          setMembers(mem);
        } catch (e) {
          if (active) setError((e as Error).message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [id, expenseId])
  );

  const memberFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile;
  const nameFor = (userId: string) => memberFor(userId)?.display_name ?? 'Someone';

  const onDelete = () => {
    Alert.alert('Delete expense', 'This permanently removes the expense and its split.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteExpense(expenseId);
            router.back();
          } catch (e) {
            setError((e as Error).message);
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }
  if (error || !expense) {
    return <Text style={styles.error}>{error ?? 'Expense not found.'}</Text>;
  }

  const formatValue = (p: ExpenseParticipant): string | null => {
    if (p.split_value == null) return null;
    if (expense.split_type === 'percentage') return `${p.split_value}%`;
    if (expense.split_type === 'shares')
      return `${p.split_value} share${p.split_value === 1 ? '' : 's'}`;
    return null; // exact: the share itself already shows the amount
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: expense.title }} />

      <View style={styles.header}>
        <Text style={styles.amount}>
          {formatMoney(expense.total_amount, expense.currency)}
        </Text>
        <Text style={styles.title}>{expense.title}</Text>
        <Text style={styles.meta}>
          {nameFor(expense.paid_by)} paid · {SPLIT_LABEL[expense.split_type]}
        </Text>
        <Text style={styles.meta}>
          {new Date(expense.created_at).toLocaleString()}
          {expense.updated_at !== expense.created_at ? ' · edited' : ''}
        </Text>
        {expense.category ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {categoryIcon(expense.category)} {categoryLabel(expense.category)}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Split breakdown</Text>
      {participants.map((p) => {
        const valueLabel = formatValue(p);
        return (
          <View key={p.id} style={styles.row}>
            <Avatar
              name={nameFor(p.user_id)}
              uri={memberFor(p.user_id)?.avatar_url}
              size={32}
            />
            <Text style={styles.rowName}>{nameFor(p.user_id)}</Text>
            {valueLabel ? <Text style={styles.rowValue}>{valueLabel}</Text> : null}
            <Text style={styles.rowShare}>{formatMoney(p.share_amount)}</Text>
          </View>
        );
      })}

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.editButton]}
          onPress={() => router.push(`/groups/${id}/expense?expenseId=${expenseId}`)}
        >
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.deleteButton, deleting && styles.disabled]}
          onPress={onDelete}
          disabled={deleting}
        >
          <Text style={styles.deleteText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 40 },
  center: { flex: 1 },
  error: { color: '#c0392b', fontSize: 14, padding: 24 },
  header: {
    padding: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 4,
  },
  amount: { fontSize: 32, fontWeight: '700', color: '#1d9e75' },
  title: { fontSize: 20, fontWeight: '600' },
  meta: { fontSize: 13, color: '#999' },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f3faf7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cce8dd',
  },
  badgeText: { fontSize: 13, color: '#1d9e75', fontWeight: '600' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  rowName: { flex: 1, fontSize: 16 },
  rowValue: { fontSize: 13, color: '#999' },
  rowShare: { fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, padding: 24 },
  button: { flex: 1, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  editButton: { backgroundColor: '#1d9e75' },
  editText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  deleteButton: { borderWidth: 1, borderColor: '#c0392b' },
  deleteText: { color: '#c0392b', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
