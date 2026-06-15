import { supabase } from '../supabase';
import type { Group } from '../types';
import { unwrap, unwrapList } from './util';

/**
 * Data-access for groups. Repositories throw on error so callers can use a
 * single try/catch; they never swallow Supabase errors silently.
 */

/** Groups the current user can see (RLS scopes this to their memberships). */
export async function listGroups(): Promise<Group[]> {
  return unwrapList(
    await supabase.from('groups').select('*').order('created_at', { ascending: false })
  );
}

export async function getGroup(groupId: string): Promise<Group> {
  return unwrap(await supabase.from('groups').select('*').eq('id', groupId).single());
}

/**
 * Create a group and add the creator as its owner. Two writes because the
 * membership row cannot be created until the group id exists; if the
 * membership insert fails we surface it (the orphan group is harmless and
 * still owned/visible to the creator via the groups SELECT policy).
 */
export async function createGroup(name: string): Promise<Group> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');

  const group = unwrap(
    await supabase
      .from('groups')
      .insert({ name: name.trim(), created_by: userId })
      .select('*')
      .single()
  );

  const { error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: userId, role: 'owner' });
  if (memberError) throw new Error(memberError.message);

  return group;
}
