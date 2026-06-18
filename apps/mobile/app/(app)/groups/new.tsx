import { Stack, useRouter } from 'expo-router';
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
import { AnimatedScreen } from '../../../lib/components/AnimatedScreen';
import { Button } from '../../../lib/components/Button';
import { GradientBackground } from '../../../lib/components/GradientBackground';
import { Input } from '../../../lib/components/Input';
import { ScreenHeader } from '../../../lib/components/ScreenHeader';
import { createGroup } from '../../../lib/repositories/groups';
import { useTheme, type Theme } from '../../../lib/theme';

export default function NewGroupScreen() {
  const t = useTheme();
  const styles = makeStyles(t);
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const group = await createGroup(name);
      router.replace(`/groups/${group.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="New group" onBack={() => router.back()} />
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
              <Input
                label="Group name"
                placeholder="e.g. Goa Trip"
                value={name}
                onChangeText={setName}
                returnKeyType="done"
                onSubmitEditing={() => name.trim() && onCreate()}
              />
              <Text style={styles.hint}>
                You can invite people once the group is created.
              </Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button
                title="Create group"
                onPress={onCreate}
                loading={submitting}
                disabled={!name.trim()}
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
