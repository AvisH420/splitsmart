import { preflight, json, errorResponse } from '../_shared/cors.ts';
import { userClientFromRequest, requireUserId } from '../_shared/auth.ts';
import { geminiEmbed, EMBED_MODEL } from '../_shared/gemini.ts';

const MEMORY_TYPES = ['preference', 'rule', 'habit'];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { supabase } = userClientFromRequest(req);
    const authorId = await requireUserId(supabase);

    const { group_id, user_id, content, memory_type } = await req.json();
    if (!group_id) return errorResponse('group_id is required');
    if (!content || typeof content !== 'string' || !content.trim()) {
      return errorResponse('content is required');
    }

    const type = MEMORY_TYPES.includes(memory_type) ? memory_type : 'preference';

    // Generate the embedding for the memory text (768-dim).
    const embedding = await geminiEmbed(content.trim());

    // Insert under the caller's RLS context: the group_memories insert policy
    // requires author_id = auth.uid() and group membership, so we cannot write
    // into a group we don't belong to.
    const { data, error } = await supabase
      .from('group_memories')
      .insert({
        group_id,
        author_id: authorId,
        subject_user_id: user_id || null,
        memory_type: type,
        content: content.trim(),
        embedding,
        embedding_model: EMBED_MODEL,
        source: 'user_stated',
        status: 'active',
      })
      .select('id')
      .single();

    if (error) return errorResponse(error.message, 400);
    return json({ id: data.id });
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse((e as Error).message, 500);
  }
});
