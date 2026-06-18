import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
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
import { AnimatedScreen } from '../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../lib/components/Avatar';
import { Button } from '../../../lib/components/Button';
import { GlassCard } from '../../../lib/components/GlassCard';
import { GradientBackground } from '../../../lib/components/GradientBackground';
import { Input } from '../../../lib/components/Input';
import { PressableScale } from '../../../lib/components/PressableScale';
import { ScreenHeader } from '../../../lib/components/ScreenHeader';
import { categoryLabel } from '../../../lib/categories';
import { formatMoney } from '../../../lib/format';
import { parseExpense, searchExpenses, upsertMemory } from '../../../lib/repositories/ai';
import { saveExpense } from '../../../lib/repositories/expenses';
import { listGroups } from '../../../lib/repositories/groups';
import { listMembers } from '../../../lib/repositories/members';
import { deleteMemory, listMemories } from '../../../lib/repositories/memories';
import { computeSplit, validateSplit, type SplitInput } from '../../../lib/splits';
import { useTheme, type Theme } from '../../../lib/theme';
import type {
  ExpenseSearchResult,
  Group,
  GroupMemberWithProfile,
  GroupMemory,
  ParsedExpense,
} from '../../../lib/types';

export default function AssistantScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
  const { group_id } = useLocalSearchParams<{ group_id?: string }>();
  const router = useRouter();

  const [mode, setMode] = useState<'assistant' | 'search'>('assistant');
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [prompt, setPrompt] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ExpenseSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [context, setContext] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedExpense | null>(null);

  const [memories, setMemories] = useState<GroupMemory[]>([]);
  const [memoryText, setMemoryText] = useState('');
  const [memorySubject, setMemorySubject] = useState<string | null>(null);
  const [addingMemory, setAddingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const loadMemories = () =>
    listMemories(group_id!)
      .then(setMemories)
      .catch((e) => setMemoryError((e as Error).message));

  useEffect(() => {
    if (!group_id) {
      listGroups()
        .then(setGroups)
        .catch((e) => setError((e as Error).message));
      return;
    }
    listMembers(group_id)
      .then(setMembers)
      .catch((e) => setError((e as Error).message));
    loadMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group_id]);

  const nameFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile.display_name ?? 'Someone';
  const avatarFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile.avatar_url ?? null;

  const previewShares = useMemo(() => {
    if (!parsed) return null;
    const inputs: SplitInput[] = parsed.participants.map((p) => ({
      userId: p.user_id,
      value: p.split_value ?? undefined,
    }));
    const err = validateSplit(parsed.split_type, parsed.total_amount, inputs);
    if (err) return { error: err, shares: [] as { userId: string; amount: number }[] };
    return {
      error: null,
      shares: computeSplit(parsed.split_type, parsed.total_amount, inputs).map((s) => ({
        userId: s.userId,
        amount: s.shareAmount,
      })),
    };
  }, [parsed]);

  const onParse = async () => {
    const fullPrompt = context.trim()
      ? `${prompt.trim()}\n\nAdditional context: ${context.trim()}`
      : prompt.trim();
    if (!fullPrompt) return;
    setParsing(true);
    setError(null);
    setClarification(null);
    setParsed(null);
    try {
      const result = await parseExpense(
        group_id!,
        fullPrompt,
        members.map((m) => ({ id: m.user_id, name: m.profile.display_name }))
      );
      if (result.status === 'clarification') setClarification(result.message);
      else setParsed(result.expense);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const onSave = async () => {
    if (!parsed || previewShares?.error) return;
    setSaving(true);
    setError(null);
    try {
      const inputs: SplitInput[] = parsed.participants.map((p) => ({
        userId: p.user_id,
        value: p.split_value ?? undefined,
      }));
      await saveExpense({
        groupId: group_id!,
        paidBy: parsed.paid_by,
        title: parsed.title,
        totalAmount: Math.round(parsed.total_amount * 100) / 100,
        splitType: parsed.split_type,
        category: parsed.category,
        participants: computeSplit(parsed.split_type, parsed.total_amount, inputs),
      });
      router.replace(`/groups/${group_id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const onEditManually = () => {
    if (!parsed) return;
    router.push({
      pathname: '/groups/[id]/expense',
      params: { id: group_id!, prefill: JSON.stringify(parsed) },
    });
  };

  const onAddMemory = async () => {
    if (!memoryText.trim()) return;
    setAddingMemory(true);
    setMemoryError(null);
    try {
      await upsertMemory({
        groupId: group_id!,
        userId: memorySubject ?? '',
        content: memoryText.trim(),
        memoryType: 'preference',
      });
      setMemoryText('');
      setMemorySubject(null);
      await loadMemories();
    } catch (e) {
      setMemoryError((e as Error).message);
    } finally {
      setAddingMemory(false);
    }
  };

  const onDeleteMemory = async (memoryId: string) => {
    try {
      await deleteMemory(memoryId);
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    } catch (e) {
      setMemoryError((e as Error).message);
    }
  };

  const onSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      setSearchResult(await searchExpenses(group_id!, searchQuery.trim()));
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  // No group selected: pick one first.
  if (!group_id) {
    return (
      <GradientBackground>
        <ScreenHeader title="Assistant" />
        <AnimatedScreen>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.pickerLabel}>Choose a group to use the assistant</Text>
            {groups.map((g) => (
              <PressableScale
                key={g.id}
                onPress={() => router.setParams({ group_id: g.id })}
              >
                <GlassCard style={styles.pickerRow}>
                  <Text style={styles.pickerName}>{g.name}</Text>
                  <Feather name="chevron-right" size={20} color={t.colors.textTertiary} />
                </GlassCard>
              </PressableScale>
            ))}
          </ScrollView>
        </AnimatedScreen>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <ScreenHeader title="Assistant" />
      <AnimatedScreen>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.segment}>
                {(['assistant', 'search'] as const).map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.segmentItem, mode === m && styles.segmentActive]}
                    onPress={() => setMode(m)}
                  >
                    <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                      {m === 'assistant' ? 'Assistant' : 'Search'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {mode === 'assistant' ? (
                <>
                  <Input
                    label="Describe an expense"
                    placeholder="e.g. Rahul paid 840 for dinner, split equally between me, Priya and him"
                    value={prompt}
                    onChangeText={setPrompt}
                    multiline
                    style={styles.multiline}
                  />
                  <Button
                    title="Parse"
                    onPress={onParse}
                    loading={parsing}
                    disabled={!prompt.trim()}
                  />

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  {clarification ? (
                    <GlassCard style={styles.clarifyCard}>
                      <View style={styles.bubbleHead}>
                        <Feather name="help-circle" size={16} color={t.colors.warning} />
                        <Text style={styles.clarifyTitle}>A bit more info</Text>
                      </View>
                      <Text style={styles.clarifyText}>{clarification}</Text>
                      <Input
                        placeholder="Add details and try again"
                        value={context}
                        onChangeText={setContext}
                      />
                      <Button title="Try again" onPress={onParse} loading={parsing} />
                    </GlassCard>
                  ) : null}

                  {parsed ? (
                    <GlassCard style={styles.bubble}>
                      <View style={styles.bubbleHead}>
                        <Feather name="zap" size={16} color={t.colors.accent} />
                        <Text style={styles.bubbleHeadText}>Here's what I understood</Text>
                      </View>
                      <View style={styles.bubbleTop}>
                        <Text style={styles.bubbleTitle}>{parsed.title}</Text>
                        <Text style={styles.bubbleAmount}>
                          {formatMoney(parsed.total_amount, parsed.currency)}
                        </Text>
                      </View>
                      <Text style={styles.bubbleMeta}>
                        {nameFor(parsed.paid_by)} paid - split {parsed.split_type}
                        {parsed.category ? ` - ${categoryLabel(parsed.category)}` : ''} -{' '}
                        {parsed.confidence} confidence
                      </Text>

                      {previewShares?.error ? (
                        <Text style={styles.warn}>{previewShares.error}</Text>
                      ) : (
                        <View style={styles.shares}>
                          {previewShares?.shares.map((s) => (
                            <View key={s.userId} style={styles.shareRow}>
                              <Avatar name={nameFor(s.userId)} uri={avatarFor(s.userId)} size={28} />
                              <Text style={styles.shareName}>{nameFor(s.userId)}</Text>
                              <Text style={styles.shareAmount}>{formatMoney(s.amount)}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      <Button
                        title="Save this expense"
                        onPress={onSave}
                        loading={saving}
                        disabled={!!previewShares?.error}
                        style={styles.gap}
                      />
                      <Button title="Edit manually" variant="ghost" onPress={onEditManually} />
                    </GlassCard>
                  ) : null}

                  {/* Group memory */}
                  <View style={styles.memoryHead}>
                    <Text style={styles.sectionTitle}>Group memory</Text>
                  </View>
                  <Text style={styles.sectionHint}>
                    Things the assistant remembers about this group - used to improve
                    parsing and receipt splits.
                  </Text>

                  {memories.length > 0 ? (
                    <GlassCard style={styles.listCard}>
                      {memories.map((m, i) => (
                        <View key={m.id} style={[styles.memoryRow, i > 0 && styles.divider]}>
                          <Text style={styles.memoryContent}>
                            {m.subject_user_id ? `${nameFor(m.subject_user_id)}: ` : ''}
                            {m.content}
                          </Text>
                          <Pressable onPress={() => onDeleteMemory(m.id)} hitSlop={8}>
                            <Feather name="x" size={16} color={t.colors.textTertiary} />
                          </Pressable>
                        </View>
                      ))}
                    </GlassCard>
                  ) : (
                    <Text style={styles.memoryEmpty}>No memories yet.</Text>
                  )}

                  <Text style={styles.aboutLabel}>About</Text>
                  <View style={styles.chips}>
                    <Chip
                      label="Group"
                      active={memorySubject === null}
                      onPress={() => setMemorySubject(null)}
                    />
                    {members.map((m) => (
                      <Chip
                        key={m.user_id}
                        label={m.profile.display_name}
                        active={memorySubject === m.user_id}
                        onPress={() => setMemorySubject(m.user_id)}
                      />
                    ))}
                  </View>
                  <Input
                    placeholder="e.g. Priya is vegetarian"
                    value={memoryText}
                    onChangeText={setMemoryText}
                  />
                  {memoryError ? <Text style={styles.error}>{memoryError}</Text> : null}
                  <Button
                    title="Add memory"
                    variant="secondary"
                    onPress={onAddMemory}
                    loading={addingMemory}
                    disabled={!memoryText.trim()}
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Ask about your expenses"
                    placeholder="e.g. how much did we spend on food last month"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  <Button
                    title="Search"
                    onPress={onSearch}
                    loading={searching}
                    disabled={!searchQuery.trim()}
                  />

                  {searchError ? <Text style={styles.error}>{searchError}</Text> : null}

                  {searchResult ? (
                    <>
                      {searchResult.summary ? (
                        <GlassCard style={styles.summaryCard}>
                          <Feather name="zap" size={16} color={t.colors.accent} />
                          <Text style={styles.summary}>{searchResult.summary}</Text>
                        </GlassCard>
                      ) : null}

                      {Object.keys(searchResult.filters_applied).length > 0 ? (
                        <View style={styles.chips}>
                          {Object.entries(searchResult.filters_applied).map(([k, v]) => (
                            <View key={k} style={styles.filterChip}>
                              <Text style={styles.filterChipText}>
                                {k.replace(/_/g, ' ')}: {String(v)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {searchResult.expenses.length === 0 ? (
                        <Text style={styles.memoryEmpty}>No matching expenses.</Text>
                      ) : (
                        <View style={styles.resultList}>
                          {searchResult.expenses.map((e) => (
                            <PressableScale
                              key={e.id}
                              onPress={() => router.push(`/groups/${group_id}/expenses/${e.id}`)}
                            >
                              <GlassCard style={styles.resultRow}>
                                <View style={styles.resultMain}>
                                  <Text style={styles.resultTitle}>{e.title}</Text>
                                  <Text style={styles.resultMeta}>{nameFor(e.paid_by)} paid</Text>
                                </View>
                                <Text style={styles.resultAmount}>
                                  {formatMoney(e.total_amount, e.currency)}
                                </Text>
                              </GlassCard>
                            </PressableScale>
                          ))}
                        </View>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </AnimatedScreen>
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
  content: {
    padding: t.spacing.xl,
    gap: t.spacing.md,
    paddingBottom: t.spacing.xxxl * 2,
  },
  pickerLabel: { fontSize: t.typography.sizes.base, color: t.colors.textSecondary },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: t.spacing.lg,
  },
  pickerName: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textPrimary,
  },
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
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  gap: { marginTop: t.spacing.xs },
  error: { color: t.colors.negative, fontSize: t.typography.sizes.sm },
  warn: { color: t.colors.warning, fontSize: t.typography.sizes.sm },
  clarifyCard: { padding: t.spacing.lg, gap: t.spacing.sm },
  bubbleHead: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  clarifyTitle: {
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.warning,
  },
  clarifyText: { fontSize: t.typography.sizes.base, color: t.colors.textSecondary },
  bubble: { padding: t.spacing.lg, gap: t.spacing.sm },
  bubbleHeadText: {
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.accent,
  },
  bubbleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bubbleTitle: {
    fontSize: t.typography.sizes.lg,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
    flex: 1,
  },
  bubbleAmount: {
    fontSize: t.typography.sizes.lg,
    fontWeight: t.typography.weights.bold,
    color: t.colors.accent,
  },
  bubbleMeta: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
  shares: { gap: t.spacing.xs, marginTop: t.spacing.xs },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  shareName: { flex: 1, fontSize: t.typography.sizes.base, color: t.colors.textPrimary },
  shareAmount: {
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textPrimary,
  },
  memoryHead: { marginTop: t.spacing.md },
  sectionTitle: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textSecondary,
  },
  sectionHint: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
  listCard: { paddingHorizontal: t.spacing.lg },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingVertical: t.spacing.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.hairline },
  memoryContent: { flex: 1, fontSize: t.typography.sizes.base, color: t.colors.textPrimary },
  memoryEmpty: { color: t.colors.textTertiary, fontSize: t.typography.sizes.sm },
  aboutLabel: {
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    padding: t.spacing.lg,
  },
  summary: {
    flex: 1,
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textPrimary,
  },
  filterChip: {
    backgroundColor: t.colors.accentSubtle,
    borderRadius: t.radii.full,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  filterChipText: {
    fontSize: t.typography.sizes.xs,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.accent,
  },
  resultList: { gap: t.spacing.sm },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: t.spacing.lg },
  resultMain: { flex: 1, gap: 2 },
  resultTitle: {
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textPrimary,
  },
  resultMeta: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
  resultAmount: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
  },
});
