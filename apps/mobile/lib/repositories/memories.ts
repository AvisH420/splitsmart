import { supabase } from '../supabase';
import type { GroupMemory } from '../types';
import { unwrapList } from './util';

/**
 * Group memories for display. Writing a memory (which needs an embedding) goes
 * through the upsert-memory Edge Function in lib/repositories/ai.ts; reads and
 * deletes are plain RLS-scoped table operations.
 */
export async function listMemories(groupId: string): Promise<GroupMemory[]> {
  return unwrapList(
    await supabase
      .from('group_memories')
      .select(
        'id, group_id, author_id, subject_user_id, memory_type, content, status, source, created_at, updated_at'
      )
      .eq('group_id', groupId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
  );
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const { error } = await supabase
    .from('group_memories')
    .delete()
    .eq('id', memoryId);
  if (error) throw new Error(error.message);
}
