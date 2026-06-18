import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { theme } from '../../../../lib/theme';
import type { GroupMemberWithProfile, SettlementSuggestion } from '../../../../lib/types';

export default function SettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [suggestions, setSuggestions] = useState<SettlementSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A settlement is from payer -> receiver, logged by the current user.
  const [fromUser, setFromUser] = useState<string | undefined>(currentUserId);
  const [toUser, setToUser] = useState<string | undefined>(undefined);
  const [amountText, setAmountText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
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
        } else if (!fromUser && mem[0]) {
          setFromUser(mem[0].user_id);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
        <ActivityIndicator style={styles.center} size="large" color={theme.colors.accent} />
      ) : (
        <AnimatedScreen>
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
                    <Feather name="check-circle" size={28} color={theme.colors.positive} />
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: theme.spacing.xl, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxxl },
  center: { flex: 1 },
  sectionTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  formTitle: { marginTop: theme.spacing.xl },
  emptyCard: { padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm },
  emptyText: { color: theme.colors.textSecondary, fontSize: theme.typography.sizes.base },
  listCard: { paddingHorizontal: theme.spacing.lg },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.hairline,
  },
  suggestionText: { fontSize: theme.typography.sizes.base, color: theme.colors.textPrimary },
  suggestionAmount: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.accent,
  },
  hint: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    backgroundColor: theme.colors.accentSubtle,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.md + 2,
    paddingVertical: theme.spacing.xs + 2,
  },
  chipActive: { backgroundColor: theme.colors.accent },
  chipText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.accent,
  },
  chipTextActive: { color: theme.colors.white },
  amountInput: { marginTop: theme.spacing.sm },
  error: { color: theme.colors.negative, fontSize: theme.typography.sizes.sm, marginTop: theme.spacing.xs },
  submit: { marginTop: theme.spacing.md },
});
