import { supabase } from '../supabase';
import type { Invitation, InviteResult } from '../types';
import { unwrap, unwrapList } from './util';

/**
 * Invite someone to a group by email via the invite_to_group RPC.
 *   'added'   -> the email already had an account; they joined immediately.
 *   'invited' -> no account yet; a pending invitation row was created.
 * (SECURITY DEFINER server-side, because RLS hides profiles you don't already
 * share a group with - see the migration.)
 */
export async function inviteToGroup(
  groupId: string,
  email: string
): Promise<InviteResult> {
  const result = unwrap(
    await supabase.rpc('invite_to_group', {
      p_group_id: groupId,
      p_email: email.trim(),
    })
  );
  return result as InviteResult;
}

/**
 * Accept an invitation by its token: joins the caller to the group and marks
 * the invitation accepted. Returns the joined group's id. SECURITY INVOKER -
 * RLS (widened for invitees) is what authorises the join.
 */
export async function acceptInvitation(token: string): Promise<string> {
  return unwrap(await supabase.rpc('accept_invitation', { p_token: token }));
}

/**
 * The most recent pending invitation for an email in a group, if any. Used to
 * surface a shareable link right after inviting someone who has no account
 * yet (there is no email-sending backend in this MVP).
 */
export async function getPendingInvitation(
  groupId: string,
  email: string
): Promise<Invitation | null> {
  const rows = unwrapList(
    await supabase
      .from('invitations')
      .select('*')
      .eq('group_id', groupId)
      .eq('email', email.trim().toLowerCase())
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
  );
  return rows[0] ?? null;
}
