import { Feather } from '@expo/vector-icons';
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
import { AnimatedScreen } from '../../../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../../../lib/components/Avatar';
import { GlassCard } from '../../../../../lib/components/GlassCard';
import { GradientBackground } from '../../../../../lib/components/GradientBackground';
import { ScreenHeader } from '../../../../../lib/components/ScreenHeader';
import { categoryLabel } from '../../../../../lib/categories';
import { formatMoney } from '../../../../../lib/format';
import {
  deleteExpense,
  getExpense,
  listParticipants,
} from '../../../../../lib/repositories/expenses';
import { listMembers } from '../../../../../lib/repositories/members';
import { theme } from '../../../../../lib/theme';
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

  const formatValue = (p: ExpenseParticipant): string | null => {
    if (!expense || p.split_value == null) return null;
    if (expense.split_type === 'percentage') return `${p.split_value}%`;
    if (expense.split_type === 'shares')
      return `${p.split_value} share${p.split_value === 1 ? '' : 's'}`;
    return null;
  };

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Expense"
        onBack={() => router.back()}
        right={
          expense ? (
            <Pressable
              onPress={() => router.push(`/groups/${id}/expense?expenseId=${expenseId}`)}
              hitSlop={8}
            >
              <Feather name="edit-2" size={18} color={theme.colors.accent} />
            </Pressable>
          ) : undefined
        }
      />

      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={theme.colors.accent} />
      ) : error || !expense ? (
        <Text style={styles.error}>{error ?? 'Expense not found.'}</Text>
      ) : (
        <AnimatedScreen>
          <ScrollView contentContainerStyle={styles.content}>
            <GlassCard style={styles.hero}>
              <Text style={styles.amount}>
                {formatMoney(expense.total_amount, expense.currency)}
              </Text>
              <Text style={styles.title}>{expense.title}</Text>
              <Text style={styles.meta}>
                {nameFor(expense.paid_by)} paid - {SPLIT_LABEL[expense.split_type]}
              </Text>
              {expense.category ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{categoryLabel(expense.category)}</Text>
                </View>
              ) : null}
              <Text style={styles.date}>
                {new Date(expense.created_at).toLocaleString()}
                {expense.updated_at !== expense.created_at ? ' - edited' : ''}
              </Text>
            </GlassCard>

            <Text style={styles.sectionTitle}>Split breakdown</Text>
            <GlassCard style={styles.listCard}>
              {participants.map((p, i) => {
                const valueLabel = formatValue(p);
                return (
                  <View key={p.id} style={[styles.row, i > 0 && styles.divider]}>
                    <Avatar
                      name={nameFor(p.user_id)}
                      uri={memberFor(p.user_id)?.avatar_url}
                      size={36}
                    />
                    <Text style={styles.rowName}>{nameFor(p.user_id)}</Text>
                    {valueLabel ? <Text style={styles.rowValue}>{valueLabel}</Text> : null}
                    <Text style={styles.rowShare}>{formatMoney(p.share_amount)}</Text>
                  </View>
                );
              })}
            </GlassCard>

            <Pressable
              style={[styles.deleteButton, deleting && styles.disabled]}
              onPress={onDelete}
              disabled={deleting}
            >
              <Feather name="trash-2" size={16} color={theme.colors.negative} />
              <Text style={styles.deleteText}>
                {deleting ? 'Deleting...' : 'Delete expense'}
              </Text>
            </Pressable>
          </ScrollView>
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
  content: { padding: theme.spacing.xl, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
  hero: { padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.xs },
  amount: {
    fontSize: theme.typography.sizes.display,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.accent,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  meta: { fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary },
  badge: {
    backgroundColor: theme.colors.accentSubtle,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  badgeText: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.accent,
  },
  date: { fontSize: theme.typography.sizes.xs, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
  sectionTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  listCard: { paddingHorizontal: theme.spacing.lg },
  row: {
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
    color: theme.colors.textPrimary,
  },
  rowValue: { fontSize: theme.typography.sizes.sm, color: theme.colors.textTertiary },
  rowShare: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  disabled: { opacity: 0.5 },
  deleteText: {
    color: theme.colors.negative,
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
  },
});
