import { mockResponse } from './mock';

export class AIError extends Error {
  constructor(message: string, public kind: 'nokey' | 'auth' | 'quota' | 'network' | 'blocked' | 'parse' | 'server' | 'other' = 'other') {
    super(message);
  }
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  fastMode: boolean;
}

export interface GeminiTurn {
  role: 'user' | 'model';
  text: string;
}


const AUTO_KEY = 'speakup.autoModel';

function getAutoModel(requested: string): string | null {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { requested: string; use: string };
    return v.requested === requested ? v.use : null;
  } catch { return null; }
}

/** Ask Google which models this key can use and pick the best fast Flash model. */
export async function findWorkingModel(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': apiKey.trim() } });
    if (!res.ok) return null;
    const data = await res.json();
    const names: string[] = (data?.models || [])
      .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .filter((n: string) => /^gemini/.test(n) && !/(tts|image|audio|live|embedding|vision|robotics|computer-use|native)/.test(n));
    if (!names.length) return null;
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
    return names.sort((a, b) => score(b) - score(a))[0];
  } catch { return null; }
}

export const DEMO_KEY = 'demo';

export function isDemoKey(key: string): boolean {
  return key.trim().toLowerCase() === DEMO_KEY || (typeof window !== 'undefined' && (window as unknown as { __SPEAKUP_MOCK__?: boolean }).__SPEAKUP_MOCK__ === true);
}

function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.search(/[[{]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new AIError('The AI sent an answer I could not read. Please try again.', 'parse');
  }
}

/**
 * Call Gemini generateContent directly from the browser and return parsed JSON.
 * `task` is only used to pick a canned response in demo / mock mode.
 */
export async function generateJSON<T>(
  cfg: GeminiConfig,
  task: string,
  system: string,
  turns: GeminiTurn[],
  temperature = 0.8,
): Promise<T> {
  if (!cfg.apiKey.trim()) throw new AIError('Add your free Gemini API key in Settings to use AI features.', 'nokey');
  if (isDemoKey(cfg.apiKey)) {
    await new Promise((r) => setTimeout(r, 450));
    return mockResponse(task, turns) as T;
  }
  const requested = (cfg.model || 'gemini-flash-lite-latest').trim().replace(/^models\//, '');
  let model = getAutoModel(requested) || requested;
  const tried = new Set<string>();
  const FALLBACKS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  let listed = false;
  const switchModel = async (): Promise<boolean> => {
    tried.add(model);
    let alt = FALLBACKS.find((m) => !tried.has(m));
    if (!alt && !listed) { listed = true; const f = await findWorkingModel(cfg.apiKey); if (f && !tried.has(f)) alt = f; }
    if (!alt) return false;
    model = alt;
    try { localStorage.setItem(AUTO_KEY, JSON.stringify({ requested, use: alt })); } catch { /* ignore */ }
    return true;
  };
  const build = () => {
    const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json', temperature };
    if (cfg.fastMode && /^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig,
      },
    };
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { url, body } = build();
    let res: Response;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey.trim() },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error)?.name === 'AbortError') {
        lastErr = new AIError(`Model "${model}" took too long to answer. Try again or pick another model in Settings.`, 'server');
        if (await switchModel()) continue;
        throw lastErr;
      }
      lastErr = new AIError('Could not reach Google AI. Check your internet connection and try again.', 'network');
      continue;
    }
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg: string = data?.error?.message || res.statusText || 'Unknown error';
      if (res.status === 400 && /api key/i.test(msg)) throw new AIError('Your Gemini API key looks invalid. Please check it in Settings.', 'auth');
      if (res.status === 401 || res.status === 403) throw new AIError(`Google refused the request (${res.status}). Check your API key in Settings. Details: ${msg}`, 'auth');
      if (res.status === 404 || (res.status === 400 && /model/i.test(msg) && /(not found|not supported|unsupported)/i.test(msg))) {
        if (await switchModel()) continue;
        throw new AIError(`Model "${model}" isn't available for your key. Open Settings and pick another model from the list.`, 'other');
      }
      if (res.status === 429) throw new AIError('You hit the free-tier rate limit. Wait a minute and try again (or switch to gemini-flash-lite-latest in Settings).', 'quota');
      if (res.status >= 500) {
        lastErr = new AIError('Google AI is busy right now. Please try again in a moment.', 'server');
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      throw new AIError(`AI error (${res.status}): ${msg}`, 'other');
    }
    const cand = data?.candidates?.[0];
    if (!cand) {
      const reason = data?.promptFeedback?.blockReason;
      throw new AIError(reason ? `The request was blocked (${reason}). Try rephrasing.` : 'The AI returned no answer. Please try again.', 'blocked');
    }
    const text: string = (cand.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
    if (!text) {
      lastErr = new AIError(cand.finishReason === 'SAFETY' ? 'The answer was blocked by safety filters. Try rephrasing.' : 'The AI returned an empty answer. Please try again.', 'blocked');
      continue;
    }
    try {
      return extractJson(text) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new AIError('Something went wrong. Please try again.');
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
