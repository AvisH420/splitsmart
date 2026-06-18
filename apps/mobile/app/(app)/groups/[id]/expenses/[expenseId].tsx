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
import { useTheme, type Theme } from '../../../../../lib/theme';
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
  const t = useTheme();
  const styles = makeStyles(t);
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
              <Feather name="edit-2" size={18} color={t.colors.accent} />
            </Pressable>
          ) : undefined
        }
      />

      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={t.colors.accent} />
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
              <Feather name="trash-2" size={16} color={t.colors.negative} />
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  center: { flex: 1 },
  error: {
    color: t.colors.negative,
    fontSize: t.typography.sizes.sm,
    padding: t.spacing.xl,
  },
  content: { padding: t.spacing.xl, gap: t.spacing.lg, paddingBottom: t.spacing.xxxl },
  hero: { padding: t.spacing.xl, alignItems: 'center', gap: t.spacing.xs },
  amount: {
    fontSize: t.typography.sizes.display,
    fontWeight: t.typography.weights.heavy,
    color: t.colors.accent,
  },
  title: {
    fontSize: t.typography.sizes.lg,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textPrimary,
  },
  meta: { fontSize: t.typography.sizes.sm, color: t.colors.textSecondary },
  badge: {
    backgroundColor: t.colors.accentSubtle,
    borderRadius: t.radii.full,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
    marginTop: t.spacing.xs,
  },
  badgeText: {
    fontSize: t.typography.sizes.xs,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.accent,
  },
  date: { fontSize: t.typography.sizes.xs, color: t.colors.textTertiary, marginTop: t.spacing.xs },
  sectionTitle: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textSecondary,
  },
  listCard: { paddingHorizontal: t.spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingVertical: t.spacing.md,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.hairline,
  },
  rowName: {
    flex: 1,
    fontSize: t.typography.sizes.base,
    color: t.colors.textPrimary,
  },
  rowValue: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
  rowShare: {
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    paddingVertical: t.spacing.md,
  },
  disabled: { opacity: 0.5 },
  deleteText: {
    color: t.colors.negative,
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.semibold,
  },
});
