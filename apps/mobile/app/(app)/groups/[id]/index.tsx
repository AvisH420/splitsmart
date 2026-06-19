import { Feather } from '@expo/vector-icons';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../../lib/auth-context';
import { computeBalances } from '../../../../lib/balances';
import { EXPENSE_CATEGORIES } from '../../../../lib/categories';
import { AnimatedListItem } from '../../../../lib/components/AnimatedListItem';
import { AnimatedMoney } from '../../../../lib/components/AnimatedMoney';
import { AnimatedScreen } from '../../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../../lib/components/Avatar';
import { Button } from '../../../../lib/components/Button';
import { GlassCard } from '../../../../lib/components/GlassCard';
import { GradientBackground } from '../../../../lib/components/GradientBackground';
import { Input } from '../../../../lib/components/Input';
import { PressableScale } from '../../../../lib/components/PressableScale';
import { ScreenHeader } from '../../../../lib/components/ScreenHeader';
import { Skeleton } from '../../../../lib/components/Skeleton';
import { formatMoney } from '../../../../lib/format';
import { generateGroupPDF } from '../../../../lib/utils/exportPdf';
import {
  listExpenses,
  listParticipantsForGroup,
  listPayersForGroup,
} from '../../../../lib/repositories/expenses';
import { getGroup, uploadGroupCover } from '../../../../lib/repositories/groups';
import { listMembers } from '../../../../lib/repositories/members';
import { listMemories } from '../../../../lib/repositories/memories';
import { listSettlements } from '../../../../lib/repositories/settlements';
import { useTheme, type Theme } from '../../../../lib/theme';
import type {
  Expense,
  ExpenseCategory,
  Group,
  GroupMemberWithProfile,
  GroupMemory,
  MemberBalance,
  Settlement,
} from '../../../../lib/types';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const t = useTheme();
  const styles = makeStyles(t);
  const insets = useSafeAreaInsets();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [memories, setMemories] = useState<GroupMemory[]>([]);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expenseQuery, setExpenseQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | null>(null);

  const filteredExpenses = useMemo(() => {
    const q = expenseQuery.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        (q === '' || e.title.toLowerCase().includes(q)) &&
        (categoryFilter === null || e.category === categoryFilter)
    );
  }, [expenses, expenseQuery, categoryFilter]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(null);
      (async () => {
        try {
          const [g, mem, exp, parts, setl, pyrs, mems] = await Promise.all([
            getGroup(id),
            listMembers(id),
            listExpenses(id),
            listParticipantsForGroup(id),
            listSettlements(id),
            listPayersForGroup(id),
            listMemories(id),
          ]);
          if (!active) return;
          setGroup(g);
          setMembers(mem);
          setExpenses(exp);
          setSettlements(setl);
          setBalances(computeBalances(mem, exp, parts, setl, pyrs));
          setMemories(mems);
        } catch (e) {
          if (active) setError((e as Error).message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [id])
  );

  const nameFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile.display_name ?? 'Someone';
  const memoriesFor = (userId: string) =>
    memories.filter((m) => m.subject_user_id === userId);

  const myNet = balances.find((b) => b.userId === currentUserId)?.net ?? 0;
  const totalSpent = expenses.reduce((a, e) => a + e.total_amount, 0);

  const onExport = async () => {
    if (!group || exporting) return;
    setExporting(true);
    try {
      const uri = await generateGroupPDF(group, members, expenses, settlements, balances);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: `${group.name} summary`,
        });
      }
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a group cover.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    try {
      const url = await uploadGroupCover(id, result.assets[0].base64);
      setGroup((g) => (g ? { ...g, cover_url: url } : g));
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    }
  };

  const renderActions = (color: string) => (
    <>
      <Pressable
        onPress={() => router.push({ pathname: '/assistant', params: { group_id: id } })}
        hitSlop={8}
      >
        <Feather name="zap" size={20} color={color} />
      </Pressable>
      <Pressable onPress={() => router.push(`/groups/${id}/receipt`)} hitSlop={8}>
        <Feather name="camera" size={20} color={color} />
      </Pressable>
      <Pressable onPress={() => router.push(`/groups/${id}/activity`)} hitSlop={8}>
        <Feather name="clock" size={20} color={color} />
      </Pressable>
      <Pressable onPress={onExport} disabled={exporting} hitSlop={8}>
        {exporting ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Feather name="download" size={20} color={color} />
        )}
      </Pressable>
    </>
  );

  const header = group?.cover_url ? (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ImageBackground
        source={{ uri: group.cover_url }}
        style={[styles.cover, { height: 160 + insets.top }]}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.coverTop, { paddingTop: insets.top + t.spacing.sm }]}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="chevron-left" size={26} color={t.colors.white} />
          </Pressable>
          <View style={styles.coverActions}>{renderActions(t.colors.white)}</View>
        </View>
        <Pressable style={styles.coverNameWrap} onLongPress={pickCover} delayLongPress={400}>
          <Text style={styles.coverName}>{group.name}</Text>
        </Pressable>
      </ImageBackground>
    </>
  ) : (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={group?.name ?? 'Group'}
        onBack={() => router.back()}
        right={
          <>
            {renderActions(t.colors.accent)}
            <Pressable onPress={pickCover} hitSlop={8}>
              <Feather name="image" size={20} color={t.colors.accent} />
            </Pressable>
          </>
        }
      />
    </>
  );

  if (loading) {
    return (
      <GradientBackground>
        {header}
        <View style={styles.skeletonWrap}>
          <Skeleton height={180} radius={t.radii.lg} />
          <Skeleton height={16} width="40%" />
          <Skeleton height={120} radius={t.radii.lg} />
          <Skeleton height={16} width="40%" />
          <Skeleton height={72} radius={t.radii.lg} />
          <Skeleton height={72} radius={t.radii.lg} />
        </View>
      </GradientBackground>
    );
  }
  if (error) {
    return (
      <GradientBackground>
        {header}
        <Text style={styles.error}>{error}</Text>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      {header}
      <AnimatedScreen>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Balance hero */}
            <GlassCard style={styles.hero}>
              <Text style={styles.heroLabelSpaced}>Your balance</Text>
              {myNet !== 0 ? (
                <AnimatedMoney
                  value={Math.abs(myNet)}
                  style={[styles.heroAmount, myNet > 0 ? styles.positive : styles.negative]}
                />
              ) : null}
              <Text style={styles.heroSub}>
                {myNet === 0
                  ? 'All settled'
                  : myNet > 0
                    ? 'you are owed overall'
                    : 'you owe overall'}
              </Text>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <AnimatedMoney value={totalSpent} style={styles.statValue} />
                  <Text style={styles.statLabel}>Total spent</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{expenses.length}</Text>
                  <Text style={styles.statLabel}>
                    {expenses.length === 1 ? 'Expense' : 'Expenses'}
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{members.length}</Text>
                  <Text style={styles.statLabel}>
                    {members.length === 1 ? 'Member' : 'Members'}
                  </Text>
                </View>
              </View>

              <Button
                title="Settle up"
                variant="secondary"
                onPress={() => router.push(`/groups/${id}/settle`)}
                style={styles.heroButton}
              />
            </GlassCard>

            {/* Balances */}
            <Text style={styles.sectionTitle}>Balances</Text>
            <GlassCard style={styles.listCard}>
              {balances.map((b, i) => (
                <View
                  key={b.userId}
                  style={[styles.listRow, i > 0 && styles.divider]}
                >
                  <Avatar
                    name={b.displayName}
                    uri={members.find((m) => m.user_id === b.userId)?.profile.avatar_url}
                    size={36}
                  />
                  <Text style={styles.rowName}>{b.displayName}</Text>
                  <View style={styles.balanceRight}>
                    <Text
                      style={[
                        styles.balanceAmount,
                        b.net > 0 ? styles.positive : b.net < 0 ? styles.negative : styles.neutral,
                      ]}
                    >
                      {b.net === 0 ? 'settled' : formatMoney(Math.abs(b.net))}
                    </Text>
                    {b.net !== 0 ? (
                      <Text style={styles.balanceLabel}>
                        {b.net > 0 ? 'owed' : 'owes'}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </GlassCard>

            {/* Members */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Members</Text>
              <Pressable
                onPress={() => router.push(`/groups/${id}/members`)}
                hitSlop={8}
                style={styles.sectionAction}
              >
                <Feather name="user-plus" size={16} color={t.colors.accent} />
                <Text style={styles.actionText}>Invite</Text>
              </Pressable>
            </View>
            <GlassCard style={styles.listCard}>
              {members.map((m, i) => (
                <View
                  key={m.user_id}
                  style={[styles.listRow, i > 0 && styles.divider]}
                >
                  <Avatar name={m.profile.display_name} uri={m.profile.avatar_url} size={36} />
                  <Text style={styles.rowName}>{m.profile.display_name}</Text>
                  {memoriesFor(m.user_id).length > 0 ? (
                    <Pressable
                      onPress={() =>
                        router.push({ pathname: '/assistant', params: { group_id: id } })
                      }
                      hitSlop={8}
                    >
                      <Feather name="cpu" size={16} color={t.colors.accentLight} />
                    </Pressable>
                  ) : null}
                  <Text style={styles.roleBadge}>{m.role}</Text>
                </View>
              ))}
            </GlassCard>

            {/* Expenses */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Expenses</Text>
              <Pressable
                onPress={() => router.push(`/groups/${id}/expense`)}
                hitSlop={8}
                style={styles.sectionAction}
              >
                <Feather name="plus" size={16} color={t.colors.accent} />
                <Text style={styles.actionText}>Add</Text>
              </Pressable>
            </View>

            {expenses.length === 0 ? (
              <GlassCard style={styles.emptyCard}>
                <Feather name="file-text" size={32} color={t.colors.textTertiary} />
                <Text style={styles.emptyTitle}>No expenses yet</Text>
                <Text style={styles.emptyBody}>
                  Add one manually, describe it to the assistant, or scan a receipt.
                </Text>
              </GlassCard>
            ) : (
              <>
                <Input
                  placeholder="Search expenses"
                  value={expenseQuery}
                  onChangeText={setExpenseQuery}
                  autoCapitalize="none"
                  style={styles.search}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                  keyboardShouldPersistTaps="handled"
                >
                  <FilterChip
                    label="All"
                    active={categoryFilter === null}
                    onPress={() => setCategoryFilter(null)}
                  />
                  {EXPENSE_CATEGORIES.map((c) => (
                    <FilterChip
                      key={c.value}
                      label={c.label}
                      active={categoryFilter === c.value}
                      onPress={() =>
                        setCategoryFilter((cur) => (cur === c.value ? null : c.value))
                      }
                    />
                  ))}
                </ScrollView>

                {filteredExpenses.length === 0 ? (
                  <Text style={styles.noMatch}>No expenses match your filters.</Text>
                ) : (
                  <View style={styles.expenseList}>
                    {filteredExpenses.map((e, i) => (
                      <AnimatedListItem key={e.id} index={i}>
                      <PressableScale
                        onPress={() => router.push(`/groups/${id}/expenses/${e.id}`)}
                      >
                        <GlassCard style={styles.expenseRow}>
                          <View style={styles.expenseMain}>
                            <Text style={styles.expenseTitle}>{e.title}</Text>
                            <Text style={styles.expenseMeta}>{nameFor(e.paid_by)} paid</Text>
                          </View>
                          <Text style={styles.expenseAmount}>
                            {formatMoney(e.total_amount, e.currency)}
                          </Text>
                        </GlassCard>
                      </PressableScale>
                      </AnimatedListItem>
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </AnimatedScreen>
    </GradientBackground>
  );
}

function FilterChip({
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
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  content: { padding: t.spacing.xl, gap: t.spacing.lg, paddingBottom: t.spacing.xxxl },
  center: { flex: 1 },
  skeletonWrap: { padding: t.spacing.xl, gap: t.spacing.md },
  cover: { width: '100%', justifyContent: 'space-between' },
  coverTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.xl,
    paddingBottom: t.spacing.sm,
  },
  coverActions: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg },
  coverNameWrap: { paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.md },
  coverName: {
    fontSize: 26,
    fontWeight: '700',
    color: t.colors.white,
    letterSpacing: -0.2,
  },
  error: {
    color: t.colors.negative,
    fontSize: t.typography.sizes.sm,
    padding: t.spacing.xl,
  },
  hero: { padding: t.spacing.xl, alignItems: 'center', gap: t.spacing.xs },
  heroLabel: {
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.medium,
    color: t.colors.textSecondary,
  },
  heroAmount: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heroLabelSpaced: {
    fontSize: 11,
    color: t.colors.textTertiary,
    letterSpacing: t.typography.tracking.widest,
    textTransform: 'uppercase',
  },
  heroSub: {
    fontSize: 15,
    fontWeight: '300',
    color: t.colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: t.spacing.lg,
    paddingTop: t.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.hairline,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: '70%',
    backgroundColor: t.colors.hairline,
  },
  statValue: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
  },
  statLabel: { fontSize: t.typography.sizes.xs, color: t.colors.textTertiary },
  heroButton: { marginTop: t.spacing.lg, alignSelf: 'stretch' },
  sectionTitle: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  actionText: {
    color: t.colors.accent,
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.semibold,
  },
  listCard: { paddingHorizontal: t.spacing.lg },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingVertical: t.spacing.md,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.hairline,
  },
  rowName: {
    flex: 1,
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.medium,
    color: t.colors.textPrimary,
  },
  balanceRight: { alignItems: 'flex-end' },
  balanceAmount: {
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.bold,
  },
  balanceLabel: { fontSize: t.typography.sizes.xs, color: t.colors.textTertiary },
  roleBadge: {
    fontSize: t.typography.sizes.xs,
    color: t.colors.textTertiary,
    textTransform: 'capitalize',
  },
  positive: { color: t.colors.positive },
  negative: { color: t.colors.negative },
  neutral: { color: t.colors.textSecondary },
  search: { marginBottom: t.spacing.xs },
  filterRow: { flexDirection: 'row', gap: t.spacing.sm, paddingVertical: t.spacing.xs },
  filterChip: {
    backgroundColor: t.colors.accentSubtle,
    borderRadius: t.radii.full,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs + 2,
  },
  filterChipActive: { backgroundColor: t.colors.accent },
  filterChipText: {
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.medium,
    color: t.colors.accent,
  },
  filterChipTextActive: { color: t.colors.white },
  expenseList: { gap: t.spacing.sm },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: t.spacing.lg,
  },
  expenseMain: { flex: 1, gap: 2 },
  expenseTitle: {
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.semibold,
    color: t.colors.textPrimary,
  },
  expenseMeta: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
  expenseAmount: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
  },
  noMatch: {
    color: t.colors.textTertiary,
    fontSize: t.typography.sizes.sm,
    paddingVertical: t.spacing.sm,
  },
  emptyCard: { padding: t.spacing.xl, alignItems: 'center', gap: t.spacing.sm },
  emptyTitle: {
    fontSize: t.typography.sizes.md,
    fontWeight: t.typography.weights.bold,
    color: t.colors.textPrimary,
  },
  emptyBody: {
    fontSize: t.typography.sizes.sm,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },
});
