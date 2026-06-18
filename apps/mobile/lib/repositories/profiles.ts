import { decode } from 'base64-arraybuffer';
import { supabase } from '../supabase';
import type { Profile } from '../types';
import { unwrap } from './util';

/** The single Storage bucket that holds avatars (created in Phase 3 migration). */
const AVATAR_BUCKET = 'avatars';

export async function getProfile(userId: string): Promise<Profile> {
  return unwrap(
    await supabase.from('profiles').select('*').eq('id', userId).single()
  );
}

/**
 * Update the caller's own profile fields. RLS already restricts updates to
 * one's own row (profiles_update_own), so no extra guard is needed here.
 */
export async function updateProfile(
  userId: string,
  patch: { display_name?: string; avatar_url?: string | null }
): Promise<Profile> {
  return unwrap(
    await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single()
  );
}

/**
 * Upload a picked image (as base64) to the user's avatar object and persist
 * its public URL on the profile. The object path is `<uid>.jpg`, the exact
 * name the avatars Storage policies pin each user to. `upsert: true` so a
 * second upload replaces the first.
 *
 * A cache-busting query param is appended to the stored URL because the
 * object name never changes - without it, React Native's image cache would
 * keep showing the old photo.
 */
export async function uploadAvatar(
  userId: string,
  base64: string
): Promise<string> {
  const path = `${userId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, decode(base64), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const url = `${publicUrl}?t=${Date.now()}`;
  await updateProfile(userId, { avatar_url: url });
  return url;
}
