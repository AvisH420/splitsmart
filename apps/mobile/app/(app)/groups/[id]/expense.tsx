import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { equalSplit } from '../../../../lib/balances';
import { formatMoney, parseAmount } from '../../../../lib/format';
import { useAuth } from '../../../../lib/auth-context';
import { createExpense } from '../../../../lib/repositories/expenses';
import { listMembers } from '../../../../lib/repositories/members';
import type { GroupMemberWithProfile } from '../../../../lib/types';

export default function NewExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<string | undefined>(currentUserId);
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listMembers(id)
      .then((mem) => {
        setMembers(mem);
        // Default: everyone shares, the current user paid.
        setParticipants(new Set(mem.map((m) => m.user_id)));
        if (!paidBy && mem[0]) setPaidBy(mem[0].user_id);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingMembers(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const amount = parseAmount(amountText);
  const participantIds = members.map((m) => m.user_id).filter((u) => participants.has(u));
  const previewShares =
    amount && participantIds.length > 0 ? equalSplit(amount, participantIds.length) : [];

  const toggleParticipant = (userId: string) => {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const canSubmit = !!title.trim() && !!amount && !!paidBy && participantIds.length > 0;

  const onSubmit = async () => {
    if (!canSubmit || !amount || !paidBy) return;
    setSubmitting(true);
    setError(null);
    try {
      await createExpense({
        groupId: id,
        paidBy,
        title,
        totalAmount: amount,
        participantUserIds: participantIds,
        // TODO(phase-next): pass `shares` + splitType for unequal splits.
      });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  if (loadingMembers) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Dinner"
          value={title}
          onChangeText={setTitle}
          autoFocus
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

        <Text style={styles.label}>Split equally between</Text>
        {members.map((m, idx) => {
          const checked = participants.has(m.user_id);
          const shareIdx = participantIds.indexOf(m.user_id);
          return (
            <Pressable
              key={m.user_id}
              style={styles.memberRow}
              onPress={() => toggleParticipant(m.user_id)}
            >
              <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                {checked ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.memberName}>{m.profile.display_name}</Text>
              {checked && shareIdx >= 0 && previewShares[shareIdx] != null ? (
                <Text style={styles.share}>{formatMoney(previewShares[shareIdx])}</Text>
              ) : null}
            </Pressable>
          );
        })}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Saving…' : 'Add expense'}
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
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
  memberName: { flex: 1, fontSize: 16 },
  share: { fontSize: 15, color: '#666' },
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
