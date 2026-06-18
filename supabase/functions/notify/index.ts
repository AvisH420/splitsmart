import { createClient } from 'npm:@supabase/supabase-js@2';
import { preflight, json, errorResponse } from '../_shared/cors.ts';

// General-purpose push dispatcher. Invoked by the database webhooks (see the
// Phase 5 migration), never by the app directly, so it is deployed with
// --no-verify-jwt and instead authenticates the caller by requiring the
// service-role key as the Bearer token. It then uses that same service-role
// key to read push_tokens across users (a trusted server-side context with no
// end-user JWT — the one justified RLS bypass in this codebase).

const EXPO_PUSH_URL = 'https://exp.host/api/v2/push/send';
const CHUNK_SIZE = 100; // Expo recommends <=100 messages per request.

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader !== `Bearer ${serviceKey}`) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const { user_ids, title, body, data } = await req.json();
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return json({ sent: 0, failed: 0 });
    }
    if (!title || !body) return errorResponse('title and body are required');

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    const { data: rows, error } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', user_ids);
    if (error) return errorResponse(error.message, 500);

    const tokens = (rows ?? [])
      .map((r: { token: string }) => r.token)
      .filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));

    if (tokens.length === 0) return json({ sent: 0, failed: 0 });

    let sent = 0;
    let failed = 0;

    for (const batch of chunk(tokens, CHUNK_SIZE)) {
      const messages = batch.map((to) => ({
        to,
        title,
        body,
        data: data ?? {},
        sound: 'default',
      }));
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        });
        const result = await res.json();
        // Expo returns { data: [{ status: 'ok' | 'error', ... }] }.
        const tickets: { status?: string }[] = Array.isArray(result?.data)
          ? result.data
          : [];
        for (const t of tickets) {
          if (t.status === 'ok') sent += 1;
          else failed += 1;
        }
        // Any tickets not returned count as failures.
        failed += Math.max(0, batch.length - tickets.length);
      } catch (_) {
        failed += batch.length;
      }
    }

    return json({ sent, failed });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
