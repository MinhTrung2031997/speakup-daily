import { useEffect, useRef, useState } from 'react';
import { createRecognition, preferredAccent, speechRecognitionSupported, type SpeechRecognitionLike } from '../lib/speech';
import { speakNatural } from '../lib/tts';
import { useStore } from '../lib/store';
import Icon from './Icon';

const norm = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();

function similar(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Did Chrome hear the target word? (Simple check: exact word, or a very close spelling.) */
export function heardWord(target: string, heard: string): boolean {
  const t = norm(target);
  const words = norm(heard).split(' ').filter(Boolean);
  if (!t || !words.length) return false;
  if (norm(heard) === t || words.includes(t)) return true;
  return words.some((w) => similar(w, t) >= 0.85);
}

/** Play the target pronunciation with the user's chosen voice, a little slower. */
export function useSayWord(accent?: 'US' | 'UK') {
  const { state } = useStore();
  return (word: string) => {
    const a = accent || preferredAccent();
    return speakNatural(word, { accent: a, voiceURI: state.settings.voiceURI, rate: Math.min(0.85, state.settings.rate) });
  };
}

export type TryResult = { ok: boolean; heard: string };

/**
 * Mic button to say ONE word again. Listens for up to ~4 s, then compares what speech recognition
 * heard with the target word. Calls onResult with the outcome.
 */
export function WordTryButton({ word, onResult, compact }: { word: string; onResult?: (r: TryResult) => void; compact?: boolean }) {
  const { addSpeaking } = useStore();
  const [state, setState] = useState<'idle' | 'listening'>('idle');
  const [res, setRes] = useState<TryResult | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const supported = speechRecognitionSupported();

  useEffect(() => () => { clearTimeout(timer.current); recRef.current?.abort(); }, []);
  useEffect(() => { setRes(null); }, [word]);

  const start = () => {
    if (state === 'listening') { recRef.current?.stop(); return; }
    const rec = createRecognition();
    if (!rec) return;
    recRef.current = rec;
    let heard = '';
    const t0 = Date.now();
    rec.onresult = (e) => {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript + ' ';
      heard = txt.trim();
      if (e.results[e.results.length - 1]?.isFinal) rec.stop();
    };
    rec.onerror = () => { /* handled in onend */ };
    rec.onend = () => {
      clearTimeout(timer.current);
      recRef.current = null;
      setState('idle');
      addSpeaking((Date.now() - t0) / 1000);
      const r = { ok: heardWord(word, heard), heard };
      setRes(r);
      onResult?.(r);
    };
    setRes(null);
    setState('listening');
    try { rec.start(); } catch { setState('idle'); return; }
    timer.current = setTimeout(() => rec.stop(), 4500);
  };

  if (!supported) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={start} className={`btn-soft ${compact ? '!px-2.5 !py-1.5 text-xs' : ''} ${state === 'listening' ? '!bg-rose-500 !text-white animate-pulse' : ''}`} data-testid="word-try">
        <Icon name={state === 'listening' ? 'stop' : 'mic'} className="h-4 w-4" /> {state === 'listening' ? 'Listening…' : res ? 'Try again' : 'Say it'}
      </button>
      {res && (
        <span className={`text-sm font-medium ${res.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`} data-testid="word-try-result">
          {res.ok ? '✅ Clear!' : res.heard ? `🔁 Heard “${res.heard}”. Try once more.` : '🔁 Didn’t catch that. Try again.'}
        </span>
      )}
    </span>
  );
}
