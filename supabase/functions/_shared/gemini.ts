// Thin wrapper over the Google Gemini REST API. The API key is read from the
// GEMINI_API_KEY secret and never logged. All AI calls in this project go
// through these helpers.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const GENERATE_MODEL = 'gemini-2.5-flash'; // text + vision
export const EMBED_MODEL = 'text-embedding-004'; // 768-dim embeddings

function apiKey(): string {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  return key;
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

type GenerateOpts = {
  prompt: string;
  system?: string;
  /** Optional inline image for vision calls. */
  image?: { mimeType: string; base64: string };
  /** Force application/json output (used for structured extraction). */
  json?: boolean;
  temperature?: number;
};

async function generate(opts: GenerateOpts): Promise<string> {
  const parts: Part[] = [{ text: opts.prompt }];
  if (opts.image) {
    parts.push({
      inlineData: { mimeType: opts.image.mimeType, data: opts.image.base64 },
    });
  }

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(
    `${BASE}/${GENERATE_MODEL}:generateContent?key=${apiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini generate failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');
  return text;
}

/** Strip ```json fences if the model wrapped its output despite instructions. */
function unfence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/** Generate and parse a JSON object from the model. */
export async function geminiJSON<T>(opts: Omit<GenerateOpts, 'json'>): Promise<T> {
  const raw = await generate({ ...opts, json: true });
  try {
    return JSON.parse(unfence(raw)) as T;
  } catch {
    throw new Error(`Gemini did not return valid JSON: ${raw.slice(0, 500)}`);
  }
}

/** Generate freeform text (e.g. a one-sentence summary). */
export async function geminiText(opts: Omit<GenerateOpts, 'json'>): Promise<string> {
  return (await generate({ ...opts, json: false })).trim();
}

/** Embed a piece of text into a 768-dim vector via text-embedding-004. */
export async function geminiEmbed(text: string): Promise<number[]> {
  const res = await fetch(
    `${BASE}/${EMBED_MODEL}:embedContent?key=${apiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini embed failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const values: number[] | undefined = data?.embedding?.values;
  if (!values?.length) throw new Error('Gemini returned no embedding');
  return values;
}
