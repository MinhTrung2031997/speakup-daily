// SpeakUp Daily AI proxy: signed-in users call Gemini through here, so the API key
// stays on the server (Edge Function secret GEMINI_API_KEY) and never reaches the browser.
//
// POST /functions/v1/ai
//   Authorization: Bearer <user access token>
//   { system?: string, turns: [{ role: 'user'|'model', text?: string, parts?: Part[] }],
//     temperature?: number, model?: string, fastMode?: boolean, json?: boolean }
//   Part = { text: string } | { inlineData: { mimeType: 'audio/...', data: <base64> } }
// -> 200 { text: string, model: string }
// -> 4xx/5xx { error: { kind, message } }   kind: nokey | auth | quota | blocked | server | bad_request | other
import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
// Same fallback order as the old browser client (src/lib/gemini.ts). Full Flash and 2.5 models are
// left out on purpose: on new keys 2.5 is "no longer available" and full Flash can hang for 60s+.
const FALLBACKS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const ATTEMPT_TIMEOUT_MS = 25000; // per Gemini call; on timeout switch to the next model
const TOTAL_BUDGET_MS = 120000; // stay well inside the Edge Function wall-clock limit
const MAX_BODY_BYTES = 12 * 1024 * 1024; // room for ~8 MB of base64 audio
const MAX_TURNS = 80;
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
const fail = (status: number, kind: string, message: string) => reply(status, { error: { kind, message } });

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
interface Turn { role: 'user' | 'model'; text?: string; parts?: Part[] }

function cleanParts(t: Turn): Part[] | null {
  const out: Part[] = [];
  if (typeof t.text === 'string' && t.text) out.push({ text: t.text });
  for (const p of Array.isArray(t.parts) ? t.parts : []) {
    if (p && typeof (p as { text?: unknown }).text === 'string') out.push({ text: (p as { text: string }).text });
    else if (p && (p as { inlineData?: unknown }).inlineData) {
      const d = (p as { inlineData: { mimeType?: unknown; data?: unknown } }).inlineData;
      if (typeof d.mimeType !== 'string' || !/^audio\/[a-z0-9.+-]+(;.*)?$/i.test(d.mimeType)) return null;
      if (typeof d.data !== 'string' || !d.data) return null;
      out.push({ inlineData: { mimeType: d.mimeType.split(';')[0], data: d.data } });
    } else return null;
  }
  return out.length ? out : null;
}

let autoModel: string | null = null; // remembered working model for this function instance

async function listModels(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    if (!res.ok) return null;
    const data = await res.json();
    const names: string[] = (data?.models || [])
      .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .filter((n: string) => /^gemini/.test(n) && !/(tts|image|audio|live|embedding|vision|robotics|computer-use|native)/.test(n));
    const score = (n: string) => {
      let sc = 0;
      if (/flash-lite-latest$/.test(n)) sc += 2000;
      if (/flash-latest$/.test(n)) sc += 1000;
      if (/flash/.test(n)) sc += 500;
      if (/lite/.test(n)) sc += 300;
      if (/^gemini-2\./.test(n)) sc -= 1000;
      if (/(preview|exp)/.test(n)) sc -= 50;
      const v = n.match(/gemini-(\d+(?:\.\d+)?)/);
      if (v) sc += parseFloat(v[1]) * 10;
      return sc;
    };
    return names.sort((a, b) => score(b) - score(a))[0] || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');

  // 1. Require a real signed-in user (the gateway's verify_jwt also accepts the anon key).
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'auth', 'Please sign in again.');
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return fail(401, 'auth', 'Your session expired. Please sign in again.');

  // 2. The Gemini key lives only here.
  const key = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  if (!key) return fail(503, 'nokey', 'AI key not set up yet. Ask the app owner to set the GEMINI_API_KEY secret in Supabase.');

  // 3. Validate the request.
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return fail(413, 'bad_request', 'The request is too large (audio must be under ~8 MB).');
  let body: { system?: unknown; turns?: unknown; temperature?: unknown; model?: unknown; fastMode?: unknown; json?: unknown };
  try { body = await req.json(); } catch { return fail(400, 'bad_request', 'Invalid JSON body.'); }
  const turns = Array.isArray(body.turns) ? (body.turns as Turn[]) : [];
  if (!turns.length || turns.length > MAX_TURNS) return fail(400, 'bad_request', 'Send between 1 and 80 turns.');
  const contents = [];
  for (const t of turns) {
    if (t?.role !== 'user' && t?.role !== 'model') return fail(400, 'bad_request', 'Each turn needs role "user" or "model".');
    const parts = cleanParts(t);
    if (!parts) return fail(400, 'bad_request', 'Each turn needs text or audio (audio/* inline data).');
    contents.push({ role: t.role, parts });
  }
  const system = typeof body.system === 'string' ? body.system : '';
  const temperature = typeof body.temperature === 'number' ? Math.min(2, Math.max(0, body.temperature)) : 0.8;
  const fastMode = body.fastMode !== false;
  const wantJson = body.json !== false;
  const requested = typeof body.model === 'string' && /^[a-z0-9][a-z0-9.\-]{2,60}$/i.test(body.model.replace(/^models\//, ''))
    ? body.model.replace(/^models\//, '')
    : DEFAULT_MODEL;

  // 4. Call Gemini, switching model if the requested one is unavailable or slow.
  let model = autoModel && requested === DEFAULT_MODEL ? autoModel : requested;
  const tried = new Set<string>();
  let listed = false;
  const switchModel = async () => {
    tried.add(model);
    let alt = FALLBACKS.find((m) => !tried.has(m));
    if (!alt && !listed) { listed = true; const f = await listModels(key); if (f && !tried.has(f)) alt = f; }
    if (!alt) return false;
    model = alt;
    if (requested === DEFAULT_MODEL) autoModel = alt;
    return true;
  };

  let last = { status: 502, kind: 'server', message: 'Google AI is busy right now. Please try again in a moment.' };
  const started = Date.now();
  for (let attempt = 0; attempt < 6; attempt++) {
    const left = TOTAL_BUDGET_MS - (Date.now() - started);
    if (left < 3000) break;
    const generationConfig: Record<string, unknown> = { temperature };
    if (wantJson) generationConfig.responseMimeType = 'application/json';
    if (fastMode && /^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const payload: Record<string, unknown> = { contents, generationConfig };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };

    let res: Response;
    try {
      res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, left)),
      });
    } catch (e) {
      const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
      if (timedOut) {
        console.warn(`Gemini model ${model} timed out after ${ATTEMPT_TIMEOUT_MS / 1000}s; switching model`);
        last = { status: 504, kind: 'server', message: 'Google AI took too long to answer. Please try again.' };
        if (await switchModel()) continue;
        break;
      }
      last = { status: 502, kind: 'server', message: 'Could not reach Google AI. Please try again.' };
      continue;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg: string = data?.error?.message || res.statusText || 'Unknown error';
      if (res.status === 404 || /no longer available|not available to new users/i.test(msg) || ((res.status === 400 || res.status === 403) && /model/i.test(msg) && /(not found|not supported|unsupported)/i.test(msg))) {
        if (await switchModel()) continue;
        return fail(400, 'other', `Model "${model}" isn't available. Pick another model in Settings.`);
      }
      if ((res.status === 400 && /api key/i.test(msg)) || res.status === 401 || res.status === 403) {
        console.error('Gemini auth error', res.status, msg);
        return fail(502, 'nokey', 'AI key not set up yet (the server key was rejected by Google). Ask the app owner to check GEMINI_API_KEY.');
      }
      if (res.status === 429) return fail(429, 'quota', 'The free AI limit was reached. Wait a minute and try again.');
      if (res.status >= 500) {
        last = { status: 502, kind: 'server', message: 'Google AI is busy right now. Please try again in a moment.' };
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return fail(400, 'other', `AI error (${res.status}): ${msg}`);
    }
    const cand = data?.candidates?.[0];
    if (!cand) {
      const reason = data?.promptFeedback?.blockReason;
      return fail(422, 'blocked', reason ? `The request was blocked (${reason}). Try rephrasing.` : 'The AI returned no answer. Please try again.');
    }
    const text: string = (cand.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
    if (!text) {
      last = cand.finishReason === 'SAFETY'
        ? { status: 422, kind: 'blocked', message: 'The answer was blocked by safety filters. Try rephrasing.' }
        : { status: 502, kind: 'server', message: 'The AI returned an empty answer. Please try again.' };
      if (cand.finishReason === 'SAFETY') break;
      continue;
    }
    return reply(200, { text, model });
  }
  return fail(last.status, last.kind, last.message);
});
