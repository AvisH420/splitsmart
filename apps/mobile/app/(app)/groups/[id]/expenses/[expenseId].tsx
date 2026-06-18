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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../../../../lib/auth-context';
import { AnimatedScreen } from '../../../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../../../lib/components/Avatar';
import { GlassCard } from '../../../../../lib/components/GlassCard';
import { GradientBackground } from '../../../../../lib/components/GradientBackground';
import { Input } from '../../../../../lib/components/Input';
import { ScreenHeader } from '../../../../../lib/components/ScreenHeader';
import { categoryLabel } from '../../../../../lib/categories';
import { formatMoney } from '../../../../../lib/format';
import {
  addComment,
  deleteComment,
  listComments,
} from '../../../../../lib/repositories/comments';
import {
  deleteExpense,
  getExpense,
  listParticipants,
  listPayers,
} from '../../../../../lib/repositories/expenses';
import { listMembers } from '../../../../../lib/repositories/members';
import { useTheme, type Theme } from '../../../../../lib/theme';
import type {
  Expense,
  ExpenseComment,
  ExpenseParticipant,
  ExpensePayer,
  GroupMemberWithProfile,
} from '../../../../../lib/types';

/** Compact relative time: "just now", "5 min ago", "yesterday", a date. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

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
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [expense, setExpense] = useState<Expense | null>(null);
  const [participants, setParticipants] = useState<ExpenseParticipant[]>([]);
  const [payers, setPayers] = useState<ExpensePayer[]>([]);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [comments, setComments] = useState<ExpenseComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(null);
      (async () => {
        try {
          const [exp, parts, pyrs, mem, cmts] = await Promise.all([
            getExpense(expenseId),
            listParticipants(expenseId),
            listPayers(expenseId),
            listMembers(id),
            listComments(expenseId),
          ]);
          if (!active) return;
          setExpense(exp);
          setParticipants(parts);
          setPayers(pyrs);
          setMembers(mem);
          setComments(cmts);
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

  const onSend = async () => {
    const text = commentText.trim();
    if (!text || !currentUserId || sending) return;
    setSending(true);
    setCommentText('');
    const tempId = `temp-${Date.now()}`;
    const authorProfile = memberFor(currentUserId) ?? {
      id: currentUserId,
      display_name: 'You',
      avatar_url: null,
    };
    const optimistic: ExpenseComment = {
      id: tempId,
      expense_id: expenseId,
      user_id: currentUserId,
      content: text,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author: authorProfile,
    };
    setComments((prev) => [...prev, optimistic]);
    try {
      await addComment(expenseId, text);
      setComments(await listComments(expenseId));
    } catch (e) {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const onDeleteComment = (comment: ExpenseComment) => {
    if (comment.user_id !== currentUserId) return;
    Alert.alert('Delete comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const previous = comments;
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
          try {
            await deleteComment(comment.id);
          } catch (e) {
            setComments(previous);
            setError((e as Error).message);
          }
        },
      },
    ]);
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
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <AnimatedScreen>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <GlassCard style={styles.hero}>
              <Text style={styles.amount}>
                {formatMoney(expense.total_amount, expense.currency)}
              </Text>
              <Text style={styles.title}>{expense.title}</Text>
              <Text style={styles.meta}>
                {payers.length > 0 ? 'Multiple payers' : `${nameFor(expense.paid_by)} paid`} -{' '}
                {SPLIT_LABEL[expense.split_type]}
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

            {payers.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Paid by</Text>
                <GlassCard style={styles.listCard}>
                  {payers.map((p, i) => (
                    <View key={p.id} style={[styles.row, i > 0 && styles.divider]}>
                      <Avatar
                        name={nameFor(p.user_id)}
                        uri={memberFor(p.user_id)?.avatar_url}
                        size={36}
                      />
                      <Text style={styles.rowName}>{nameFor(p.user_id)}</Text>
                      <Text style={styles.rowShare}>{formatMoney(p.amount)}</Text>
                    </View>
                  ))}
                </GlassCard>
              </>
            ) : null}

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

            <Text style={styles.sectionTitle}>Comments</Text>
            {comments.length === 0 ? (
              <Text style={styles.noComments}>No comments yet.</Text>
            ) : (
              <GlassCard style={styles.listCard}>
                {comments.map((c, i) => (
                  <Pressable
                    key={c.id}
                    onLongPress={() => onDeleteComment(c)}
                    delayLongPress={350}
                    style={[styles.commentRow, i > 0 && styles.divider]}
                  >
                    <Avatar name={c.author.display_name} uri={c.author.avatar_url} size={32} />
                    <View style={styles.commentBody}>
                      <View style={styles.commentHead}>
                        <Text style={styles.commentName}>{c.author.display_name}</Text>
                        <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                      </View>
                      <Text style={styles.commentText}>{c.content}</Text>
                    </View>
                  </Pressable>
                ))}
              </GlassCard>
            )}

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

        <View style={styles.inputBar}>
          <View style={styles.inputWrap}>
            <Input
              placeholder="Add a comment"
              value={commentText}
              onChangeText={setCommentText}
              onSubmitEditing={onSend}
              returnKeyType="send"
            />
          </View>
          <Pressable
            style={styles.sendBtn}
            onPress={onSend}
            disabled={!commentText.trim() || sending}
            hitSlop={8}
          >
            <Feather
              name="send"
              size={20}
              color={commentText.trim() ? t.colors.accent : t.colors.textTertiary}
            />
          </Pressable>
        </View>
        </KeyboardAvoidingView>
      )}
    </GradientBackground>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  fill: { flex: 1 },
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
  noComments: { color: t.colors.textTertiary, fontSize: t.typography.sizes.sm },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.spacing.md,
    paddingVertical: t.spacing.md,
  },
  commentBody: { flex: 1, gap: 2 },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentName: {
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textPrimary,
  },
  commentTime: { fontSize: t.typography.sizes.xs, color: t.colors.textTertiary },
  commentText: { fontSize: t.typography.sizes.base, color: t.colors.textPrimary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.hairline,
  },
  inputWrap: { flex: 1 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
