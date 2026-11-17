import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuggestedAnswer, { reusedPhrases } from '../components/SuggestedAnswer';
import { CompareRecordings, RecordingList } from '../components/RecordingPlayer';
import { useStore } from '../lib/store';
import { prettyDate } from '../lib/date';
import type { DailyQuestion, Entry } from '../lib/types';
import UpgradeResult from '../components/UpgradeResult';
import BuilderResult from '../components/BuilderResult';
import { ShadowCard } from '../components/ShadowPractice';
import FluencyCard from '../components/FluencyCard';
import PronunciationCard from '../components/PronunciationCard';
import { Empty, PageTitle } from '../components/ui';
import { FeedbackCard } from './Chat';
import { ListenBadges, RetellCard } from './Listen';
import Icon from '../components/Icon';

export default function History() {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const urlTab = params.get('tab');
  const [tab, setTabState] = useState<'daily' | 'answers' | 'chats' | 'listening'>(urlTab === 'daily' || urlTab === 'chats' || urlTab === 'listening' ? urlTab : 'answers');
  const setTab = (t: typeof tab) => { setTabState(t); setParams(t === 'answers' ? {} : { tab: t }, { replace: true }); };
  const [dailyFilter, setDailyFilter] = useState<'all' | 'answered' | 'suggested' | 'starred'>('all');
  const [dailyShown, setDailyShown] = useState(10);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const topics = useMemo(() => Array.from(new Set([...state.entries.map((e) => e.topicName), ...state.chats.map((c) => c.topicName), ...state.listens.map((l) => l.topic)])).sort(), [state.entries, state.chats, state.listens]);

  const entries = useMemo(() => {
    const q = query.toLowerCase();
    return [...state.entries]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((e) => (!topic || e.topicName === topic) && (!date || e.date === date) && (!q || [e.question, e.answer, e.upgrade?.natural || ''].some((t) => t.toLowerCase().includes(q))));
  }, [state.entries, query, topic, date]);

  const chats = useMemo(() => {
    const q = query.toLowerCase();
    return [...state.chats]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((c) => c.messages.length > 1 && (!topic || c.topicName === topic) && (!date || c.date === date) && (!q || c.messages.some((m) => m.text.toLowerCase().includes(q))));
  }, [state.chats, query, topic, date]);

  const listens = useMemo(() => {
    const q = query.toLowerCase();
    return [...state.listens]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((l) => (!topic || l.topic === topic) && (!date || l.date === date) && (!q || [l.drill.title, ...l.drill.lines.map((x) => x.text)].some((t) => t.toLowerCase().includes(q))));
  }, [state.listens, query, topic, date]);

  const starredAnswers = useMemo(() => new Set(state.recordings.filter((r) => r.starred && r.answerId).map((r) => r.answerId!)), [state.recordings]);
  // Daily questions with a suggested answer and/or his own answer, newest first. Answers link by
  // question id (answers.question_id); old rows without one fall back to the same question text.
  const daily = useMemo(() => {
    const q = query.toLowerCase();
    return [...state.questions]
      .sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)))
      .map((dq) => ({ q: dq, answers: state.entries.filter((e) => !e.builder && (e.questionId === dq.id || (!e.questionId && e.question === dq.question))).sort((a, b) => a.createdAt - b.createdAt) }))
      .filter(({ q: dq, answers }) => answers.length > 0 || (dq.suggestions?.length || 0) > 0)
      .filter(({ answers }) => dailyFilter === 'all' || (dailyFilter === 'starred' ? answers.some((e) => starredAnswers.has(e.id)) : dailyFilter === 'answered' ? answers.length > 0 : answers.length === 0))
      .filter(({ q: dq, answers }) => (!topic || dq.topicName === topic) && (!date || dq.date === date) && (!q || [dq.question, ...answers.map((e) => e.answer), ...(dq.suggestions || []).map((v) => v.answer)].some((t) => t.toLowerCase().includes(q))));
  }, [state.questions, state.entries, query, topic, date, dailyFilter, starredAnswers]);

  const unanswered = state.questions.filter((qq) => !state.entries.some((e) => e.questionId === qq.id)).length;

  return (
    <div className="space-y-4">
      <PageTitle title="History" subtitle={`${state.entries.length} answers · ${state.chats.length} chats · ${state.listens.length} listening${unanswered ? ` · ${unanswered} skipped questions` : ''}`} />
      <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button onClick={() => setTab('daily')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'daily' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>Daily</button>
        <button onClick={() => setTab('answers')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'answers' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>Answers</button>
        <button onClick={() => setTab('chats')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'chats' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>Chats</button>
        <button onClick={() => setTab('listening')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'listening' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>Listening</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions and answers…" />
        </div>
        <select className="input sm:!w-48" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">All topics</option>
          {topics.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input type="date" className="input sm:!w-44" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Filter by date" />
      </div>

      {tab === 'daily' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Daily filter">
            {([['all', 'All'], ['answered', 'Answered'], ['suggested', 'Suggested only'], ['starred', '⭐ Starred']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={dailyFilter === id} onClick={() => { setDailyFilter(id); setDailyShown(10); }}
                className={`rounded-full border px-3 py-1 text-xs ${dailyFilter === id ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500 dark:text-slate-950' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{label}</button>
            ))}
          </div>
          {dailyFilter === 'all' && <CompareRecordings recs={state.recordings} />}
          {daily.length ? (
            <>
              {daily.slice(0, dailyShown).map(({ q: dq, answers }) => <DailyRow key={dq.id} q={dq} answers={answers} open={open === dq.id} onToggle={() => setOpen(open === dq.id ? null : dq.id)} />)}
              {daily.length > dailyShown && <button className="btn-soft w-full justify-center" onClick={() => setDailyShown((n) => n + 10)}>Show more ({daily.length - dailyShown} left)</button>}
            </>
          ) : (
            <Empty icon="📅" title={dailyFilter === 'all' && !query && !topic && !date ? 'No daily questions saved yet' : 'No daily questions match'} text="A daily question shows up here once you answer it or open a suggested answer." />
          )}
        </div>
      ) : tab === 'listening' ? (
        listens.length ? (
          <div className="space-y-2">
            {listens.map((l) => (
              <details key={l.id} className="card !p-0">
                <summary className="cursor-pointer list-none p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{prettyDate(l.date)}</span><span>{l.topic}</span></div>
                  <p className="mt-1 font-medium">🎧 {l.drill.title}</p>
                  <div className="mt-1 flex items-center justify-between gap-2"><span className="muted text-xs">{l.accent} · {l.speed}x · {l.level}</span><ListenBadges s={l} /></div>
                </summary>
                <div className="space-y-2 border-t border-slate-200 p-4 text-sm dark:border-slate-800">
                  {l.drill.lines.map((x, i) => <p key={i}><b className={x.speaker === 'Sam' ? 'text-violet-600 dark:text-violet-300' : 'text-amber-600 dark:text-amber-300'}>{x.speaker}:</b> {x.text}</p>)}
                  {l.dictationText != null && <p className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">✍️ Dictation {l.dictationAccuracy}%: “{l.dictationText}”</p>}
                  {l.retell && <RetellCard s={l} />}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty icon="🎧" title={state.listens.length ? 'No drills match your search' : 'No listening drills yet'} text="Your Listen tab drills will appear here." />
        )
      ) : tab === 'answers' ? (
        entries.length ? (
          <div className="space-y-2">
            {entries.map((e) => <EntryRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />)}
          </div>
        ) : (
          <Empty icon="🗂️" title={state.entries.length ? 'No answers match your search' : 'No answers yet'} text="Your answers and upgrades will appear here." />
        )
      ) : chats.length ? (
        <div className="space-y-2">
          {chats.map((c) => (
            <details key={c.id} className="card !p-0">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{prettyDate(c.date)}</span><span>{c.topicName}</span></div>
                <p className="mt-1 font-medium">{c.question}</p>
                <p className="muted text-xs">{c.messages.filter((m) => m.role === 'user').length} messages from you{c.feedback ? ' · feedback ✓' : ''}</p>
              </summary>
              <div className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-800">
                {c.messages.map((m, i) => (
                  <p key={i} className="text-sm"><b className={m.role === 'user' ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500'}>{m.role === 'user' ? 'You' : 'Partner'}:</b> {m.text}</p>
                ))}
                {c.feedback && <FeedbackCard session={c} />}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <Empty icon="💬" title="No chats yet" text="Your conversation practice will appear here." />
      )}
    </div>
  );
}

function EntryRow({ e, open, onToggle }: { e: Entry; open: boolean; onToggle: () => void }) {
  return (
    <div className="card !p-0">
      <button onClick={onToggle} className="w-full p-4 text-left">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>{prettyDate(e.date)}</span>
          <span className="flex items-center gap-2">
            {e.fluency && <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{e.fluency.wpm} wpm</span>}
            {e.builder && <span className="chip bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">🧩 Builder</span>}
            {e.retry && <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Retry {e.retry.score}</span>}
            {e.topicName}
          </span>
        </div>
        <p className="mt-1 font-medium text-slate-900 dark:text-white">{e.question}</p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{e.answer || (e.builder ? 'Model answer built. Not tried yet.' : '')}</p>
      </button>
      {open && (
        <div className="border-t border-slate-200 p-3 dark:border-slate-800 sm:p-4">
          <EntryDetail e={e} />
        </div>
      )}
    </div>
  );
}

/** One answer in full: fluency, pronunciation, upgrade / model answer, shadowing and the retry. */
function EntryDetail({ e, showRecordings = true }: { e: Entry; showRecordings?: boolean }) {
  const { addPhrases, state } = useStore();
  return (
        <>
          {showRecordings && <div className="mb-4"><RecordingList recs={state.recordings.filter((r) => r.answerId === e.id)} /></div>}
          {e.fluency && <div className="mb-4"><FluencyCard stats={e.fluency} title="📈 Fluency (your answer)" /></div>}
          {e.pronunciation && <div className="mb-4"><PronunciationCard clips={[]} transcript={e.answer} result={e.pronunciation} /></div>}
          {e.builder && e.upgrade ? <BuilderResult entry={e} onSave={(items) => addPhrases(items, e.question)} /> : e.upgrade ? <UpgradeResult entry={e} /> : <p className="muted">No upgrade for this answer.</p>}
          {e.upgrade && <div className="mt-4"><ShadowCard text={e.upgrade.natural} phrases={e.upgrade.phrases.map((p) => p.phrase)} /></div>}
          {e.retry && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
              <p className="font-semibold">{e.builder ? 'Say it your way' : 'Say it again'}: {e.retry.score}/100</p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">“{e.retry.attempt}”</p>
              {e.retry.tip && <p className="mt-1">💡 {e.retry.tip}</p>}
              {e.retry.pronunciation && <div className="mt-2"><PronunciationCard clips={[]} transcript={e.retry.attempt} result={e.retry.pronunciation} title="🗣️ Pronunciation (your try)" /></div>}
            </div>
          )}
        </>
  );
}

const fluencyLine = (e: Entry) => [e.fluency ? `${e.fluency.wpm} wpm` : '', e.fluency ? `${e.fluency.fillers} fillers` : '', e.pronunciation ? `pron. ${e.pronunciation.score}` : '', e.retry ? `retry ${e.retry.score}` : ''].filter(Boolean).join(' · ');

/** A daily question with his answer(s) and the suggested answer versions. */
function DailyRow({ q, answers, open, onToggle }: { q: DailyQuestion; answers: Entry[]; open: boolean; onToggle: () => void }) {
  const { state } = useStore();
  const ids = new Set(answers.map((e) => e.id));
  const recordings = state.recordings.filter((r) => r.answerId && ids.has(r.answerId));
  const versions = q.suggestions || [];
  const last = answers[answers.length - 1];
  const reused = last ? reusedPhrases(versions, last.answer) : [];
  return (
    <div className="card !p-0" data-daily={q.id}>
      <button onClick={onToggle} className="w-full p-4 text-left" aria-expanded={open}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{prettyDate(q.date)}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {answers.length > 0 && <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">🎙️ {answers.length > 1 ? `${answers.length} answers` : 'Answered'}</span>}
            {versions.length > 0 && <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">💡 {versions.length} suggested</span>}
            {recordings.length > 0 && <span className="chip bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">🎧 {recordings.length}{recordings.some((r) => r.starred) ? ' ⭐' : ''}</span>}
            <span>{q.topicName}</span>
          </span>
        </div>
        <p className="mt-1 font-medium text-slate-900 dark:text-white">{q.question}</p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{last ? `You: ${last.answer}` : `Suggested: ${versions[versions.length - 1]?.answer || ''}`}</p>
        {last && fluencyLine(last) && <p className="mt-1 text-xs text-slate-400">{fluencyLine(last)}</p>}
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-200 p-3 dark:border-slate-800 sm:p-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">🎙️ Your answer{answers.length > 1 ? 's' : ''}</h3>
            {answers.length ? answers.map((e, i) => (
              <div key={e.id} className="mb-3 space-y-3">
                <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                  {answers.length > 1 && <p className="mb-1 text-xs font-semibold text-slate-500">Answer {i + 1}</p>}
                  <p className="text-slate-700 dark:text-slate-200">“{e.answer}”</p>
                  {fluencyLine(e) && <p className="mt-1 text-xs text-slate-500">{fluencyLine(e)}</p>}
                </div>
                <RecordingList recs={recordings.filter((r) => r.answerId === e.id)} />
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-slate-500">Feedback, upgrade and retry</summary>
                  <div className="mt-3"><EntryDetail e={e} showRecordings={false} /></div>
                </details>
              </div>
            )) : <p className="muted text-sm">Not answered yet. Try it on Today.</p>}
            {reused.length > 0 && (
              <p className="text-xs text-slate-500">💡 Suggested phrases you used: {reused.filter((r) => r.used).map((r) => r.phrase).join(', ') || 'none yet'} ({reused.filter((r) => r.used).length}/{reused.length})</p>
            )}
          </div>
          {versions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">💡 Suggested answer{versions.length > 1 ? `s (${versions.length} versions)` : ''}</h3>
              <SuggestedAnswer q={q} autoStart={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
