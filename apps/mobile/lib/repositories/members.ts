import { supabase } from '../supabase';
import type { GroupMember, GroupMemberWithProfile } from '../types';
import { unwrap, unwrapList } from './util';

/**
 * Members of a group, each joined with their profile for display.
 *
 * Done as two queries (members, then their profiles) rather than a PostgREST
 * embed: the embed needs FK-relationship metadata in the generated Database
 * type, which our hand-authored types don't declare. RLS makes both reads
 * safe — co-members' profiles are visible via profiles_select_visible.
 */
export async function listMembers(groupId: string): Promise<GroupMemberWithProfile[]> {
  const members = unwrapList(
    await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
  );
  if (members.length === 0) return [];

  const profiles = unwrapList(
    await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in(
        'id',
        members.map((m) => m.user_id)
      )
  );
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return members.map((m) => ({
    ...m,
    profile: byId.get(m.user_id) ?? {
      id: m.user_id,
      display_name: 'Unknown',
      email: null,
    },
  }));
}

/**
 * Add a member by email. Uses the add_group_member_by_email RPC because RLS
 * hides profiles of people the caller does not already share a group with,
 * so a direct client-side lookup would return nothing.
 */
export async function addMemberByEmail(
  groupId: string,
  email: string
): Promise<GroupMember> {
  return unwrap(
    await supabase.rpc('add_group_member_by_email', {
      p_group_id: groupId,
      p_email: email.trim(),
    })
  );
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
