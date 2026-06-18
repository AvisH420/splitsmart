import { preflight, json, errorResponse } from '../_shared/cors.ts';
import { userClientFromRequest } from '../_shared/auth.ts';
import { geminiEmbed } from '../_shared/gemini.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { supabase } = userClientFromRequest(req);

    const { group_id, query, limit } = await req.json();
    if (!group_id) return errorResponse('group_id is required');
    if (!query || typeof query !== 'string') {
      return errorResponse('query is required');
    }

    const embedding = await geminiEmbed(query);

    // match_group_memories runs SECURITY INVOKER, so RLS still scopes results
    // to groups the caller belongs to.
    const { data, error } = await supabase.rpc('match_group_memories', {
      p_group_id: group_id,
      query_embedding: embedding,
      match_count: typeof limit === 'number' ? limit : 5,
    });

    if (error) return errorResponse(error.message, 400);
    return json({ memories: data ?? [] });
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse((e as Error).message, 500);
  }
});
