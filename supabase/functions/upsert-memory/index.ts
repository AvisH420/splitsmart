import { preflight, json } from '../_shared/cors.ts';

// Scaffolding health-check; real implementation lands in Phase 4 feature 2.
Deno.serve((req) => {
  const pre = preflight(req);
  if (pre) return pre;
  return json({ ok: true, function: 'upsert-memory' });
});
