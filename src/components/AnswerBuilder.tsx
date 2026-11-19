import { useEffect, useMemo, useRef, useState } from 'react';
import { SpokenQuestion } from './AskAloud';
import { groupTopics, nextBankQuestion, topicIdOf } from '../lib/topics';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { builderAnswer, builderIdeas, builderQuestion, DEFAULT_SLOTS, QUESTION_TYPES, LENGTH_LABEL, scoreRetry, type IdeaRow, type IdeaSource } from '../lib/ai';
import { loadBuilderPrefs, saveBuilderPrefs } from '../lib/builderPrefs';
import { errorText } from '../lib/gemini';
import { todayStr, uid } from '../lib/date';
import { analyzeFluency, withAudioFluency } from '../lib/fluency';
import type { AudioClip } from '../lib/audio';
import PronunciationCard from './PronunciationCard';
import type { SpeechSample } from '../lib/speech';
import type { BuilderInfo, BuilderLength, BuilderLevel, Entry, PronunciationResult, QuestionType } from '../lib/types';
import BuilderResult from './BuilderResult';
import { RecordingList } from './RecordingPlayer';
import FluencyCard from './FluencyCard';
import MicInput from './MicInput';
import RetryCard from './RetryCard';
import { ShadowCard } from './ShadowPractice';
import { ErrorBox, Spinner } from './ui';
import Icon from './Icon';

const LEVELS: { id: BuilderLevel; hint: string }[] = [
  { id: 'Simple', hint: 'B1, short sentences' },
  { id: 'Natural', hint: 'B2, a few idioms' },
  { id: 'Fluent', hint: 'C1, varied linking' },
];
const LENGTHS: BuilderLength[] = [20, 45, 90, 120];

const pill = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on
    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500 dark:text-slate-950'
    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'}`;

function Step({ n, title, children, right }: { n: number; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="h-section flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white dark:bg-blue-500 dark:text-slate-950">{n}</span>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** "Answer builder": topic + question type -> question -> idea chips -> model answer -> say it your way. */
export default function AnswerBuilder() {
  const { state, update, addPhrases, logActivity, saveRecordings } = useStore();
  const [recNote, setRecNote] = useState('');
  const ai = useAIConfig();
  const topics = useMemo(() => {
    const active = state.topics.filter((t) => t.active);
    return active.length ? active : state.topics;
  }, [state.topics]);

  // Step 1
  const [topic, setTopic] = useState(''); // display name, e.g. "💼 Work & Career" or a custom topic
  const [custom, setCustom] = useState('');
  const [qtype, setQtype] = useState<QuestionType>('Opinion');
  const [question, setQuestion] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [askedType, setAskedType] = useState<QuestionType>('Opinion');
  const [askedTopic, setAskedTopic] = useState('');
  const [loadingQ, setLoadingQ] = useState(false);
  const [qError, setQError] = useState('');
  const [past, setPast] = useState<string[]>([]);
  // Step 2
  const [rows, setRows] = useState<IdeaRow[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [ideaError, setIdeaError] = useState('');
  // Auto-pick: skip the idea chips; builderAnswer chooses one idea per part (one AI call fewer).
  const [auto, setAutoPref] = useState(() => loadBuilderPrefs().auto);
  const [manual, setManual] = useState(false); // "Choose my own ideas" opened for this question
  const [focusSlot, setFocusSlot] = useState('');
  const ideasRef = useRef<HTMLDivElement>(null);
  // Step 3 (last-used level / length are remembered)
  const [level, setLevelState] = useState<BuilderLevel>(() => loadBuilderPrefs().level);
  const [seconds, setSecondsState] = useState<BuilderLength>(() => loadBuilderPrefs().seconds);
  const setLevel = (l: BuilderLevel) => { setLevelState(l); saveBuilderPrefs({ level: l }); };
  const setSeconds = (n: BuilderLength) => { setSecondsState(n); saveBuilderPrefs({ seconds: n }); };
  const setAuto = (v: boolean) => {
    setAutoPref(v);
    saveBuilderPrefs({ auto: v });
    if (!v && question && !rows.length && !loadingIdeas) loadIdeas(question, askedType, slots);
  };
  const picking = !auto || manual;
  // Step 4
  const [entryId, setEntryId] = useState('');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');
  // Step 5
  const [practice, setPractice] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [samples, setSamples] = useState<SpeechSample[]>([]);
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [pron, setPron] = useState<PronunciationResult>();
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState('');
  const answerRef = useRef<HTMLDivElement>(null);
  const tryRef = useRef<HTMLDivElement>(null);

  const entry = entryId ? state.entries.find((e) => e.id === entryId) : undefined;
  const fluency = useMemo(() => withAudioFluency(analyzeFluency(samples), pron), [samples, pron]);
  useEffect(() => { if (!attempt.trim()) { setSamples([]); setClips([]); setPron(undefined); } }, [attempt]);
  const onSavedPron = (r: PronunciationResult) => {
    setPron(r);
    if (!entry) return;
    const f = withAudioFluency(entry.fluency, r);
    update((s) => ({ ...s, entries: s.entries.map((x) => (x.id === entry.id ? { ...x, pronunciation: r, ...(f ? { fluency: f } : {}) } : x)) }));
  };

  const topicLabel = custom.trim() || topic;
  const pickedAll = slots.length > 0 && slots.every((s) => (picks[s] || '').trim());

  const surprise = () => {
    const pool = topics.filter((t) => `${t.emoji} ${t.name}` !== topic);
    const t = (pool.length ? pool : topics)[Math.floor(Math.random() * (pool.length || topics.length))];
    const types = QUESTION_TYPES.filter((x) => x.type !== qtype);
    const ty = types[Math.floor(Math.random() * types.length)].type;
    if (t) { setTopic(`${t.emoji} ${t.name}`); setCustom(''); }
    setQtype(ty);
    getQuestion(t ? `${t.emoji} ${t.name}` : topicLabel || 'Daily life', ty, auto ? 'auto' : undefined);
  };

  const resetAfterQuestion = () => {
    setRows([]); setPicks({}); setTyped({}); setIdeaError(''); setManual(false); setFocusSlot('');
    setEntryId(''); setBuildError(''); setPractice(false); setAttempt(''); setSamples([]); setClips([]); setPron(undefined); setScoreError('');
  };

  const loadIdeas = async (q: string, ty: QuestionType, sl: string[]) => {
    setLoadingIdeas(true);
    setIdeaError('');
    try {
      setRows(await builderIdeas(ai, state.profile, ty, q, sl));
    } catch (e) {
      setIdeaError(errorText(e));
    } finally {
      setLoadingIdeas(false);
    }
  };

  async function getQuestion(t = topicLabel, ty = qtype, then?: 'auto') {
    if (!t) return;
    setLoadingQ(true);
    setQError('');
    resetAfterQuestion();
    try {
      const all = [...state.questions.map((x) => x.question), ...state.entries.filter((e) => e.builder).map((e) => e.question), ...past];
      const plain = t.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '');
      // Try EL's question bank first (same topic + type, not asked before); the AI writes one only when it runs out.
      const tid = topicIdOf(topics.find((x) => `${x.emoji} ${x.name}` === t)?.id, t);
      const bank = tid ? nextBankQuestion(tid, all.map((question) => ({ question })), ty) : undefined;
      const r = bank ? { question: bank.text, slots: DEFAULT_SLOTS[ty] } : await builderQuestion(ai, state.profile, plain, ty, all);
      setQuestion(r.question);
      setSlots(r.slots);
      setAskedType(ty);
      setAskedTopic(t);
      setPast((p) => [...p, r.question]);
      if (then === 'auto') build('auto', { question: r.question, slots: r.slots, qtype: ty, topic: t });
      else if (!auto) loadIdeas(r.question, ty, r.slots);
    } catch (e) {
      setQError(errorText(e));
    } finally {
      setLoadingQ(false);
    }
  }

  const choose = (slot: string, idea: string) => {
    setPicks((p) => ({ ...p, [slot]: p[slot] === idea ? '' : idea }));
    setTyped((t) => ({ ...t, [slot]: '' }));
  };
  const type = (slot: string, v: string) => {
    setTyped((t) => ({ ...t, [slot]: v }));
    setPicks((p) => ({ ...p, [slot]: v }));
  };

  /** Open "Choose my own ideas": load the idea chips only now (lazily). Prefill with the ideas already used. */
  const openManual = (slot = '') => {
    setManual(true);
    setFocusSlot(slot);
    const used = entry?.builder?.picks || {};
    if (Object.keys(used).length) {
      setPicks((p) => ({ ...used, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v.trim())) }));
      setTyped((t) => ({ ...used, ...t }));
    }
    if (!rows.length && !loadingIdeas) loadIdeas(question, askedType, slots);
    setTimeout(() => {
      const el = (slot && ideasRef.current?.querySelector(`[data-slot="${CSS.escape(slot)}"]`)) || ideasRef.current;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const build = async (source: IdeaSource = 'picked', ctx?: { question: string; slots: string[]; qtype: QuestionType; topic: string }) => {
    const c = ctx || { question, slots, qtype: askedType, topic: askedTopic };
    if (source === 'picked' && !pickedAll) return;
    setBuilding(true);
    setBuildError('');
    try {
      const chosen = source === 'picked' ? Object.fromEntries(c.slots.map((s) => [s, picks[s].trim()])) : {};
      const r = await builderAnswer(ai, state.profile, c.qtype, c.question, c.slots, chosen, level, seconds, source);
      const slots = r.slots, question = c.question, askedTopic = c.topic;
      const parts = r.parts.length ? r.parts : [{ slot: slots[0], text: r.answer }];
      const builder: BuilderInfo = { qtype: c.qtype, slots, picks: source === 'picked' ? { ...r.ideas, ...chosen } : r.ideas, level, seconds, parts, source };
      const txt = (i: number) => parts[i]?.text || '';
      const e: Entry = {
        // Every build is kept as its own History entry (delete one there with the 🗑️ button).
        id: uid(),
        date: todayStr(),
        questionId: '',
        question,
        topicName: askedTopic,
        answer: '',
        upgrade: {
          natural: r.answer,
          structure: { point: txt(0), reason: txt(1), example: txt(2), wrapUp: parts.slice(3).map((p) => p.text).join(' ') },
          phrases: r.phrases,
          corrections: [],
          encouragement: '',
        },
        builder,
        createdAt: Date.now(),
      };
      update((s) => ({ ...s, entries: s.entries.some((x) => x.id === e.id) ? s.entries.map((x) => (x.id === e.id ? e : x)) : [...s.entries, e] }));
      addPhrases(r.phrases, question, 'builder'); // auto-collect highlighted phrases into the word bank
      setEntryId(e.id);
      setPractice(false);
      setAttempt('');
      if (source === 'picked') setManual(false);
      logActivity();
      setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err) {
      setBuildError(errorText(err));
    } finally {
      setBuilding(false);
    }
  };

  const score = async () => {
    if (!entry?.upgrade || !attempt.trim()) return;
    setScoring(true);
    setScoreError('');
    try {
      const structure = (entry.builder?.slots || DEFAULT_SLOTS[askedType]).join(', ');
      const r = await scoreRetry(ai, entry.question, entry.upgrade.natural, entry.upgrade.phrases.map((p) => p.phrase), attempt.trim(), structure, 'builder-retry');
      const next: Entry = { ...entry, answer: attempt.trim(), retry: r, ...(fluency ? { fluency } : {}), pronunciation: pron };
      update((s) => ({ ...s, entries: s.entries.map((x) => (x.id === entry.id ? next : x)) }));
      if (clips.length) {
        setRecNote('');
        saveRecordings(clips, { kind: 'builder', answerId: entry.id, questionType: entry.builder?.qtype })
          .then((failed) => failed && setRecNote('🎙️ Recording not saved. Your try and scores are saved.'));
      }
      logActivity();
      setPractice(false);
    } catch (e) {
      setScoreError(errorText(e));
    } finally {
      setScoring(false);
    }
  };

  return (
    <div className="space-y-4">
      <Step n={1} title="Pick a topic and question type">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Topic</p>
          <div className="space-y-2" data-testid="builder-topics">
            {groupTopics(topics).map((g) => (
              <div key={g.group}>
                <p className="mb-1 text-[11px] font-medium text-slate-400">{g.group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.topics.map((t) => {
                    const label = `${t.emoji} ${t.name}`;
                    return <button key={t.id} className={pill(!custom.trim() && topic === label)} onClick={() => { setTopic(label); setCustom(''); }}>{label}</button>;
                  })}
                </div>
              </div>
            ))}
          </div>
          <input className="input mt-2" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="…or type your own topic (e.g. football, coffee, side projects)" maxLength={60} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Question type</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {QUESTION_TYPES.map((x) => (
              <button key={x.type} onClick={() => setQtype(x.type)} className={`rounded-xl border p-2.5 text-left transition ${qtype === x.type ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-950/50' : 'border-slate-200 hover:border-blue-300 dark:border-slate-700'}`}>
                <p className="text-sm font-semibold">{x.emoji} {x.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{x.hint}</p>
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={auto} onChange={(e) => setAuto(e.target.checked)} data-testid="auto-pick" />
          <span>
            <span className="block text-sm font-semibold">✨ Auto-pick ideas</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">Skip picking. The AI chooses one natural idea for each part and writes the answer straight away.</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {auto ? (
            <>
              <button className="btn-primary" onClick={() => getQuestion(topicLabel, qtype, 'auto')} disabled={!topicLabel || loadingQ || building}>
                {loadingQ || building ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />} Generate answer for me
              </button>
              <button className="btn-soft" onClick={() => getQuestion()} disabled={!topicLabel || loadingQ}>Just the question</button>
            </>
          ) : (
            <button className="btn-primary" onClick={() => getQuestion()} disabled={!topicLabel || loadingQ}>
              {loadingQ ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />} Get a question
            </button>
          )}
          <button className="btn-soft" onClick={surprise} disabled={loadingQ || !topics.length}>🎲 Surprise me</button>
        </div>
        {!topicLabel && <p className="muted text-xs">Pick a topic chip or type one to start.</p>}
        <ErrorBox error={qError} onRetry={() => getQuestion()} />
      </Step>

      {question && (
        <section className="card relative overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-blue-100/70 blur-2xl dark:bg-blue-900/30" />
          <div className="relative">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <span className="chip bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">{askedTopic}</span>
                <span className="chip bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-200">{QUESTION_TYPES.find((x) => x.type === askedType)?.label}</span>
              </div>
              <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => getQuestion(askedTopic, askedType)} disabled={loadingQ}>
                {loadingQ ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-4 w-4" />} New question
              </button>
            </div>
            <SpokenQuestion id={`builder:${question}`} question={question} answered={!!entry} />
            <p className="muted mt-2 text-xs">Answer structure: {slots.join(' → ')}</p>
          </div>
        </section>
      )}

      {question && !picking && (
        <section className="card flex flex-wrap items-center justify-between gap-2" data-testid="choose-own">
          <div>
            <h2 className="h-section text-base">✋ Choose my own ideas</h2>
            <p className="muted text-xs">Optional. Auto-pick is on, so the AI picks one idea per part.</p>
          </div>
          <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => openManual()}>Show idea chips</button>
        </section>
      )}

      {question && picking && (
        <div ref={ideasRef} className="scroll-mt-20">
        <Step n={2} title="Pick your ideas" right={rows.length > 0 && <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => loadIdeas(question, askedType, slots)} disabled={loadingIdeas}><Icon name="refresh" className="h-4 w-4" /> More ideas</button>}>
          <p className="muted">Tap one idea for each part, or type your own. These are words you already know, ready to use.</p>
          {loadingIdeas ? (
            <div className="flex items-center gap-3 py-4 text-slate-500"><Spinner /> Finding ideas that fit you…</div>
          ) : (
            <div className="space-y-4">
              {rows.map((row, i) => (
                <div key={row.slot} data-slot={row.slot} className={`scroll-mt-20 ${focusSlot === row.slot ? 'rounded-xl ring-2 ring-amber-400/70 ring-offset-4 ring-offset-white dark:ring-offset-slate-900' : ''}`}>
                  <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                    <span className="text-xs text-slate-400">{i + 1}.</span> {row.slot}
                    {(picks[row.slot] || '').trim() && <Icon name="check" className="h-4 w-4 text-emerald-600" />}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {row.options.map((o) => <button key={o} className={pill(picks[row.slot] === o && !typed[row.slot])} onClick={() => choose(row.slot, o)}>{o}</button>)}
                  </div>
                  <input className="input mt-2 !py-2" value={typed[row.slot] || ''} onChange={(e) => type(row.slot, e.target.value)} placeholder="✏️ Or type your own idea" maxLength={120} />
                </div>
              ))}
            </div>
          )}
          <ErrorBox error={ideaError} onRetry={() => loadIdeas(question, askedType, slots)} />
          {auto && <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setManual(false)}>✨ Back to auto-pick</button>}
        </Step>
        </div>
      )}

      {question && (picking ? rows.length > 0 : true) && (
        <Step n={picking ? 3 : 2} title="Level and length">
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((l) => (
              <button key={l.id} onClick={() => setLevel(l.id)} className={`rounded-xl border p-2 text-center transition ${level === l.id ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-950/50' : 'border-slate-200 hover:border-blue-300 dark:border-slate-700'}`}>
                <p className="text-sm font-semibold">{l.id}</p>
                <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">{l.hint}</p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">⏱️ Length</span>
            {LENGTHS.map((s) => <button key={s} className={pill(seconds === s)} onClick={() => setSeconds(s)}>{LENGTH_LABEL[s]}</button>)}
          </div>
          {picking ? (
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={() => build('picked')} disabled={!pickedAll || building}>
                {building ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />} {entry ? 'Build it again' : 'Build my answer'}
              </button>
              {!pickedAll && <span className="muted text-xs">Pick an idea for every part ({slots.filter((s) => (picks[s] || '').trim()).length}/{slots.length}).</span>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={() => build('auto')} disabled={building || loadingQ}>
                {building ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />} {entry ? 'Generate again' : 'Generate answer for me'}
              </button>
              <span className="muted text-xs">The AI picks the ideas.</span>
            </div>
          )}
          <ErrorBox error={buildError} onRetry={() => build(picking ? 'picked' : 'auto')} />
        </Step>
      )}

      {entry?.upgrade && entry.builder && (
        <div ref={answerRef} className="scroll-mt-20 space-y-4">
          <BuilderResult entry={entry} hidden={practice} onSave={(items) => addPhrases(items, entry.question, 'builder')} step={4} onIdea={entry.question === question ? openManual : undefined} />
          {!practice && <ShadowCard text={entry.upgrade.natural} phrases={entry.upgrade.phrases.map((p) => p.phrase)} hint="Shadow the model answer one sentence at a time: listen, repeat, then compare it with your own voice." />}

          <div ref={tryRef}>
            <Step n={5} title="Say it your way">
              <p className="muted">Hide the answer, then say it in your own words with the mic (or type). Try to use the highlighted phrases.</p>
              {!practice ? (
                <button className="btn-soft" onClick={() => { setPractice(true); setAttempt(''); setSamples([]); setClips([]); setPron(undefined); setTimeout(() => tryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }}>
                  <Icon name="mic" className="h-4 w-4" /> {entry.retry ? 'Try again' : 'Hide answer & try'}
                </button>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-slate-500">Try to use:</span>
                    {entry.upgrade.phrases.map((p) => <span key={p.phrase} className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{p.phrase}</span>)}
                  </div>
                  <MicInput value={attempt} onChange={setAttempt} onSpeech={(s) => setSamples((a) => [...a, s])} onAudio={(c) => { setClips((a) => [...a, c]); setPron(undefined); }} placeholder="Answer in your own words without looking…" rows={4} />
                  {fluency && <FluencyCard stats={fluency} title="📈 Fluency (this try)" />}
                  <PronunciationCard clips={clips} transcript={attempt} result={pron} onResult={setPron} context="saying a prepared answer in their own words" title="🗣️ Pronunciation (this try)" />
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary" onClick={score} disabled={!attempt.trim() || scoring}>{scoring ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Check my answer</button>
                    <button className="btn-ghost" onClick={() => setPractice(false)}>Show answer</button>
                  </div>
                  <ErrorBox error={scoreError} onRetry={score} />
                </>
              )}
              {entry.retry && !practice && (
                <>
                  {entry.fluency && <FluencyCard stats={entry.fluency} title="📈 Fluency (your try)" />}
                  <RetryCard entry={entry} />
                  <RecordingList recs={state.recordings.filter((r) => r.answerId === entry.id)} title="🎧 Your tries" />
                  {recNote && <p className="muted text-xs" data-testid="rec-note">{recNote}</p>}
                  {(entry.pronunciation || clips.length > 0) && (
                    <PronunciationCard clips={attempt.trim() === entry.answer.trim() ? clips : []} transcript={entry.answer} result={entry.pronunciation} onResult={onSavedPron} context="saying a prepared answer in their own words" title="🗣️ Pronunciation (your try)" />
                  )}
                  <p className="muted text-xs">✅ Saved to History.</p>
                </>
              )}
            </Step>
          </div>
        </div>
      )}
    </div>
  );
}
