import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { equalSplit } from '../../../../lib/balances';
import { formatMoney } from '../../../../lib/format';
import { parseReceipt } from '../../../../lib/repositories/ai';
import { saveExpense } from '../../../../lib/repositories/expenses';
import { saveReceiptItems, type ReceiptItemWrite } from '../../../../lib/repositories/items';
import { listMembers } from '../../../../lib/repositories/members';
import type {
  GroupMemberWithProfile,
  ItemCategory,
  ReceiptParseResult,
} from '../../../../lib/types';

/** Map a receipt line-item category to the expense_items enum. */
function toItemCategory(c: string): ItemCategory {
  return c === 'food' ? 'food' : 'other';
}

/** Fuzzy-resolve a member name (as the AI returned it) to a member id. */
function resolveName(name: string, members: GroupMemberWithProfile[]): string | null {
  const n = name.trim().toLowerCase();
  const m =
    members.find((x) => x.profile.display_name.toLowerCase() === n) ??
    members.find((x) => x.profile.display_name.toLowerCase().startsWith(n)) ??
    members.find((x) => x.profile.display_name.toLowerCase().includes(n));
  return m?.user_id ?? null;
}

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [context, setContext] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ReceiptParseResult | null>(null);
  // itemIndex -> set of assigned member ids
  const [assignments, setAssignments] = useState<Record<number, Set<string>>>({});
  const [paidBy, setPaidBy] = useState<string | undefined>(currentUserId);
  const [previewed, setPreviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMembers(id)
      .then((mem) => {
        setMembers(mem);
        if (!currentUserId && mem[0]) setPaidBy(mem[0].user_id);
      })
      .catch((e) => setError((e as Error).message));
  }, [id, currentUserId]);

  const nameFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile.display_name ?? 'Someone';

  const initAssignments = (r: ReceiptParseResult) => {
    const next: Record<number, Set<string>> = {};
    r.line_items.forEach((item, i) => {
      const set = new Set<string>();
      if (item.is_shared) {
        members.forEach((m) => set.add(m.user_id));
      } else {
        const suggestion = r.suggested_assignments.find(
          (s) => s.item_description.toLowerCase() === item.description.toLowerCase()
        );
        for (const nm of suggestion?.suggested_for ?? []) {
          const uid = resolveName(nm, members);
          if (uid) set.add(uid);
        }
      }
      next[i] = set;
    });
    setAssignments(next);
  };

  const runParse = async (imageBase64: string, imageMimeType: string) => {
    setParsing(true);
    setError(null);
    setPreviewed(false);
    try {
      const r = await parseReceipt({
        groupId: id,
        imageBase64,
        imageMimeType,
        context: context.trim() || undefined,
      });
      setParsed(r);
      initAssignments(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const pickImage = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to scan a receipt.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          base64: true,
          quality: 0.5,
        });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    await runParse(asset.base64!, asset.mimeType ?? 'image/jpeg');
  };

  const toggleAssign = (itemIndex: number, userId: string) => {
    setAssignments((prev) => {
      const set = new Set(prev[itemIndex] ?? []);
      if (set.has(userId)) set.delete(userId);
      else set.add(userId);
      return { ...prev, [itemIndex]: set };
    });
    setPreviewed(false);
  };

  // Live per-person split, computed client-side in integer cents.
  const split = useMemo(() => {
    const perUser = new Map<string, number>(); // cents
    let totalCents = 0;
    parsed?.line_items.forEach((item, i) => {
      const assignees = [...(assignments[i] ?? [])];
      if (assignees.length === 0) return;
      const shares = equalSplit(item.amount, assignees.length);
      assignees.forEach((uid, k) => {
        const cents = Math.round(shares[k] * 100);
        perUser.set(uid, (perUser.get(uid) ?? 0) + cents);
        totalCents += cents;
      });
    });
    return { perUser, totalCents };
  }, [parsed, assignments]);

  const unassignedCount = useMemo(() => {
    if (!parsed) return 0;
    return parsed.line_items.filter((_, i) => (assignments[i]?.size ?? 0) === 0).length;
  }, [parsed, assignments]);

  const onSave = async () => {
    if (!parsed || !paidBy || split.totalCents <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const participants = [...split.perUser.entries()].map(([userId, cents]) => ({
        userId,
        shareAmount: cents / 100,
        splitValue: cents / 100,
      }));
      const expense = await saveExpense({
        groupId: id,
        paidBy,
        title: parsed.restaurant_name || 'Receipt',
        totalAmount: Math.round(split.totalCents) / 100,
        splitType: 'exact',
        category: 'food',
        participants,
      });

      // Persist the per-item breakdown (expense_items / item_shares).
      const items: ReceiptItemWrite[] = [];
      parsed.line_items.forEach((item, i) => {
        const assignees = [...(assignments[i] ?? [])];
        if (assignees.length === 0) return;
        const shares = equalSplit(item.amount, assignees.length);
        items.push({
          name: item.description,
          amount: item.amount,
          category: toItemCategory(item.category),
          shares: assignees.map((uid, k) => ({ userId: uid, amount: shares[k] })),
        });
      });
      await saveReceiptItems(expense.id, items);

      router.replace(`/groups/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Scan Receipt' }} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!parsed && !parsing ? (
          <>
            <Text style={styles.label}>
              Add a note (optional) — e.g. “I don’t drink”, “Priya had only the salad”
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Context for the split"
              value={context}
              onChangeText={setContext}
            />
            <Pressable style={styles.button} onPress={() => pickImage(true)}>
              <Text style={styles.buttonText}>Take photo</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => pickImage(false)}>
              <Text style={styles.secondaryText}>Choose from library</Text>
            </Pressable>
          </>
        ) : null}

        {parsing ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Reading your receipt…</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {parsed && !parsing ? (
          <>
            <View style={styles.headerCard}>
              <Text style={styles.restaurant}>
                {parsed.restaurant_name || 'Receipt'}
              </Text>
              <Text style={styles.totalNote}>
                Receipt total {formatMoney(parsed.total_amount, parsed.currency)} ·{' '}
                {parsed.confidence} confidence
              </Text>
            </View>

            <Text style={styles.label}>Assign each item</Text>
            {parsed.line_items.map((item, i) => (
              <View key={i} style={styles.itemCard}>
                <View style={styles.itemHead}>
                  <Text style={styles.itemDesc}>{item.description}</Text>
                  <Text style={styles.itemAmount}>{formatMoney(item.amount)}</Text>
                </View>
                <View style={styles.itemBadge}>
                  <Text style={styles.itemBadgeText}>{item.category}</Text>
                </View>
                <View style={styles.assignChips}>
                  {members.map((m) => {
                    const on = assignments[i]?.has(m.user_id);
                    return (
                      <Pressable
                        key={m.user_id}
                        style={[styles.chip, on && styles.chipActive]}
                        onPress={() => toggleAssign(i, m.user_id)}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextActive]}>
                          {m.profile.display_name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <Text style={styles.label}>Paid by</Text>
            <View style={styles.assignChips}>
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

            {unassignedCount > 0 ? (
              <Text style={styles.warn}>
                {unassignedCount} item(s) are unassigned and will be left out.
              </Text>
            ) : null}

            {!previewed ? (
              <Pressable
                style={[styles.button, split.totalCents <= 0 && styles.buttonDisabled]}
                onPress={() => setPreviewed(true)}
                disabled={split.totalCents <= 0}
              >
                <Text style={styles.buttonText}>Preview split</Text>
              </Pressable>
            ) : (
              <View style={styles.previewCard}>
                <View style={styles.previewHead}>
                  <Text style={styles.previewTitle}>Split preview</Text>
                  <Text style={styles.previewTotal}>
                    {formatMoney(split.totalCents / 100)}
                  </Text>
                </View>
                {[...split.perUser.entries()].map(([uid, cents]) => (
                  <View key={uid} style={styles.previewRow}>
                    <Text style={styles.previewName}>{nameFor(uid)}</Text>
                    <Text style={styles.previewAmount}>{formatMoney(cents / 100)}</Text>
                  </View>
                ))}
                <Pressable
                  style={[
                    styles.button,
                    (saving || !paidBy) && styles.buttonDisabled,
                  ]}
                  onPress={onSave}
                  disabled={saving || !paidBy}
                >
                  <Text style={styles.buttonText}>
                    {saving ? 'Saving…' : 'Save expense'}
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 10 },
  label: { fontSize: 14, color: '#666', marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#1d9e75',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#1d9e75', fontSize: 15, fontWeight: '600' },
  error: { color: '#c0392b', fontSize: 14 },
  warn: { color: '#b9770e', fontSize: 14 },
  loading: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  loadingText: { color: '#666', fontSize: 15 },
  headerCard: {
    backgroundColor: '#f3faf7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cce8dd',
    borderRadius: 12,
    padding: 16,
  },
  restaurant: { fontSize: 18, fontWeight: '700' },
  totalNote: { fontSize: 13, color: '#777', marginTop: 2 },
  itemCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemDesc: { fontSize: 16, fontWeight: '500', flex: 1 },
  itemAmount: { fontSize: 16, fontWeight: '600' },
  itemBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  itemBadgeText: { fontSize: 12, color: '#666' },
  assignChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: '#1d9e75', borderColor: '#1d9e75' },
  chipText: { fontSize: 13, color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  previewCard: {
    backgroundColor: '#f3faf7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cce8dd',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTitle: { fontSize: 16, fontWeight: '700' },
  previewTotal: { fontSize: 16, fontWeight: '700', color: '#1d9e75' },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  previewName: { fontSize: 15 },
  previewAmount: { fontSize: 15, fontWeight: '600' },
});
