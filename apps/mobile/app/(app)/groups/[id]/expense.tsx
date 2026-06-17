import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../../../lib/auth-context';
import { formatMoney, parseAmount } from '../../../../lib/format';
import {
  getExpense,
  listParticipants,
  saveExpense,
} from '../../../../lib/repositories/expenses';
import { listMembers } from '../../../../lib/repositories/members';
import { computeSplit, validateSplit, type SplitInput } from '../../../../lib/splits';
import type { GroupMemberWithProfile, SplitType } from '../../../../lib/types';

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
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  const isEdit = !!expenseId;
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<string | undefined>(currentUserId);
  const [splitType, setSplitTypeState] = useState<SplitType>('equal');
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  /** Per-member raw split inputs (exact amount / percent / share weight). */
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const mem = await listMembers(id);
        setMembers(mem);

        if (isEdit && expenseId) {
          const [exp, parts] = await Promise.all([
            getExpense(expenseId),
            listParticipants(expenseId),
          ]);
          setTitle(exp.title);
          setAmountText(String(exp.total_amount));
          setPaidBy(exp.paid_by);
          setSplitTypeState(exp.split_type);
          setParticipants(new Set(parts.map((p) => p.user_id)));
          const v: Record<string, string> = {};
          for (const p of parts) {
            if (p.split_value != null) v[p.user_id] = String(p.split_value);
          }
          setValues(v);
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

  // Live preview of resolved shares, only when the split is valid.
  const splitError =
    amount != null ? validateSplit(splitType, amount, inputs) : null;
  const preview = useMemo(() => {
    if (amount == null || inputs.length === 0 || splitError) return null;
    const shares = computeSplit(splitType, amount, inputs);
    return new Map(shares.map((s) => [s.userId, s.shareAmount]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, splitType, inputs, splitError]);

  const setSplitType = (next: SplitType) => {
    // Seed share weights to 1 so a fresh "Shares" split is immediately valid.
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

  const canSubmit =
    !!title.trim() &&
    amount != null &&
    !!paidBy &&
    participantIds.length > 0 &&
    !splitError &&
    !submitting;

  const onSubmit = async () => {
    if (!canSubmit || amount == null || !paidBy) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveExpense({
        expenseId: isEdit ? expenseId : null,
        groupId: id,
        paidBy,
        title,
        totalAmount: amount,
        splitType,
        participants: computeSplit(splitType, amount, inputs),
      });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }

  const splitHint: Record<SplitType, string> = {
    equal: 'Split equally between',
    exact: 'Enter each person’s exact amount',
    percentage: 'Enter each person’s percentage',
    shares: 'Assign shares to each person',
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: isEdit ? 'Edit Expense' : 'New Expense' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Dinner"
          value={title}
          onChangeText={setTitle}
          autoFocus={!isEdit}
        />

        <Text style={styles.label}>Amount</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Paid by</Text>
        <View style={styles.chips}>
          {members.map((m) => (
            <Pressable
              key={m.user_id}
              style={[styles.chip, paidBy === m.user_id && styles.chipActive]}
              onPress={() => setPaidBy(m.user_id)}
            >
              <Text
                style={[styles.chipText, paidBy === m.user_id && styles.chipTextActive]}
              >
                {m.profile.display_name}
              </Text>
            </Pressable>
          ))}
        </View>

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
                  {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={styles.memberName}>{m.profile.display_name}</Text>
              </Pressable>

              {checked && splitType !== 'equal' ? (
                <TextInput
                  style={styles.valueInput}
                  placeholder={splitType === 'percentage' ? '%' : '0'}
                  value={values[m.user_id] ?? ''}
                  onChangeText={(t) => setValue(m.user_id, t)}
                  keyboardType="decimal-pad"
                />
              ) : null}

              {checked && share != null ? (
                <Text style={styles.share}>{formatMoney(share)}</Text>
              ) : null}
            </View>
          );
        })}

        {splitError && amount != null ? (
          <Text style={styles.warn}>{splitError}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add expense'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 8 },
  center: { flex: 1 },
  label: { fontSize: 14, color: '#666', marginTop: 8 },
  hint: { fontSize: 13, color: '#999', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: '#1d9e75', borderColor: '#1d9e75' },
  chipText: { fontSize: 14, color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#1d9e75',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: '#1d9e75' },
  segmentText: { fontSize: 14, color: '#1d9e75', fontWeight: '600' },
  segmentTextActive: { color: '#fff' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  memberToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#1d9e75', borderColor: '#1d9e75' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  memberName: { fontSize: 16 },
  valueInput: {
    width: 72,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    textAlign: 'right',
  },
  share: { fontSize: 15, color: '#666', minWidth: 64, textAlign: 'right' },
  warn: { color: '#b9770e', fontSize: 14, marginTop: 8 },
  error: { color: '#c0392b', fontSize: 14, marginTop: 8 },
  button: {
    backgroundColor: '#1d9e75',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
