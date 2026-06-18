import { preflight, json, errorResponse } from '../_shared/cors.ts';
import { userClientFromRequest } from '../_shared/auth.ts';
import { geminiJSON, geminiText, geminiEmbed } from '../_shared/gemini.ts';

// Expense columns the app needs (deliberately excludes title_embedding).
const EXPENSE_COLS =
  'id, group_id, paid_by, title, total_amount, currency, status, split_type, category, created_at, updated_at';

const CATEGORIES = [
  'food', 'transport', 'accommodation', 'entertainment',
  'utilities', 'health', 'shopping', 'other',
];

type Filters = {
  category?: string;
  date_from?: string;
  date_to?: string;
  paid_by_name?: string;
  min_amount?: number;
  max_amount?: number;
};

function matchName(name: string, people: { id: string; name: string }[]) {
  const n = name.trim().toLowerCase();
  return (
    people.find((p) => p.name.toLowerCase() === n) ??
    people.find((p) => p.name.toLowerCase().startsWith(n)) ??
    people.find((p) => p.name.toLowerCase().includes(n)) ??
    null
  );
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { supabase } = userClientFromRequest(req);
    const { group_id, query } = await req.json();
    if (!group_id) return errorResponse('group_id is required');
    if (!query || typeof query !== 'string') return errorResponse('query is required');

    // Group members, for resolving a paid_by_name filter.
    const { data: gm } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group_id);
    const ids = (gm ?? []).map((r: { user_id: string }) => r.user_id);
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const people = (profs ?? []).map((p: { id: string; display_name: string }) => ({
      id: p.id,
      name: p.display_name,
    }));

    // 1) Extract structured filters from the query.
    const today = new Date().toISOString().slice(0, 10);
    let filters: Filters = {};
    try {
      filters = await geminiJSON<Filters>({
        system: [
          'Extract search filters from an expense query as JSON. Today is ' + today + '.',
          'Return ONLY JSON with any of these optional fields (omit unknowns):',
          '{ "category"?: one of ' + CATEGORIES.join('|') + ',',
          '  "date_from"?: "YYYY-MM-DD", "date_to"?: "YYYY-MM-DD",',
          '  "paid_by_name"?: string, "min_amount"?: number, "max_amount"?: number }',
          'Resolve relative ranges (e.g. "last month") against today.',
        ].join('\n'),
        prompt: query,
      });
    } catch (_) {
      filters = {};
    }

    const category =
      filters.category && CATEGORIES.includes(filters.category) ? filters.category : undefined;
    const payer = filters.paid_by_name ? matchName(filters.paid_by_name, people) : null;
    const filtersApplied: Filters = {
      ...(category ? { category } : {}),
      ...(filters.date_from ? { date_from: filters.date_from } : {}),
      ...(filters.date_to ? { date_to: filters.date_to } : {}),
      ...(payer ? { paid_by_name: payer.name } : {}),
      ...(typeof filters.min_amount === 'number' ? { min_amount: filters.min_amount } : {}),
      ...(typeof filters.max_amount === 'number' ? { max_amount: filters.max_amount } : {}),
    };
    const hasFilters = Object.keys(filtersApplied).length > 0;

    // 2) Lazily backfill missing title embeddings for this group (free, and
    // makes semantic search improve over time without touching save_expense).
    const { data: missing } = await supabase
      .from('expenses')
      .select('id, title')
      .eq('group_id', group_id)
      .is('title_embedding', null)
      .limit(40);
    for (const e of (missing ?? []) as { id: string; title: string }[]) {
      try {
        const emb = await geminiEmbed(e.title);
        await supabase.from('expenses').update({ title_embedding: emb }).eq('id', e.id);
      } catch (_) {
        // skip a title that fails to embed
      }
    }

    // Semantic similarity map.
    const simById = new Map<string, number>();
    try {
      const emb = await geminiEmbed(query);
      const { data: matches } = await supabase.rpc('match_expenses', {
        p_group_id: group_id,
        query_embedding: emb,
        match_count: 25,
      });
      for (const m of (matches ?? []) as { id: string; similarity: number }[]) {
        simById.set(m.id, m.similarity);
      }
    } catch (_) {
      // semantic optional
    }

    // 3) Build the result set.
    let rows: Record<string, unknown>[] = [];
    if (hasFilters) {
      let q = supabase.from('expenses').select(EXPENSE_COLS).eq('group_id', group_id);
      if (category) q = q.eq('category', category);
      if (filters.date_from) q = q.gte('created_at', filters.date_from);
      if (filters.date_to) q = q.lte('created_at', `${filters.date_to}T23:59:59`);
      if (payer) q = q.eq('paid_by', payer.id);
      if (typeof filters.min_amount === 'number') q = q.gte('total_amount', filters.min_amount);
      if (typeof filters.max_amount === 'number') q = q.lte('total_amount', filters.max_amount);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
      if (error) return errorResponse(error.message, 400);
      rows = data ?? [];
      // Re-rank by semantic similarity where available.
      rows.sort(
        (a, b) =>
          (simById.get(b.id as string) ?? -1) - (simById.get(a.id as string) ?? -1)
      );
    } else if (simById.size > 0) {
      const orderedIds = [...simById.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
      const { data } = await supabase
        .from('expenses')
        .select(EXPENSE_COLS)
        .eq('group_id', group_id)
        .in('id', orderedIds);
      const byId = new Map((data ?? []).map((r: Record<string, unknown>) => [r.id, r]));
      rows = orderedIds.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
    } else {
      // No filters and no embeddings yet: recent expenses.
      const { data } = await supabase
        .from('expenses')
        .select(EXPENSE_COLS)
        .eq('group_id', group_id)
        .order('created_at', { ascending: false })
        .limit(20);
      rows = data ?? [];
    }

    // 4) One-sentence natural-language summary.
    const total = rows.reduce((a, r) => a + Number(r.total_amount ?? 0), 0);
    let summary = '';
    try {
      summary = await geminiText({
        system:
          'Answer the user in ONE short sentence using the stats provided. ' +
          'Use the ₹ symbol for amounts. Do not list items.',
        prompt: `Query: "${query}". Results: ${rows.length} expenses totalling ₹${total.toFixed(
          2
        )}.`,
      });
    } catch (_) {
      summary = `${rows.length} expense(s) totalling ₹${total.toFixed(2)}.`;
    }

    return json({ expenses: rows, filters_applied: filtersApplied, summary });
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse((e as Error).message, 500);
  }
});
