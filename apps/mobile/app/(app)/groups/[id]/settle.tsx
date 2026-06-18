import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useAuth } from '../../../../lib/auth-context';
import { computeBalances, suggestSettlements } from '../../../../lib/balances';
import { AnimatedScreen } from '../../../../lib/components/AnimatedScreen';
import { Button } from '../../../../lib/components/Button';
import { GlassCard } from '../../../../lib/components/GlassCard';
import { GradientBackground } from '../../../../lib/components/GradientBackground';
import { Input } from '../../../../lib/components/Input';
import { ScreenHeader } from '../../../../lib/components/ScreenHeader';
import { formatMoney, parseAmount } from '../../../../lib/format';
import {
  listExpenses,
  listParticipantsForGroup,
} from '../../../../lib/repositories/expenses';
import { listMembers } from '../../../../lib/repositories/members';
import {
  createSettlement,
  listSettlements,
} from '../../../../lib/repositories/settlements';
import { useTheme, type Theme } from '../../../../lib/theme';
import type { GroupMemberWithProfile, SettlementSuggestion } from '../../../../lib/types';

export default function SettleScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [suggestions, setSuggestions] = useState<SettlementSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A settlement is from payer -> receiver, logged by the current user.
  const [fromUser, setFromUser] = useState<string | undefined>(currentUserId);
  const [toUser, setToUser] = useState<string | undefined>(undefined);
  const [amountText, setAmountText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [mem, exp, parts, setl] = await Promise.all([
        listMembers(id),
        listExpenses(id),
        listParticipantsForGroup(id),
        listSettlements(id),
      ]);
      setMembers(mem);
      const balances = computeBalances(mem, exp, parts, setl);
      const suggs = suggestSettlements(balances);
      setSuggestions(suggs);

      const mine = suggs.find((s) => s.fromUserId === currentUserId) ?? suggs[0];
      if (mine) {
        setFromUser(mine.fromUserId);
        setToUser(mine.toUserId);
        setAmountText(String(mine.amount));
      } else if (mem[0]) {
        setFromUser((prev) => prev ?? mem[0].user_id);
      }
    } catch (e) {
      // Surface the failure instead of spinning forever.
      setLoadError((e as Error).message || 'Could not load this group.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const amount = parseAmount(amountText);
  const receivers = members.filter((m) => m.user_id !== fromUser);
  const canSubmit =
    !!currentUserId &&
    !!fromUser &&
    !!toUser &&
    fromUser !== toUser &&
    !!amount &&
    !submitting;

  const onRecord = async () => {
    if (!currentUserId || !fromUser || !toUser || !amount) return;
    setSubmitting(true);
    setError(null);
    try {
      await createSettlement({
        groupId: id,
        fromUser,
        toUser,
        amount,
        recordedBy: currentUserId,
      });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  const applySuggestion = (s: SettlementSuggestion) => {
    setFromUser(s.fromUserId);
    setToUser(s.toUserId);
    setAmountText(String(s.amount));
  };

  const renderChips = (
    selected: string | undefined,
    onSelect: (userId: string) => void,
    list: GroupMemberWithProfile[]
  ) => (
    <View style={styles.chips}>
      {list.map((m) => (
        <Pressable
          key={m.user_id}
          style={[styles.chip, selected === m.user_id && styles.chipActive]}
          onPress={() => onSelect(m.user_id)}
        >
          <Text style={[styles.chipText, selected === m.user_id && styles.chipTextActive]}>
            {m.profile.display_name}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Settle up" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={t.colors.accent} />
      ) : loadError ? (
        <AnimatedScreen variant="modal">
          <ScrollView contentContainerStyle={styles.content}>
            <GlassCard style={styles.errorCard}>
              <Text style={styles.errorTitle}>Could not load balances</Text>
              <Text style={styles.errorBody}>{loadError}</Text>
              <Button title="Try again" onPress={load} style={styles.errorButton} />
            </GlassCard>
          </ScrollView>
        </AnimatedScreen>
      ) : (
        <AnimatedScreen variant="modal">
          <KeyboardAvoidingView
            style={styles.fill}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.sectionTitle}>Suggested payments</Text>
                {suggestions.length === 0 ? (
                  <GlassCard style={styles.emptyCard}>
                    <Feather name="check-circle" size={28} color={t.colors.positive} />
                    <Text style={styles.emptyText}>Everyone is settled up.</Text>
                  </GlassCard>
                ) : (
                  <GlassCard style={styles.listCard}>
                    {suggestions.map((s, i) => (
                      <Pressable
                        key={i}
                        style={[styles.suggestion, i > 0 && styles.divider]}
                        onPress={() => applySuggestion(s)}
                      >
                        <Text style={styles.suggestionText}>
                          {s.fromName} <Feather name="arrow-right" size={13} /> {s.toName}
                        </Text>
                        <Text style={styles.suggestionAmount}>{formatMoney(s.amount)}</Text>
                      </Pressable>
                    ))}
                  </GlassCard>
                )}

                <Text style={[styles.sectionTitle, styles.formTitle]}>Record a payment</Text>

                <Text style={styles.hint}>Who paid</Text>
                {renderChips(
                  fromUser,
                  (u) => {
                    setFromUser(u);
                    if (toUser === u) setToUser(undefined);
                  },
                  members
                )}

                <Text style={styles.hint}>Who received</Text>
                {renderChips(toUser, setToUser, receivers)}

                <Input
                  label="Amount"
                  placeholder="0.00"
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="decimal-pad"
                  style={styles.amountInput}
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Button
                  title="Record payment"
                  onPress={onRecord}
                  loading={submitting}
                  disabled={!canSubmit}
                  style={styles.submit}
                />
              </ScrollView>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </AnimatedScreen>
      )}
    </GradientBackground>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: t.spacing.xl, gap: t.spacing.sm, paddingBottom: t.spacing.xxxl },
  center: { flex: 1 },
  sectionTitle: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textSecondary,
  },
  formTitle: { marginTop: t.spacing.xl },
  emptyCard: { padding: t.spacing.xl, alignItems: 'center', gap: t.spacing.sm },
  emptyText: { color: t.colors.textSecondary, fontSize: t.typography.sizes.base },
  listCard: { paddingHorizontal: t.spacing.lg },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: t.spacing.md,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.hairline,
  },
  suggestionText: { fontSize: t.typography.sizes.base, color: t.colors.textPrimary },
  suggestionAmount: {
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.bold,
    color: t.colors.accent,
  },
  hint: {
    fontSize: t.typography.sizes.sm,
    color: t.colors.textSecondary,
    marginTop: t.spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  chip: {
    backgroundColor: t.colors.accentSubtle,
    borderRadius: t.radii.full,
    paddingHorizontal: t.spacing.md + 2,
    paddingVertical: t.spacing.xs + 2,
  },
  chipActive: { backgroundColor: t.colors.accent },
  chipText: {
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.medium,
    color: t.colors.accent,
  },
  chipTextActive: { color: t.colors.white },
  amountInput: { marginTop: t.spacing.sm },
  error: { color: t.colors.negative, fontSize: t.typography.sizes.sm, marginTop: t.spacing.xs },
  submit: { marginTop: t.spacing.md },
  errorCard: { padding: t.spacing.xl, gap: t.spacing.sm, alignItems: 'center' },
  errorTitle: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
  },
  errorBody: {
    fontSize: t.typography.sizes.sm,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },
  errorButton: { marginTop: t.spacing.sm, alignSelf: 'stretch' },
});

