// Shared CORS handling for every Edge Function. Origin is open ('*') because
// the app is a native client, not a browser on a fixed origin.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Respond to the CORS preflight if this is an OPTIONS request, else null. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

/** JSON success response with CORS headers attached. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** JSON error response with CORS headers attached. */
export function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}
