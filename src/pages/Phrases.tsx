import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { phraseMeanings } from '../lib/ai';
import { FillBlankDrill, PhraseUseCard, SituationDrill, SpeedRound } from '../components/LearnDrills';
import { isDue, schedule, stageLabel, MASTERED_STAGE, INTERVALS } from '../lib/srs';
import { prettyDate } from '../lib/date';
import { speak, ttsSupported } from '../lib/speech';
import type { Phrase, SoundItem } from '../lib/types';
import { issueLabel } from '../components/PronunciationCard';
import { useSayWord, WordTryButton, type TryResult } from '../components/WordTry';
import { Empty, PageTitle } from '../components/ui';
import Icon from '../components/Icon';

export default function Phrases() {
  const { state } = useStore();
  const due = state.phrases.filter((p) => isDue(p));
  const dueSounds = state.sounds.filter((x) => isDue(x));
  const [tab, setTab] = useState<'review' | 'drills' | 'all'>(location.hash === '#drills' ? 'drills' : due.length || dueSounds.length || location.hash === '#sounds' ? 'review' : 'all');
  useLazyMeanings();
  useEffect(() => {
    if (location.hash === '#sounds') setTimeout(() => document.getElementById('sounds')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, []);
  const badge = due.length + dueSounds.length;

  return (
    <div className="space-y-4">
      <PageTitle title="Phrase Bank" subtitle={`${state.phrases.length} phrases · ${state.phrases.filter((p) => p.learnedByVoice).length} learned by voice · ${state.phrases.filter((p) => p.stage >= MASTERED_STAGE).length} mastered · reviews on days ${INTERVALS.join(', ')}`} />
      <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button onClick={() => setTab('review')} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'review' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>Review {badge > 0 && <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{badge}</span>}</button>
        <button onClick={() => setTab('drills')} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'drills' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>Drills</button>
        <button onClick={() => setTab('all')} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'all' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>All phrases</button>
      </div>
      {tab === 'review' ? <><Review due={due} /><SoundsReview /></> : tab === 'drills' ? <Drills /> : <AllPhrases />}
    </div>
  );
}

function Review({ due }: { due: Phrase[] }) {
  const { state } = useStore();
  const [doneCount, setDoneCount] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(due[0]?.id ?? null);
  const current = state.phrases.find((p) => p.id === currentId) || due[0];

  if (!current) {
    const next = state.phrases.filter((p) => p.stage < MASTERED_STAGE).sort((a, b) => a.due.localeCompare(b.due))[0];
    return (
      <Empty icon={doneCount ? '🎉' : '✅'} title={doneCount ? `Great work! You reviewed ${doneCount} phrase${doneCount > 1 ? 's' : ''}.` : 'Nothing to review right now'} text={next ? `Next review: ${prettyDate(next.due)}. Try a drill meanwhile.` : 'Highlighted phrases from suggested answers, the Answer builder and Listen are collected here automatically.'}>
        <Link to="/" className="btn-soft mt-2">Go to Today</Link>
      </Empty>
    );
  }
  const next = () => {
    const remaining = state.phrases.filter((p) => isDue(p) && p.id !== current.id);
    setCurrentId(remaining[0]?.id ?? '__none__');
    setDoneCount((n) => n + 1);
  };
  return <PhraseUseCard key={current.id} phrase={current} left={state.phrases.filter((p) => isDue(p)).length} onNext={next} />;
}

function Drills() {
  const [d, setD] = useState<'fill' | 'situation' | 'speed'>('fill');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Drill">
        {([['fill', '✍️ Fill the blank'], ['situation', '🎬 Situation'], ['speed', '⚡ Speed round']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={d === id} onClick={() => setD(id)} className={`chip !px-3 !py-1.5 text-sm ${d === id ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{label}</button>
        ))}
      </div>
      {d === 'fill' ? <FillBlankDrill /> : d === 'situation' ? <SituationDrill /> : <SpeedRound />}
    </div>
  );
}

/** Phrases without a meaning (e.g. typed in by hand) get one in a single batched AI call; cached on the phrase. */
function useLazyMeanings() {
  const { state, update } = useStore();
  const ai = useAIConfig();
  const tried = useRef(new Set<string>());
  useEffect(() => {
    const missing = state.phrases.filter((p) => !p.meaning && !tried.current.has(p.id)).slice(0, 20);
    if (!missing.length || !ai.hasKey) return;
    missing.forEach((p) => tried.current.add(p.id));
    phraseMeanings(ai, missing.map((p) => p.phrase)).then((m) => {
      if (!Object.keys(m).length) return;
      update((s) => ({ ...s, phrases: s.phrases.map((p) => (!p.meaning && m[p.phrase] ? { ...p, meaning: m[p.phrase].meaning, example: p.example || m[p.phrase].example } : p)) }));
    }).catch(() => {});
  }, [state.phrases, ai, update]);
}

const ORIGIN: Record<NonNullable<Phrase['origin']>, string> = { answer: '✨ Upgrade', suggested: '💡 Suggested', builder: '🧱 Builder', listen: '🎧 Listen', manual: '✍️ Added by you' };

function AddPhrase() {
  const { addPhrases } = useStore();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [meaning, setMeaning] = useState('');
  const [msg, setMsg] = useState('');
  const add = () => {
    if (!phrase.trim()) return;
    const n = addPhrases([{ phrase: phrase.trim(), meaning: meaning.trim(), example: '' }], 'Added by you', 'manual');
    setMsg(n ? `Added “${phrase.trim()}”.` : 'That phrase is already in your bank.');
    setPhrase(''); setMeaning('');
  };
  if (!open) return <button className="btn-soft" onClick={() => setOpen(true)} data-testid="add-phrase"><Icon name="plus" className="h-4 w-4" /> Add a phrase</button>;
  return (
    <div className="card space-y-2 !p-3.5">
      <input className="input" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Phrase, e.g. bounce ideas off" maxLength={120} data-testid="add-phrase-input" />
      <input className="input" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="Meaning (optional, the AI fills it in)" maxLength={160} />
      <div className="flex items-center gap-2">
        <button className="btn-primary" onClick={add} disabled={!phrase.trim()} data-testid="add-phrase-save">Add</button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

function AllPhrases() {
  const { state, update } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'learning' | 'mastered'>('all');
  const list = useMemo(() => {
    const q = query.toLowerCase();
    return state.phrases.filter((p) => {
      if (filter === 'mastered' && p.stage < MASTERED_STAGE) return false;
      if (filter === 'learning' && p.stage >= MASTERED_STAGE) return false;
      return !q || p.phrase.toLowerCase().includes(q) || p.meaning.toLowerCase().includes(q);
    });
  }, [state.phrases, query, filter]);

  const remove = (id: string) => {
    if (confirm('Delete this phrase?')) update((s) => ({ ...s, phrases: s.phrases.filter((p) => p.id !== id) }));
  };

  return (
    <div className="space-y-3">
      <AddPhrase />
      {!state.phrases.length && <Empty icon="📚" title="Your Phrase Bank is empty" text="Highlighted phrases from suggested answers, the Answer builder and Listen are saved here automatically." />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search phrases…" />
        </div>
        <select className="input sm:!w-40" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All</option>
          <option value="learning">Learning</option>
          <option value="mastered">Mastered</option>
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((p) => (
          <div key={p.id} className="card !p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900 dark:text-white">{p.phrase}</p>
              <span className={`chip shrink-0 ${p.stage >= MASTERED_STAGE ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : isDue(p) ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {p.stage >= MASTERED_STAGE ? '🏆 Mastered' : isDue(p) ? 'Due now' : stageLabel(p.stage)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{p.meaning || <span className="italic text-slate-400">Getting the meaning…</span>}</p>
            <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-400"><span className="chip bg-slate-100 !py-0 dark:bg-slate-800">{ORIGIN[p.origin || 'answer']}</span>{p.learnedByVoice && <span className="chip bg-emerald-50 !py-0 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">🎙️ learned by voice</span>}</p>
            {p.example && <p className="mt-1 text-sm italic text-slate-500">e.g. {p.example}</p>}
            <div className="mt-2 flex items-center gap-1">
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: MASTERED_STAGE }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < p.stage ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />)}
              </div>
              <span className="ml-2 text-[11px] text-slate-400">{p.stage >= MASTERED_STAGE ? '' : `next ${prettyDate(p.due)}`}</span>
              {ttsSupported() && <button className="btn-ghost !p-1.5" title="Listen" onClick={() => speak(p.phrase, { voiceURI: state.settings.voiceURI, rate: state.settings.rate })}><Icon name="play" className="h-3.5 w-3.5" /></button>}
              <button className="btn-ghost !p-1.5" title="Delete" onClick={() => remove(p.id)}><Icon name="trash" className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      {!list.length && <p className="muted text-center">No phrases match.</p>}
    </div>
  );
}

/* ---------------- Sounds to fix (pronunciation_items), same SRS as phrases ---------------- */
function SoundsReview() {
  const { state, update, logActivity } = useStore();
  const say = useSayWord();
  const due = state.sounds.filter((x) => isDue(x));
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [result, setResult] = useState<TryResult | null>(null);
  const [done, setDone] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const current = (currentId && currentId !== '__none__' ? state.sounds.find((x) => x.id === currentId) : undefined) || (currentId === '__none__' ? undefined : due[0]);

  if (!state.sounds.length) return null;

  const grade = (ok: boolean, r?: TryResult) => {
    if (!current) return;
    const sched = schedule(current, ok);
    setCurrentId(current.id); // keep showing this word (it is no longer due)
    update((s) => ({ ...s, sounds: s.sounds.map((x) => (x.id === current.id ? { ...x, ...sched } : x)) }));
    setResult(r || { ok, heard: '' });
    if (!done) logActivity();
  };
  const next = () => {
    const rest = state.sounds.filter((x) => isDue(x) && x.id !== current?.id);
    setCurrentId(rest[0]?.id ?? '__none__');
    setResult(null);
    setDone((n) => n + 1);
  };
  const remove = (x: SoundItem) => {
    if (!confirm(`Remove "${x.word}" from Sounds to fix?`)) return;
    update((s) => ({ ...s, sounds: s.sounds.filter((y) => y.id !== x.id) }));
  };

  return (
    <section id="sounds" className="card scroll-mt-20 space-y-3" data-testid="sounds">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="h-section">🗣️ Sounds to fix</h2>
          <p className="muted">Words from your pronunciation checks. Hear it, say it, and it comes back on days {INTERVALS.join(', ')}.</p>
        </div>
        <span className="chip shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{due.length} due</span>
      </div>

      {current && isDue(current) || (current && result) ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-center dark:border-amber-900/60 dark:bg-amber-950/20" data-testid="sound-card">
          <p className="text-xs text-slate-500">{stageLabel(current.stage)} · heard {current.timesSeen}×</p>
          <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{current.word}</p>
          <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm">
            {current.ipa && <span className="font-mono text-slate-500">/{current.ipa}/</span>}
            <span className="chip bg-white text-[11px] text-amber-800 dark:bg-slate-900 dark:text-amber-200">{issueLabel(current.issue)}</span>
          </p>
          {current.note && <p className="mx-auto mt-2 max-w-md text-sm">💡 {current.note}</p>}
          {current.heard && current.heard.toLowerCase() !== current.word.toLowerCase() && <p className="text-xs text-slate-500">Last time it sounded like “{current.heard}”</p>}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button className="btn-soft" onClick={() => say(current.word)}><Icon name="play" className="h-4 w-4" /> Hear it</button>
            {!result && <WordTryButton word={current.word} onResult={(r) => grade(r.ok, r)} />}
          </div>
          {!result ? (
            <div className="mt-3 flex justify-center gap-2 text-xs">
              <button className="btn-ghost !py-1 text-xs" onClick={() => grade(true)}>✓ I said it well</button>
              <button className="btn-ghost !py-1 text-xs" onClick={() => grade(false)}>Still tricky</button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className={`text-sm font-medium ${result.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-200'}`}>
                {result.ok ? '✅ Nice! Moved to the next review step.' : `🌱 We'll practise “${current.word}” again tomorrow.`}{result.heard ? ` (Heard “${result.heard}”)` : ''}
              </p>
              <button className="btn-primary" onClick={next}>Next sound →</button>
            </div>
          )}
        </div>
      ) : (
        <p className="muted text-sm">{done ? `🎉 You practised ${done} sound${done > 1 ? 's' : ''}.` : '✅ No sounds due right now.'}</p>
      )}

      <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide' : 'Show'} all {state.sounds.length} sounds</button>
      {showAll && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {state.sounds.map((x) => (
            <li key={x.id} className="flex items-center gap-2 py-2 text-sm">
              <button className="btn-ghost !p-1.5" onClick={() => say(x.word)} title="Hear it"><Icon name="play" className="h-3.5 w-3.5" /></button>
              <span className="min-w-0 flex-1"><b>{x.word}</b> <span className="text-xs text-slate-500">{x.note}</span></span>
              <span className="chip shrink-0 bg-slate-100 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{x.stage >= MASTERED_STAGE ? '🏆' : isDue(x) ? 'Due' : stageLabel(x.stage)}</span>
              <button className="btn-ghost !p-1.5" onClick={() => remove(x)} title="Remove"><Icon name="x" className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
