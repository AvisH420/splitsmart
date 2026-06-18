import { preflight, json } from '../_shared/cors.ts';

// Scaffolding health-check; real implementation lands in Phase 4 feature 1.
Deno.serve((req) => {
  const pre = preflight(req);
  if (pre) return pre;
  return json({ ok: true, function: 'parse-expense' });
});
