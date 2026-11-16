import { mockResponse } from './mock';
import { supabase, SUPABASE_URL } from './supabase';

export class AIError extends Error {
  constructor(message: string, public kind: 'nokey' | 'auth' | 'quota' | 'network' | 'blocked' | 'parse' | 'server' | 'other' = 'other') {
    super(message);
  }
}

export interface GeminiConfig {
  model: string;
  fastMode: boolean;
  /** Demo mode: canned sample answers, no AI calls (stored per device). */
  demo: boolean;
}

export interface GeminiTurn {
  role: 'user' | 'model';
  text: string;
  /** Optional recorded audio for this turn (base64, audio/* mime type), e.g. for pronunciation feedback. */
  audio?: { mimeType: string; data: string };
}

export const NO_KEY_MESSAGE = 'AI key not set up yet. The app owner needs to add the GEMINI_API_KEY secret in Supabase (see README).';

const DEMO_FLAG = 'speakup.demo';

export function getDemoMode(): boolean {
  if (typeof window !== 'undefined' && (window as unknown as { __SPEAKUP_MOCK__?: boolean }).__SPEAKUP_MOCK__ === true) return true;
  try { return localStorage.getItem(DEMO_FLAG) === '1'; } catch { return false; }
}

export function setDemoMode(on: boolean) {
  try { if (on) localStorage.setItem(DEMO_FLAG, '1'); else localStorage.removeItem(DEMO_FLAG); } catch { /* ignore */ }
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
    if (start >= 0 && end > start) {
      try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
    }
    throw new AIError('The AI sent an answer I could not read. Please try again.', 'parse');
  }
}

/**
 * Send a request to the `ai` Supabase Edge Function, which calls Gemini with the server-side key.
 * Returns the model's raw text.
 */
export async function callAI(cfg: GeminiConfig, system: string, turns: GeminiTurn[], temperature = 0.8, json = true): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AIError('Please sign in again to use AI features.', 'auth');
  const body = {
    system,
    temperature,
    json,
    model: cfg.model || 'gemini-flash-lite-latest',
    fastMode: cfg.fastMode,
    turns: turns.map((t) => ({
      role: t.role,
      text: t.text,
      ...(t.audio ? { parts: [{ inlineData: { mimeType: t.audio.mimeType, data: t.audio.data } }] } : {}),
    })),
  };
  let res: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new AIError('The AI took too long to answer. Please try again.', 'server');
    throw new AIError('Could not reach the AI server. Check your internet connection and try again.', 'network');
  } finally {
    clearTimeout(timer);
  }
  const out = await res.json().catch(() => null);
  if (!res.ok) {
    const kind = out?.error?.kind as string | undefined;
    const msg = (out?.error?.message as string | undefined) || (out?.msg as string | undefined) || res.statusText || 'Unknown error';
    if (kind === 'nokey') throw new AIError(NO_KEY_MESSAGE, 'nokey');
    if (res.status === 401) throw new AIError('Your session expired. Please sign out and sign in again.', 'auth');
    if (kind === 'quota' || res.status === 429) throw new AIError(msg, 'quota');
    if (kind === 'blocked') throw new AIError(msg, 'blocked');
    if (res.status === 404) throw new AIError('The AI server is not deployed yet (Edge Function "ai" not found).', 'server');
    if (res.status >= 500) throw new AIError(msg, 'server');
    throw new AIError(msg, 'other');
  }
  const text = typeof out?.text === 'string' ? out.text : '';
  if (!text) throw new AIError('The AI returned an empty answer. Please try again.', 'blocked');
  return text;
}

/**
 * Ask the AI for JSON. `task` is only used to pick a canned response in demo mode.
 */
export async function generateJSON<T>(
  cfg: GeminiConfig,
  task: string,
  system: string,
  turns: GeminiTurn[],
  temperature = 0.8,
): Promise<T> {
  if (cfg.demo || getDemoMode()) {
    await new Promise((r) => setTimeout(r, 450));
    return mockResponse(task, turns) as T;
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await callAI(cfg, system, turns, temperature, true);
      return extractJson(text) as T;
    } catch (e) {
      lastErr = e;
      // Only retry unreadable / empty / busy answers.
      if (!(e instanceof AIError) || !['parse', 'server', 'blocked', 'network'].includes(e.kind) || /safety|blocked \(/i.test(e.message)) break;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr instanceof Error ? lastErr : new AIError('Something went wrong. Please try again.');
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
