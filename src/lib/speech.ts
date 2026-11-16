import { useCallback, useEffect, useRef, useState } from 'react';

/* ---------------- Speech-to-text (Web Speech API) ---------------- */

// Minimal typings for the (still prefixed) Web Speech API.
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRErrorEvent { error: string }
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

function getSR(): SRCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const speechRecognitionSupported = (): boolean => !!getSR();

/** A fresh continuous en-US recogniser with interim results, or null if unsupported. */
export function createRecognition(): SpeechRecognitionLike | null {
  const SR = getSR();
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  return rec;
}

/** One mic session: what was heard plus timing, used for fluency stats. */
export interface SpeechSample {
  transcript: string;
  startedAt: number;
  endedAt: number;
  /** Time of the first / last recognition result (0 if nothing was heard). */
  firstResultAt: number;
  lastResultAt: number;
  /** Silent gaps (ms) longer than PAUSE_MS between recognition results. */
  pauses: number[];
}

export const PAUSE_MS = 2000;

export interface RecognitionHandlers {
  /** Called with final text chunks as they are recognised. */
  onFinal: (text: string) => void;
  /** Called when a recording session ends, with its length in seconds. */
  onSession?: (seconds: number) => void;
  /** Called when a recording session ends, with its transcript and timing. */
  onSample?: (sample: SpeechSample) => void;
}

export function useSpeechRecognition({ onFinal, onSession, onSample }: RecognitionHandlers) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const startedAt = useRef(0);
  const handlers = useRef({ onFinal, onSession, onSample });
  handlers.current = { onFinal, onSession, onSample };
  const timing = useRef({ first: 0, last: 0, pauses: [] as number[], finals: [] as string[] });
  const supported = speechRecognitionSupported();

  const finish = useCallback(() => {
    if (startedAt.current) {
      const now = Date.now();
      handlers.current.onSession?.((now - startedAt.current) / 1000);
      const t = timing.current;
      handlers.current.onSample?.({
        transcript: t.finals.join(' ').trim(),
        startedAt: startedAt.current,
        endedAt: now,
        firstResultAt: t.first,
        lastResultAt: t.last,
        pauses: t.pauses,
      });
      startedAt.current = 0;
    }
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    const SR = getSR();
    if (!SR) {
      setError("Voice input isn't supported in this browser. Try Chrome, Edge or Safari, or just type your answer.");
      return;
    }
    setError('');
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const now = Date.now();
      const t = timing.current;
      if (t.last && now - t.last > PAUSE_MS) t.pauses.push(now - t.last);
      if (!t.first) t.first = now;
      t.last = now;
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          t.finals.push(r[0].transcript.trim());
          handlers.current.onFinal(r[0].transcript.trim());
        }
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wantRef.current = false;
      const map: Record<string, string> = {
        'not-allowed': 'Microphone permission was blocked. Allow mic access in your browser settings, or type instead.',
        'service-not-allowed': 'Speech recognition is not allowed here. Try Chrome or Edge, or type instead.',
        network: 'Speech recognition needs an internet connection. Please try again.',
        'audio-capture': 'No microphone was found.',
      };
      setError(map[e.error] || `Voice input error: ${e.error}`);
    };
    rec.onend = () => {
      // Chrome stops after a pause; keep going until the user presses stop.
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through */
        }
      }
      finish();
    };
    recRef.current = rec;
    wantRef.current = true;
    timing.current = { first: 0, last: 0, pauses: [], finals: [] };
    try {
      rec.start();
      startedAt.current = Date.now();
      setListening(true);
    } catch {
      wantRef.current = false;
      setError('Could not start the microphone. Please try again.');
    }
  }, [finish]);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  useEffect(() => () => {
    wantRef.current = false;
    recRef.current?.abort();
  }, []);

  return { supported, listening, interim, error, start, stop, toggle: listening ? stop : start };
}

/* ---------------- Text-to-speech (speechSynthesis) ---------------- */

export const ttsSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
      all.sort((a, b) => Number(b.lang === 'en-US') - Number(a.lang === 'en-US') || a.name.localeCompare(b.name));
      setVoices(all);
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

export function pickVoice(voiceURI: string): SpeechSynthesisVoice | undefined {
  if (!ttsSupported()) return undefined;
  const all = window.speechSynthesis.getVoices();
  return all.find((v) => v.voiceURI === voiceURI) || all.find((v) => v.lang === 'en-US') || all.find((v) => v.lang.startsWith('en'));
}

/** Speak one piece of text. Resolves when finished (or cancelled). */
export function speak(text: string, opts: { voiceURI: string; rate: number }): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(opts.voiceURI);
    if (v) u.voice = v;
    u.lang = v?.lang || 'en-US';
    u.rate = opts.rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/* ---------------- Two-voice dialogue playback (Listen tab) ---------------- */

const langOf = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();

/**
 * Two different voices for a dialogue in the chosen accent (en-US or en-GB). Falls back to the
 * closest English voices when the device lacks one; `pitch` separates the speakers if both
 * end up on the same voice.
 */
export function dialogueVoices(accent: 'US' | 'UK'): { voice?: SpeechSynthesisVoice; pitch: number; fallback: boolean }[] {
  if (!ttsSupported()) return [{ pitch: 1, fallback: true }, { pitch: 1, fallback: true }];
  const all = window.speechSynthesis.getVoices().filter((v) => langOf(v).startsWith('en'));
  const want = accent === 'UK' ? 'en-gb' : 'en-us';
  const exact = all.filter((v) => langOf(v) === want);
  // Prefer the accent, then other English voices (en-AU, en-IE... sound closer than a US/UK swap), then anything English.
  const near = all.filter((v) => !exact.includes(v) && !['en-us', 'en-gb'].includes(langOf(v)));
  const rest = all.filter((v) => !exact.includes(v) && !near.includes(v));
  const ordered = [...exact, ...near, ...rest];
  const a = ordered[0];
  const b = ordered.find((v) => v !== a);
  return [
    { voice: a, pitch: 1, fallback: !a || langOf(a) !== want },
    b ? { voice: b, pitch: 1, fallback: langOf(b) !== want } : { voice: a, pitch: 0.75, fallback: true },
  ];
}

/** Speak with an explicit voice/pitch. Resolves when finished, cancelled, or after a safety timeout. */
export function speakWith(text: string, opts: { voice?: SpeechSynthesisVoice; rate: number; pitch?: number; lang?: string }): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
    // Some browsers never fire onend (e.g. no voices installed); don't hang the player.
    const words = text.split(/\s+/).length;
    const timer = setTimeout(finish, Math.max(4000, (words / (2.6 * opts.rate)) * 1000 * 2 + 3000));
    const u = new SpeechSynthesisUtterance(text);
    if (opts.voice) u.voice = opts.voice;
    u.lang = opts.voice?.lang || opts.lang || 'en-US';
    u.rate = opts.rate;
    u.pitch = opts.pitch ?? 1;
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  });
}
