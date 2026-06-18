import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import {
  getPendingInvitation,
  inviteToGroup,
} from '../../../../lib/repositories/invitations';
import { inviteUrl } from '../../../../lib/use-invite-link';

export default function InviteMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onInvite = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await inviteToGroup(id, email);
      if (result === 'invited') {
        // No account yet: surface a shareable link (no email backend in MVP).
        const inv = await getPendingInvitation(id, email);
        if (inv) {
          await Share.share({
            message: `Join my group on SplitSmart: ${inviteUrl(inv.token)}`,
          });
        }
      }
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Invite by email</Text>
          <TextInput
            style={styles.input}
            placeholder="friend@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="done"
            onSubmitEditing={() => email.trim() && onInvite()}
          />
          <Text style={styles.hint}>
            If they already have a SplitSmart account they’ll be added right away.
            Otherwise we’ll create an invite link for you to share.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, (submitting || !email.trim()) && styles.buttonDisabled]}
            onPress={onInvite}
            disabled={submitting || !email.trim()}
          >
            <Text style={styles.buttonText}>{submitting ? 'Inviting…' : 'Invite'}</Text>
          </Pressable>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 8 },
  label: { fontSize: 14, color: '#666' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  hint: { fontSize: 13, color: '#999' },
  error: { color: '#c0392b', fontSize: 14 },
  button: {
    backgroundColor: '#1d9e75',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
