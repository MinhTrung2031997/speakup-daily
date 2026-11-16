import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todaysQuestion, useAIConfig } from '../lib/hooks';
import { generateQuestion, scoreRetry, upgradeAnswer } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { prettyDate, todayStr, uid } from '../lib/date';
import { isDue } from '../lib/srs';
import { streak } from '../lib/stats';
import type { DailyQuestion, Entry } from '../lib/types';
import MicInput from '../components/MicInput';
import UpgradeResult from '../components/UpgradeResult';
import { ErrorBox, NoKeyBanner, Spinner } from '../components/ui';
import Icon from '../components/Icon';

const normQ = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Today() {
  const { state, update, addPhrases, logActivity } = useStore();
  const ai = useAIConfig();
  const q = todaysQuestion(state);
  const entry = q ? [...state.entries].reverse().find((e) => e.questionId === q.id) : undefined;

  const [answer, setAnswer] = useState(entry?.answer || '');
  const [loadingQ, setLoadingQ] = useState(false);
  const [qError, setQError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [upError, setUpError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [practice, setPractice] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [scoring, setScoring] = useState(false);
  const [retryError, setRetryError] = useState('');
  const autoTried = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // Reset local drafts when the question changes.
  useEffect(() => {
    setAnswer(entry?.answer || '');
    setPractice(false);
    setAttempt('');
    setSavedMsg('');
    setUpError('');
    setRetryError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id]);

  const newQuestion = useCallback(async () => {
    setLoadingQ(true);
    setQError('');
    try {
      const active = state.topics.filter((t) => t.active);
      const pool = active.length ? active : state.topics;
      const lastTopic = state.questions[state.questions.length - 1]?.topicId;
      const choices = pool.length > 1 ? pool.filter((t) => t.id !== lastTopic) : pool;
      const topic = choices[Math.floor(Math.random() * choices.length)];
      const past = state.questions.map((x) => x.question);
      const seen = new Set(past.map(normQ));
      let r = await generateQuestion(ai, state.profile, topic.name, past);
      if (seen.has(normQ(r.question))) r = await generateQuestion(ai, state.profile, topic.name, [...past, r.question]);
      const dq: DailyQuestion = { id: uid(), date: todayStr(), topicId: topic.id, topicName: `${topic.emoji} ${topic.name}`, question: r.question, starters: r.starters, createdAt: Date.now() };
      update((s) => ({ ...s, questions: [...s.questions, dq] }));
    } catch (e) {
      setQError(errorText(e));
    } finally {
      setLoadingQ(false);
    }
  }, [ai, state.topics, state.questions, state.profile, update]);

  // Auto-create today's question once per visit.
  useEffect(() => {
    if (!q && ai.hasKey && !autoTried.current) {
      autoTried.current = true;
      newQuestion();
    }
  }, [q, ai.hasKey, newQuestion]);

  const askNew = () => {
    if (answer.trim() && !entry?.upgrade && !confirm('Get a new question? Your current answer will be cleared.')) return;
    newQuestion();
  };

  const doUpgrade = async () => {
    if (!q || !answer.trim()) return;
    setUpgrading(true);
    setUpError('');
    setSavedMsg('');
    try {
      const up = await upgradeAnswer(ai, state.profile, q.question, answer.trim());
      const e: Entry = entry
        ? { ...entry, answer: answer.trim(), upgrade: up, retry: undefined }
        : { id: uid(), date: todayStr(), questionId: q.id, question: q.question, topicName: q.topicName, answer: answer.trim(), upgrade: up, createdAt: Date.now() };
      update((s) => ({ ...s, entries: entry ? s.entries.map((x) => (x.id === e.id ? e : x)) : [...s.entries, e] }));
      const n = addPhrases(up.phrases, q.question);
      logActivity();
      setSavedMsg(n ? `Saved ${n} new phrase${n > 1 ? 's' : ''} to your Phrase Bank.` : 'These phrases are already in your Phrase Bank.');
      setPractice(false);
      setAttempt('');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      setUpError(errorText(e));
    } finally {
      setUpgrading(false);
    }
  };

  const doScore = async () => {
    if (!entry?.upgrade || !attempt.trim()) return;
    setScoring(true);
    setRetryError('');
    try {
      const r = await scoreRetry(ai, entry.question, entry.upgrade.natural, entry.upgrade.phrases.map((p) => p.phrase), attempt.trim());
      update((s) => ({ ...s, entries: s.entries.map((x) => (x.id === entry.id ? { ...x, retry: r } : x)) }));
      logActivity();
      setPractice(false);
    } catch (e) {
      setRetryError(errorText(e));
    } finally {
      setScoring(false);
    }
  };

  const st = streak(state);
  const due = state.phrases.filter((p) => isDue(p)).length;
  const name = state.profile.name.trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="muted">{prettyDate(todayStr())}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{greeting()}{name ? `, ${name}` : ''} 👋</h1>
        </div>
        <div className="flex gap-2">
          <span className="chip bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200"><Icon name="fire" className="h-3.5 w-3.5" /> {st.current} day streak</span>
          {due > 0 && <Link to="/phrases" className="chip bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-400/15 dark:text-amber-200">🔁 {due} to review</Link>}
        </div>
      </div>

      {!ai.hasKey && <NoKeyBanner />}

      {/* Question card */}
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-blue-100/70 blur-2xl dark:bg-blue-900/30" />
        <div className="relative">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="chip bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">{q ? q.topicName : "Today's question"}</span>
            <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={askNew} disabled={loadingQ || !ai.hasKey}>
              {loadingQ ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-4 w-4" />} New question
            </button>
          </div>
          {q ? (
            <>
              <p className="text-xl font-semibold leading-snug text-slate-900 dark:text-white">{q.question}</p>
              {q.starters.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">💡 Idea starters</p>
                  <div className="flex flex-wrap gap-2">
                    {q.starters.map((s) => <span key={s} className="chip bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{s}</span>)}
                  </div>
                </div>
              )}
            </>
          ) : loadingQ ? (
            <div className="flex items-center gap-3 py-6 text-slate-500"><Spinner /> Thinking of a good question for you…</div>
          ) : (
            <div className="py-4">
              <p className="muted mb-3">No question yet today.</p>
              <button className="btn-primary" onClick={newQuestion} disabled={!ai.hasKey}><Icon name="sparkles" className="h-4 w-4" /> Get today's question</button>
            </div>
          )}
          {qError && <div className="mt-3"><ErrorBox error={qError} onRetry={newQuestion} /></div>}
        </div>
      </section>

      {/* Answer card */}
      {q && (
        <section className="card space-y-3">
          <div>
            <h2 className="h-section">🎙️ Your answer</h2>
            <p className="muted">Say it out loud with the mic, or type. Don't worry about mistakes. Just get your idea out.</p>
          </div>
          <MicInput value={answer} onChange={setAnswer} placeholder="Tap the mic and speak, or type your answer here…" rows={5} />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={doUpgrade} disabled={!answer.trim() || upgrading || !ai.hasKey}>
              {upgrading ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />} {entry?.upgrade ? 'Upgrade again' : 'Upgrade my answer'}
            </button>
            <span className="muted text-xs">{answer.trim() ? `${answer.trim().split(/\s+/).length} words` : ''}</span>
          </div>
          {savedMsg && <p className="text-sm text-emerald-600 dark:text-emerald-300">✅ {savedMsg}</p>}
          <ErrorBox error={upError} onRetry={doUpgrade} />
        </section>
      )}

      {/* Upgrade result */}
      {entry?.upgrade && (
        <div ref={resultRef} className="scroll-mt-20 space-y-4">
          <UpgradeResult entry={entry} hideModel={practice} />

          <section className="card space-y-3">
            <div>
              <h2 className="h-section">🔁 Say it again</h2>
              <p className="muted">Listen 2–3 times and shadow it. Then hide the model answer and say it again in your own way, using the new phrases.</p>
            </div>
            {!practice ? (
              <button className="btn-soft" onClick={() => { setPractice(true); setAttempt(''); }}><Icon name="mic" className="h-4 w-4" /> Hide answer &amp; try again</button>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-slate-500">Try to use:</span>
                  {entry.upgrade.phrases.map((p) => <span key={p.phrase} className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{p.phrase}</span>)}
                </div>
                <MicInput value={attempt} onChange={setAttempt} placeholder="Answer again without looking…" rows={4} />
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={doScore} disabled={!attempt.trim() || scoring}>{scoring ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Check my attempt</button>
                  <button className="btn-ghost" onClick={() => setPractice(false)}>Show answer</button>
                </div>
                <ErrorBox error={retryError} onRetry={doScore} />
              </>
            )}
            {entry.retry && !practice && <RetryCard entry={entry} />}
          </section>
        </div>
      )}

      {entry?.upgrade && (
        <Link to="/chat" className="card flex items-center gap-3 transition hover:border-blue-300 dark:hover:border-blue-800">
          <span className="text-2xl">💬</span>
          <div className="flex-1">
            <p className="font-semibold">Keep talking about it</p>
            <p className="muted">Chat with an AI partner and reuse today's phrases.</p>
          </div>
          <Icon name="send" className="h-5 w-5 text-blue-600" />
        </Link>
      )}
    </div>
  );
}

function RetryCard({ entry }: { entry: Entry }) {
  const r = entry.retry!;
  const total = r.used.length + r.missed.length || 1;
  const color = r.score >= 80 ? 'text-emerald-600 dark:text-emerald-300' : r.score >= 60 ? 'text-blue-600 dark:text-blue-300' : 'text-amber-600 dark:text-amber-300';
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className={color} strokeWidth="3.5" strokeDasharray={`${r.score} 100`} strokeLinecap="round" />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${color}`}>{r.score}</span>
        </div>
        <div className="text-sm">
          <p className="font-semibold">{r.used.length}/{total} target phrases used</p>
          {r.praise && <p className="text-slate-600 dark:text-slate-300">{r.praise}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.used.map((p) => <span key={p} className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ {p}</span>)}
        {r.missed.map((p) => <span key={p} className="chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">○ {p}</span>)}
      </div>
      {r.tip && <p className="mt-3 rounded-lg bg-blue-50 p-2.5 text-sm text-blue-900 dark:bg-blue-950/50 dark:text-blue-100">💡 <b>Tip:</b> {r.tip}</p>}
    </div>
  );
}
