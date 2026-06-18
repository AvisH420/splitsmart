import { supabase } from '../supabase';

/**
 * Store (or refresh) the current user's Expo push token. One row per user
 * (unique user_id), so this upserts on conflict. RLS restricts writes to the
 * caller's own row.
 */
export async function upsertPushToken(
  userId: string,
  token: string
): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}
