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
  View,
} from 'react-native';
import { AnimatedScreen } from '../../lib/components/AnimatedScreen';
import { Button } from '../../lib/components/Button';
import { GlassCard } from '../../lib/components/GlassCard';
import { GradientBackground } from '../../lib/components/GradientBackground';
import { Input } from '../../lib/components/Input';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSignIn = async () => {
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
    }
    // On success, no navigation needed: the (auth) layout redirects
    // as soon as the session appears in context.
    setSubmitting(false);
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AnimatedScreen>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>SplitSmart</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>

            <GlassCard style={styles.card}>
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
                autoComplete="password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button
                title={submitting ? 'Signing in...' : 'Sign in'}
                onPress={onSignIn}
                loading={submitting}
                disabled={!email || !password}
                style={styles.submit}
              />
            </GlassCard>

            <Button
              title="New here? Create an account"
              variant="ghost"
              onPress={() => router.push('/signup')}
            />
          </ScrollView>
        </TouchableWithoutFeedback>
        </AnimatedScreen>
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
  },
  subtitle: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  card: { padding: theme.spacing.xl, gap: theme.spacing.md },
  submit: { marginTop: theme.spacing.sm },
  error: { color: theme.colors.negative, fontSize: theme.typography.sizes.sm },
});
