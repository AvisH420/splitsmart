import { useLocalSearchParams, useRouter } from 'expo-router';
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
  TextInput,
  TouchableWithoutFeedback,
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

        // Prefill from the suggestion involving the current user, else the first.
        const mine =
          suggs.find((s) => s.fromUserId === currentUserId) ?? suggs[0];
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

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }

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
          <Text
            style={[styles.chipText, selected === m.user_id && styles.chipTextActive]}
          >
            {m.profile.display_name}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Suggested payments</Text>
        {suggestions.length === 0 ? (
          <Text style={styles.empty}>Everyone is settled up. 🎉</Text>
        ) : (
          suggestions.map((s, i) => (
            <Pressable key={i} style={styles.suggestion} onPress={() => applySuggestion(s)}>
              <Text style={styles.suggestionText}>
                {s.fromName} pays {s.toName}
              </Text>
              <Text style={styles.suggestionAmount}>{formatMoney(s.amount)}</Text>
            </Pressable>
          ))
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
      </TouchableWithoutFeedback>
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
