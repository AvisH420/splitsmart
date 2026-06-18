import { preflight, json, errorResponse } from '../_shared/cors.ts';
import { userClientFromRequest } from '../_shared/auth.ts';
import { geminiJSON, geminiEmbed } from '../_shared/gemini.ts';

type ReceiptResult = {
  restaurant_name: string | null;
  total_amount: number;
  currency: string;
  line_items: {
    description: string;
    amount: number;
    category: 'food' | 'drink' | 'tax' | 'service_charge' | 'other';
    is_shared: boolean;
  }[];
  suggested_assignments: { item_description: string; suggested_for: string[] }[];
  confidence: 'high' | 'medium' | 'low';
  clarification_needed: string | null;
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { supabase } = userClientFromRequest(req);
    const { group_id, image_base64, image_mime_type, context } = await req.json();
    if (!group_id) return errorResponse('group_id is required');
    if (!image_base64 || !image_mime_type) {
      return errorResponse('image_base64 and image_mime_type are required');
    }

    // Member names so the model can suggest who ordered what.
    const { data: gm } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group_id);
    const ids = (gm ?? []).map((r: { user_id: string }) => r.user_id);
    const { data: profs } = await supabase
      .from('profiles')
      .select('display_name')
      .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const names = (profs ?? []).map((p: { display_name: string }) => p.display_name);

    // Best-effort dietary/payment memory context (e.g. "Priya is vegetarian").
    let memoryContext = '';
    try {
      const emb = await geminiEmbed(
        context || 'dietary preferences, who does not drink alcohol'
      );
      const { data: mems } = await supabase.rpc('match_group_memories', {
        p_group_id: group_id,
        query_embedding: emb,
        match_count: 5,
      });
      if (Array.isArray(mems) && mems.length > 0) {
        memoryContext = mems.map((m: { content: string }) => `- ${m.content}`).join('\n');
      }
    } catch (_) {
      // optional
    }

    const system = [
      'You read a restaurant/bill receipt image and return ONLY a JSON object.',
      'No markdown, no commentary.',
      '',
      `Group members: ${names.join(', ')}.`,
      ...(memoryContext ? ['', 'Group context:', memoryContext] : []),
      ...(context ? ['', `User note: ${context}`] : []),
      '',
      'JSON shape:',
      '{',
      '  "restaurant_name": string|null,',
      '  "total_amount": number,',
      '  "currency": "INR",',
      '  "line_items": [{ "description": string, "amount": number,',
      '     "category": "food"|"drink"|"tax"|"service_charge"|"other",',
      '     "is_shared": boolean }],',
      '  "suggested_assignments": [{ "item_description": string,',
      '     "suggested_for": string[] }],   // member names',
      '  "confidence": "high"|"medium"|"low",',
      '  "clarification_needed": string|null',
      '}',
      '',
      'Rules:',
      '- is_shared=true for tax, service charge and clearly shared items.',
      '- Use the group context and user note to suggest assignments (e.g. exclude',
      '  non-drinkers from alcohol). Use member names exactly as given.',
      '- amounts are positive numbers in the receipt currency.',
    ].join('\n');

    const result = await geminiJSON<ReceiptResult>({
      system,
      prompt: 'Extract the receipt as specified.',
      image: { mimeType: image_mime_type, base64: image_base64 },
      temperature: 0.1,
    });

    return json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse((e as Error).message, 500);
  }
});
