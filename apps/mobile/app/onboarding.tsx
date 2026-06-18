import { Feather } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../lib/components/Button';
import { GlassCard } from '../lib/components/GlassCard';
import { GradientBackground } from '../lib/components/GradientBackground';
import { useOnboarding } from '../lib/onboarding-context';
import { useTheme, type Theme } from '../lib/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const FEATURES: { icon: FeatherName; text: string }[] = [
  { icon: 'users', text: 'Track shared expenses across groups' },
  { icon: 'zap', text: 'AI that understands natural language' },
  { icon: 'camera', text: 'Scan receipts and split instantly' },
];

export default function OnboardingScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { finish } = useOnboarding();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<number>>(null);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <GradientBackground>
      {index < 2 ? (
        <Pressable
          style={[styles.skip, { top: insets.top + t.spacing.md }]}
          onPress={finish}
          hitSlop={8}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      ) : null}

      <FlatList
        ref={listRef}
        data={[0, 1, 2]}
        keyExtractor={(i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <View style={[styles.page, { width, paddingTop: insets.top + t.spacing.xxxl }]}>
            {item === 0 ? (
              <ScreenOne t={t} styles={styles} />
            ) : item === 1 ? (
              <ScreenTwo t={t} styles={styles} />
            ) : (
              <ScreenThree styles={styles} onFinish={finish} />
            )}
          </View>
        )}
      />

      <View style={[styles.dots, { bottom: insets.bottom + t.spacing.xxl }]}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === index ? t.colors.accent : t.colors.surfaceBorder },
            ]}
          />
        ))}
      </View>
    </GradientBackground>
  );
}

function ScreenOne({ t, styles }: { t: Theme; styles: Styles }) {
  return (
    <View style={styles.pageInner}>
      <Text style={styles.wordmark}>SplitSmart</Text>
      <Text style={styles.subtitle}>Shared expenses, made effortless.</Text>
      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f.text} style={styles.featureRow}>
            <Feather name={f.icon} size={20} color={t.colors.accent} />
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ScreenTwo({ t, styles }: { t: Theme; styles: Styles }) {
  return (
    <View style={styles.pageInner}>
      <Text style={styles.heading}>Your AI expense assistant</Text>
      <GlassCard style={styles.mockCard}>
        <Text style={styles.mockLabel}>You</Text>
        <Text style={styles.mockPrompt}>
          Rahul paid 840 for dinner, split equally between me, Priya and him
        </Text>
        <View style={styles.mockResult}>
          <View style={styles.mockResultHead}>
            <Feather name="zap" size={14} color={t.colors.accent} />
            <Text style={styles.mockResultTitleLabel}>Parsed expense</Text>
          </View>
          <View style={styles.mockRow}>
            <Text style={styles.mockKey}>Title</Text>
            <Text style={styles.mockVal}>Dinner</Text>
          </View>
          <View style={styles.mockRow}>
            <Text style={styles.mockKey}>Amount</Text>
            <Text style={styles.mockVal}>840.00</Text>
          </View>
          <View style={styles.mockRow}>
            <Text style={styles.mockKey}>Paid by</Text>
            <Text style={styles.mockVal}>Rahul</Text>
          </View>
          <View style={styles.mockRow}>
            <Text style={styles.mockKey}>Split</Text>
            <Text style={styles.mockVal}>Equal, 3 people</Text>
          </View>
        </View>
      </GlassCard>
      <Text style={styles.caption}>
        Describe any expense in plain language and the AI handles the rest.
      </Text>
    </View>
  );
}

function ScreenThree({ styles, onFinish }: { styles: Styles; onFinish: () => void }) {
  return (
    <View style={styles.pageInner}>
      <Text style={styles.heading}>Ready to split smarter?</Text>
      <Text style={styles.subtext}>
        Create a group and add your first expense in under a minute.
      </Text>
      <Button title="Get started" onPress={onFinish} style={styles.cta} />
      <Button title="Already have an account? Sign in" variant="ghost" onPress={onFinish} />
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    skip: { position: 'absolute', right: t.spacing.xl, zIndex: 2 },
    skipText: {
      fontSize: t.typography.sizes.base,
      color: t.colors.textSecondary,
      fontWeight: t.typography.weights.medium,
    },
    page: { flex: 1, paddingHorizontal: t.spacing.xl },
    pageInner: { flex: 1, justifyContent: 'center', gap: t.spacing.lg },
    wordmark: {
      fontSize: 36,
      fontWeight: '700',
      color: t.colors.textPrimary,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 18,
      fontWeight: '300',
      color: t.colors.textSecondary,
    },
    features: { gap: t.spacing.lg, marginTop: t.spacing.lg },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
    featureText: { fontSize: 15, color: t.colors.textPrimary, flex: 1 },
    heading: {
      fontSize: 28,
      fontWeight: '700',
      color: t.colors.textPrimary,
      letterSpacing: -0.3,
    },
    mockCard: { padding: t.spacing.lg, gap: t.spacing.sm },
    mockLabel: {
      fontSize: t.typography.sizes.xs,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: t.colors.textTertiary,
    },
    mockPrompt: { fontSize: t.typography.sizes.base, color: t.colors.textPrimary },
    mockResult: {
      marginTop: t.spacing.sm,
      paddingTop: t.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.hairline,
      gap: t.spacing.xs,
    },
    mockResultHead: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
    mockResultTitleLabel: {
      fontSize: t.typography.sizes.sm,
      fontWeight: t.typography.weights.semibold,
      color: t.colors.accent,
    },
    mockRow: { flexDirection: 'row', justifyContent: 'space-between' },
    mockKey: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
    mockVal: {
      fontSize: t.typography.sizes.sm,
      color: t.colors.textPrimary,
      fontWeight: t.typography.weights.medium,
    },
    caption: { fontSize: 14, color: t.colors.textSecondary },
    subtext: { fontSize: 16, color: t.colors.textSecondary },
    cta: { marginTop: t.spacing.md },
    dots: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: t.spacing.sm,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
  });
