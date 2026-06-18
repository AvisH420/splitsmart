import { preflight, json, errorResponse } from '../_shared/cors.ts';
import { userClientFromRequest } from '../_shared/auth.ts';
import { geminiJSON } from '../_shared/gemini.ts';

type Member = { id: string; name: string };

const CATEGORIES = [
  'food', 'transport', 'accommodation', 'entertainment',
  'utilities', 'health', 'shopping', 'other',
];

/** Raw shape we ask Gemini to produce (names, not ids). */
type RawParse = {
  title: string;
  total_amount: number;
  currency: string;
  paid_by_name: string;
  split_type: 'equal' | 'exact' | 'percentage' | 'shares';
  category: string | null;
  participants: { name: string; split_value: number | null }[];
  confidence: 'high' | 'medium' | 'low';
  clarification_needed: string | null;
};

/** Fuzzy match a free-text name to a member id: exact -> prefix -> substring. */
function matchMember(name: string, members: Member[]): Member | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return (
    members.find((m) => m.name.toLowerCase() === n) ??
    members.find((m) => m.name.toLowerCase().startsWith(n)) ??
    members.find((m) => m.name.toLowerCase().includes(n)) ??
    members.find((m) => n.includes(m.name.toLowerCase())) ??
    null
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function systemPrompt(members: Member[]): string {
  const names = members.map((m) => m.name).join(', ');
  return [
    'You convert a natural-language expense description into a single JSON object.',
    'Return ONLY the JSON object — no markdown, no commentary.',
    '',
    `The group members are: ${names}.`,
    'Use ONLY these member names for paid_by_name and participant names. Match',
    'nicknames/first names to the closest member. "me"/"I" refers to the speaker;',
    'if you cannot tell who the speaker is, set clarification_needed.',
    '',
    'JSON shape:',
    '{',
    '  "title": string,                 // short human title, e.g. "Dinner"',
    '  "total_amount": number,          // positive number in the currency',
    '  "currency": "INR",',
    '  "paid_by_name": string,          // who paid',
    '  "split_type": "equal"|"exact"|"percentage"|"shares",',
    `  "category": one of ${CATEGORIES.join('|')} or null,`,
    '  "participants": [{ "name": string, "split_value": number|null }],',
    '  "confidence": "high"|"medium"|"low",',
    '  "clarification_needed": string|null',
    '}',
    '',
    'Rules:',
    '- split_value is null for equal splits; the exact amount for "exact";',
    '  the percent (0-100) for "percentage"; the integer weight for "shares".',
    '- For exact/percentage splits, the split_values must reconcile to the total/100.',
    '- If the description is ambiguous or amounts do not add up, set',
    '  clarification_needed to a short question and leave best-effort values.',
  ].join('\n');
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    // Validates the Authorization header is present (RLS context, even though
    // this function only reads the request and calls Gemini — never writes).
    userClientFromRequest(req);

    const { prompt, group_id, members } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return errorResponse('prompt is required');
    }
    if (!group_id) return errorResponse('group_id is required');
    if (!Array.isArray(members) || members.length === 0) {
      return errorResponse('members are required');
    }

    const raw = await geminiJSON<RawParse>({
      system: systemPrompt(members),
      prompt,
    });

    if (raw.clarification_needed) {
      return json({ status: 'clarification', message: raw.clarification_needed });
    }

    // Resolve names -> member ids.
    const payer = matchMember(raw.paid_by_name ?? '', members);
    if (!payer) {
      return json({
        status: 'clarification',
        message: `Who paid? I couldn't match "${raw.paid_by_name}" to a member.`,
      });
    }

    const participants: { user_id: string; split_value: number | null }[] = [];
    for (const p of raw.participants ?? []) {
      const m = matchMember(p.name ?? '', members);
      if (!m) {
        return json({
          status: 'clarification',
          message: `I couldn't match participant "${p.name}" to a member.`,
        });
      }
      participants.push({
        user_id: m.id,
        split_value:
          p.split_value == null ? null : round2(Number(p.split_value)),
      });
    }

    const total = round2(Number(raw.total_amount));
    if (!(total > 0)) return errorResponse('Parsed total amount must be positive');
    if (participants.length === 0) {
      return errorResponse('No participants could be resolved');
    }

    const category =
      raw.category && CATEGORIES.includes(raw.category) ? raw.category : null;

    return json({
      status: 'parsed',
      expense: {
        title: (raw.title ?? '').trim() || 'Expense',
        total_amount: total,
        currency: raw.currency || 'INR',
        paid_by: payer.id,
        split_type: raw.split_type ?? 'equal',
        category,
        participants,
        confidence: raw.confidence ?? 'medium',
      },
    });
  } catch (e) {
    if (e instanceof Response) return e; // thrown by auth helper
    return errorResponse((e as Error).message, 500);
  }
});
