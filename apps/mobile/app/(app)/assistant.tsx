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
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Avatar } from '../../lib/components/Avatar';
import { categoryLabel } from '../../lib/categories';
import { formatMoney } from '../../lib/format';
import { parseExpense, searchExpenses, upsertMemory } from '../../lib/repositories/ai';
import { saveExpense } from '../../lib/repositories/expenses';
import { listMembers } from '../../lib/repositories/members';
import { deleteMemory, listMemories } from '../../lib/repositories/memories';
import { computeSplit, validateSplit, type SplitInput } from '../../lib/splits';
import type {
  ExpenseSearchResult,
  GroupMemberWithProfile,
  GroupMemory,
  ParsedExpense,
} from '../../lib/types';

export default function AssistantScreen() {
  const { group_id } = useLocalSearchParams<{ group_id: string }>();
  const router = useRouter();

  const [mode, setMode] = useState<'assistant' | 'search'>('assistant');
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [prompt, setPrompt] = useState('');

  // Search tab state.
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
    listMemories(group_id)
      .then(setMemories)
      .catch((e) => setMemoryError((e as Error).message));

  useEffect(() => {
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

  // Resolved per-person shares for the preview, recomputed from the parsed split.
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
      shares: computeSplit(parsed.split_type, parsed.total_amount, inputs).map(
        (s) => ({ userId: s.userId, amount: s.shareAmount })
      ),
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
        group_id,
        fullPrompt,
        members.map((m) => ({ id: m.user_id, name: m.profile.display_name }))
      );
      if (result.status === 'clarification') {
        setClarification(result.message);
      } else {
        setParsed(result.expense);
      }
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
        groupId: group_id,
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
      params: { id: group_id, prefill: JSON.stringify(parsed) },
    });
  };

  const onAddMemory = async () => {
    if (!memoryText.trim()) return;
    setAddingMemory(true);
    setMemoryError(null);
    try {
      await upsertMemory({
        groupId: group_id,
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
      setSearchResult(await searchExpenses(group_id, searchQuery.trim()));
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'AI Assistant' }} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === 'assistant' && styles.tabActive]}
            onPress={() => setMode('assistant')}
          >
            <Text style={[styles.tabText, mode === 'assistant' && styles.tabTextActive]}>
              Assistant
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === 'search' && styles.tabActive]}
            onPress={() => setMode('search')}
          >
            <Text style={[styles.tabText, mode === 'search' && styles.tabTextActive]}>
              Search
            </Text>
          </Pressable>
        </View>

        {mode === 'assistant' ? (
          <>
        <Text style={styles.label}>Describe the expense</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="e.g. Rahul paid 840 for dinner, split equally between me, Priya and him"
          value={prompt}
          onChangeText={setPrompt}
          multiline
        />

        <Pressable
          style={[styles.button, (parsing || !prompt.trim()) && styles.buttonDisabled]}
          onPress={onParse}
          disabled={parsing || !prompt.trim()}
        >
          <Text style={styles.buttonText}>{parsing ? 'Parsing…' : 'Parse'}</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {clarification ? (
          <View style={styles.clarifyCard}>
            <Text style={styles.clarifyTitle}>I need a bit more info</Text>
            <Text style={styles.clarifyText}>{clarification}</Text>
            <TextInput
              style={styles.input}
              placeholder="Add details and parse again"
              value={context}
              onChangeText={setContext}
            />
            <Pressable
              style={[styles.button, parsing && styles.buttonDisabled]}
              onPress={onParse}
              disabled={parsing}
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {parsed ? (
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>{parsed.title}</Text>
              <Text style={styles.previewAmount}>
                {formatMoney(parsed.total_amount, parsed.currency)}
              </Text>
            </View>
            <Text style={styles.previewMeta}>
              {nameFor(parsed.paid_by)} paid · split {parsed.split_type}
              {parsed.category ? ` · ${categoryLabel(parsed.category)}` : ''}
              {`  ·  ${parsed.confidence} confidence`}
            </Text>

            {previewShares?.error ? (
              <Text style={styles.warn}>{previewShares.error}</Text>
            ) : (
              previewShares?.shares.map((s) => (
                <View key={s.userId} style={styles.shareRow}>
                  <Avatar name={nameFor(s.userId)} uri={avatarFor(s.userId)} size={28} />
                  <Text style={styles.shareName}>{nameFor(s.userId)}</Text>
                  <Text style={styles.shareAmount}>{formatMoney(s.amount)}</Text>
                </View>
              ))
            )}

            <Pressable
              style={[
                styles.button,
                (saving || !!previewShares?.error) && styles.buttonDisabled,
              ]}
              onPress={onSave}
              disabled={saving || !!previewShares?.error}
            >
              <Text style={styles.buttonText}>
                {saving ? 'Saving…' : 'Save this expense'}
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onEditManually}>
              <Text style={styles.secondaryText}>Edit manually</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Group memory */}
        <View style={styles.memorySection}>
          <Text style={styles.sectionTitle}>Group memory</Text>
          <Text style={styles.sectionHint}>
            Things the assistant remembers about this group — used to improve
            parsing and receipt splits.
          </Text>

          {memories.length === 0 ? (
            <Text style={styles.memoryEmpty}>No memories yet.</Text>
          ) : (
            memories.map((m) => (
              <View key={m.id} style={styles.memoryRow}>
                <Text style={styles.memoryContent}>
                  {m.subject_user_id ? `${nameFor(m.subject_user_id)}: ` : ''}
                  {m.content}
                </Text>
                <Pressable onPress={() => onDeleteMemory(m.id)} hitSlop={8}>
                  <Text style={styles.memoryDelete}>Delete</Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={styles.memoryAbout}>About</Text>
          <View style={styles.subjectChips}>
            <Pressable
              style={[styles.chip, memorySubject === null && styles.chipActive]}
              onPress={() => setMemorySubject(null)}
            >
              <Text style={[styles.chipText, memorySubject === null && styles.chipTextActive]}>
                Group
              </Text>
            </Pressable>
            {members.map((m) => (
              <Pressable
                key={m.user_id}
                style={[styles.chip, memorySubject === m.user_id && styles.chipActive]}
                onPress={() => setMemorySubject(m.user_id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    memorySubject === m.user_id && styles.chipTextActive,
                  ]}
                >
                  {m.profile.display_name}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="e.g. Priya is vegetarian"
            value={memoryText}
            onChangeText={setMemoryText}
          />
          {memoryError ? <Text style={styles.error}>{memoryError}</Text> : null}
          <Pressable
            style={[
              styles.secondaryButton,
              (addingMemory || !memoryText.trim()) && styles.buttonDisabled,
            ]}
            onPress={onAddMemory}
            disabled={addingMemory || !memoryText.trim()}
          >
            <Text style={styles.secondaryText}>
              {addingMemory ? 'Adding…' : '+ Add memory'}
            </Text>
          </Pressable>
        </View>
          </>
        ) : (
          <View style={styles.searchBlock}>
            <Text style={styles.label}>Ask about your expenses</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. how much did we spend on food last month"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Pressable
              style={[
                styles.button,
                (searching || !searchQuery.trim()) && styles.buttonDisabled,
              ]}
              onPress={onSearch}
              disabled={searching || !searchQuery.trim()}
            >
              <Text style={styles.buttonText}>{searching ? 'Searching…' : 'Search'}</Text>
            </Pressable>

            {searchError ? <Text style={styles.error}>{searchError}</Text> : null}

            {searchResult ? (
              <>
                {searchResult.summary ? (
                  <Text style={styles.summary}>{searchResult.summary}</Text>
                ) : null}

                {Object.keys(searchResult.filters_applied).length > 0 ? (
                  <View style={styles.subjectChips}>
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
                  searchResult.expenses.map((e) => (
                    <Pressable
                      key={e.id}
                      style={styles.resultRow}
                      onPress={() =>
                        router.push(`/groups/${group_id}/expenses/${e.id}`)
                      }
                    >
                      <View style={styles.resultMain}>
                        <Text style={styles.resultTitle}>{e.title}</Text>
                        <Text style={styles.resultMeta}>{nameFor(e.paid_by)} paid</Text>
                      </View>
                      <Text style={styles.resultAmount}>
                        {formatMoney(e.total_amount, e.currency)}
                      </Text>
                    </Pressable>
                  ))
                )}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 10 },
  label: { fontSize: 14, color: '#666' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#1d9e75',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#1d9e75', fontSize: 15, fontWeight: '600' },
  error: { color: '#c0392b', fontSize: 14 },
  warn: { color: '#b9770e', fontSize: 14, marginTop: 4 },
  clarifyCard: {
    backgroundColor: '#fffaf0',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#f0d9a8',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  clarifyTitle: { fontSize: 15, fontWeight: '700', color: '#b9770e' },
  clarifyText: { fontSize: 14, color: '#7a5b1e' },
  previewCard: {
    backgroundColor: '#f3faf7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cce8dd',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  previewAmount: { fontSize: 18, fontWeight: '700', color: '#1d9e75' },
  previewMeta: { fontSize: 13, color: '#777' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  shareName: { flex: 1, fontSize: 15 },
  shareAmount: { fontSize: 15, fontWeight: '600' },
  memorySection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    gap: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionHint: { fontSize: 13, color: '#999' },
  memoryEmpty: { color: '#999', fontSize: 14, paddingVertical: 4 },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  memoryContent: { flex: 1, fontSize: 15 },
  memoryDelete: { color: '#c0392b', fontSize: 13, fontWeight: '600' },
  memoryAbout: { fontSize: 13, color: '#666', marginTop: 8 },
  subjectChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  tabs: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#1d9e75',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#1d9e75' },
  tabText: { fontSize: 14, color: '#1d9e75', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  searchBlock: { gap: 10 },
  summary: { fontSize: 16, fontWeight: '600', color: '#1d9e75', marginTop: 4 },
  filterChip: {
    backgroundColor: '#f3faf7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cce8dd',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterChipText: { fontSize: 12, color: '#1d9e75', fontWeight: '600' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  resultMain: { flex: 1, gap: 2 },
  resultTitle: { fontSize: 16, fontWeight: '500' },
  resultMeta: { fontSize: 13, color: '#999' },
  resultAmount: { fontSize: 16, fontWeight: '600' },
});
