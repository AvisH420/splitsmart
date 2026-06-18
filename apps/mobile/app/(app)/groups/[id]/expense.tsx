import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { EXPENSE_CATEGORIES } from '../../../../lib/categories';
import { AnimatedScreen } from '../../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../../lib/components/Avatar';
import { Button } from '../../../../lib/components/Button';
import { GradientBackground } from '../../../../lib/components/GradientBackground';
import { Input } from '../../../../lib/components/Input';
import { ScreenHeader } from '../../../../lib/components/ScreenHeader';
import { formatMoney, parseAmount } from '../../../../lib/format';
import {
  getExpense,
  listParticipants,
  listPayers,
  saveExpense,
} from '../../../../lib/repositories/expenses';
import { listMembers } from '../../../../lib/repositories/members';
import { computeSplit, validateSplit, type SplitInput } from '../../../../lib/splits';
import { useTheme, type Theme } from '../../../../lib/theme';
import type {
  ExpenseCategory,
  GroupMemberWithProfile,
  SplitType,
} from '../../../../lib/types';

const SPLIT_TABS: { type: SplitType; label: string }[] = [
  { type: 'equal', label: 'Equal' },
  { type: 'exact', label: 'Exact' },
  { type: 'percentage', label: '%' },
  { type: 'shares', label: 'Shares' },
];

/** Parse a per-member split input field; empty/invalid reads as 0. */
function parseValue(text: string | undefined): number {
  if (!text) return 0;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function ExpenseFormScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
  const { id, expenseId, prefill } = useLocalSearchParams<{
    id: string;
    expenseId?: string;
    prefill?: string;
  }>();
  const isEdit = !!expenseId;
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<string | undefined>(currentUserId);
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [splitType, setSplitTypeState] = useState<SplitType>('equal');
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  /** Per-member raw split inputs (exact amount / percent / share weight). */
  const [values, setValues] = useState<Record<string, string>>({});
  const [multiPayers, setMultiPayers] = useState(false);
  /** Per-member paid amount when in multi-payer mode. */
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const mem = await listMembers(id);
        setMembers(mem);

        if (isEdit && expenseId) {
          const [exp, parts, payerRows] = await Promise.all([
            getExpense(expenseId),
            listParticipants(expenseId),
            listPayers(expenseId),
          ]);
          setTitle(exp.title);
          setAmountText(String(exp.total_amount));
          setPaidBy(exp.paid_by);
          setCategory(exp.category);
          setSplitTypeState(exp.split_type);
          setParticipants(new Set(parts.map((p) => p.user_id)));
          const v: Record<string, string> = {};
          for (const p of parts) {
            if (p.split_value != null) v[p.user_id] = String(p.split_value);
          }
          setValues(v);
          // Multi-payer expense: hydrate the per-payer amounts.
          if (payerRows.length > 0) {
            setMultiPayers(true);
            const pa: Record<string, string> = {};
            for (const pr of payerRows) pa[pr.user_id] = String(pr.amount);
            setPayerAmounts(pa);
          }
        } else if (prefill) {
          // Hydrate from an AI-parsed expense handed off by the assistant.
          try {
            const p = JSON.parse(prefill) as {
              title: string;
              total_amount: number;
              paid_by: string;
              split_type: SplitType;
              category: ExpenseCategory | null;
              participants: { user_id: string; split_value: number | null }[];
            };
            setTitle(p.title);
            setAmountText(String(p.total_amount));
            setPaidBy(p.paid_by);
            setCategory(p.category);
            setSplitTypeState(p.split_type);
            setParticipants(new Set(p.participants.map((x) => x.user_id)));
            const v: Record<string, string> = {};
            for (const x of p.participants) {
              if (x.split_value != null) v[x.user_id] = String(x.split_value);
            }
            setValues(v);
          } catch {
            // Malformed prefill: fall back to create defaults.
            setParticipants(new Set(mem.map((m) => m.user_id)));
          }
        } else {
          // Create defaults: everyone shares, the current user paid.
          setParticipants(new Set(mem.map((m) => m.user_id)));
          if (!currentUserId && mem[0]) setPaidBy(mem[0].user_id);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, expenseId]);

  const amount = parseAmount(amountText);
  const participantIds = useMemo(
    () => members.map((m) => m.user_id).filter((u) => participants.has(u)),
    [members, participants]
  );

  const inputs: SplitInput[] = useMemo(
    () => participantIds.map((u) => ({ userId: u, value: parseValue(values[u]) })),
    [participantIds, values]
  );

  const splitError = amount != null ? validateSplit(splitType, amount, inputs) : null;
  const preview = useMemo(() => {
    if (amount == null || inputs.length === 0 || splitError) return null;
    const shares = computeSplit(splitType, amount, inputs);
    return new Map(shares.map((s) => [s.userId, s.shareAmount]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, splitType, inputs, splitError]);

  const setSplitType = (next: SplitType) => {
    if (next === 'shares') {
      setValues((prev) => {
        const updated = { ...prev };
        for (const u of participantIds) if (!updated[u]) updated[u] = '1';
        return updated;
      });
    }
    setSplitTypeState(next);
  };

  const toggleParticipant = (userId: string) => {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else {
        next.add(userId);
        if (splitType === 'shares') {
          setValues((v) => (v[userId] ? v : { ...v, [userId]: '1' }));
        }
      }
      return next;
    });
  };

  const setValue = (userId: string, text: string) =>
    setValues((prev) => ({ ...prev, [userId]: text }));

  const setPayerAmount = (userId: string, text: string) =>
    setPayerAmounts((prev) => ({ ...prev, [userId]: text }));

  // Multi-payer: collect members with a positive amount.
  const payerEntries = useMemo(
    () =>
      members
        .map((m) => ({ userId: m.user_id, amount: parseValue(payerAmounts[m.user_id]) }))
        .filter((e) => e.amount > 0),
    [members, payerAmounts]
  );
  const payerTotalCents = payerEntries.reduce(
    (a, e) => a + Math.round(e.amount * 100),
    0
  );
  const amountCents = amount != null ? Math.round(amount * 100) : null;
  const payersBalanced =
    amountCents != null && payerTotalCents === amountCents && payerEntries.length >= 2;
  const payersValid = !multiPayers || payersBalanced;

  const canSubmit =
    !!title.trim() &&
    amount != null &&
    !!paidBy &&
    participantIds.length > 0 &&
    !splitError &&
    payersValid &&
    !submitting;

  const onSubmit = async () => {
    if (!canSubmit || amount == null || !paidBy) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveExpense({
        expenseId: isEdit ? expenseId : null,
        groupId: id,
        paidBy: multiPayers ? payerEntries[0].userId : paidBy,
        title,
        totalAmount: amount,
        splitType,
        category,
        participants: computeSplit(splitType, amount, inputs),
        payers: multiPayers ? payerEntries : undefined,
      });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  const splitHint: Record<SplitType, string> = {
    equal: 'Split equally between everyone selected',
    exact: 'Enter an exact amount for each person',
    percentage: 'Enter a percentage for each person',
    shares: 'Assign shares to each person',
  };

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={isEdit ? 'Edit expense' : 'New expense'}
        onBack={() => router.back()}
      />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={t.colors.accent} />
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
                <Input
                  label="Description"
                  placeholder="e.g. Dinner"
                  value={title}
                  onChangeText={setTitle}
                />
                <Input
                  label="Amount"
                  placeholder="0.00"
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="decimal-pad"
                />

                <View style={styles.payerHeader}>
                  <Text style={styles.label}>Paid by</Text>
                  <Pressable
                    style={styles.toggleRow}
                    onPress={() => setMultiPayers((v) => !v)}
                  >
                    <Text style={styles.toggleLabel}>Multiple payers</Text>
                    <View style={[styles.toggle, multiPayers && styles.toggleOn]}>
                      <View style={[styles.toggleKnob, multiPayers && styles.toggleKnobOn]} />
                    </View>
                  </Pressable>
                </View>

                {multiPayers ? (
                  <View style={styles.memberList}>
                    {members.map((m) => (
                      <View key={m.user_id} style={styles.memberRow}>
                        <Avatar
                          name={m.profile.display_name}
                          uri={m.profile.avatar_url}
                          size={28}
                        />
                        <Text style={[styles.memberName, styles.payerName]}>
                          {m.profile.display_name}
                        </Text>
                        <Input
                          placeholder="0.00"
                          value={payerAmounts[m.user_id] ?? ''}
                          onChangeText={(text) => setPayerAmount(m.user_id, text)}
                          keyboardType="decimal-pad"
                          style={styles.valueInput}
                        />
                      </View>
                    ))}
                    <Text
                      style={[
                        styles.allocated,
                        payersBalanced ? styles.allocatedOk : styles.allocatedBad,
                      ]}
                    >
                      {formatMoney(payerTotalCents / 100)} of {formatMoney(amount ?? 0)}{' '}
                      allocated
                    </Text>
                    {!payersBalanced ? (
                      <Text style={styles.warn}>
                        {payerEntries.length < 2
                          ? 'Add at least two payers.'
                          : 'Payer amounts must add up to the total.'}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.chips}>
                    {members.map((m) => (
                      <Chip
                        key={m.user_id}
                        label={m.profile.display_name}
                        active={paidBy === m.user_id}
                        onPress={() => setPaidBy(m.user_id)}
                      />
                    ))}
                  </View>
                )}

                <Text style={styles.label}>Category</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryRow}
                  keyboardShouldPersistTaps="handled"
                >
                  <Chip
                    label="None"
                    active={category === null}
                    onPress={() => setCategory(null)}
                  />
                  {EXPENSE_CATEGORIES.map((c) => (
                    <Chip
                      key={c.value}
                      label={c.label}
                      active={category === c.value}
                      onPress={() => setCategory(c.value)}
                    />
                  ))}
                </ScrollView>

                <Text style={styles.label}>Split</Text>
                <View style={styles.segment}>
                  {SPLIT_TABS.map((t) => (
                    <Pressable
                      key={t.type}
                      style={[styles.segmentItem, splitType === t.type && styles.segmentActive]}
                      onPress={() => setSplitType(t.type)}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          splitType === t.type && styles.segmentTextActive,
                        ]}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>{splitHint[splitType]}</Text>

                <View style={styles.memberList}>
                  {members.map((m) => {
                    const checked = participants.has(m.user_id);
                    const share = preview?.get(m.user_id);
                    return (
                      <View key={m.user_id} style={styles.memberRow}>
                        <Pressable
                          style={styles.memberToggle}
                          onPress={() => toggleParticipant(m.user_id)}
                        >
                          <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                            {checked ? (
                              <Feather name="check" size={14} color={t.colors.white} />
                            ) : null}
                          </View>
                          <Avatar
                            name={m.profile.display_name}
                            uri={m.profile.avatar_url}
                            size={28}
                          />
                          <Text style={styles.memberName}>{m.profile.display_name}</Text>
                        </Pressable>

                        {checked && splitType !== 'equal' ? (
                          <Input
                            placeholder={splitType === 'percentage' ? '%' : '0'}
                            value={values[m.user_id] ?? ''}
                            onChangeText={(t) => setValue(m.user_id, t)}
                            keyboardType="decimal-pad"
                            style={styles.valueInput}
                          />
                        ) : null}

                        {checked && share != null ? (
                          <Text style={styles.share}>{formatMoney(share)}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                {splitError && amount != null ? (
                  <Text style={styles.warn}>{splitError}</Text>
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Button
                  title={isEdit ? 'Save changes' : 'Add expense'}
                  onPress={onSubmit}
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

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = makeStyles(useTheme());
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: t.spacing.xl, gap: t.spacing.md, paddingBottom: t.spacing.xxxl },
  center: { flex: 1 },
  label: {
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.medium,
    color: t.colors.textSecondary,
    marginTop: t.spacing.xs,
  },
  hint: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  categoryRow: { flexDirection: 'row', gap: t.spacing.sm, paddingVertical: 2 },
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
  segment: {
    flexDirection: 'row',
    backgroundColor: t.colors.accentSubtle,
    borderRadius: t.radii.md,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: t.spacing.sm,
    alignItems: 'center',
    borderRadius: t.radii.sm,
  },
  segmentActive: { backgroundColor: t.colors.accent },
  segmentText: {
    fontSize: t.typography.sizes.sm,
    color: t.colors.accent,
    fontWeight: t.typography.weights.semibold,
  },
  segmentTextActive: { color: t.colors.white },
  memberList: { gap: t.spacing.xs },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: t.spacing.xs,
    gap: t.spacing.md,
  },
  memberToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: t.radii.sm,
    borderWidth: 1.5,
    borderColor: t.colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  memberName: {
    fontSize: t.typography.sizes.base,
    color: t.colors.textPrimary,
  },
  payerName: { flex: 1 },
  valueInput: { width: 96, textAlign: 'right' },
  payerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  toggleLabel: { fontSize: t.typography.sizes.sm, color: t.colors.textSecondary },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.colors.surfaceBorder,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: t.colors.accent },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: t.colors.white,
    alignSelf: 'flex-start',
  },
  toggleKnobOn: { alignSelf: 'flex-end' },
  allocated: {
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.semibold,
    marginTop: t.spacing.xs,
  },
  allocatedOk: { color: t.colors.positive },
  allocatedBad: { color: t.colors.negative },
  share: {
    fontSize: t.typography.sizes.base,
    color: t.colors.textSecondary,
    minWidth: 64,
    textAlign: 'right',
  },
  warn: { color: t.colors.warning, fontSize: t.typography.sizes.sm, marginTop: t.spacing.xs },
  error: { color: t.colors.negative, fontSize: t.typography.sizes.sm, marginTop: t.spacing.xs },
  submit: { marginTop: t.spacing.md },
});
