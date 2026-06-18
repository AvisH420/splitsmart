import { supabase } from '../supabase';
import type { ExpenseComment } from '../types';
import { unwrap, unwrapList } from './util';

/**
 * Comments on an expense. RLS lets group members read all comments on
 * expenses in their groups and write/delete only their own.
 */
export async function listComments(expenseId: string): Promise<ExpenseComment[]> {
  const rows = unwrapList(
    await supabase
      .from('expense_comments')
      .select('*')
      .eq('expense_id', expenseId)
      .order('created_at', { ascending: true })
  );
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const profiles = unwrapList(
    await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids)
  );
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return rows.map((r) => ({
    ...r,
    author: byId.get(r.user_id) ?? {
      id: r.user_id,
      display_name: 'Unknown',
      avatar_url: null,
    },
  }));
}

/** Insert a comment as the current user (RLS pins user_id to auth.uid()). */
export async function addComment(
  expenseId: string,
  content: string
): Promise<{ id: string; created_at: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');
  return unwrap(
    await supabase
      .from('expense_comments')
      .insert({ expense_id: expenseId, user_id: userId, content: content.trim() })
      .select('id, created_at')
      .single()
  );
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('expense_comments')
    .delete()
    .eq('id', commentId);
  if (error) throw new Error(error.message);
}
