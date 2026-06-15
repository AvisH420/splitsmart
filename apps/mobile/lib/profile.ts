import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Ensure a `profiles` row exists for the authenticated user.
 *
 * The primary mechanism is the `on_auth_user_created` database trigger
 * (see supabase/migrations). This client-side upsert is an idempotent
 * safety net for edge cases (e.g. users created before the trigger
 * existed, or a future auth provider that bypasses it).
 *
 * `ignoreDuplicates: true` means an existing row is left untouched,
 * so we never overwrite a display name the user has edited.
 */
export async function ensureProfile(user: User): Promise<void> {
  const fallbackName = user.email?.split('@')[0] ?? 'User';
  const displayName =
    (user.user_metadata?.display_name as string | undefined)?.trim() || fallbackName;

  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      display_name: displayName,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  if (error) {
    // Non-fatal: the trigger has almost certainly created the row already.
    console.warn('ensureProfile failed:', error.message);
  }
}
