import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
} from 'react-native';
import { AnimatedScreen } from '../../../../lib/components/AnimatedScreen';
import { Button } from '../../../../lib/components/Button';
import { GradientBackground } from '../../../../lib/components/GradientBackground';
import { Input } from '../../../../lib/components/Input';
import { ScreenHeader } from '../../../../lib/components/ScreenHeader';
import {
  getPendingInvitation,
  inviteToGroup,
} from '../../../../lib/repositories/invitations';
import { useTheme, type Theme } from '../../../../lib/theme';
import { inviteUrl } from '../../../../lib/use-invite-link';

export default function InviteMemberScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
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
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Invite member" onBack={() => router.back()} />
      <AnimatedScreen variant="modal">
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              <Input
                label="Email address"
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
                If they already have a SplitSmart account they'll be added right
                away. Otherwise we'll create an invite link for you to share.
              </Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button
                title="Send invite"
                onPress={onInvite}
                loading={submitting}
                disabled={!email.trim()}
                style={styles.submit}
              />
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </AnimatedScreen>
    </GradientBackground>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: t.spacing.xl, gap: t.spacing.md },
  hint: { fontSize: t.typography.sizes.sm, color: t.colors.textTertiary },
  error: { color: t.colors.negative, fontSize: t.typography.sizes.sm },
  submit: { marginTop: t.spacing.sm },
});
