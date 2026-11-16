import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { checkSentence, type ReviewResult } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { isDue, schedule, stageLabel, MASTERED_STAGE, INTERVALS } from '../lib/srs';
import { prettyDate, todayStr } from '../lib/date';
import { speak, ttsSupported } from '../lib/speech';
import type { Phrase } from '../lib/types';
import MicInput from '../components/MicInput';
import { Empty, ErrorBox, PageTitle, Spinner } from '../components/ui';
import Icon from '../components/Icon';

export default function Phrases() {
  const { state } = useStore();
  const due = state.phrases.filter((p) => isDue(p));
  const [tab, setTab] = useState<'review' | 'all'>(due.length ? 'review' : 'all');

  return (
    <div className="space-y-4">
      <PageTitle title="Phrase Bank" subtitle={`${state.phrases.length} phrases · reviews on days ${INTERVALS.join(', ')}`} />
      <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button onClick={() => setTab('review')} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'review' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>Review {due.length > 0 && <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{due.length}</span>}</button>
        <button onClick={() => setTab('all')} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === 'all' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>All phrases</button>
      </div>
      {tab === 'review' ? <Review due={due} /> : <AllPhrases />}
    </div>
  );
}

function Review({ due }: { due: Phrase[] }) {
  const { state, update, logActivity } = useStore();
  const ai = useAIConfig();
  const [sentence, setSentence] = useState('');
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [showMeaning, setShowMeaning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(due[0]?.id ?? null);

  const current = state.phrases.find((p) => p.id === currentId) || due[0];

  if (!current) {
    const next = state.phrases.filter((p) => p.stage < MASTERED_STAGE).sort((a, b) => a.due.localeCompare(b.due))[0];
    return (
      <Empty icon={doneCount ? '🎉' : '✅'} title={doneCount ? `Great work! You reviewed ${doneCount} phrase${doneCount > 1 ? 's' : ''}.` : 'Nothing to review right now'} text={next ? `Next review: ${prettyDate(next.due)}.` : 'Upgrade an answer on the Today page to collect new phrases.'}>
        <Link to="/" className="btn-soft mt-2">Go to Today</Link>
      </Empty>
    );
  }

  const check = async () => {
    if (!sentence.trim()) return;
    setChecking(true);
    setError('');
    try {
      const r = await checkSentence(ai, current.phrase, current.meaning, sentence.trim());
      setResult(r);
      const sched = schedule(current, r.ok);
      update((s) => ({
        ...s,
        phrases: s.phrases.map((p) => (p.id === current.id ? { ...p, ...sched, reviews: [...p.reviews, { date: todayStr(), sentence: sentence.trim(), ok: r.ok, feedback: r.feedback }] } : p)),
      }));
      logActivity();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setChecking(false);
    }
  };

  const next = () => {
    const remaining = state.phrases.filter((p) => isDue(p) && p.id !== current.id);
    setCurrentId(remaining[0]?.id ?? '__none__');
    setDoneCount((n) => n + 1);
    setSentence('');
    setResult(null);
    setShowMeaning(false);
    setError('');
  };

  const leftCount = state.phrases.filter((p) => isDue(p)).length;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{stageLabel(current.stage)}</span>
        <span>{leftCount} left today</span>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-slate-900 dark:text-white">"{current.phrase}"</p>
        <div className="mt-2 flex justify-center gap-2">
          {ttsSupported() && <button className="btn-ghost !py-1 text-xs" onClick={() => speak(current.phrase, { voiceURI: state.settings.voiceURI, rate: state.settings.rate })}><Icon name="play" className="h-3.5 w-3.5" /> Listen</button>}
          <button className="btn-ghost !py-1 text-xs" onClick={() => setShowMeaning((v) => !v)}><Icon name="eye" className="h-3.5 w-3.5" /> {showMeaning ? 'Hide' : 'Show'} meaning</button>
        </div>
        {(showMeaning || result) && (
          <div className="mx-auto mt-2 max-w-md text-sm">
            <p className="text-slate-600 dark:text-slate-300">{current.meaning}</p>
            {current.example && <p className="mt-1 italic text-slate-500">e.g. {current.example}</p>}
          </div>
        )}
      </div>
      <div>
        <p className="label">Make your own sentence with this phrase (say it or type it):</p>
        <MicInput value={sentence} onChange={setSentence} rows={2} placeholder="Try something about your own life…" disabled={!!result} />
      </div>
      <ErrorBox error={error} onRetry={check} />
      {result ? (
        <div className={`rounded-xl p-3 text-sm ${result.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'}`}>
          <p className="font-semibold">{result.ok ? '✅ Nice one!' : '🌱 Almost there'}</p>
          <p className="mt-1">{result.feedback}</p>
          {result.better && <p className="mt-2"><span className="text-xs font-semibold uppercase tracking-wide opacity-70">More natural:</span> {result.better}</p>}
          <p className="mt-2 text-xs opacity-70">{result.ok ? 'Moved to the next review step.' : "We'll practise this one again tomorrow."}</p>
          <button className="btn-primary mt-3" onClick={next}>Next phrase →</button>
        </div>
      ) : (
        <button className="btn-primary w-full" onClick={check} disabled={!sentence.trim() || checking || !ai.hasKey}>{checking ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Check my sentence</button>
      )}
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

  if (!state.phrases.length) return <Empty icon="📚" title="Your Phrase Bank is empty" text="When you upgrade an answer, the highlighted phrases are saved here automatically." />;

  return (
    <div className="space-y-3">
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
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{p.meaning}</p>
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
