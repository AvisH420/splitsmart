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
import { equalSplit } from '../../../../lib/balances';
import { AnimatedScreen } from '../../../../lib/components/AnimatedScreen';
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
import { theme } from '../../../../lib/theme';
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
  const [assignments, setAssignments] = useState<Record<number, Set<string>>>({});
  const [paidBy, setPaidBy] = useState<string | undefined>(currentUserId);
  const [previewed, setPreviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load members exactly once for this screen. Guarding with a ref avoids any
  // chance of re-fetching (and resetting picked state) when the component
  // re-renders or currentUserId resolves a tick later.
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

  const split = useMemo(() => {
    const perUser = new Map<string, number>();
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
              <AnimatedScreen>
                <View style={styles.intro}>
                  <View style={styles.iconCircle}>
                    <Feather name="camera" size={28} color={theme.colors.accent} />
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
                <Button
                  title="Take photo"
                  onPress={() => pickImage(true)}
                  style={styles.gap}
                />
                <Button
                  title="Choose from library"
                  variant="secondary"
                  onPress={() => pickImage(false)}
                />
              </AnimatedScreen>
            ) : null}

            {parsing ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={theme.colors.accent} />
                <Text style={styles.loadingText}>Reading your receipt...</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {parsed && !parsing ? (
              <AnimatedScreen>
                <GlassCard style={styles.headerCard}>
                  <Text style={styles.restaurant}>{parsed.restaurant_name || 'Receipt'}</Text>
                  <Text style={styles.totalNote}>
                    {formatMoney(parsed.total_amount, parsed.currency)} - {parsed.confidence} confidence
                  </Text>
                </GlassCard>

                <Text style={styles.sectionTitle}>Assign each item</Text>
                <View style={styles.itemList}>
                  {parsed.line_items.map((item, i) => (
                    <GlassCard key={i} style={styles.itemCard}>
                      <View style={styles.itemHead}>
                        <Text style={styles.itemDesc}>{item.description}</Text>
                        <Text style={styles.itemAmount}>{formatMoney(item.amount)}</Text>
                      </View>
                      <View style={styles.itemBadge}>
                        <Text style={styles.itemBadgeText}>{item.category}</Text>
                      </View>
                      <View style={styles.chips}>
                        {members.map((m) => {
                          const on = assignments[i]?.has(m.user_id);
                          return (
                            <Chip
                              key={m.user_id}
                              label={m.profile.display_name}
                              active={!!on}
                              onPress={() => toggleAssign(i, m.user_id)}
                            />
                          );
                        })}
                      </View>
                    </GlassCard>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>Paid by</Text>
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

                {unassignedCount > 0 ? (
                  <Text style={styles.warn}>
                    {unassignedCount} item(s) are unassigned and will be left out.
                  </Text>
                ) : null}

                {!previewed ? (
                  <Button
                    title="Preview split"
                    onPress={() => setPreviewed(true)}
                    disabled={split.totalCents <= 0}
                    style={styles.gap}
                  />
                ) : (
                  <GlassCard style={styles.previewCard}>
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
                    <Button
                      title="Save expense"
                      onPress={onSave}
                      loading={saving}
                      disabled={!paidBy}
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

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: theme.spacing.xl, gap: theme.spacing.md, paddingBottom: theme.spacing.xxxl },
  intro: { alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  introTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  introBody: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  gap: { marginTop: theme.spacing.sm },
  loading: { alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xxxl },
  loadingText: { color: theme.colors.textSecondary, fontSize: theme.typography.sizes.base },
  error: { color: theme.colors.negative, fontSize: theme.typography.sizes.sm },
  warn: { color: theme.colors.warning, fontSize: theme.typography.sizes.sm },
  headerCard: { padding: theme.spacing.lg },
  restaurant: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  totalNote: { fontSize: theme.typography.sizes.sm, color: theme.colors.textTertiary, marginTop: 2 },
  sectionTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  itemList: { gap: theme.spacing.sm },
  itemCard: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemDesc: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  itemAmount: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  itemBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentSubtle,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  itemBadgeText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.accent,
    textTransform: 'capitalize',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    backgroundColor: theme.colors.accentSubtle,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
  },
  chipActive: { backgroundColor: theme.colors.accent },
  chipText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.accent,
  },
  chipTextActive: { color: theme.colors.white },
  previewCard: { padding: theme.spacing.lg, gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  previewTotal: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.accent,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.xs },
  previewName: { fontSize: theme.typography.sizes.base, color: theme.colors.textPrimary },
  previewAmount: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
});
