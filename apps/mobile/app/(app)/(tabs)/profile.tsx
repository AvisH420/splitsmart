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
import { useTheme, type Theme } from '../../../lib/theme';
import { useThemeMode, type ThemeMode } from '../../../lib/theme-context';
import type { Profile } from '../../../lib/types';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ProfileScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
  const { mode, setMode } = useThemeMode();
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
        <ActivityIndicator style={styles.center} size="large" color={t.colors.accent} />
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
                      {uploading ? 'Uploading...' : 'Change photo'}
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
                  <Text style={styles.readonlyValue}>{profile?.email ?? '-'}</Text>
                </View>

                <View style={styles.section}>
                  <Text style={styles.readonlyLabel}>Appearance</Text>
                  <View style={styles.modeRow}>
                    {MODES.map((m) => {
                      const isActive = mode === m.value;
                      return (
                        <Pressable
                          key={m.value}
                          style={[styles.modeChip, isActive && styles.modeChipActive]}
                          onPress={() => setMode(m.value)}
                        >
                          <Text
                            style={[styles.modeChipText, isActive && styles.modeChipTextActive]}
                          >
                            {m.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: t.spacing.xl,
    gap: t.spacing.md,
    paddingBottom: t.spacing.xxxl * 2,
  },
  center: { flex: 1 },
  avatarBlock: { alignItems: 'center', gap: t.spacing.sm, marginBottom: t.spacing.md },
  changePhoto: {
    color: t.colors.accent,
    fontSize: t.typography.sizes.base,
    fontWeight: t.typography.weights.semibold,
  },
  readonlyBlock: { gap: t.spacing.xs },
  readonlyLabel: {
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.medium,
    color: t.colors.textSecondary,
  },
  readonlyValue: {
    fontSize: t.typography.sizes.base,
    color: t.colors.textPrimary,
    paddingVertical: t.spacing.sm,
  },
  error: { color: t.colors.negative, fontSize: t.typography.sizes.sm },
  saved: { color: t.colors.positive, fontSize: t.typography.sizes.sm },
  gap: { marginTop: t.spacing.sm },
  section: { gap: t.spacing.xs, marginTop: t.spacing.xs },
  modeRow: { flexDirection: 'row', gap: t.spacing.sm },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: t.spacing.sm + 2,
    borderRadius: t.radii.md,
    backgroundColor: t.colors.accentSubtle,
  },
  modeChipActive: { backgroundColor: t.colors.accent },
  modeChipText: {
    fontSize: t.typography.sizes.sm,
    fontWeight: t.typography.weights.medium,
    color: t.colors.accent,
  },
  modeChipTextActive: { color: t.colors.onAccent },
});
