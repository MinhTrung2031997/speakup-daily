import DailyPlanCard from '../components/DailyPlan';
import { planStreak } from '../lib/plan';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SpokenQuestion } from '../components/AskAloud';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todaysQuestion, useAIConfig } from '../lib/hooks';
import { generateQuestion, inferQuestionType, scoreRetry, upgradeAnswer } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { prettyDate, todayStr, uid } from '../lib/date';
import { isDue } from '../lib/srs';
import type { DailyQuestion, Entry, PronunciationResult } from '../lib/types';
import type { AudioClip } from '../lib/audio';
import type { SpeechSample } from '../lib/speech';
import { analyzeFluency, withAudioFluency } from '../lib/fluency';
import PronunciationCard from '../components/PronunciationCard';
import FluencyCard from '../components/FluencyCard';
import MicInput from '../components/MicInput';
import UpgradeResult from '../components/UpgradeResult';
import { ShadowCard } from '../components/ShadowPractice';
import RetryCard from '../components/RetryCard';
import AnswerBuilder from '../components/AnswerBuilder';
import SuggestedAnswer, { reusedPhrases } from '../components/SuggestedAnswer';
import { RecordingList } from '../components/RecordingPlayer';
import { nextSeed, pickDailyTopic } from '../lib/topics';
import { ErrorBox, Spinner } from '../components/ui';
import Icon from '../components/Icon';
import { HuntChips, HuntResult } from '../components/HuntCards';
import { useHunt } from '../lib/useHunt';

const MODE_KEY = 'speakup.todayMode';
const normQ = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Today() {
  const { state, update, addPhrases, logActivity, saveRecordings } = useStore();
  const ai = useAIConfig();
  const hunt = useHunt();
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
  const [answerSamples, setAnswerSamples] = useState<SpeechSample[]>([]);
  const [attemptSamples, setAttemptSamples] = useState<SpeechSample[]>([]);
  const [answerClips, setAnswerClips] = useState<AudioClip[]>([]);
  const [attemptClips, setAttemptClips] = useState<AudioClip[]>([]);
  const [answerPron, setAnswerPron] = useState<PronunciationResult>();
  const [showSuggested, setShowSuggested] = useState(false);
  const [recNote, setRecNote] = useState('');
  const [attemptPron, setAttemptPron] = useState<PronunciationResult>();
  const autoTried = useRef(false);
  const [mode, setMode] = useState<'daily' | 'builder'>(() => {
    try { return localStorage.getItem(MODE_KEY) === 'builder' ? 'builder' : 'daily'; } catch { return 'daily'; }
  });
  const switchMode = (m: 'daily' | 'builder') => {
    setMode(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  };
  const resultRef = useRef<HTMLDivElement>(null);

  // Reset local drafts when the question changes.
  useEffect(() => {
    setAnswer(entry?.answer || '');
    setPractice(false);
    setAttempt('');
    setSavedMsg('');
    setUpError('');
    setRetryError('');
    setAnswerSamples([]);
    setAttemptSamples([]);
    setAnswerClips([]);
    setAttemptClips([]);
    setAnswerPron(undefined);
    setAttemptPron(undefined);
    setShowSuggested(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id]);

  // Clearing the box starts a fresh answer, so drop its speech stats too.
  useEffect(() => { if (!answer.trim()) { setAnswerSamples([]); setAnswerClips([]); setAnswerPron(undefined); } }, [answer]);
  useEffect(() => { if (!attempt.trim()) { setAttemptSamples([]); setAttemptClips([]); setAttemptPron(undefined); } }, [attempt]);

  const reused = useMemo(() => reusedPhrases(q?.suggestions, answer), [q?.suggestions, answer]);
  const sameAnswer = !!entry && entry.answer === answer.trim();
  // A fresh recording replaces the saved check (until it is checked itself).
  const shownAnswerPron = answerPron || (sameAnswer && !answerClips.length ? entry?.pronunciation : undefined);
  const liveFluency = useMemo(() => analyzeFluency(answerSamples), [answerSamples]);
  const attemptFluency = useMemo(() => withAudioFluency(analyzeFluency(attemptSamples), attemptPron), [attemptSamples, attemptPron]);
  // Fillers / pauses from the recording win over Chrome's transcript when a pronunciation check ran.
  const answerFluency = withAudioFluency(liveFluency || (sameAnswer ? entry?.fluency : undefined), shownAnswerPron);

  const onAnswerPron = (r: PronunciationResult) => {
    setAnswerPron(r);
    if (entry && sameAnswer) {
      const fluency = withAudioFluency(liveFluency || entry.fluency, r);
      update((s) => ({ ...s, entries: s.entries.map((x) => (x.id === entry.id ? { ...x, pronunciation: r, ...(fluency ? { fluency } : {}) } : x)) }));
    }
  };
  const onRetryPron = (r: PronunciationResult) => {
    setAttemptPron(r);
    if (!entry?.retry) return;
    const fluency = withAudioFluency(entry.retry.fluency, r);
    update((s) => ({ ...s, entries: s.entries.map((x) => (x.id === entry.id && x.retry ? { ...x, retry: { ...x.retry, pronunciation: r, ...(fluency ? { fluency } : {}) } } : x)) }));
  };

  const newQuestion = useCallback(async () => {
    setLoadingQ(true);
    setQError('');
    try {
      const lastTopic = state.questions[state.questions.length - 1]?.topicId;
      const topic = pickDailyTopic(state.topics, lastTopic, Math.random, state.questions);
      if (!topic) throw new Error('Turn on at least one topic in Settings.');
      const past = state.questions.map((x) => x.question);
      const seen = new Set(past.map(normQ));
      // Rotate through the topic's seed questions first (no repeats), then let the AI write new ones.
      const seed = nextSeed(topic.id, state.questions);
      let r = await generateQuestion(ai, state.profile, topic.name, past, seed);
      if (!seed && seen.has(normQ(r.question))) r = await generateQuestion(ai, state.profile, topic.name, [...past, r.question]);
      const dq: DailyQuestion = { id: uid(), date: todayStr(), topicId: topic.id, topicName: `${topic.emoji} ${topic.name}`, question: r.question, starters: r.starters, ...(seed ? { seed } : {}), createdAt: Date.now() };
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
      const fluency = answerFluency || undefined;
      const pronunciation = shownAnswerPron;
      const e: Entry = entry
        ? { ...entry, answer: answer.trim(), upgrade: up, retry: undefined, fluency, pronunciation }
        : { id: uid(), date: todayStr(), questionId: q.id, question: q.question, topicName: q.topicName, answer: answer.trim(), upgrade: up, fluency, pronunciation, createdAt: Date.now() };
      update((s) => ({ ...s, entries: entry ? s.entries.map((x) => (x.id === e.id ? e : x)) : [...s.entries, e] }));
      // Keep the recording (background; never blocks saving the answer).
      if (answerClips.length) {
        setRecNote('');
        saveRecordings(answerClips, { kind: 'answer', answerId: e.id, questionId: q.id, questionType: inferQuestionType(q.question) })
          .then((failed) => failed && setRecNote('🎙️ Recording not saved. Your answer and scores are saved.'));
      }
      const n = addPhrases(up.phrases, q.question);
      logActivity();
      // Word tracker: did the spoken answer use today's target words? (background; never blocks saving)
      if (answerFluency || answerClips.length || answerSamples.length) void hunt.run({ ref: `answer:${e.id}`, source: 'daily', question: q.question, transcript: answer.trim() });
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
      if (attemptFluency) r.fluency = attemptFluency;
      if (attemptPron) r.pronunciation = attemptPron;
      update((s) => ({ ...s, entries: s.entries.map((x) => (x.id === entry.id ? { ...x, retry: r } : x)) }));
      if (attemptClips.length) {
        setRecNote('');
        saveRecordings(attemptClips, { kind: 'retry', answerId: entry.id, questionId: entry.questionId || undefined, questionType: inferQuestionType(entry.question) })
          .then((failed) => failed && setRecNote('🎙️ Recording not saved. Your try and scores are saved.'));
      }
      logActivity();
      if (attemptFluency || attemptClips.length || attemptSamples.length) void hunt.run({ ref: `retry:${entry.id}`, source: 'retry', question: entry.question, transcript: attempt.trim() });
      setPractice(false);
    } catch (e) {
      setRetryError(errorText(e));
    } finally {
      setScoring(false);
    }
  };

  const st = planStreak(state);
  const due = state.phrases.filter((p) => isDue(p)).length + state.sounds.filter((x) => isDue(x)).length;
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
          {due > 0 && <Link to="/phrases" className="chip bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-400/15 dark:text-amber-200" data-testid="due-badge">📚 {due} phrase{due > 1 ? 's' : ''} due</Link>}
          {state.questions.some((x) => x.date < todayStr()) && <Link to="/replay" className="chip bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-400/15 dark:text-violet-200" data-testid="replay-link">🔁 Replay</Link>}
        </div>
      </div>

      <DailyPlanCard />

      <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
        <button role="tab" aria-selected={mode === 'daily'} onClick={() => switchMode('daily')} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'daily' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>📅 Daily question</button>
        <button role="tab" aria-selected={mode === 'builder'} onClick={() => switchMode('builder')} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'builder' ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>🧩 Answer builder</button>
      </div>

      {mode === 'builder' ? <AnswerBuilder /> : (
      <>
      {/* Question card */}
      <section className="card relative overflow-hidden scroll-mt-20" id="question">
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
              <SpokenQuestion id={q.id} question={q.question} answered={!!entry?.upgrade} />
              {q.starters.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">💡 Idea starters</p>
                  <div className="flex flex-wrap gap-2">
                    {q.starters.map((s) => <span key={s} className="chip bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{s}</span>)}
                  </div>
                </div>
              )}
              <HuntChips question={q.question} />
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button className="btn-soft !py-1.5 text-sm" onClick={() => setShowSuggested((v) => !v)} disabled={!ai.hasKey && !q.suggestions?.length} aria-expanded={showSuggested}>
                  💡 {showSuggested ? 'Hide the suggested answer' : 'Show a suggested answer'}
                </button>
                {!showSuggested && <span className="muted text-xs">Try it yourself first. Peek if you're stuck.</span>}
                <Link to="/history?tab=daily" className="ml-auto text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">🗂️ Past questions</Link>
              </div>
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

      {q && showSuggested && <SuggestedAnswer q={q} onClose={() => setShowSuggested(false)} />}

      {/* Answer card */}
      {q && (
        <section className="card space-y-3">
          <div>
            <h2 className="h-section">🎙️ Your answer</h2>
            <p className="muted">Say it out loud with the mic, or type. Don't worry about mistakes. Just get your idea out.</p>
          </div>
          <MicInput value={answer} onChange={setAnswer} onSpeech={(s) => setAnswerSamples((a) => [...a, s])} onAudio={(c) => { setAnswerClips((a) => [...a, c]); setAnswerPron(undefined); }} placeholder="Tap the mic and speak, or type your answer here…" rows={5} />
          {answerFluency ? <FluencyCard stats={answerFluency} /> : answer.trim() && <p className="muted text-xs">🎙️ Answer with the mic to see your pace, filler words, restarts and long pauses.</p>}
          <PronunciationCard clips={answerClips} transcript={answer} result={shownAnswerPron} onResult={onAnswerPron} context={q ? `answering the question "${q.question}"` : undefined} />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={doUpgrade} disabled={!answer.trim() || upgrading || !ai.hasKey}>
              {upgrading ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />} {entry?.upgrade ? 'Upgrade again' : 'Upgrade my answer'}
            </button>
            <span className="muted text-xs">{answer.trim() ? `${answer.trim().split(/\s+/).length} words` : ''}</span>
          </div>
          {reused.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="reused-phrases">
              <span className="text-xs text-slate-500">💡 Suggested phrases used: {reused.filter((r) => r.used).length}/{reused.length}</span>
              {reused.map((r) => (
                <span key={r.phrase} className={`chip ${r.used ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{r.used ? '✓' : '○'} {r.phrase}</span>
              ))}
            </div>
          )}
          {savedMsg && <p className="text-sm text-emerald-600 dark:text-emerald-300">✅ {savedMsg}</p>}
          {entry && <HuntResult refId={`answer:${entry.id}`} busy={hunt.busyRef} error={hunt.error} />}
          {entry && <RecordingList recs={state.recordings.filter((r) => r.answerId === entry.id && r.kind === 'answer')} />}
          {recNote && <p className="muted text-xs" data-testid="rec-note">{recNote}</p>}
          <ErrorBox error={upError} onRetry={doUpgrade} />
        </section>
      )}

      {/* Upgrade result */}
      {entry?.upgrade && (
        <div ref={resultRef} className="scroll-mt-20 space-y-4">
          <UpgradeResult entry={entry} hideModel={practice} />

          {!practice && <ShadowCard text={entry.upgrade.natural} phrases={entry.upgrade.phrases.map((p) => p.phrase)} hint="Shadow your upgraded answer one sentence at a time: listen, repeat, then compare the model with your own voice." />}

          <section className="card space-y-3">
            <div>
              <h2 className="h-section">🔁 Say it again</h2>
              <p className="muted">After shadowing, hide the model answer and say it again in your own way, using the new phrases.</p>
            </div>
            {!practice ? (
              <button className="btn-soft" onClick={() => { setPractice(true); setAttempt(''); setAttemptSamples([]); setAttemptClips([]); setAttemptPron(undefined); }}><Icon name="mic" className="h-4 w-4" /> Hide answer &amp; try again</button>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-slate-500">Try to use:</span>
                  {entry.upgrade.phrases.map((p) => <span key={p.phrase} className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{p.phrase}</span>)}
                </div>
                <MicInput value={attempt} onChange={setAttempt} onSpeech={(s) => setAttemptSamples((a) => [...a, s])} onAudio={(c) => { setAttemptClips((a) => [...a, c]); setAttemptPron(undefined); }} placeholder="Answer again without looking…" rows={4} />
                {attemptFluency && <FluencyCard stats={attemptFluency} title="📈 Fluency (this try)" />}
                <PronunciationCard clips={attemptClips} transcript={attempt} result={attemptPron} onResult={setAttemptPron} context="saying their answer again in their own words" title="🗣️ Pronunciation (this try)" />
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={doScore} disabled={!attempt.trim() || scoring}>{scoring ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Check my attempt</button>
                  <button className="btn-ghost" onClick={() => setPractice(false)}>Show answer</button>
                </div>
                <ErrorBox error={retryError} onRetry={doScore} />
              </>
            )}
            {entry.retry && !practice && <RetryCard entry={entry} />}
            {entry.retry && !practice && <HuntResult refId={`retry:${entry.id}`} busy={hunt.busyRef} error={hunt.error} />}
            {!practice && <RecordingList recs={state.recordings.filter((r) => r.answerId === entry.id && r.kind === 'retry')} title="🎧 Your tries" />}
            {entry.retry && !practice && (entry.retry.pronunciation || attemptClips.length > 0) && (
              <PronunciationCard clips={attempt.trim() === entry.retry.attempt?.trim() ? attemptClips : []} transcript={entry.retry.attempt || attempt} result={entry.retry.pronunciation} onResult={onRetryPron} context="saying their answer again in their own words" title="🗣️ Pronunciation (your try)" />
            )}
          </section>
        </div>
      )}

      <Link to="/speed" className="card flex items-center gap-3 transition hover:border-amber-300 dark:hover:border-amber-800" data-testid="speed-link">
        <span className="text-2xl">⚡</span>
        <div className="flex-1">
          <p className="font-semibold">Reply speed round</p>
          <p className="muted">8 quick questions. Start talking within 3 seconds. About 4 min.</p>
        </div>
      </Link>

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
      </>
      )}
    </div>
  );
}
