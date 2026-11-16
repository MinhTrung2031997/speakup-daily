import { useEffect, useMemo, useRef, useState } from 'react';
import { markPhrases, splitSentences } from '../lib/diff';
import { speak, stopSpeaking, ttsSupported, useEnglishVoices } from '../lib/speech';
import { useStore } from '../lib/store';
import Icon from './Icon';

/** Reads text aloud sentence by sentence, highlighting the current sentence and the target phrases. */
export default function ListenPlayer({ text, phrases = [], hidden = false }: { text: string; phrases?: string[]; hidden?: boolean }) {
  const { state, update } = useStore();
  const { rate, voiceURI } = state.settings;
  const voices = useEnglishVoices();
  const sentences = useMemo(() => splitSentences(text), [text]);
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const runId = useRef(0);

  useEffect(() => () => { runId.current++; stopSpeaking(); }, []);
  useEffect(() => { runId.current++; stopSpeaking(); setPlaying(false); setCurrent(-1); }, [text]);

  const play = async (from = 0) => {
    if (!ttsSupported()) return;
    stopSpeaking();
    const id = ++runId.current;
    setPlaying(true);
    for (let i = from; i < sentences.length; i++) {
      if (runId.current !== id) return;
      setCurrent(i);
      await speak(sentences[i], { voiceURI, rate });
    }
    if (runId.current === id) {
      setPlaying(false);
      setCurrent(-1);
    }
  };
  const stop = () => {
    runId.current++;
    stopSpeaking();
    setPlaying(false);
    setCurrent(-1);
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
      {ttsSupported() ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
          {playing ? (
            <button className="btn-primary !px-3" onClick={stop}><Icon name="stop" className="h-4 w-4" /> Stop</button>
          ) : (
            <button className="btn-primary !px-3" onClick={() => play(0)}><Icon name="play" className="h-4 w-4" /> Listen</button>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            Speed
            <input type="range" min={0.75} max={1.25} step={0.05} value={rate} onChange={(e) => setSetting({ rate: Number(e.target.value) })} className="w-24 accent-blue-600" />
            <span className="w-10 font-mono">{rate.toFixed(2)}x</span>
          </label>
          {voices.length > 0 && (
            <select className="input !w-auto !py-1.5 text-xs" value={voiceURI} onChange={(e) => setSetting({ voiceURI: e.target.value })} aria-label="Voice">
              <option value="">Default English voice</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <p className="muted">Read-aloud isn't supported in this browser.</p>
      )}
    </div>
  );
}
