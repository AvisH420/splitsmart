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
import { useAuth } from '../../../../lib/auth-context';
import { computeBalances, suggestSettlements } from '../../../../lib/balances';
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

  // Form state for recording a payment the current user made.
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

        // Prefill from the suggestion where the current user is the payer.
        const mine = suggs.find((s) => s.fromUserId === currentUserId);
        if (mine) {
          setToUser(mine.toUserId);
          setAmountText(String(mine.amount));
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
  const recipients = members.filter((m) => m.user_id !== currentUserId);
  const canSubmit = !!currentUserId && !!toUser && !!amount && !submitting;

  const onRecord = async () => {
    if (!currentUserId || !toUser || !amount) return;
    setSubmitting(true);
    setError(null);
    try {
      await createSettlement({
        groupId: id,
        fromUser: currentUserId,
        toUser,
        amount,
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Suggested payments</Text>
        {suggestions.length === 0 ? (
          <Text style={styles.empty}>Everyone is settled up. 🎉</Text>
        ) : (
          suggestions.map((s, i) => (
            <View key={i} style={styles.suggestion}>
              <Text style={styles.suggestionText}>
                {s.fromName} pays {s.toName}
              </Text>
              <Text style={styles.suggestionAmount}>{formatMoney(s.amount)}</Text>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, styles.formTitle]}>Record a payment</Text>
        <Text style={styles.hint}>You paid…</Text>

        <View style={styles.chips}>
          {recipients.map((m) => (
            <Pressable
              key={m.user_id}
              style={[styles.chip, toUser === m.user_id && styles.chipActive]}
              onPress={() => setToUser(m.user_id)}
            >
              <Text
                style={[styles.chipText, toUser === m.user_id && styles.chipTextActive]}
              >
                {m.profile.display_name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.hint}>Amount</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onRecord}
          disabled={!canSubmit}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Recording…' : 'Record payment'}
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
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  formTitle: { marginTop: 24 },
  empty: { color: '#999', fontSize: 15 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  suggestionText: { fontSize: 16 },
  suggestionAmount: { fontSize: 16, fontWeight: '600', color: '#c0392b' },
  hint: { fontSize: 14, color: '#666', marginTop: 8 },
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
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
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
