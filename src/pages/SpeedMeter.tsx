// Reply speed meter (quick-fire), ES's spec: 8 short everyday questions in the natural voice; 3 s to start
// (2 s at the harder level), up to 20 s to answer; ends after ~1.5 s of silence. Measures time to first word,
// fillers per minute (Gemini from the audio, Chrome's count as fallback) and the longest pause.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { prettyDate, todayStr, uid } from '../lib/date';
import { EASY_LIMIT, HARD_LIMIT, MAX_ANSWER_S, pickRound, recentQuestions, ROUND_SIZE, speedLevel, summarizeRound, UNLOCK_ROUNDS } from '../lib/speed';
import { analyzeAnswer, calibrate, openMic, playQuestion, prepareVoices, recordAnswer, stopQuestion, type LiveTick, type Mic } from '../lib/speedRound';
import type { QuickFire } from '../lib/quickfire';
import type { QuickFireAnswer, QuickFireRound } from '../lib/types';
import type { AudioClip } from '../lib/audio';
import { ErrorBox, PageTitle, Spinner } from '../components/ui';
import RecordingPlayer from '../components/RecordingPlayer';
import { SpeedTrend } from '../components/SpeedTrend';

type Phase = 'intro' | 'ready' | 'run' | 'scoring' | 'results';
const fmt = (v: number | null | undefined, unit = 's') => (v == null ? '–' : `${v.toFixed(1)}${unit}`);

export default function SpeedMeter() {
  const { state, update, saveRecordings, addSpeaking, logActivity } = useStore();
  const cfg = useAIConfig();
  const rounds = state.quickfire || [];
  const lvl = useMemo(() => speedLevel(rounds), [rounds]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState('');
  const [items, setItems] = useState<QuickFire[]>([]);
  const [ready, setReady] = useState(0);
  const [browserVoice, setBrowserVoice] = useState(0);
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState<'asking' | 'answer'>('asking');
  const [tick, setTick] = useState<LiveTick>({ elapsed: 0, level: 0, spoke: false, missed: false });
  const [scored, setScored] = useState(0);
  const [round, setRound] = useState<QuickFireRound | null>(null);
  const [clipUrls, setClipUrls] = useState<(string | null)[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const cancel = useRef({ cancelled: false });
  const skip = useRef({ cancelled: false });
  const mic = useRef<Mic | null>(null);
  const urls = useRef<string[]>([]);

  const cleanup = () => {
    cancel.current.cancelled = true;
    skip.current.cancelled = true;
    stopQuestion();
    mic.current?.close();
    mic.current = null;
  };
  useEffect(() => () => { cleanup(); urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const start = async () => {
    setError('');
    cancel.current = { cancelled: false };
    const picked = pickRound(lvl.level, recentQuestions(rounds), Date.now() % 233280);
    setItems(picked);
    setReady(0);
    setRound(null);
    setSaveState('idle');
    setPhase('ready');
    try {
      mic.current = await openMic();
    } catch (e) {
      setPhase('intro');
      setError((e as Error)?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow the mic for this site and try again.' : (e as Error).message || 'Could not open the microphone.');
      return;
    }
    const minWait = calibrate(mic.current, 1500);
    const voices = await prepareVoices(picked.map((x) => x.q), setReady);
    urls.current.push(...voices.filter((v): v is string => !!v));
    setBrowserVoice(voices.filter((v) => !v).length);
    await minWait;
    if (cancel.current.cancelled) return;
    void run(picked, voices);
  };

  const run = async (picked: QuickFire[], voices: (string | null)[]) => {
    setPhase('run');
    const limit = lvl.limit;
    const jobs: Promise<QuickFireAnswer>[] = [];
    const clips: (AudioClip | null)[] = [];
    let done = 0;
    for (let i = 0; i < picked.length; i++) {
      if (cancel.current.cancelled || !mic.current) return;
      setIdx(i);
      setStep('asking');
      setTick({ elapsed: 0, level: 0, spoke: false, missed: false });
      await playQuestion(picked[i].q, voices[i]);
      if (cancel.current.cancelled || !mic.current) return;
      setStep('answer');
      skip.current = { cancelled: false };
      const both = { get cancelled() { return cancel.current.cancelled || skip.current.cancelled; } };
      const raw = await recordAnswer(mic.current, limit, setTick, both);
      if (cancel.current.cancelled) return;
      clips.push(raw.clip);
      // Measure in the background while the next question plays.
      jobs.push(analyzeAnswer(cfg, picked[i], raw, limit).finally(() => setScored(++done)));
      await new Promise((r) => setTimeout(r, 400));
    }
    mic.current?.close();
    mic.current = null;
    setScored(done);
    setPhase('scoring');
    const answers = await Promise.all(jobs);
    const sum = summarizeRound(answers, limit);
    const r: QuickFireRound = { id: uid(), date: todayStr(), level: lvl.level, startLimit: limit, answers, ...sum, createdAt: Date.now() };
    const objUrls = clips.map((c) => (c ? URL.createObjectURL(c.blob) : null));
    urls.current.push(...objUrls.filter((u): u is string => !!u));
    setClipUrls(objUrls);
    setRound(r);
    setPhase('results');
    // Save: the round row, then the best + worst answer audio (Opus 24 kbps, private bucket).
    setSaveState('saving');
    update((s) => ({ ...s, quickfire: [...(s.quickfire || []), r] }));
    addSpeaking(Math.round(answers.reduce((a, x) => a + x.speechSeconds, 0)));
    logActivity();
    const keep: [number | null, 'best' | 'worst'][] = [[sum.bestIndex, 'best'], [sum.worstIndex, 'worst']];
    let failed = 0;
    for (const [i, tag] of keep) {
      const c = i == null ? null : clips[i];
      if (c) failed += await saveRecordings([c], { kind: 'quickfire', answerId: r.id, questionType: tag });
    }
    setSaveState(failed ? 'error' : 'saved');
  };

  const quit = () => {
    cleanup();
    setPhase('intro');
  };

  const last = rounds[rounds.length - 1];

  return (
    <div className="space-y-4" data-testid="speed-page">
      <PageTitle title="Reply speed" subtitle="8 quick questions. Start talking fast; any answer counts." />
      <ErrorBox error={error} />

      {phase === 'intro' && (
        <section className="card space-y-3" data-testid="speed-intro">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${lvl.level === 'open' ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200'}`} data-testid="speed-level">
              {lvl.level === 'open' ? `Harder: ${HARD_LIMIT} s to start + "why" questions` : `${EASY_LIMIT} s to start`}
            </span>
            <span className="muted text-xs">Up to {MAX_ANSWER_S} s per answer. It moves on after a short silence.</span>
          </div>
          <ul className="muted list-disc space-y-0.5 pl-5 text-sm">
            <li>Listen to the question, then start talking straight away.</li>
            <li>Short is fine. "Coffee, definitely. I drink two a day." is a great answer.</li>
            <li>Late start? Keep talking. It still records.</li>
          </ul>
          {lvl.level === 'easy' && <p className="text-xs text-slate-500" data-testid="speed-unlock">Average under {HARD_LIMIT} s for {UNLOCK_ROUNDS} rounds in a row to unlock the harder level{lvl.streak ? ` (${lvl.streak}/${UNLOCK_ROUNDS} so far)` : ''}.</p>}
          {last && <p className="text-sm" data-testid="speed-last">Last round: start <b>{fmt(last.avgStart)}</b>, fillers <b>{fmt(last.fillersPerMin, '/min')}</b>, longest pause <b>{fmt(last.longestPause)}</b> ({prettyDate(last.date)}).</p>}
          <button className="btn-primary w-full sm:w-auto" onClick={start} data-testid="speed-start">⚡ Start a round</button>
        </section>
      )}

      {phase === 'ready' && (
        <section className="card space-y-3 text-center" data-testid="speed-ready">
          <p className="text-3xl">🎧</p>
          <p className="text-lg font-semibold">Get ready</p>
          <p className="muted text-sm">Loading the questions… {ready}/{ROUND_SIZE}</p>
          <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-blue-500 transition-all" style={{ width: `${(ready / ROUND_SIZE) * 100}%` }} /></div>
          <p className="muted text-xs">Start talking within {lvl.limit} seconds after each question.</p>
          <p className="muted text-[11px]">If the natural voice is busy, a question uses your browser's voice instead.</p>
          <button className="btn-ghost" onClick={quit}>Cancel</button>
        </section>
      )}

      {phase === 'run' && items[idx] && (
        <section className="card space-y-4" data-testid="speed-run">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span data-testid="speed-progress">Question {idx + 1}/{items.length}</span>
            {browserVoice > 0 && <span title="The natural voice was not available for some questions">🔈 browser voice for {browserVoice}</span>}
          </div>
          <p className="text-xl font-semibold" data-testid="speed-question">{items[idx].q}</p>
          {step === 'asking' ? (
            <p className="muted flex items-center gap-2 text-sm" data-testid="speed-asking">🔊 Listen…</p>
          ) : (
            <AnswerMeter tick={tick} limit={lvl.limit} />
          )}
          <div className="flex gap-2">
            {step === 'answer' && <button className="btn-soft" onClick={() => { skip.current.cancelled = true; }} data-testid="speed-next">Done, next</button>}
            <button className="btn-ghost" onClick={quit} data-testid="speed-quit">Stop round</button>
          </div>
        </section>
      )}

      {phase === 'scoring' && (
        <section className="card flex items-center gap-3" data-testid="speed-scoring">
          <Spinner /> <span>Measuring your answers… {scored}/{items.length}</span>
        </section>
      )}

      {phase === 'results' && round && (
        <Results round={round} unlocked={round.level === 'easy' && lvl.level === 'open'} prev={rounds.filter((r) => r.id !== round.id).slice(-1)[0]} clipUrls={clipUrls} saveState={saveState} onAgain={start} />
      )}

      {phase === 'intro' && rounds.length > 0 && (
        <>
          <section className="card space-y-2" data-testid="speed-trend-card">
            <h2 className="h-section text-base">📈 Your start time</h2>
            <SpeedTrend rounds={rounds} />
          </section>
          <History rounds={rounds} />
        </>
      )}
    </div>
  );
}

function AnswerMeter({ tick, limit }: { tick: LiveTick; limit: number }) {
  const left = Math.max(0, limit - tick.elapsed);
  return (
    <div className="space-y-2" data-testid="speed-answer">
      {!tick.spoke && !tick.missed && <p className="text-2xl font-bold text-emerald-600" data-testid="speed-go">Go! {left.toFixed(1)}</p>}
      {tick.missed && !tick.spoke && <p className="text-sm font-semibold text-amber-600" data-testid="speed-missed">Missed the start. Say something anyway!</p>}
      {tick.spoke && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400" data-testid="speed-talking">🎙️ Recording… {tick.missed ? '(late start)' : ''}</p>}
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${Math.round(tick.level * 100)}%` }} /></div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900"><div className="h-full bg-slate-400" style={{ width: `${Math.min(100, (tick.elapsed / MAX_ANSWER_S) * 100)}%` }} /></div>
    </div>
  );
}

function Delta({ now, prev, unit }: { now: number | null; prev?: number | null; unit: string }) {
  if (now == null || prev == null) return null;
  const d = Math.round((now - prev) * 10) / 10;
  if (!d) return <span className="text-[11px] text-slate-500">same as last</span>;
  return <span className={`text-[11px] ${d < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{d < 0 ? '▼' : '▲'} {Math.abs(d)}{unit} vs last</span>;
}

function Results({ round, unlocked, prev, clipUrls, saveState, onAgain }: { round: QuickFireRound; unlocked: boolean; prev?: QuickFireRound; clipUrls: (string | null)[]; saveState: string; onAgain: () => void }) {
  const tiles = [
    { label: 'Avg start', v: round.avgStart, p: prev?.avgStart, unit: 's', id: 'avg-start' },
    { label: 'Fillers / min', v: round.fillersPerMin, p: prev?.fillersPerMin, unit: '', id: 'fpm' },
    { label: 'Longest pause', v: round.longestPause, p: prev?.longestPause, unit: 's', id: 'pause' },
  ];
  const pick = (i: number | null, tag: string) => (i == null ? null : { a: round.answers[i], url: clipUrls[i], tag, i });
  const cards = [pick(round.bestIndex, 'Best'), pick(round.worstIndex, 'Worst')].filter(Boolean) as { a: QuickFireAnswer; url: string | null; tag: string; i: number }[];
  return (
    <div className="space-y-4" data-testid="speed-results">
      <section className="card space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {tiles.map((t) => (
            <div key={t.id} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900" data-testid={`speed-${t.id}`}>
              <p className="text-xl font-bold">{t.v == null ? '–' : `${t.v.toFixed(1)}${t.unit}`}</p>
              <p className="text-[11px] text-slate-500">{t.label}</p>
              <Delta now={t.v} prev={t.p} unit={t.unit} />
            </div>
          ))}
        </div>
        <p className="text-sm" data-testid="speed-misses">{round.misses ? `⏱️ ${round.misses} late start${round.misses > 1 ? 's' : ''} (over ${round.startLimit} s).` : `✅ Every answer started within ${round.startLimit} s.`}
          <span className="muted text-xs"> Fillers counted by {round.fillerSource === 'chrome' ? "Chrome's transcript (AI count not available)" : round.fillerSource === 'mixed' ? 'AI from the audio (Chrome for some)' : 'AI from the audio'}.</span></p>
        {unlocked && <p className="rounded-xl bg-violet-50 p-2 text-sm font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200" data-testid="speed-unlocked">🔓 {UNLOCK_ROUNDS} fast rounds in a row! Next round: {HARD_LIMIT} s to start, with some "why" questions.</p>}
        <p className="text-xs text-slate-500" data-testid="speed-saved">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved. Best and worst answers are kept in your recordings.' : saveState === 'error' ? 'Saved, but an answer recording could not be uploaded.' : ''}</p>
      </section>

      {cards.map((c) => (
        <section key={c.tag} className={`card space-y-1.5 border-l-4 ${c.tag === 'Best' ? 'border-l-emerald-500' : 'border-l-amber-500'}`} data-testid={`speed-${c.tag.toLowerCase()}`}>
          <p className="text-xs font-semibold text-slate-500">{c.tag === 'Best' ? '🏆 Best answer' : '🔁 Weakest answer (start + fillers + pauses)'} · Q{c.i + 1}</p>
          <p className="font-medium">{c.a.q}</p>
          <p className="muted text-sm">Start {fmt(c.a.start)} · {c.a.fillers} filler{c.a.fillers === 1 ? '' : 's'} · longest pause {fmt(c.a.longestPause)}</p>
          {c.a.transcript && <p className="text-sm italic">"{c.a.transcript}"</p>}
          {c.url && <audio controls src={c.url} className="h-9 w-full" data-testid={`speed-${c.tag.toLowerCase()}-audio`} />}
        </section>
      ))}

      <section className="card space-y-1" data-testid="speed-answers">
        <h2 className="h-section text-base">All answers</h2>
        {round.answers.map((a, i) => (
          <div key={i} className="flex items-start justify-between gap-2 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">
            <span className="flex-1">{i + 1}. {a.q}{a.level === 'open' && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-700 dark:bg-violet-950 dark:text-violet-200">why</span>}</span>
            <span className={`shrink-0 tabular-nums ${a.start == null ? 'text-rose-600' : a.missed ? 'text-amber-600' : 'text-emerald-600'}`}>{a.start == null ? 'no answer' : `${a.start.toFixed(1)}s`}</span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={onAgain} data-testid="speed-again">⚡ Another round</button>
        <Link className="btn-soft" to="/">Back to Today</Link>
      </div>
    </div>
  );
}

function History({ rounds }: { rounds: QuickFireRound[] }) {
  const { state } = useStore();
  const list = [...rounds].reverse().slice(0, 10);
  return (
    <section className="card space-y-2" data-testid="speed-history">
      <h2 className="h-section text-base">Past rounds</h2>
      {list.map((r) => {
        const recs = state.recordings.filter((x) => x.kind === 'quickfire' && x.answerId === r.id).sort((a, b) => (a.questionType === 'best' ? -1 : 1) - (b.questionType === 'best' ? -1 : 1));
        return (
          <details key={r.id} className="rounded-xl border border-slate-200 p-2 dark:border-slate-800">
            <summary className="cursor-pointer text-sm">
              <b>{prettyDate(r.date)}</b> · start {fmt(r.avgStart)} · {fmt(r.fillersPerMin, '')} fillers/min · pause {fmt(r.longestPause)}{r.level === 'open' ? ' · harder' : ''}
            </summary>
            <div className="mt-2 space-y-1.5">
              {recs.map((x) => {
                const i = x.questionType === 'best' ? r.bestIndex : r.worstIndex;
                return <RecordingPlayer key={x.id} rec={x} compact label={`${x.questionType === 'best' ? '🏆 Best' : '🔁 Weakest'}: ${i != null ? r.answers[i]?.q || '' : ''}`} />;
              })}
              {!recs.length && <p className="muted text-xs">No audio kept for this round.</p>}
            </div>
          </details>
        );
      })}
    </section>
  );
}
