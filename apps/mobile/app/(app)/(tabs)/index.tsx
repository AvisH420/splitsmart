import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../../lib/auth-context';
import { AnimatedListItem } from '../../../lib/components/AnimatedListItem';
import { AnimatedScreen } from '../../../lib/components/AnimatedScreen';
import { Button } from '../../../lib/components/Button';
import { GlassCard } from '../../../lib/components/GlassCard';
import { GradientBackground } from '../../../lib/components/GradientBackground';
import { PressableScale } from '../../../lib/components/PressableScale';
import { ScreenHeader } from '../../../lib/components/ScreenHeader';
import { listGroups } from '../../../lib/repositories/groups';
import { theme } from '../../../lib/theme';
import type { Group } from '../../../lib/types';

export default function GroupsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(null);
      listGroups()
        .then((data) => active && setGroups(data))
        .catch((e) => active && setError(e.message))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <GradientBackground>
      <ScreenHeader
        title="Groups"
        right={
          <>
            <Pressable onPress={() => router.push('/groups/new')} hitSlop={8}>
              <Feather name="plus" size={22} color={theme.colors.accent} />
            </Pressable>
            <Pressable onPress={() => router.push('/activity')} hitSlop={8}>
              <Feather name="bell" size={20} color={theme.colors.accent} />
            </Pressable>
            <Pressable onPress={signOut} hitSlop={8}>
              <Feather name="log-out" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </>
        }
      />

      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={theme.colors.accent} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <AnimatedScreen>
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={
            groups.length === 0 ? styles.emptyContent : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={40} color={theme.colors.textTertiary} />
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptyBody}>
                Create a group to start splitting expenses with friends.
              </Text>
              <Button
                title="Create a group"
                onPress={() => router.push('/groups/new')}
                style={styles.emptyButton}
              />
            </View>
          }
          renderItem={({ item, index }) => (
            <AnimatedListItem index={index}>
              <PressableScale onPress={() => router.push(`/groups/${item.id}`)}>
                <GlassCard style={styles.row}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Feather name="chevron-right" size={22} color={theme.colors.textTertiary} />
                </GlassCard>
              </PressableScale>
            </AnimatedListItem>
          )}
        />
        </AnimatedScreen>
      )}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  error: {
    color: theme.colors.negative,
    fontSize: theme.typography.sizes.sm,
    padding: theme.spacing.xl,
  },
  listContent: {
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xxxl * 2,
  },
  emptyContent: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl },
  empty: { alignItems: 'center', gap: theme.spacing.md },
  emptyTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  emptyBody: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  emptyButton: { marginTop: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  rowTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
});
