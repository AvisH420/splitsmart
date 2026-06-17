import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { Avatar } from '../../lib/components/Avatar';
import { getProfile, updateProfile, uploadAvatar } from '../../lib/repositories/profiles';
import type { Profile } from '../../lib/types';

export default function ProfileScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const p = await getProfile(userId);
        setProfile(p);
        setDisplayName(p.display_name);
        setAvatarUrl(p.avatar_url);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const onChangePhoto = async () => {
    if (!userId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploading(true);
    setError(null);
    try {
      const url = await uploadAvatar(userId, result.assets[0].base64);
      setAvatarUrl(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    if (!userId || !displayName.trim()) return;
    setSaving(true);
    setError(null);
    setSavedNote(false);
    try {
      await updateProfile(userId, { display_name: displayName.trim() });
      setSavedNote(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }

  const name = displayName.trim() || profile?.display_name || 'You';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Profile' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarBlock}>
          <Avatar name={name} uri={avatarUrl} size={96} />
          <Pressable onPress={onChangePhoto} disabled={uploading} hitSlop={8}>
            <Text style={styles.changePhoto}>
              {uploading ? 'Uploading…' : 'Change photo'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={(t) => {
            setDisplayName(t);
            setSavedNote(false);
          }}
          placeholder="Your name"
          autoCapitalize="words"
        />

        <Text style={styles.label}>Email</Text>
        <Text style={styles.readonly}>{profile?.email ?? '—'}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {savedNote ? <Text style={styles.saved}>Saved.</Text> : null}

        <Pressable
          style={[styles.button, (saving || !displayName.trim()) && styles.buttonDisabled]}
          onPress={onSave}
          disabled={saving || !displayName.trim()}
        >
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 8 },
  center: { flex: 1 },
  avatarBlock: { alignItems: 'center', gap: 10, marginBottom: 16 },
  changePhoto: { color: '#1d9e75', fontSize: 15, fontWeight: '600' },
  label: { fontSize: 14, color: '#666', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  readonly: { fontSize: 16, color: '#333', paddingVertical: 10 },
  error: { color: '#c0392b', fontSize: 14, marginTop: 8 },
  saved: { color: '#1d9e75', fontSize: 14, marginTop: 8 },
  button: {
    backgroundColor: '#1d9e75',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
