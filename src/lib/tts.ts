// Natural voice (Gemini TTS through the `tts` Edge Function, cached per user in Storage), with a
// fallback to the browser's speechSynthesis (best English voice for the accent). Used for "ask me the
// question aloud" and reusable for any short text (e.g. example sentences in the Words session).
import { supabase, SUPABASE_URL } from './supabase';
import { getDemoMode } from './gemini';
import { accentVoice, preferredAccent, speakWith, stopSpeaking, ttsSupported } from './speech';

export type Accent = 'US' | 'UK';
const urls = new Map<string, Promise<string>>(); // text|accent -> signed URL (valid 1 h)
let current: HTMLAudioElement | null = null;
let stopCurrent: (() => void) | null = null;

/** Signed URL for natural speech of `text` (generated once, then served from the cache). */
export function naturalSpeechUrl(text: string, accent: Accent = preferredAccent()): Promise<string> {
  const k = `${accent}|${text}`;
  let p = urls.get(k);
  if (!p) {
    p = (async () => {
      if (getDemoMode()) throw new Error('demo');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('signed out');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45000);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, accent }),
        });
        const out = await res.json().catch(() => null);
        if (!res.ok || !out?.url) throw new Error(out?.error?.message || `TTS ${res.status}`);
        return out.url as string;
      } finally { clearTimeout(t); }
    })();
    urls.set(k, p);
    p.catch(() => urls.delete(k));
    setTimeout(() => urls.delete(k), 50 * 60 * 1000); // signed URLs last 1 h
  }
  return p;
}

export function stopVoice() {
  stopCurrent?.();
  stopCurrent = null;
  if (current) { current.pause(); current = null; }
  stopSpeaking();
}

export type VoiceResult = 'natural' | 'browser' | 'blocked' | 'none';

/**
 * Speak `text`: natural voice first, browser voice if that fails. Resolves when playback ends.
 * 'blocked' = the browser refused to auto-play (no tap yet); the caller can show the play button.
 */
export async function speakNatural(text: string, opts: { accent?: Accent; voiceURI?: string; rate?: number; onStart?: (how: VoiceResult) => void } = {}): Promise<VoiceResult> {
  stopVoice();
  const accent = opts.accent || preferredAccent();
  let token = {};
  const mine = token;
  stopCurrent = () => { token = {}; };
  try {
    const url = await naturalSpeechUrl(text, accent);
    if (token !== mine) return 'none';
    const a = new Audio(url);
    a.playbackRate = opts.rate && opts.rate !== 1 ? opts.rate : 1;
    current = a;
    const ended = new Promise<void>((r) => { a.onended = () => r(); a.onpause = () => r(); a.onerror = () => r(); });
    try { await a.play(); } catch (e) {
      if ((e as Error)?.name === 'NotAllowedError') return 'blocked';
      throw e;
    }
    opts.onStart?.('natural');
    await ended;
    return 'natural';
  } catch {
    if (token !== mine) return 'none';
    if (!ttsSupported()) return 'none';
    opts.onStart?.('browser');
    await speakWith(text, { voice: accentVoice(accent, opts.voiceURI || ''), rate: opts.rate || 1, lang: accent === 'UK' ? 'en-GB' : 'en-US' });
    return 'browser';
  }
}

/** What is said aloud for a question: a casual lead-in ("Hey Trung, quick question…") + the question. */
export function spokenQuestion(question: string, name?: string): string {
  const first = (name || '').trim().split(/\s+/)[0];
  return `Hey${first ? ` ${first}` : ''}, quick question… ${question.trim()}`;
}
