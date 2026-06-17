import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { listGroups } from '../../lib/repositories/groups';
import type { Group } from '../../lib/types';

export default function GroupsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reload whenever the screen regains focus so a newly created group shows
  // up after returning from the modal.
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
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
                <Text style={styles.headerIcon}>👤</Text>
              </Pressable>
              <Pressable onPress={signOut} hitSlop={8}>
                <Text style={styles.headerAction}>Sign out</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      {loading ? (
        <ActivityIndicator style={styles.center} size="large" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={groups.length === 0 && styles.center}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No groups yet. Create one to start splitting expenses.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/groups/${item.id}`)}
            >
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowChevron}>›</Text>
            </Pressable>
          )}
        />
      )}

      <Link href="/groups/new" asChild>
        <Pressable style={styles.fab}>
          <Text style={styles.fabText}>+ New Group</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#999', fontSize: 15, textAlign: 'center' },
  error: { color: '#c0392b', fontSize: 14, padding: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowTitle: { flex: 1, fontSize: 17, fontWeight: '500' },
  rowChevron: { fontSize: 22, color: '#ccc' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerIcon: { fontSize: 20 },
  headerAction: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 32,
    backgroundColor: '#1d9e75',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
