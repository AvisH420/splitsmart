import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useAuth } from '../../../../lib/auth-context';
import { AnimatedScreen } from '../../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../../lib/components/Avatar';
import { Button } from '../../../../lib/components/Button';
import { GlassCard } from '../../../../lib/components/GlassCard';
import { GradientBackground } from '../../../../lib/components/GradientBackground';
import { Input } from '../../../../lib/components/Input';
import { ScreenHeader } from '../../../../lib/components/ScreenHeader';
import { formatMoney } from '../../../../lib/format';
import { parseReceipt } from '../../../../lib/repositories/ai';
import { saveExpense } from '../../../../lib/repositories/expenses';
import { saveReceiptItems, type ReceiptItemWrite } from '../../../../lib/repositories/items';
import { listMembers } from '../../../../lib/repositories/members';
import { computeSplit, type SplitInput } from '../../../../lib/splits';
import { useTheme, type Theme } from '../../../../lib/theme';
import type {
  GroupMemberWithProfile,
  ItemCategory,
  ReceiptParseResult,
} from '../../../../lib/types';

type ReceiptCategory = 'food' | 'drink' | 'tax' | 'service_charge' | 'other';
type SplitMethod = 'equal' | 'proportional' | 'custom';

/** Editable line item (seeded from the AI parse, then user-adjustable). */
type EditItem = {
  description: string;
  amount: number;
  category: ReceiptCategory;
  isShared: boolean;
  method: SplitMethod;
  /** userId -> percent string, only used when method === 'custom'. */
  customPct: Record<string, string>;
};

const RECEIPT_CATEGORIES: ReceiptCategory[] = [
  'food',
  'drink',
  'tax',
  'service_charge',
  'other',
];

function toItemCategory(c: string): ItemCategory {
  return c === 'food' ? 'food' : 'other';
}

function resolveName(name: string, members: GroupMemberWithProfile[]): string | null {
  const n = name.trim().toLowerCase();
  const m =
    members.find((x) => x.profile.display_name.toLowerCase() === n) ??
    members.find((x) => x.profile.display_name.toLowerCase().startsWith(n)) ??
    members.find((x) => x.profile.display_name.toLowerCase().includes(n));
  return m?.user_id ?? null;
}

function parseNum(text: string | undefined): number {
  if (!text) return 0;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function ReceiptScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [context, setContext] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ReceiptParseResult | null>(null);
  const [items, setItems] = useState<EditItem[]>([]);
  const [assignments, setAssignments] = useState<Record<number, Set<string>>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [paidBy, setPaidBy] = useState<string | undefined>(currentUserId);
  const [multiPayers, setMultiPayers] = useState(false);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [previewed, setPreviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    listMembers(id)
      .then((mem) => {
        setMembers(mem);
        if (!currentUserId && mem[0]) setPaidBy(mem[0].user_id);
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const nameFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile.display_name ?? 'Someone';

  const initFromParse = (r: ReceiptParseResult) => {
    const nextItems: EditItem[] = r.line_items.map((item) => ({
      description: item.description,
      amount: item.amount,
      category: item.category,
      isShared: item.is_shared,
      method: 'equal',
      customPct: {},
    }));
    const nextAssign: Record<number, Set<string>> = {};
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
      nextAssign[i] = set;
    });
    setItems(nextItems);
    setAssignments(nextAssign);
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
      initFromParse(r);
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

  const dirty = () => setPreviewed(false);

  const toggleAssign = (itemIndex: number, userId: string) => {
    setAssignments((prev) => {
      const set = new Set(prev[itemIndex] ?? []);
      if (set.has(userId)) set.delete(userId);
      else set.add(userId);
      return { ...prev, [itemIndex]: set };
    });
    dirty();
  };

  const patchItem = (index: number, patch: Partial<EditItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
    dirty();
  };

  const setCustomPct = (index: number, userId: string, value: string) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, customPct: { ...it.customPct, [userId]: value } } : it
      )
    );
    dirty();
  };

  const setMethod = (index: number, method: SplitMethod) => patchItem(index, { method });

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setAssignments((prev) => {
      const next: Record<number, Set<string>> = {};
      let j = 0;
      for (let i = 0; i < items.length; i++) {
        if (i === index) continue;
        next[j] = prev[i] ?? new Set();
        j += 1;
      }
      return next;
    });
    if (editingIndex === index) setEditingIndex(null);
    dirty();
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { description: '', amount: 0, category: 'food', isShared: false, method: 'equal', customPct: {} },
    ]);
    setEditingIndex(items.length);
    dirty();
  };

  const setPayerAmount = (userId: string, text: string) =>
    setPayerAmounts((prev) => ({ ...prev, [userId]: text }));

  // Per-item subtotal each assignee carries from their other non-shared items
  // (used as proportional weights). Equal share of each such item.
  const individualSubtotal = (userId: string, exceptIndex: number): number => {
    let total = 0;
    items.forEach((it, idx) => {
      if (idx === exceptIndex || it.isShared) return;
      const as = [...(assignments[idx] ?? [])];
      if (as.includes(userId) && as.length > 0) total += it.amount / as.length;
    });
    return total;
  };

  // Resolve every item's split into per-user cents (always fully allocates the
  // item, so the grand total reconciles for save_expense).
  const split = useMemo(() => {
    const perUser = new Map<string, number>();
    let totalCents = 0;
    items.forEach((item, i) => {
      const assignees = [...(assignments[i] ?? [])];
      if (assignees.length === 0 || item.amount <= 0) return;
      let splitType: 'equal' | 'percentage' | 'shares';
      let inputs: SplitInput[];
      if (item.method === 'custom') {
        splitType = 'percentage';
        inputs = assignees.map((u) => ({ userId: u, value: parseNum(item.customPct[u]) }));
        if (inputs.every((x) => (x.value ?? 0) === 0)) {
          inputs = assignees.map((u) => ({ userId: u, value: 1 }));
        }
      } else if (item.method === 'proportional') {
        splitType = 'shares';
        const weights = assignees.map((u) => individualSubtotal(u, i));
        const allZero = weights.every((w) => w === 0);
        inputs = assignees.map((u, k) => ({ userId: u, value: allZero ? 1 : weights[k] }));
      } else {
        splitType = 'equal';
        inputs = assignees.map((u) => ({ userId: u }));
      }
      const shares = computeSplit(splitType, item.amount, inputs);
      shares.forEach((s) => {
        const cents = Math.round(s.shareAmount * 100);
        perUser.set(s.userId, (perUser.get(s.userId) ?? 0) + cents);
        totalCents += cents;
      });
    });
    return { perUser, totalCents };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, assignments]);

  const unassignedCount = items.filter((_, i) => (assignments[i]?.size ?? 0) === 0).length;

  // Multi-payer allocation must match the computed total.
  const payerEntries = members
    .map((m) => ({ userId: m.user_id, amount: parseNum(payerAmounts[m.user_id]) }))
    .filter((e) => e.amount > 0);
  const payerTotalCents = payerEntries.reduce((a, e) => a + Math.round(e.amount * 100), 0);
  const payersBalanced = payerTotalCents === split.totalCents && payerEntries.length >= 2;
  const payersValid = !multiPayers || payersBalanced;

  // Custom-percentage items must sum to ~100 among their assignees.
  const customValid = items.every((item, i) => {
    if (item.method !== 'custom') return true;
    const assignees = [...(assignments[i] ?? [])];
    if (assignees.length < 2) return true;
    const sum = assignees.reduce((a, u) => a + parseNum(item.customPct[u]), 0);
    return Math.abs(sum - 100) < 0.5;
  });

  const canSave =
    split.totalCents > 0 &&
    payersValid &&
    customValid &&
    editingIndex === null &&
    (multiPayers || !!paidBy);

  const onSave = async () => {
    if (!canSave) return;
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
        paidBy: multiPayers ? payerEntries[0].userId : paidBy!,
        title: parsed?.restaurant_name || 'Receipt',
        totalAmount: Math.round(split.totalCents) / 100,
        splitType: 'exact',
        category: 'food',
        participants,
        payers: multiPayers ? payerEntries : undefined,
      });

      const writes: ReceiptItemWrite[] = [];
      items.forEach((item, i) => {
        const assignees = [...(assignments[i] ?? [])];
        if (assignees.length === 0 || item.amount <= 0) return;
        const inputs: SplitInput[] =
          item.method === 'custom'
            ? assignees.map((u) => ({ userId: u, value: parseNum(item.customPct[u]) || 1 }))
            : item.method === 'proportional'
              ? assignees.map((u) => ({ userId: u, value: individualSubtotal(u, i) || 1 }))
              : assignees.map((u) => ({ userId: u }));
        const stype =
          item.method === 'custom' ? 'percentage' : item.method === 'proportional' ? 'shares' : 'equal';
        const shares = computeSplit(stype, item.amount, inputs);
        writes.push({
          name: item.description || 'Item',
          amount: item.amount,
          category: toItemCategory(item.category),
          shares: shares.map((s) => ({ userId: s.userId, amount: s.shareAmount })),
        });
      });
      await saveReceiptItems(expense.id, writes);
      router.replace(`/groups/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Scan receipt" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {!parsed && !parsing ? (
              <AnimatedScreen variant="modal">
                <View style={styles.intro}>
                  <View style={styles.iconCircle}>
                    <Feather name="camera" size={28} color={t.colors.accent} />
                  </View>
                  <Text style={styles.introTitle}>Scan a receipt</Text>
                  <Text style={styles.introBody}>
                    Snap a bill and the assistant will pull out the line items and
                    suggest who had what.
                  </Text>
                </View>
                <Input
                  label="Note (optional)"
                  placeholder="e.g. I don't drink, Priya had only the salad"
                  value={context}
                  onChangeText={setContext}
                />
                <Button title="Take photo" onPress={() => pickImage(true)} style={styles.gap} />
                <Button
                  title="Choose from library"
                  variant="secondary"
                  onPress={() => pickImage(false)}
                />
              </AnimatedScreen>
            ) : null}

            {parsing ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={t.colors.accent} />
                <Text style={styles.loadingText}>Reading your receipt...</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {parsed && !parsing ? (
              <AnimatedScreen variant="modal">
                <GlassCard style={styles.headerCard}>
                  <Text style={styles.restaurant}>{parsed.restaurant_name || 'Receipt'}</Text>
                  <Text style={styles.totalNote}>
                    {formatMoney(parsed.total_amount, parsed.currency)} - {parsed.confidence} confidence
                  </Text>
                </GlassCard>

                <Text style={styles.sectionTitle}>Items</Text>
                <View style={styles.itemList}>
                  {items.map((item, i) => {
                    const assignees = [...(assignments[i] ?? [])];
                    if (editingIndex === i) {
                      return (
                        <ItemEditor
                          key={i}
                          t={t}
                          styles={styles}
                          item={item}
                          onChange={(patch) => patchItem(i, patch)}
                          onDone={() => setEditingIndex(null)}
                        />
                      );
                    }
                    return (
                      <GlassCard key={i} style={styles.itemCard}>
                        <View style={styles.itemHead}>
                          <Text style={styles.itemDesc}>{item.description || 'Untitled item'}</Text>
                          <Text style={styles.itemAmount}>{formatMoney(item.amount)}</Text>
                          <Pressable onPress={() => setEditingIndex(i)} hitSlop={8} style={styles.iconBtn}>
                            <Feather name="edit-2" size={16} color={t.colors.accent} />
                          </Pressable>
                          <Pressable onPress={() => removeItem(i)} hitSlop={8} style={styles.iconBtn}>
                            <Feather name="trash-2" size={16} color={t.colors.negative} />
                          </Pressable>
                        </View>
                        <View style={styles.itemBadge}>
                          <Text style={styles.itemBadgeText}>
                            {item.category.replace('_', ' ')}
                            {item.isShared ? ' / shared' : ''}
                          </Text>
                        </View>
                        <View style={styles.chips}>
                          {members.map((m) => (
                            <Chip
                              key={m.user_id}
                              label={m.profile.display_name}
                              active={assignments[i]?.has(m.user_id) ?? false}
                              onPress={() => toggleAssign(i, m.user_id)}
                            />
                          ))}
                        </View>

                        {assignees.length >= 2 ? (
                          <>
                            <Text style={styles.methodLabel}>Split method</Text>
                            <View style={styles.chips}>
                              {(['equal', 'proportional', 'custom'] as SplitMethod[]).map((mth) => (
                                <Chip
                                  key={mth}
                                  label={
                                    mth === 'equal'
                                      ? 'Equal'
                                      : mth === 'proportional'
                                        ? 'Proportional'
                                        : 'Custom %'
                                  }
                                  active={item.method === mth}
                                  onPress={() => setMethod(i, mth)}
                                />
                              ))}
                            </View>
                            {item.method === 'custom' ? (
                              <CustomPct
                                t={t}
                                styles={styles}
                                assignees={assignees}
                                nameFor={nameFor}
                                customPct={item.customPct}
                                onChange={(uid, v) => setCustomPct(i, uid, v)}
                              />
                            ) : null}
                          </>
                        ) : null}
                      </GlassCard>
                    );
                  })}
                  <Pressable style={styles.addItem} onPress={addItem}>
                    <Feather name="plus" size={16} color={t.colors.accent} />
                    <Text style={styles.addItemText}>Add item</Text>
                  </Pressable>
                </View>

                {/* Who paid */}
                <View style={styles.payerHeader}>
                  <Text style={styles.sectionTitle}>Who paid</Text>
                  <Pressable style={styles.toggleRow} onPress={() => setMultiPayers((v) => !v)}>
                    <Text style={styles.toggleLabel}>Multiple payers</Text>
                    <View style={[styles.toggle, multiPayers && styles.toggleOn]}>
                      <View style={[styles.toggleKnob, multiPayers && styles.toggleKnobOn]} />
                    </View>
                  </Pressable>
                </View>
                {multiPayers ? (
                  <View>
                    {members.map((m) => (
                      <View key={m.user_id} style={styles.payerRow}>
                        <Avatar name={m.profile.display_name} uri={m.profile.avatar_url} size={28} />
                        <Text style={styles.payerName}>{m.profile.display_name}</Text>
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
                      style={[styles.allocated, payersBalanced ? styles.allocatedOk : styles.allocatedBad]}
                    >
                      {formatMoney(payerTotalCents / 100)} of {formatMoney(split.totalCents / 100)}{' '}
                      allocated
                    </Text>
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

                {unassignedCount > 0 ? (
                  <Text style={styles.warn}>
                    {unassignedCount} item(s) are unassigned and will be left out.
                  </Text>
                ) : null}
                {!customValid ? (
                  <Text style={styles.warn}>Custom percentages must add up to 100.</Text>
                ) : null}

                {!previewed ? (
                  <Button
                    title="Preview split"
                    onPress={() => setPreviewed(true)}
                    disabled={split.totalCents <= 0 || editingIndex !== null}
                    style={styles.gap}
                  />
                ) : (
                  <GlassCard style={styles.previewCard}>
                    <View style={styles.previewHead}>
                      <Text style={styles.previewTitle}>Split preview</Text>
                      <Text style={styles.previewTotal}>{formatMoney(split.totalCents / 100)}</Text>
                    </View>
                    {[...split.perUser.entries()].map(([uid, cents]) => (
                      <View key={uid} style={styles.previewRow}>
                        <Text style={styles.previewName}>{nameFor(uid)}</Text>
                        <Text style={styles.previewAmount}>{formatMoney(cents / 100)}</Text>
                      </View>
                    ))}
                    <Button
                      title="Save expense"
                      onPress={onSave}
                      loading={saving}
                      disabled={!canSave}
                      style={styles.gap}
                    />
                  </GlassCard>
                )}
              </AnimatedScreen>
            ) : null}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function ItemEditor({
  t,
  styles,
  item,
  onChange,
  onDone,
}: {
  t: Theme;
  styles: Styles;
  item: EditItem;
  onChange: (patch: Partial<EditItem>) => void;
  onDone: () => void;
}) {
  const [desc, setDesc] = useState(item.description);
  const [amount, setAmount] = useState(item.amount ? String(item.amount) : '');
  const [category, setCategory] = useState<ReceiptCategory>(item.category);
  const [isShared, setIsShared] = useState(item.isShared);

  const save = () => {
    onChange({ description: desc, amount: parseNum(amount), category, isShared });
    onDone();
  };

  return (
    <GlassCard style={styles.itemCard}>
      <Input label="Description" value={desc} onChangeText={setDesc} placeholder="Item" />
      <Input
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <Text style={styles.methodLabel}>Category</Text>
      <View style={styles.chips}>
        {RECEIPT_CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={c.replace('_', ' ')}
            active={category === c}
            onPress={() => setCategory(c)}
          />
        ))}
      </View>
      <Pressable style={styles.sharedRow} onPress={() => setIsShared((v) => !v)}>
        <View style={[styles.checkbox, isShared && styles.checkboxOn]}>
          {isShared ? <Feather name="check" size={13} color={t.colors.white} /> : null}
        </View>
        <Text style={styles.sharedLabel}>Shared item (split among everyone assigned)</Text>
      </Pressable>
      <View style={styles.editActions}>
        <Button title="Cancel" variant="ghost" onPress={onDone} />
        <Button title="Save" onPress={save} />
      </View>
    </GlassCard>
  );
}

function CustomPct({
  t,
  styles,
  assignees,
  nameFor,
  customPct,
  onChange,
}: {
  t: Theme;
  styles: Styles;
  assignees: string[];
  nameFor: (id: string) => string;
  customPct: Record<string, string>;
  onChange: (userId: string, value: string) => void;
}) {
  const sum = assignees.reduce((a, u) => a + parseNum(customPct[u]), 0);
  const ok = Math.abs(sum - 100) < 0.5;
  return (
    <View style={styles.customWrap}>
      {assignees.map((u) => (
        <View key={u} style={styles.payerRow}>
          <Text style={styles.payerName}>{nameFor(u)}</Text>
          <Input
            placeholder="%"
            value={customPct[u] ?? ''}
            onChangeText={(v) => onChange(u, v)}
            keyboardType="decimal-pad"
            style={styles.pctInput}
          />
        </View>
      ))}
      <Text style={[styles.allocated, ok ? styles.allocatedOk : styles.allocatedBad]}>
        {sum.toFixed(0)}% of 100% allocated
      </Text>
    </View>
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

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    content: { padding: t.spacing.xl, gap: t.spacing.md, paddingBottom: t.spacing.xxxl },
    intro: { alignItems: 'center', gap: t.spacing.sm, marginBottom: t.spacing.md },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: t.radii.full,
      backgroundColor: t.colors.accentSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.spacing.xs,
    },
    introTitle: {
      fontSize: t.typography.sizes.lg,
      fontWeight: t.typography.weights.bold,
      color: t.colors.textPrimary,
    },
    introBody: {
      fontSize: t.typography.sizes.base,
      color: t.colors.textSecondary,
      textAlign: 'center',
    },
    gap: { marginTop: t.spacing.sm },
    loading: { alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xxxl },
    loadingText: { color: t.colors.textSecondary, fontSize: t.typography.sizes.base },
    error: { color: t.colors.negative, fontSize: t.typography.sizes.sm },
    warn: { color: t.colors.warning, fontSize: t.typography.sizes.sm },
    headerCard: { padding: t.spacing.lg },
    restaurant: {
      fontSize: t.typography.sizes.lg,
      fontWeight: t.typography.weights.bold,
      color: t.colors.textPrimary,
    },
    totalNote: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary, marginTop: 2 },
    sectionTitle: {
      fontSize: t.typography.sizes.md,
      fontWeight: t.typography.weights.semibold,
      color: t.colors.textSecondary,
      marginTop: t.spacing.sm,
    },
    itemList: { gap: t.spacing.sm },
    itemCard: { padding: t.spacing.lg, gap: t.spacing.sm },
    itemHead: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    itemDesc: {
      fontSize: t.typography.sizes.base,
      fontWeight: t.typography.weights.medium,
      color: t.colors.textPrimary,
      flex: 1,
    },
    itemAmount: {
      fontSize: t.typography.sizes.base,
      fontWeight: t.typography.weights.bold,
      color: t.colors.textPrimary,
    },
    iconBtn: { padding: 2 },
    itemBadge: {
      alignSelf: 'flex-start',
      backgroundColor: t.colors.accentSubtle,
      borderRadius: t.radii.full,
      paddingHorizontal: t.spacing.sm,
      paddingVertical: 2,
    },
    itemBadgeText: {
      fontSize: t.typography.sizes.xs,
      color: t.colors.accent,
      textTransform: 'capitalize',
    },
    methodLabel: {
      fontSize: t.typography.sizes.sm,
      color: t.colors.textSecondary,
      marginTop: t.spacing.xs,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
    chip: {
      backgroundColor: t.colors.accentSubtle,
      borderRadius: t.radii.full,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs + 2,
    },
    chipActive: { backgroundColor: t.colors.accent },
    chipText: {
      fontSize: t.typography.sizes.sm,
      fontWeight: t.typography.weights.medium,
      color: t.colors.accent,
    },
    chipTextActive: { color: t.colors.white },
    addItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.xs,
      paddingVertical: t.spacing.md,
    },
    addItemText: {
      color: t.colors.accent,
      fontSize: t.typography.sizes.sm,
      fontWeight: t.typography.weights.semibold,
    },
    sharedRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    sharedLabel: { fontSize: t.typography.sizes.sm, color: t.colors.textPrimary, flex: 1 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: t.radii.sm,
      borderWidth: 1.5,
      borderColor: t.colors.textTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.sm },
    customWrap: { gap: t.spacing.xs, marginTop: t.spacing.xs },
    pctInput: { width: 72, textAlign: 'right' },
    payerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
    payerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingVertical: t.spacing.xs,
    },
    payerName: { flex: 1, fontSize: t.typography.sizes.base, color: t.colors.textPrimary },
    valueInput: { width: 96, textAlign: 'right' },
    allocated: {
      fontSize: t.typography.sizes.sm,
      fontWeight: t.typography.weights.semibold,
      marginTop: t.spacing.xs,
    },
    allocatedOk: { color: t.colors.positive },
    allocatedBad: { color: t.colors.negative },
    previewCard: { padding: t.spacing.lg, gap: t.spacing.sm, marginTop: t.spacing.sm },
    previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    previewTitle: {
      fontSize: t.typography.sizes.md,
      fontWeight: t.typography.weights.bold,
      color: t.colors.textPrimary,
    },
    previewTotal: {
      fontSize: t.typography.sizes.md,
      fontWeight: t.typography.weights.bold,
      color: t.colors.accent,
    },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: t.spacing.xs },
    previewName: { fontSize: t.typography.sizes.base, color: t.colors.textPrimary },
    previewAmount: {
      fontSize: t.typography.sizes.base,
      fontWeight: t.typography.weights.semibold,
      color: t.colors.textPrimary,
    },
  });
