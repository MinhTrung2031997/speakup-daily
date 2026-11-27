// Replay: pick a random old daily question and answer it again (normal record → feedback → pronunciation flow).
// The old answer and the suggested answer stay hidden until he has answered. 2 phrases due for review are shown
// as targets. Afterwards: "Then vs now" (first vs latest attempt) + EL's compareAnswers, and the targets are graded
// on 3 levels and scheduled in code (srs.scheduleLevel).
import { useEffect, useMemo, useState } from 'react';
import { SpokenQuestion } from '../components/AskAloud';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { compareAnswers, inferQuestionType, upgradeAnswer } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { prettyDate, todayStr, uid, addDays } from '../lib/date';
import { analyzeFluency, withAudioFluency } from '../lib/fluency';
import { HuntResult } from '../components/HuntCards';
import { useHunt } from '../lib/useHunt';
import { filterWordsUsed } from '../lib/learnPrompts';
import { groupTopics, topicIdOf } from '../lib/topics';
import type { AnswerReview, DailyQuestion, Entry, PronunciationResult } from '../lib/types';
import { ANSWER_GAPS, latestAttempt, nextReview } from '../lib/plan';
import type { AudioClip } from '../lib/audio';
import type { SpeechSample } from '../lib/speech';
import MicInput from '../components/MicInput';
import FluencyCard from '../components/FluencyCard';
import PronunciationCard from '../components/PronunciationCard';
import UpgradeResult from '../components/UpgradeResult';
import SuggestedAnswer from '../components/SuggestedAnswer';
import RecordingPlayer from '../components/RecordingPlayer';
import { LevelChip, practicePool } from '../components/LearnDrills';
import { ErrorBox, PageTitle, Spinner } from '../components/ui';
import Icon from '../components/Icon';

type Filter = 'any' | 'answered' | 'new' | 'old7' | 'low';
const FILTERS: [Filter, string][] = [['any', 'Any'], ['answered', 'Answered before'], ['new', 'Not answered yet'], ['old7', 'Answered 7+ days ago'], ['low', 'Low score']];

/** Daily answers to a question (not builder), oldest first. */
export function answersFor(entries: Entry[], q: DailyQuestion): Entry[] {
  return entries.filter((e) => !e.builder && (e.questionId === q.id || (!e.questionId && e.question === q.question))).sort((a, b) => a.createdAt - b.createdAt);
}

/** "Low score": latest attempt had pronunciation < 70, a retry < 60, or a replay score ≤ 5/10. */
function isLow(e: Entry | undefined): boolean {
  if (!e) return false;
  return (e.pronunciation?.score ?? 100) < 70 || (e.retry?.score ?? 100) < 60 || (e.replay?.compare?.score.new ?? 10) <= 5;
}

export default function Replay() {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('any');
  const [topic, setTopic] = useState('');
  const today = todayStr();
  const qid = params.get('q') || '';

  const pool = useMemo(() => {
    const week = addDays(today, -7);
    return state.questions.filter((q) => {
      if (q.date >= today && !qid) return false; // old questions only
      const ans = answersFor(state.entries, q);
      if (topic && topicIdOf(q.topicId, q.topicName) !== topic && `name:${q.topicName}` !== topic) return false;
      if (filter === 'answered') return ans.length > 0;
      if (filter === 'new') return ans.length === 0;
      if (filter === 'old7') return ans.length > 0 && ans[ans.length - 1].date <= week;
      if (filter === 'low') return isLow(ans[ans.length - 1]);
      return true;
    });
  }, [state.questions, state.entries, filter, topic, today, qid]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    state.questions.filter((q) => q.date < today).forEach((q) => { const k = topicIdOf(q.topicId, q.topicName) || `name:${q.topicName}`; m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [state.questions, today]);

  const pick = () => {
    const others = pool.filter((q) => q.id !== qid);
    const list = others.length ? others : pool;
    const q = list[Math.floor(Math.random() * list.length)];
    if (q) setParams({ q: q.id });
  };

  const q = state.questions.find((x) => x.id === qid);

  // Answer review (from Today's plan): /replay?review=<answerId>
  const reviewId = params.get('review') || '';
  const review = reviewId ? (state.answerReviews || []).find((r) => r.answerId === reviewId) : undefined;
  const reviewEntry = reviewId ? state.entries.find((e) => e.id === reviewId) : undefined;
  if (reviewId) {
    const rq: DailyQuestion | undefined = reviewEntry && (state.questions.find((x) => x.id === reviewEntry.questionId)
      || { id: reviewEntry.questionId || reviewEntry.id, date: reviewEntry.date, topicId: '', topicName: reviewEntry.topicName, question: reviewEntry.question, starters: [], createdAt: reviewEntry.createdAt });
    return (
      <div className="space-y-4">
        <PageTitle title="🔁 Answer review" subtitle="Hear your old answer, then answer the same question again." right={<Link to="/#plan" className="btn-ghost !py-1 text-sm">Today's plan</Link>} />
        {rq && review && reviewEntry ? <ReplayRound key={reviewId} q={rq} review={review} reviewEntry={reviewEntry} /> : <p className="muted text-sm" data-testid="review-missing">This answer isn't available for review any more.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle title="🔁 Replay" subtitle="Answer an old question again, then compare your first try with now." right={<Link to="/" className="btn-ghost !py-1 text-sm">Today</Link>} />
      <section className="card space-y-3" data-testid="replay-filters">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Which questions">
          {FILTERS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={`chip !px-3 !py-1.5 text-sm ${filter === id ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{label}</button>
          ))}
        </div>
        <select className="input" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" data-testid="replay-topic">
          <option value="">All topics</option>
          {groupTopics(state.topics).map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.topics.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name} ({counts.get(t.id) || 0})</option>)}
            </optgroup>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={pick} disabled={!pool.length} data-testid="random-old"><Icon name="refresh" className="h-4 w-4" /> {q ? 'Skip · another random' : 'Random old question'}</button>
          <span className="text-xs text-slate-500">{pool.length} question{pool.length === 1 ? '' : 's'} match</span>
        </div>
      </section>
      {q ? <ReplayRound key={q.id} q={q} /> : !pool.length && <p className="muted text-sm">No old questions match yet. Answer a few daily questions first, or change the filter.</p>}
    </div>
  );
}

function ReplayRound({ q, review, reviewEntry }: { q: DailyQuestion; review?: AnswerReview; reviewEntry?: Entry }) {
  const { state, update, addPhrases, logActivity, saveRecordings, reviewPhrase } = useStore();
  // Review mode compares against the latest earlier attempt (fixed when the screen opens).
  const [base] = useState(() => (reviewEntry ? latestAttempt(state, reviewEntry) : undefined));
  const [reviewResult, setReviewResult] = useState<AnswerReview>();
  const ai = useAIConfig();
  const hunt = useHunt();
  const prev = useMemo(() => answersFor(state.entries, q), [state.entries, q]);
  const [targets] = useState(() => practicePool(state.phrases).slice(0, 2).map((p) => p.phrase));
  const [answer, setAnswer] = useState('');
  const [samples, setSamples] = useState<SpeechSample[]>([]);
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [pron, setPron] = useState<PronunciationResult>();
  const [showSuggested, setShowSuggested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newId, setNewId] = useState('');
  const [recNote, setRecNote] = useState('');
  const fluency = useMemo(() => withAudioFluency(analyzeFluency(samples), pron), [samples, pron]);
  useEffect(() => { if (!answer.trim()) { setSamples([]); setClips([]); setPron(undefined); } }, [answer]);

  const first = base || prev.find((e) => e.id !== newId);
  const latest = state.entries.find((e) => e.id === newId);

  const submit = async () => {
    if (!answer.trim()) return;
    setBusy(true); setError('');
    try {
      const voiced = samples.length > 0 || clips.length > 0;
      const bank = state.phrases.map((p) => p.phrase);
      const [up, cmp] = await Promise.all([
        upgradeAnswer(ai, state.profile, q.question, answer.trim()),
        first ? compareAnswers(ai, q.question, first.answer, answer.trim(), bank, targets) : Promise.resolve(undefined),
      ]);
      const e: Entry = {
        id: uid(), date: todayStr(), questionId: q.id, question: q.question, topicName: q.topicName, answer: answer.trim(), upgrade: up,
        fluency: fluency || undefined, pronunciation: pron,
        replay: { ...(first ? { firstAnswerId: first.id } : {}), targets, ...(cmp ? { compare: cmp } : {}) },
        createdAt: Date.now(),
      };
      update((s) => ({ ...s, entries: [...s.entries, e] }));
      setNewId(e.id);
      if (clips.length) {
        saveRecordings(clips, { kind: 'answer', answerId: e.id, questionId: q.id, questionType: inferQuestionType(q.question) })
          .then((failed) => failed && setRecNote('🎙️ Recording not saved. Your answer and scores are saved.'));
      }
      // Grade the 2 target phrases (dates computed in code).
      const graded = cmp?.targets || targets.map((t) => ({ phrase: t, level: filterWordsUsed([t], [], answer).length ? 'understandable' as const : 'off' as const, fix: '' }));
      for (const t of graded) {
        const p = state.phrases.find((x) => x.phrase === t.phrase);
        if (p) reviewPhrase(p.id, { level: t.level, sentence: answer.trim(), feedback: t.fix, drill: 'replay', byVoice: voiced });
      }
      addPhrases(up.phrases, q.question);
      if (review) {
        const better = !!cmp && cmp.score.new > cmp.score.old;
        const same = !cmp || cmp.score.new === cmp.score.old;
        const nr = nextReview(review, better, same);
        update((s) => ({ ...s, answerReviews: (s.answerReviews || []).map((r) => (r.answerId === review.answerId ? nr : r)) }));
        setReviewResult(nr);
      }
      logActivity();
      if (voiced) void hunt.run({ ref: `replay:${e.id}`, source: 'replay', question: q.question, transcript: answer.trim() });
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  const recsFor = (id?: string) => state.recordings.filter((r) => r.answerId === id && r.kind === 'answer');
  return (
    <div className="space-y-4">
      <section className="card space-y-3" data-testid="replay-question">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="chip bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">{q.topicName}</span>
          <span>First asked {prettyDate(q.date)}</span>
          <span>· {prev.filter((e) => e.id !== newId).length ? `${prev.filter((e) => e.id !== newId).length} earlier attempt${prev.filter((e) => e.id !== newId).length > 1 ? 's' : ''} (hidden)` : 'never answered'}</span>
        </div>
        <SpokenQuestion id={`replay:${q.id}`} question={q.question} answered={!!latest} className="text-xl font-semibold text-slate-900 dark:text-white" />
        {targets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="replay-targets">
            <span className="text-xs text-slate-500">Try to use (due for review):</span>
            {targets.map((t) => <span key={t} className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{t}</span>)}
          </div>
        )}
      </section>

      {review && base && !latest && (
        <section className="card space-y-2" data-testid="review-old">
          <h2 className="h-section">🎧 First, hear your old answer</h2>
          {recsFor(base.id).length ? (
            <>
              <p className="muted text-sm">This is how you answered on {prettyDate(base.date)}. Your old text stays hidden until you answer, so you don't just read it back.</p>
              {recsFor(base.id).slice(-1).map((r) => <RecordingPlayer key={r.id} rec={r} label="Your old answer" />)}
            </>
          ) : (
            <p className="muted text-sm" data-testid="review-no-rec">There's no recording of your answer from {prettyDate(base.date)}. You'll see your old text after you answer.</p>
          )}
        </section>
      )}

      {!latest && (
        <section className="card space-y-3">
          <h2 className="h-section">🎙️ Answer it again</h2>
          <MicInput value={answer} onChange={setAnswer} onSpeech={(s) => setSamples((a) => [...a, s])} onAudio={(c) => { setClips((a) => [...a, c]); setPron(undefined); }} rows={5} placeholder="Tap the mic and answer without looking…" />
          {fluency && <FluencyCard stats={fluency} />}
          <PronunciationCard clips={clips} transcript={answer} result={pron} onResult={setPron} context={`answering the question "${q.question}"`} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={submit} disabled={!answer.trim() || busy || !ai.hasKey} data-testid="replay-submit">{busy ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />} Check &amp; compare</button>
            {!showSuggested && <button className="btn-ghost" onClick={() => setShowSuggested(true)} data-testid="replay-show-suggested">💡 Show a suggested answer</button>}
          </div>
          <ErrorBox error={error} onRetry={submit} />
        </section>
      )}
      {showSuggested && <SuggestedAnswer q={q} onClose={() => setShowSuggested(false)} />}

      {latest && (
        <>
          {reviewResult && (
            <div className={`rounded-xl p-3 text-sm ${reviewResult.lastResult === 'better' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'}`} data-testid="review-result" data-result={reviewResult.lastResult}>
              {reviewResult.lastResult === 'better'
                ? (reviewResult.step >= ANSWER_GAPS.length ? '🏆 Better again. This answer is done: it won\'t come back for review.' : `📈 Better than last time! This question comes back in ${ANSWER_GAPS[reviewResult.step]} days.`)
                : '🔁 Not better yet, and that\'s fine. This question comes back tomorrow.'}
              {' '}<Link to="/#plan" className="font-semibold underline">Back to today's plan</Link>
            </div>
          )}
          <ThenVsNow first={first} latest={latest} recsFor={recsFor} />
          {recNote && <p className="muted text-xs" data-testid="rec-note">{recNote}</p>}
          <HuntResult refId={`replay:${latest.id}`} busy={hunt.busyRef} error={hunt.error} />
          <UpgradeResult entry={latest} />
          <div className="flex flex-wrap gap-2">
            <Link to={`/history?tab=daily`} className="btn-soft">See all attempts in History</Link>
          </div>
        </>
      )}
    </div>
  );
}

function ThenVsNow({ first, latest, recsFor }: { first?: Entry; latest: Entry; recsFor: (id?: string) => ReturnType<typeof useStore>['state']['recordings'] }) {
  const { state } = useStore();
  const cmp = latest.replay?.compare;
  const bank = state.phrases.map((p) => p.phrase);
  const usedOld = first ? filterWordsUsed(bank, [], first.answer) : [];
  const usedNew = cmp?.wordsUsed || filterWordsUsed(bank, [], latest.answer);
  const col = (e: Entry | undefined, label: string, used: string[], score?: number, structure?: string) => (
    <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700" data-testid={`col-${label.toLowerCase()}`}>
      <p className="text-xs font-semibold text-slate-500">{label}{e ? ` · ${prettyDate(e.date)}` : ''}</p>
      {e ? (
        <>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            <dt className="text-slate-500">Words/min</dt><dd className="font-semibold tabular-nums">{e.fluency?.wpm ? Math.round(e.fluency.wpm) : '–'}</dd>
            <dt className="text-slate-500">Fillers</dt><dd className="font-semibold tabular-nums">{e.fluency ? e.fluency.fillers : e.pronunciation ? e.pronunciation.fillerTotal : '–'}</dd>
            <dt className="text-slate-500">Pronunciation</dt><dd className="font-semibold tabular-nums">{e.pronunciation ? `${e.pronunciation.score}/100` : '–'}</dd>
            {score !== undefined && <><dt className="text-slate-500">Score</dt><dd className="font-semibold tabular-nums">{score}/10</dd></>}
          </dl>
          {structure && <p className="text-xs text-slate-500">Shape: <span className="font-medium text-slate-700 dark:text-slate-200">{structure}</span></p>}
          <p className="text-xs text-slate-500">Phrases used: {used.length ? used.map((p) => <mark key={p} className="mark-phrase mr-1">{p}</mark>) : 'none'}</p>
          <details><summary className="cursor-pointer text-xs text-blue-600 dark:text-blue-400">Transcript</summary><p className="mt-1 text-sm">{e.answer}</p></details>
          {recsFor(e.id).slice(-1).map((r) => <RecordingPlayer key={r.id} rec={r} label={label} compact />)}
        </>
      ) : <p className="text-sm text-slate-500">This was your first attempt.</p>}
    </div>
  );
  return (
    <section className="card space-y-3" data-testid="then-vs-now">
      <h2 className="h-section">🆚 Then vs now</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {col(first, 'Then', usedOld, cmp?.score.old, cmp?.structureOld)}
        {col(latest, 'Now', usedNew, cmp?.score.new, cmp?.structureNew)}
      </div>
      {cmp && (
        <div className="space-y-2 text-sm" data-testid="compare-ai">
          {cmp.improved.length > 0 ? <div><p className="font-semibold">📈 What got better</p><ul className="ml-5 list-disc">{cmp.improved.map((x) => <li key={x}>{x}</li>)}</ul></div> : <p>No clear improvement this time, and that's normal. Try the tip below.</p>}
          {cmp.fixNext && <p><span className="font-semibold">🎯 Fix next time:</span> {cmp.fixNext}</p>}
          {cmp.upgradedSentence && <p><span className="font-semibold">✨ Say it like this:</span> {cmp.upgradedSentence}</p>}
          {cmp.targets.length > 0 && (
            <div className="space-y-1.5" data-testid="replay-target-results">
              <p className="font-semibold">🎯 Your target phrases</p>
              {cmp.targets.map((t) => <p key={t.phrase} className="flex flex-wrap items-center gap-1.5"><LevelChip level={t.level} /> <b>{t.phrase}</b> <span className="text-slate-600 dark:text-slate-300">{t.fix}</span></p>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
