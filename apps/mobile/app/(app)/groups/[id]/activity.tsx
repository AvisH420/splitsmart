import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Avatar } from '../../../../lib/components/Avatar';
import { formatMoney } from '../../../../lib/format';
import { listActivity } from '../../../../lib/repositories/activity';
import type { ActivityItem } from '../../../../lib/types';

function describe(item: ActivityItem): { name: string; text: string; amount?: string } {
  switch (item.kind) {
    case 'expense':
      return {
        name: item.payerName,
        text: `${item.payerName} added “${item.title}”${item.edited ? ' (edited)' : ''}`,
        amount: formatMoney(item.amount, item.currency),
      };
    case 'settlement':
      return {
        name: item.fromName,
        text: item.recordedByName
          ? `${item.fromName} paid ${item.toName} (logged by ${item.recordedByName})`
          : `${item.fromName} paid ${item.toName}`,
        amount: formatMoney(item.amount),
      };
    case 'member_joined':
      return { name: item.name, text: `${item.name} joined the group` };
  }
}

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(null);
      listActivity(id)
        .then((data) => active && setItems(data))
        .catch((e) => active && setError(e.message))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [id])
  );

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }
  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(it) => `${it.kind}:${it.id}`}
      contentContainerStyle={items.length === 0 && styles.center}
      ListEmptyComponent={<Text style={styles.empty}>No activity yet.</Text>}
      renderItem={({ item }) => {
        const d = describe(item);
        return (
          <View style={styles.row}>
            <Avatar name={d.name} uri={item.avatarUrl} size={36} />
            <View style={styles.body}>
              <Text style={styles.text}>{d.text}</Text>
              <Text style={styles.date}>{new Date(item.at).toLocaleString()}</Text>
            </View>
            {d.amount ? <Text style={styles.amount}>{d.amount}</Text> : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#999', fontSize: 15 },
  error: { color: '#c0392b', fontSize: 14, padding: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  body: { flex: 1, gap: 2 },
  text: { fontSize: 15 },
  date: { fontSize: 12, color: '#999' },
  amount: { fontSize: 15, fontWeight: '600' },
});
