import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
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
import { useAuth } from '../../../lib/auth-context';
import { AnimatedScreen } from '../../../lib/components/AnimatedScreen';
import { Avatar } from '../../../lib/components/Avatar';
import { Button } from '../../../lib/components/Button';
import { GlassCard } from '../../../lib/components/GlassCard';
import { GradientBackground } from '../../../lib/components/GradientBackground';
import { Input } from '../../../lib/components/Input';
import { ScreenHeader } from '../../../lib/components/ScreenHeader';
import { getProfile, updateProfile, uploadAvatar } from '../../../lib/repositories/profiles';
import { theme } from '../../../lib/theme';
import type { Profile } from '../../../lib/types';

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
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

  const name = displayName.trim() || profile?.display_name || 'You';

  return (
    <GradientBackground>
      <ScreenHeader title="Profile" />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={theme.colors.accent} />
      ) : (
        <AnimatedScreen>
          <KeyboardAvoidingView
            style={styles.fill}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.avatarBlock}>
                  <Avatar name={name} uri={avatarUrl} size={104} />
                  <Pressable onPress={onChangePhoto} disabled={uploading} hitSlop={8}>
                    <Text style={styles.changePhoto}>
                      {uploading ? 'Uploading…' : 'Change photo'}
                    </Text>
                  </Pressable>
                </View>

                <Input
                  label="Display name"
                  value={displayName}
                  onChangeText={(t) => {
                    setDisplayName(t);
                    setSavedNote(false);
                  }}
                  placeholder="Your name"
                  autoCapitalize="words"
                />

                <View style={styles.readonlyBlock}>
                  <Text style={styles.readonlyLabel}>Email</Text>
                  <Text style={styles.readonlyValue}>{profile?.email ?? '—'}</Text>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}
                {savedNote ? <Text style={styles.saved}>Saved.</Text> : null}

                <Button
                  title="Save changes"
                  onPress={onSave}
                  loading={saving}
                  disabled={!displayName.trim()}
                  style={styles.gap}
                />
                <Button title="Sign out" variant="ghost" onPress={signOut} />
              </ScrollView>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </AnimatedScreen>
      )}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xxxl * 2,
  },
  center: { flex: 1 },
  avatarBlock: { alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  changePhoto: {
    color: theme.colors.accent,
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
  },
  readonlyBlock: { gap: theme.spacing.xs },
  readonlyLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textSecondary,
  },
  readonlyValue: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textPrimary,
    paddingVertical: theme.spacing.sm,
  },
  error: { color: theme.colors.negative, fontSize: theme.typography.sizes.sm },
  saved: { color: theme.colors.positive, fontSize: theme.typography.sizes.sm },
  gap: { marginTop: theme.spacing.sm },
});
