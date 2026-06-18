import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
} from 'react-native';
import { Button } from '../../lib/components/Button';
import { GlassCard } from '../../lib/components/GlassCard';
import { GradientBackground } from '../../lib/components/GradientBackground';
import { Input } from '../../lib/components/Input';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';

export default function SignupScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSignUp = async () => {
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Carried into auth.users.raw_user_meta_data, read by the
        // handle_new_user() trigger to populate profiles.display_name.
        data: { display_name: displayName.trim() },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
    } else if (!data.session) {
      // Email confirmation is enabled: no session until the link is clicked.
      setNotice('Check your email to confirm your account, then sign in.');
    }
    // If a session was returned, the (auth) layout redirects automatically.
    setSubmitting(false);
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Create account</Text>

            <GlassCard style={styles.card}>
              <Input
                label="Display name"
                autoComplete="name"
                value={displayName}
                onChangeText={setDisplayName}
              />
              <Input
                label="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Input
                label="Password"
                placeholder="At least 6 characters"
                autoComplete="new-password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}

              <Button
                title={submitting ? 'Creating account...' : 'Create account'}
                onPress={onSignUp}
                loading={submitting}
                disabled={!displayName || !email || password.length < 6}
                style={styles.submit}
              />
            </GlassCard>

            <Button
              title="Already have an account? Sign in"
              variant="ghost"
              onPress={() => router.push('/login')}
            />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.sizes.display,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  card: { padding: theme.spacing.xl, gap: theme.spacing.md },
  submit: { marginTop: theme.spacing.sm },
  error: { color: theme.colors.negative, fontSize: theme.typography.sizes.sm },
  notice: { color: theme.colors.positive, fontSize: theme.typography.sizes.sm },
});
