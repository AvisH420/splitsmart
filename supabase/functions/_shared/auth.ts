import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Build a Supabase client that runs under the *caller's* RLS context by
 * forwarding their JWT. Throws if the Authorization header is missing so the
 * handler can return 401. SUPABASE_URL / SUPABASE_ANON_KEY are injected into
 * every Edge Function's environment by the platform.
 */
export function userClientFromRequest(req: Request): {
  supabase: SupabaseClient;
  authHeader: string;
} {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Response('Missing Authorization header', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  return { supabase, authHeader };
}

/** The authenticated user's id, or throws a 401 Response if the JWT is bad. */
export async function requireUserId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Response('Not authenticated', { status: 401 });
  }
  return user.id;
}
