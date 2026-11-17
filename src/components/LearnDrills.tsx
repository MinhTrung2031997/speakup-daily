// Learn highlighted words: 3-level graded drills (EL's prompts, ES's levels).
// Natural ✅ = full review, Understandable 🟡 = half (same stage, half the gap), Off ❌ = back tomorrow.
// A phrase counts as "learned" only after a Natural grade on a sentence said with the mic.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { checkWordUsage, fillInBlank, situationPrompt, speedRound, type WordCheck } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { isDue, MASTERED_STAGE, stageLabel } from '../lib/srs';
import { speak, ttsSupported } from '../lib/speech';
import { phraseInText, type FillBlank, type Situation, type SpeedResult } from '../lib/learnPrompts';
import type { Phrase, ReviewDrill, UsageLevel } from '../lib/types';
import MicInput from './MicInput';
import { ErrorBox, Spinner } from './ui';
import Icon from './Icon';

export const LEVEL_UI: Record<UsageLevel, { icon: string; label: string; cls: string; note: string }> = {
  natural: { icon: '✅', label: 'Natural', cls: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100', note: 'Full review: moved to the next step.' },
  understandable: { icon: '🟡', label: 'Understandable', cls: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100', note: 'Half a review: same step, back a bit sooner.' },
  off: { icon: '❌', label: 'Off', cls: 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100', note: "We'll bring it back tomorrow." },
};

export function LevelChip({ level }: { level: UsageLevel }) {
  const u = LEVEL_UI[level];
  return <span className={`chip ${u.cls}`} data-level={level}>{u.icon} {u.label}</span>;
}

/** Due phrases first (oldest due), then the ones still being learned. */
export function practicePool(phrases: Phrase[]): Phrase[] {
  const due = phrases.filter((p) => isDue(p)).sort((a, b) => a.due.localeCompare(b.due));
  const rest = phrases.filter((p) => !isDue(p) && p.stage < MASTERED_STAGE).sort(() => Math.random() - 0.5);
  return [...due, ...rest];
}

function useSay() {
  const { state } = useStore();
  return (t: string) => speak(t, { voiceURI: state.settings.voiceURI, rate: state.settings.rate });
}

/** Hear → Use → graded review for one phrase. */
export function PhraseUseCard({ phrase, left, onNext }: { phrase: Phrase; left: number; onNext: () => void }) {
  const { reviewPhrase, logActivity } = useStore();
  const ai = useAIConfig();
  const say = useSay();
  const [sentence, setSentence] = useState('');
  const [voiced, setVoiced] = useState(false);
  const [result, setResult] = useState<WordCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const check = async () => {
    if (!sentence.trim()) return;
    setChecking(true);
    setError('');
    try {
      const r = await checkWordUsage(ai, phrase.phrase, phrase.meaning, sentence.trim());
      setResult(r);
      reviewPhrase(phrase.id, { level: r.level, sentence: sentence.trim(), feedback: r.feedback, drill: 'use', byVoice: voiced });
      logActivity();
    } catch (e) { setError(errorText(e)); } finally { setChecking(false); }
  };

  return (
    <div className="card space-y-4" data-testid="use-card" data-phrase={phrase.phrase}>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{stageLabel(phrase.stage)}{phrase.learnedByVoice ? ' · 🎙️ learned by voice' : ''}</span>
        <span>{left} left today</span>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1 · Hear</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">“{phrase.phrase}”</p>
        {phrase.meaning && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{phrase.meaning}</p>}
        {phrase.example && <p className="mt-1 text-sm italic text-slate-500">e.g. {phrase.example}</p>}
        {phrase.source && <p className="mt-1 text-xs text-slate-400">From: {phrase.source}</p>}
        {ttsSupported() && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-ghost !py-1 text-xs" onClick={() => say(phrase.phrase)}><Icon name="play" className="h-3.5 w-3.5" /> Phrase</button>
            {phrase.example && <button className="btn-ghost !py-1 text-xs" onClick={() => say(phrase.example)}><Icon name="play" className="h-3.5 w-3.5" /> Sentence</button>}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2 · Use</p>
        <p className="label">Say a NEW sentence of your own with this phrase (the mic counts toward “learned”):</p>
        <MicInput value={sentence} onChange={setSentence} onSpeech={() => setVoiced(true)} rows={2} placeholder="Tap the mic and say something about your own life…" disabled={!!result} />
      </div>
      <ErrorBox error={error} onRetry={check} />
      {result ? (
        <div className={`rounded-xl p-3 text-sm ${LEVEL_UI[result.level].cls}`} data-testid="use-result">
          <p className="font-semibold">{LEVEL_UI[result.level].icon} {LEVEL_UI[result.level].label}</p>
          {result.feedback && <p className="mt-1">{result.feedback}</p>}
          {result.betterSentence && <p className="mt-2"><span className="text-xs font-semibold uppercase tracking-wide opacity-70">More natural:</span> {result.betterSentence}</p>}
          <p className="mt-2 text-xs opacity-70">3 · Review: {LEVEL_UI[result.level].note}{result.level === 'natural' && voiced ? ' 🎙️ Learned by voice!' : result.level === 'natural' ? ' Say it with the mic next time to mark it learned.' : ''}</p>
          <button className="btn-primary mt-3" onClick={onNext}>Next phrase →</button>
        </div>
      ) : (
        <button className="btn-primary w-full" onClick={check} disabled={!sentence.trim() || checking || !ai.hasKey}>{checking ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Check my sentence</button>
      )}
    </div>
  );
}

/** Fill in the blank: a NEW sentence (not the source one) with 4 options. Practice only (does not move the review date). */
export function FillBlankDrill() {
  const { state, logActivity } = useStore();
  const ai = useAIConfig();
  const pool = useMemo(() => practicePool(state.phrases), [state.phrases.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [item, setItem] = useState<FillBlank | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [score, setScore] = useState({ right: 0, total: 0 });
  const phrase = pool[i % Math.max(1, pool.length)];

  const load = async () => {
    if (!phrase) return;
    setLoading(true); setError(''); setPick(null); setItem(null);
    try { setItem(await fillInBlank(ai, phrase.phrase, phrase.meaning, phrase.example)); } catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!phrase) return <p className="muted text-sm">Collect a few phrases first.</p>;
  const choose = (k: number) => {
    if (pick !== null || !item) return;
    setPick(k);
    setScore((s) => ({ right: s.right + (k === item.answer ? 1 : 0), total: s.total + 1 }));
    logActivity();
  };
  return (
    <div className="card space-y-3" data-testid="fill-drill">
      <div className="flex items-center justify-between text-xs text-slate-500"><span>✍️ Fill in the blank</span><span>{score.right}/{score.total} right</span></div>
      {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Writing a new sentence…</p>}
      <ErrorBox error={error} onRetry={load} />
      {item && (
        <>
          <p className="text-lg font-medium text-slate-900 dark:text-white" data-testid="fill-sentence">{item.blanked}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.options.map((o, k) => (
              <button key={k} onClick={() => choose(k)} data-testid="fill-option" className={`rounded-xl border px-3 py-2 text-left text-sm ${pick === null ? 'border-slate-200 hover:border-blue-400 dark:border-slate-700' : k === item.answer ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' : k === pick ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40' : 'border-slate-200 opacity-60 dark:border-slate-700'}`}>{o}</button>
            ))}
          </div>
          {pick !== null && (
            <div className="space-y-2 text-sm">
              <p>{pick === item.answer ? '✅ Right!' : `❌ It's “${item.options[item.answer]}”.`} <span className="text-slate-500">{item.sentence}</span></p>
              <p className="text-xs text-slate-500">Fill-in-the-blank is practice only. Say the phrase in your own sentence (Review) to move it forward.</p>
              <button className="btn-primary" onClick={() => setI((x) => x + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Situation prompt: a short scene; he picks the fitting phrase himself and answers by voice. */
export function SituationDrill() {
  const { state, reviewPhrase, logActivity } = useStore();
  const ai = useAIConfig();
  const [round, setRound] = useState(0);
  const list = useMemo(() => practicePool(state.phrases).slice(0, 4), [round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sit, setSit] = useState<Situation | null>(null);
  const [reply, setReply] = useState('');
  const [voiced, setVoiced] = useState(false);
  const [result, setResult] = useState<(WordCheck & { phrase: string }) | null>(null);
  const [busy, setBusy] = useState<'' | 'scene' | 'check'>('');
  const [error, setError] = useState('');

  const load = async () => {
    if (list.length < 2) return;
    setBusy('scene'); setError(''); setSit(null); setReply(''); setResult(null); setVoiced(false);
    try { setSit(await situationPrompt(ai, state.profile, list.map((p) => ({ phrase: p.phrase, meaning: p.meaning })))); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };
  useEffect(() => { load(); }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async () => {
    if (!sit || !reply.trim()) return;
    setBusy('check'); setError('');
    try {
      // Grade the phrase he actually reached for (intended, or another one that also fits).
      const tried = [sit.intended, ...sit.alsoOk].find((p) => phraseInText(p, reply, 1)) || list.find((p) => phraseInText(p.phrase, reply, 1))?.phrase || sit.intended;
      const ph = list.find((p) => p.phrase === tried)!;
      const r = await checkWordUsage(ai, ph.phrase, ph.meaning, reply.trim());
      const fits = tried === sit.intended || sit.alsoOk.includes(tried);
      const lvl: UsageLevel = fits ? r.level : r.level === 'natural' ? 'understandable' : r.level;
      setResult({ ...r, level: lvl, phrase: tried });
      reviewPhrase(ph.id, { level: lvl, sentence: reply.trim(), feedback: r.feedback, drill: 'situation', byVoice: voiced });
      logActivity();
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };

  if (list.length < 2) return <p className="muted text-sm">You need at least 2 phrases for situations.</p>;
  return (
    <div className="card space-y-3" data-testid="situation-drill">
      <p className="text-xs text-slate-500">🎬 Situation · pick the phrase that fits</p>
      <div className="flex flex-wrap gap-1.5">{list.map((p) => <span key={p.id} className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{p.phrase}</span>)}</div>
      {busy === 'scene' && <p className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Setting the scene…</p>}
      {sit && (
        <>
          <p className="rounded-xl bg-slate-50 p-3 text-slate-900 dark:bg-slate-800/60 dark:text-white" data-testid="scene">{sit.scene}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{sit.sayThis}</p>
          <MicInput value={reply} onChange={setReply} onSpeech={() => setVoiced(true)} rows={3} placeholder="Answer out loud…" disabled={!!result} />
          {result ? (
            <div className={`rounded-xl p-3 text-sm ${LEVEL_UI[result.level].cls}`} data-testid="situation-result">
              <p className="font-semibold">{LEVEL_UI[result.level].icon} {LEVEL_UI[result.level].label} · “{result.phrase}”{result.phrase !== sit.intended && !sit.alsoOk.includes(result.phrase) ? ` (best fit here: “${sit.intended}”)` : ''}</p>
              {result.feedback && <p className="mt-1">{result.feedback}</p>}
              {result.betterSentence && <p className="mt-1"><span className="text-xs font-semibold uppercase opacity-70">More natural:</span> {result.betterSentence}</p>}
              <button className="btn-primary mt-3" onClick={() => setRound((r) => r + 1)}>Another situation →</button>
            </div>
          ) : (
            <button className="btn-primary w-full" onClick={check} disabled={!reply.trim() || busy === 'check'}>{busy === 'check' ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Check my answer</button>
          )}
        </>
      )}
      <ErrorBox error={error} onRetry={sit ? check : load} />
    </div>
  );
}

/** Speed round: 3 phrases, 60 seconds, by voice. */
export function SpeedRound() {
  const { state, reviewPhrase, logActivity } = useStore();
  const ai = useAIConfig();
  const [round, setRound] = useState(0);
  const list = useMemo(() => practicePool(state.phrases).slice(0, 3), [round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [left, setLeft] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [voiced, setVoiced] = useState(false);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const start = () => {
    setText(''); setResult(null); setError(''); setVoiced(false); setLeft(60);
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setLeft((s) => { if (s === null || s <= 1) { window.clearInterval(timer.current); return 0; } return s - 1; }), 1000);
  };
  const finish = async () => {
    window.clearInterval(timer.current);
    setLeft(0);
    if (!text.trim()) return;
    setChecking(true); setError('');
    try {
      const r = await speedRound(ai, list.map((p) => ({ phrase: p.phrase, meaning: p.meaning })), text.trim());
      setResult(r);
      r.results.forEach((x, k) => reviewPhrase(list[k].id, { level: x.level, sentence: text.trim(), feedback: x.feedback, drill: 'speed', byVoice: voiced }));
      logActivity();
    } catch (e) { setError(errorText(e)); } finally { setChecking(false); }
  };

  if (list.length < 3) return <p className="muted text-sm">You need at least 3 phrases for a speed round.</p>;
  return (
    <div className="card space-y-3" data-testid="speed-round">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">⚡ Speed round · use all 3 in 60 seconds</p>
        {left !== null && <span className={`font-mono text-lg font-bold tabular-nums ${left <= 10 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`} data-testid="speed-timer">0:{String(left).padStart(2, '0')}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">{list.map((p) => <span key={p.id} className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{p.phrase}</span>)}</div>
      {left === null ? (
        <button className="btn-primary w-full" onClick={start}>Start 60 seconds</button>
      ) : (
        <>
          <MicInput value={text} onChange={setText} onSpeech={() => setVoiced(true)} rows={3} placeholder="Tap the mic and talk: use all three phrases…" disabled={!!result || checking} />
          {!result && <button className="btn-primary w-full" onClick={finish} disabled={!text.trim() || checking}>{checking ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} {left === 0 ? 'Check my round' : 'Done, check it'}</button>}
        </>
      )}
      <ErrorBox error={error} onRetry={finish} />
      {result && (
        <div className="space-y-2" data-testid="speed-result">
          {result.results.map((x) => (
            <div key={x.phrase} className={`rounded-xl p-2.5 text-sm ${LEVEL_UI[x.level].cls}`}>
              <p className="font-semibold">{LEVEL_UI[x.level].icon} “{x.phrase}” · {LEVEL_UI[x.level].label}</p>
              {x.feedback && <p className="mt-0.5">{x.feedback}</p>}
              {x.better && x.level !== 'natural' && <p className="mt-0.5 text-xs opacity-80">Try: {x.better}</p>}
            </div>
          ))}
          {result.tip && <p className="text-sm">💡 {result.tip}</p>}
          <button className="btn-primary" onClick={() => { setRound((r) => r + 1); setLeft(null); setResult(null); setText(''); }}>Another round →</button>
        </div>
      )}
    </div>
  );
}

export type { ReviewDrill };
