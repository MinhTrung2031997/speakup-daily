// 🔊 Hear the question asked by a natural voice (auto-plays once when the question opens, if on in
// Settings), and Listening mode: the question text stays hidden until he has answered (or taps Show text).
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { preferredAccent } from '../lib/speech';
import { speakNatural, spokenQuestion, stopVoice } from '../lib/tts';
import { Spinner } from './ui';

const played = new Set<string>(); // auto-play once per question per page load

export function AskAloudButton({ id, question, auto = true, lead = true, label = 'Hear it' }: { id: string; question: string; auto?: boolean; lead?: boolean; label?: string }) {
  const { state } = useStore();
  const [st, setSt] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [how, setHow] = useState('');
  const alive = useRef(true);
  const text = lead ? spokenQuestion(question, state.profile.name) : question;
  const play = async () => {
    if (st !== 'idle') { stopVoice(); setSt('idle'); return; }
    setSt('loading');
    const r = await speakNatural(text, { accent: preferredAccent(), voiceURI: state.settings.voiceURI, onStart: (h) => { if (alive.current) { setSt('playing'); setHow(h); } } });
    if (alive.current) { setSt('idle'); if (r !== 'blocked' && r !== 'none') setHow(r); }
  };
  useEffect(() => {
    alive.current = true;
    if (auto && state.settings.askAloud !== false && question && !played.has(id)) { played.add(id); play(); }
    return () => { alive.current = false; stopVoice(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <button type="button" onClick={play} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${st === 'playing' ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200'}`}
      aria-label={st === 'idle' ? 'Play the question' : 'Stop'} data-testid="ask-aloud" data-state={st} data-voice={how}>
      {st === 'loading' ? <Spinner className="h-3.5 w-3.5" /> : <span aria-hidden>{st === 'playing' ? '⏹' : '🔊'}</span>}
      {st === 'playing' ? 'Stop' : st === 'loading' ? 'Loading voice…' : label}
    </button>
  );
}

/** The question text with the 🔊 button and the Listening mode switch. */
export function SpokenQuestion({ id, question, answered, className = 'text-xl font-semibold leading-snug text-slate-900 dark:text-white' }: { id: string; question: string; answered: boolean; className?: string }) {
  const { state, update } = useStore();
  const listening = !!state.settings.listeningMode;
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [id]);
  const hide = listening && !answered && !shown;
  return (
    <div className="space-y-2" data-testid="spoken-question">
      {hide ? (
        <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/60 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100" data-testid="question-hidden">
          🎧 <b>Listening mode:</b> listen and answer by ear. The text shows after you answer.
          <button className="ml-2 text-xs font-medium text-blue-700 underline dark:text-blue-300" onClick={() => setShown(true)} data-testid="show-text">Show text</button>
        </div>
      ) : (
        <p className={className} data-testid="question-text">{question}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <AskAloudButton id={id} question={question} />
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={listening} onChange={(e) => update((s) => ({ ...s, settings: { ...s.settings, listeningMode: e.target.checked } }))} data-testid="listening-toggle" />
          Listening mode
        </label>
      </div>
    </div>
  );
}
