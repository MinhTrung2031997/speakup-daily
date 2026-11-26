// Words session ("Word of the day"): 5 new spoken phrases a day, about 10 minutes.
// Each word has 4 steps (ES): 1 Hear it, 2 Notice it, 3 Say it, 4 Use it. Bank + prompts by EL (lib/words.ts).
// Learned words join the Phrase Bank (origin 'words') and its spaced reviews; review dates are set in code (srs.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { checkWordUsage } from '../lib/ai';
import { errorText, generateJSON, getDemoMode } from '../lib/gemini';
import { scheduleLevel } from '../lib/srs';
import { todayStr, uid } from '../lib/date';
import { cleanPhrase } from '../lib/diff';
import { stopVoice } from '../lib/tts';
import { useVoicePlayer } from '../lib/useVoicePlayer';
import { catalogueTopic } from '../lib/topics';
import { dailyTopicSlug, pickDailyWords, pickWordsPrompt, TOPIC_SLUGS, WORD_BANK, type WordEntry } from '../lib/words';
import type { AppState, WordCard, WordProgress, WordSession } from '../lib/types';
import ShadowPractice from '../components/ShadowPractice';
import MicInput from '../components/MicInput';
import { LEVEL_UI, LevelChip } from '../components/LearnDrills';
import { ErrorBox, PageTitle, Spinner } from '../components/ui';
import Icon from '../components/Icon';

const N = 5;
const STEPS = ['Hear it', 'Notice it', 'Say it', 'Use it'] as const;
const key = (p: string) => cleanPhrase(p).toLowerCase();

/** Seed for today: the date rotates the topic; if that topic is switched off, use one of his active topics. */
export function wordSeed(state: AppState, date: string): string {
  const active = state.topics.filter((t) => t.active && (TOPIC_SLUGS as readonly string[]).includes(t.id)).map((t) => t.id);
  if (!active.length || active.includes(dailyTopicSlug(date))) return date;
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return `${date}:${active[day % active.length]}`;
}

const toCard = (w: WordEntry | Record<string, unknown>): WordCard | null => {
  const r = w as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const phrase = s(r.phrase);
  if (!phrase) return null;
  return {
    phrase, meaning: s(r.meaning), vi: s(r.vi), example: s(r.example), example2: s(r.example2) || s(r.example),
    topic: s(r.topic) || 'general', level: s(r.level) || 'B2', kind: s(r.kind) || 'collocation',
    collocations: Array.isArray(r.collocations) ? r.collocations.map(s).filter(Boolean).slice(0, 3) : [],
    ...(s(r.wrongPair) ? { wrongPair: s(r.wrongPair) } : {}),
    useItQuestion: s(r.useItQuestion) || `Tell me about a time you could say “${phrase}”.`,
  };
};

/** Today's session: create it once (bank first, AI only if the bank runs out). */
function useTodaySession() {
  const { state, update } = useStore();
  const ai = useAIConfig();
  const today = todayStr();
  const session = state.wordSessions.find((w) => w.date === today);
  const [error, setError] = useState('');
  const started = useRef(false);

  const create = async () => {
    setError('');
    const seed = wordSeed(state, today);
    const learned = state.phrases.map((p) => p.phrase);
    let words = pickDailyWords(WORD_BANK, learned, seed, N).map(toCard).filter(Boolean) as WordCard[];
    if (words.length < N && ai.hasKey && !getDemoMode()) {
      try {
        const topics = state.topics.filter((t) => t.active).map((t) => t.id);
        const recent = state.questions.slice(-5).map((q) => q.question);
        const r = await generateJSON<{ words?: unknown[] }>(ai, 'pick-words', 'Reply with valid JSON only.', [{ role: 'user', text: pickWordsPrompt(state.profile, topics, learned, recent, N - words.length) }], 0.6);
        const have = new Set([...learned, ...words.map((w) => w.phrase)].map(key));
        for (const x of Array.isArray(r.words) ? r.words : []) {
          const c = toCard(x as Record<string, unknown>);
          if (c && !have.has(key(c.phrase)) && words.length < N) { have.add(key(c.phrase)); words.push(c); }
        }
      } catch (e) { setError(errorText(e)); }
    }
    if (!words.length) return;
    const fresh: WordSession = { id: uid(), date: today, topic: dailyTopicSlug(seed), words, current: 0, items: words.map(() => ({ step: 1 })), createdAt: Date.now() };
    update((s) => (s.wordSessions.some((w) => w.date === today) ? s : { ...s, wordSessions: [...s.wordSessions, fresh] }));
  };

  useEffect(() => {
    if (!session && !started.current) { started.current = true; create(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const patch = (fn: (w: WordSession) => WordSession) =>
    update((s) => ({ ...s, wordSessions: s.wordSessions.map((w) => (w.date === today ? fn(w) : w)) }));
  return { session, patch, error, retry: () => { started.current = true; create(); } };
}

export default function Words() {
  const { session, patch, error, retry } = useTodaySession();
  const [view, setView] = useState<number | null>(null);
  useEffect(() => () => stopVoice(), []);

  if (!session) {
    return (
      <div className="space-y-4">
        <PageTitle title="Words" subtitle="5 new spoken phrases a day · about 10 minutes" />
        {error ? <ErrorBox error={error} onRetry={retry} /> : <div className="card flex items-center gap-2 text-sm text-slate-500"><Spinner /> Picking today's words…</div>}
      </div>
    );
  }

  const doneCount = session.items.filter((i) => i?.done).length;
  const allDone = doneCount >= session.words.length;
  const idx = view ?? (allDone ? -1 : session.current);
  const topic = catalogueTopic(session.topic);
  const setItem = (i: number, p: Partial<WordProgress>) => patch((w) => ({ ...w, items: w.items.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  const next = (i: number) => {
    setView(null);
    patch((w) => {
      const items = w.items.map((x, j) => (j === i ? { ...x, done: true } : x));
      const nextIdx = items.findIndex((x) => !x?.done);
      return { ...w, items, current: nextIdx < 0 ? w.current : nextIdx, ...(nextIdx < 0 && !w.completedAt ? { completedAt: Date.now() } : {}) };
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Words" subtitle={`Word of the day${topic ? ` · ${topic.emoji} ${topic.name}` : ''} · ${doneCount}/${session.words.length} done · about 10 min`} />
      <div className="flex flex-wrap gap-2" data-testid="word-dots">
        {session.words.map((w, i) => {
          const it = session.items[i];
          const active = i === idx;
          return (
            <button key={w.phrase} onClick={() => setView(i === session.current && !allDone ? null : i)} disabled={!it?.done && i !== session.current}
              className={`chip !px-3 !py-1.5 ${active ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : it?.done ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'} disabled:opacity-60`}
              aria-label={`Word ${i + 1}: ${it?.done || i === session.current ? w.phrase : 'locked'}`} aria-current={active ? 'step' : undefined}>
              {it?.done ? (it.level ? LEVEL_UI[it.level].icon : '✓') : i + 1} {it?.done || i === session.current ? w.phrase : '•••'}
            </button>
          );
        })}
      </div>
      {idx >= 0 && session.words[idx] ? (
        <WordStep key={idx} n={idx} total={session.words.length} word={session.words[idx]} prog={session.items[idx] || { step: 1 }} date={session.date}
          onChange={(p) => setItem(idx, p)} onNext={() => next(idx)} />
      ) : (
        <Summary session={session} />
      )}
    </div>
  );
}

function Summary({ session }: { session: WordSession }) {
  const { state } = useStore();
  const saved = new Map(state.phrases.map((p) => [key(p.phrase), p]));
  return (
    <section className="card space-y-3" data-testid="words-done">
      <h2 className="h-section">🎉 Today's words are done</h2>
      <p className="muted">They're in your Phrase Bank now and come back in your reviews (day 1, 3, 7, 14, 30).</p>
      <ul className="space-y-2">
        {session.words.map((w, i) => {
          const it = session.items[i];
          const p = saved.get(key(w.phrase));
          return (
            <li key={w.phrase} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-900 dark:text-white">{w.phrase}</span>
              {it?.level && <LevelChip level={it.level} />}
              {p?.learnedByVoice && <span className="chip bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">🎙️ learned by voice</span>}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link to="/phrases" className="btn-soft">Open Phrase Bank</Link>
        <Link to="/" className="btn-ghost">Back to Today</Link>
      </div>
    </section>
  );
}

const usePlayer = useVoicePlayer;

const autoPlayed = new Set<string>();

function WordStep({ n, total, word, prog, date, onChange, onNext }: {
  n: number; total: number; word: WordCard; prog: WordProgress; date: string;
  onChange: (p: Partial<WordProgress>) => void; onNext: () => void;
}) {
  const [step, setStep] = useState<number>(prog.done ? 4 : prog.step || 1);
  const { play, playing } = usePlayer();
  const go = (s: number) => { stopVoice(); setStep(s); if (s > (prog.step || 1)) onChange({ step: s as WordProgress['step'] }); };

  useEffect(() => {
    if (step === 1 && !autoPlayed.has(`${date}:${word.phrase}`)) { autoPlayed.add(`${date}:${word.phrase}`); play([word.example, word.example2], 'both'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const PlayBtn = ({ texts, tag, label }: { texts: string[]; tag: string; label: string }) => (
    <button type="button" className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${playing === tag ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200'}`}
      onClick={() => play(texts, tag)} aria-label={playing === tag ? 'Stop' : label} data-testid={`play-${tag}`} data-state={playing === tag ? 'playing' : 'idle'}>
      <span aria-hidden>{playing === tag ? '⏹' : '🔊'}</span> {playing === tag ? 'Stop' : label}
    </button>
  );

  return (
    <section className="card space-y-4" data-testid="word-card" data-phrase={word.phrase} data-step={step}>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Word {n + 1} of {total} · {word.level} · {word.kind}</span>
        {prog.done && <span className="chip bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">Done</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="word-phrase">“{word.phrase}”</h2>
        <PlayBtn texts={[word.phrase]} tag="phrase" label="Phrase" />
      </div>
      <ol className="grid grid-cols-4 gap-1" aria-label="Steps">
        {STEPS.map((s, i) => {
          const reached = i + 1 <= Math.max(prog.step || 1, step) || prog.done;
          return (
            <li key={s}>
              <button type="button" onClick={() => reached && go(i + 1)} disabled={!reached} aria-current={step === i + 1 ? 'step' : undefined}
                className={`w-full rounded-lg px-1 py-1.5 text-[11px] font-semibold sm:text-xs ${step === i + 1 ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : reached ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}
                data-testid={`step-${i + 1}`}>
                {i + 1} · {s}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="space-y-3" data-testid="hear-it">
          <p className="label">Listen to it in two real sentences:</p>
          {[word.example, word.example2].map((t, i) => (
            <div key={i} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="text-slate-800 dark:text-slate-100">{t}</p>
              <PlayBtn texts={[t]} tag={`ex${i + 1}`} label="Play" />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <PlayBtn texts={[word.example, word.example2]} tag="both" label="Play both" />
            <button className="btn-primary ml-auto" onClick={() => go(2)} data-testid="next-step">Next: Notice it →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3" data-testid="notice-it">
          <p className="text-slate-800 dark:text-slate-100"><span className="font-semibold">Meaning:</span> {word.meaning}</p>
          {word.vi && <p className="text-slate-700 dark:text-slate-200" lang="vi"><span aria-hidden>🇻🇳</span> <span className="sr-only">Vietnamese: </span>{word.vi}</p>}
          {word.collocations.length > 0 && (
            <div>
              <p className="label">Goes with:</p>
              <div className="mt-1 flex flex-wrap gap-2">{word.collocations.map((c) => <span key={c} className="chip bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200">{c}</span>)}</div>
            </div>
          )}
          {word.wrongPair && (
            <div className="grid gap-2 sm:grid-cols-2" data-testid="wrong-pair">
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">✅ Say: <b>{word.phrase}</b></p>
              <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">❌ Not: <s>{word.wrongPair}</s></p>
            </div>
          )}
          <div className="flex"><button className="btn-primary ml-auto" onClick={() => go(3)} data-testid="next-step">Next: Say it →</button></div>
        </div>
      )}

      {step === 3 && <SayIt word={word} prog={prog} onChange={onChange} onNext={() => go(4)} />}
      {step === 4 && <UseIt word={word} prog={prog} date={date} onChange={onChange} onNext={onNext} last={n + 1 >= total} play={play} playing={playing} />}
    </section>
  );
}

/** A sentence with the phrase blanked (handles simple inflections like get → got / getting). */
export function blankPhrase(sentence: string, phrase: string): string | null {
  const words = phrase.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const IRREG: Record<string, string> = { get: 'get|gets|got|gotten|getting', make: 'make|makes|made|making', take: 'take|takes|took|taken|taking', go: 'go|goes|went|gone|going', come: 'come|comes|came|coming', keep: 'keep|keeps|kept|keeping', run: 'run|runs|ran|running', find: 'find|finds|found|finding', put: 'put|puts|putting', give: 'give|gives|gave|given|giving', be: 'be|is|am|are|was|were|been|being' };
  const parts = words.map((w, i) => (i === 0 && IRREG[w] ? `(?:${IRREG[w]})` : i === 0 ? `${esc(w)}(?:s|es|ed|d|ing)?` : esc(w)));
  const re = new RegExp(`\\b${parts.join("[\\s,'’]+")}\\b`, 'i');
  if (!re.test(sentence)) return null;
  return sentence.replace(re, '_____');
}

function SayIt({ word, prog, onChange, onNext }: { word: WordCard; prog: WordProgress; onChange: (p: Partial<WordProgress>) => void; onNext: () => void }) {
  const [takes, setTakes] = useState(0);
  const cloze = useMemo(() => {
    const sentence = blankPhrase(word.example2, word.phrase) || blankPhrase(word.example, word.phrase);
    const same = WORD_BANK.filter((w) => w.phrase !== word.phrase && (w.topic === word.topic || w.kind === word.kind));
    const pool = same.length >= 3 ? same : WORD_BANK.filter((w) => w.phrase !== word.phrase);
    let h = 0;
    for (const c of word.phrase) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const others: string[] = [];
    for (let i = 0; others.length < 3 && i < pool.length; i++) {
      const p = pool[(h + i * 7) % pool.length].phrase;
      if (!others.includes(p)) others.push(p);
    }
    const options = [word.phrase, ...others];
    const rot = h % options.length;
    return { sentence, options: [...options.slice(rot), ...options.slice(0, rot)] };
  }, [word]);
  const [pick, setPick] = useState<string | null>(null);
  const answered = !!prog.cloze || !!pick;
  const choose = (o: string) => {
    if (answered) return;
    setPick(o);
    onChange({ cloze: o === word.phrase ? 'right' : 'wrong' });
  };

  return (
    <div className="space-y-4" data-testid="say-it">
      <div className="space-y-2">
        <p className="label">Shadow both sentences: listen, repeat out loud, and get a pronunciation check.</p>
        <ShadowPractice text={`${word.example} ${word.example2}`} phrases={[word.phrase]} onTake={() => { setTakes((t) => t + 1); if (!prog.shadowed) onChange({ shadowed: true }); }} />
        {(prog.shadowed || takes > 0) && <p className="text-xs text-emerald-700 dark:text-emerald-300" data-testid="shadowed">✓ Shadowing saved</p>}
      </div>
      <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800" data-testid="cloze">
        <p className="label">Quick check: which one fits?</p>
        <p className="text-slate-800 dark:text-slate-100">{cloze.sentence || <>Which phrase means: <i>{word.meaning}</i>?</>}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {cloze.options.map((o) => {
            const right = o === word.phrase;
            const show = answered && (right || o === pick);
            return (
              <button key={o} type="button" onClick={() => choose(o)} disabled={answered} data-testid="cloze-option" data-right={right ? '1' : '0'}
                className={`rounded-xl border px-3 py-2 text-left text-sm ${show ? (right ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100') : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                {show ? (right ? '✅ ' : '❌ ') : ''}{o}
              </button>
            );
          })}
        </div>
        {answered && <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="cloze-result">{(pick ? pick === word.phrase : prog.cloze === 'right') ? 'Nice, that’s it.' : `It’s “${word.phrase}”.`}</p>}
      </div>
      <div className="flex"><button className="btn-primary ml-auto" onClick={onNext} disabled={!answered} data-testid="next-step">Next: Use it →</button></div>
    </div>
  );
}

function UseIt({ word, prog, date, onChange, onNext, last, play, playing }: {
  word: WordCard; prog: WordProgress; date: string; onChange: (p: Partial<WordProgress>) => void; onNext: () => void; last: boolean;
  play: (t: string[], tag: string) => void; playing: string | null;
}) {
  const { update, addPhrases, logActivity } = useStore();
  const ai = useAIConfig();
  const [sentence, setSentence] = useState('');
  const [voiced, setVoiced] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const result = !retrying && prog.level ? prog : null;

  const check = async () => {
    const said = sentence.trim();
    if (!said) return;
    setChecking(true); setError('');
    try {
      const r = await checkWordUsage(ai, word.phrase, word.meaning, said);
      // Save to the Phrase Bank (skipped if it's already there), then grade it like a review: dates come from srs.ts.
      addPhrases([{ phrase: word.phrase, meaning: word.meaning, example: word.example }], `Words · ${date}`, 'words');
      const k = key(word.phrase);
      update((s) => ({
        ...s,
        phrases: s.phrases.map((p) => {
          if (key(p.phrase) !== k) return p;
          return {
            ...p, ...scheduleLevel(p, r.level),
            learnedByVoice: p.learnedByVoice || (r.level === 'natural' && voiced),
            reviews: [...p.reviews, { date: todayStr(), sentence: said, ok: r.level === 'natural', feedback: r.feedback, level: r.level, drill: 'use' as const }],
          };
        }),
      }));
      onChange({ step: 4, level: r.level, sentence: said, feedback: r.feedback, better: r.betterSentence, voiced });
      setRetrying(false);
      logActivity();
    } catch (e) { setError(errorText(e)); } finally { setChecking(false); }
  };

  return (
    <div className="space-y-3" data-testid="use-it">
      <div className="flex items-start justify-between gap-3 rounded-xl bg-blue-50 p-3 dark:bg-blue-950/50">
        <p className="font-medium text-blue-900 dark:text-blue-100" data-testid="use-question">{word.useItQuestion}</p>
        <button type="button" onClick={() => play([word.useItQuestion], 'q')} aria-label={playing === 'q' ? 'Stop' : 'Play the question'}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-blue-700 dark:bg-slate-900 dark:text-blue-200" data-testid="play-q">{playing === 'q' ? '⏹ Stop' : '🔊 Hear it'}</button>
      </div>
      {result ? (
        <div className={`rounded-xl p-3 text-sm ${LEVEL_UI[result.level!].cls}`} data-testid="use-result" data-level={result.level}>
          <p className="font-semibold">{LEVEL_UI[result.level!].icon} {LEVEL_UI[result.level!].label}</p>
          {result.sentence && <p className="mt-1 italic opacity-80">“{result.sentence}”</p>}
          {result.feedback && <p className="mt-1">{result.feedback}</p>}
          {result.better && result.level !== 'natural' && <p className="mt-2"><span className="text-xs font-semibold uppercase tracking-wide opacity-70">More natural:</span> {result.better}</p>}
          <p className="mt-2 text-xs opacity-70">
            Saved to your Phrase Bank. {LEVEL_UI[result.level!].note}
            {result.level === 'natural' && result.voiced ? ' 🎙️ Learned by voice!' : result.level === 'natural' ? ' Say it with the mic to mark it learned by voice.' : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={onNext} data-testid="next-word">{prog.done ? 'Back to today’s list' : last ? 'Finish ✓' : 'Next word →'}</button>
            {result.level !== 'natural' || !result.voiced ? <button className="btn-ghost" onClick={() => { setRetrying(true); setSentence(''); setVoiced(false); }} data-testid="try-again"><Icon name="refresh" className="h-4 w-4" /> Try again</button> : null}
          </div>
        </div>
      ) : (
        <>
          <p className="label">Answer in 1–2 sentences, out loud, using “{word.phrase}”:</p>
          <MicInput value={sentence} onChange={setSentence} onSpeech={() => setVoiced(true)} rows={2} placeholder="Tap the mic and answer…" />
          <ErrorBox error={error} onRetry={check} />
          <button className="btn-primary w-full" onClick={check} disabled={!sentence.trim() || checking || !ai.hasKey} data-testid="check-use">
            {checking ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Check my answer
          </button>
        </>
      )}
    </div>
  );
}
