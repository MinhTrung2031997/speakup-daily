import { useEffect, useMemo, useRef, useState } from 'react';
import { markPhrases, splitSentences } from '../lib/diff';
import { preferredAccent, ttsSupported } from '../lib/speech';
import { naturalSpeechUrl, speakNatural, stopVoice } from '../lib/tts';
import { Spinner } from './ui';
import { useStore } from '../lib/store';
import Icon from './Icon';

/**
 * Reads text aloud sentence by sentence with the natural AI voice (cached per sentence; the browser voice
 * is only a fallback), highlighting the current sentence and the target phrases.
 */
export default function ListenPlayer({ text, phrases = [], hidden = false }: { text: string; phrases?: string[]; hidden?: boolean }) {
  const { state, update } = useStore();
  const { rate, voiceURI } = state.settings;
  const [accent, setAccentState] = useState(preferredAccent());
  const [loading, setLoading] = useState(false);
  const sentences = useMemo(() => splitSentences(text), [text]);
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const runId = useRef(0);

  useEffect(() => () => { runId.current++; stopVoice(); }, []);
  useEffect(() => { runId.current++; stopVoice(); setPlaying(false); setCurrent(-1); }, [text]);

  const play = async (from = 0) => {
    stopVoice();
    const id = ++runId.current;
    setPlaying(true);
    for (let i = from; i < sentences.length; i++) {
      if (runId.current !== id) return;
      setCurrent(i);
      // Warm the cache for the next two sentences while this one plays.
      sentences.slice(i + 1, i + 3).forEach((t) => naturalSpeechUrl(t, accent).catch(() => {}));
      setLoading(true);
      const r = await speakNatural(sentences[i], { accent, voiceURI, rate, onStart: () => runId.current === id && setLoading(false) });
      if (runId.current === id) setLoading(false);
      if (r === 'blocked' || r === 'none') break;
    }
    if (runId.current === id) {
      setPlaying(false);
      setCurrent(-1);
    }
  };
  const stop = () => {
    runId.current++;
    stopVoice();
    setPlaying(false);
    setLoading(false);
    setCurrent(-1);
  };
  const pickAccent = (a: 'US' | 'UK') => {
    try { localStorage.setItem('speakup.listen', JSON.stringify({ ...JSON.parse(localStorage.getItem('speakup.listen') || '{}'), accent: a })); } catch { /* ignore */ }
    setAccentState(a);
    stop();
  };
  const setSetting = (patch: Partial<typeof state.settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));

  return (
    <div className="space-y-3">
      {!hidden && (
        <p className="text-[15px] leading-8">
          {sentences.map((s, i) => (
            <span
              key={i}
              onClick={() => play(i)}
              title="Click to play from here"
              className={`cursor-pointer rounded px-0.5 transition ${current === i ? 'bg-blue-100 ring-2 ring-blue-300 dark:bg-blue-900/50 dark:ring-blue-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {markPhrases(s, phrases).map((c, j) => (c.hit ? <mark key={j} className="mark-phrase">{c.text}</mark> : <span key={j}>{c.text}</span>))}{' '}
            </span>
          ))}
        </p>
      )}
      {ttsSupported() || typeof Audio !== 'undefined' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
          {playing ? (
            <button className="btn-primary !px-3" onClick={stop} data-testid="listen-stop">{loading ? <Spinner /> : <Icon name="stop" className="h-4 w-4" />} {loading ? 'Loading voice…' : 'Stop'}</button>
          ) : (
            <button className="btn-primary !px-3" onClick={() => play(0)} data-testid="listen-play"><Icon name="play" className="h-4 w-4" /> Listen</button>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            Speed
            <input type="range" min={0.75} max={1.25} step={0.05} value={rate} onChange={(e) => setSetting({ rate: Number(e.target.value) })} className="w-24 accent-blue-600" />
            <span className="w-10 font-mono">{rate.toFixed(2)}x</span>
          </label>
          <div className="inline-flex rounded-lg bg-white p-0.5 text-xs dark:bg-slate-900" role="group" aria-label="Accent">
            {(['US', 'UK'] as const).map((a) => (
              <button key={a} type="button" onClick={() => pickAccent(a)} aria-pressed={accent === a}
                className={`rounded-md px-2.5 py-1 font-medium ${accent === a ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : 'text-slate-600 dark:text-slate-300'}`}>{a === 'US' ? '🇺🇸 US' : '🇬🇧 UK'}</button>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted">Read-aloud isn't supported in this browser.</p>
      )}
    </div>
  );
}
