import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { builderAnswer, DEFAULT_SLOTS, inferQuestionType } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { loadBuilderPrefs } from '../lib/builderPrefs';
import { cleanPhrase } from '../lib/diff';
import type { BuilderLength, BuilderLevel, DailyQuestion, SuggestedAnswer as Suggested } from '../lib/types';
import BuilderResult from './BuilderResult';
import { ShadowCard } from './ShadowPractice';
import { ErrorBox, Spinner } from './ui';
import Icon from './Icon';

const LEVELS: BuilderLevel[] = ['Simple', 'Natural', 'Fluent'];
const LENGTHS: BuilderLength[] = [20, 45, 90];
const pill = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs transition ${on
    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500 dark:text-slate-950'
    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'}`;

/** Build a suggested answer for the daily question from its idea starters (one builderAnswer call). */
async function suggest(ai: ReturnType<typeof useAIConfig>, profile: Parameters<typeof builderAnswer>[1], q: DailyQuestion, level: BuilderLevel, seconds: BuilderLength): Promise<Suggested> {
  const qtype = inferQuestionType(q.question);
  const slots = DEFAULT_SLOTS[qtype];
  const starters = q.starters.filter((s) => s.trim());
  const r = starters.length
    ? await builderAnswer(ai, profile, qtype, q.question, slots, { 'Ideas to use': starters.join('; ') }, level, seconds, 'starters')
    : await builderAnswer(ai, profile, qtype, q.question, slots, {}, level, seconds, 'auto');
  const parts = r.parts.length ? r.parts : [{ slot: slots[0], text: r.answer }];
  return { qtype, slots, ideas: r.ideas, level, seconds, answer: r.answer, parts, phrases: r.phrases, createdAt: Date.now() };
}

/** Which suggested phrases appear in the learner's own answer. */
export function reusedPhrases(s: Suggested | undefined, answer: string) {
  if (!s || !answer.trim()) return [];
  const norm = (t: string) => ` ${t.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const a = norm(answer);
  return s.phrases.map((p) => ({ phrase: p.phrase, used: a.includes(norm(cleanPhrase(p.phrase))) }));
}

/** "💡 Show a suggested answer" for Today's daily question: collapsed until tapped, cached on the question. */
export default function SuggestedAnswer({ q, onClose }: { q: DailyQuestion; onClose: () => void }) {
  const { state, update, addPhrases } = useStore();
  const ai = useAIConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = q.suggested;

  const generate = async (level: BuilderLevel, seconds: BuilderLength) => {
    setBusy(true);
    setError('');
    try {
      const next = await suggest(ai, state.profile, q, level, seconds);
      update((st) => ({ ...st, questions: st.questions.map((x) => (x.id === q.id ? { ...x, suggested: next } : x)) }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // First open: build it (Natural or the last builder level, 45s); later opens reuse the cached one.
  useEffect(() => {
    if (!s && ai.hasKey) generate(loadBuilderPrefs().level, 45);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  const level = s?.level || loadBuilderPrefs().level;
  const seconds = s?.seconds || 45;
  const controls = (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {LEVELS.map((l) => <button key={l} className={pill(level === l)} disabled={busy} onClick={() => l !== level && generate(l, seconds)}>{l}</button>)}
      <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
      {LENGTHS.map((n) => <button key={n} className={pill(seconds === n)} disabled={busy} onClick={() => n !== seconds && generate(level, n)}>{n}s</button>)}
      <button className="btn-ghost ml-auto !px-2 !py-1 text-xs" disabled={busy} onClick={() => generate(level, seconds)} title="Write a different one">
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-3.5 w-3.5" />} New
      </button>
    </div>
  );

  return (
    <div className="space-y-4" id="suggested-answer">
      {s ? (
        <BuilderResult
          entry={{ upgrade: { natural: s.answer, phrases: s.phrases }, builder: { qtype: s.qtype, slots: s.slots, picks: s.ideas, level: s.level, seconds: s.seconds, parts: s.parts, source: 'starters' } }}
          title="💡 Suggested answer"
          controls={controls}
          busy={busy}
          onSave={(items) => addPhrases(items, q.question)}
        />
      ) : (
        <section className="card">
          <h2 className="h-section mb-2">💡 Suggested answer</h2>
          {busy ? <div className="flex items-center gap-3 py-4 text-slate-500"><Spinner /> Writing a model answer from the idea starters…</div> : null}
        </section>
      )}
      <ErrorBox error={error} onRetry={() => generate(level, seconds)} />
      {s && !busy && <ShadowCard text={s.answer} phrases={s.phrases.map((p) => p.phrase)} hint="Shadow the suggested answer one sentence at a time, then answer in your own words below." />}
      <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={onClose}>🙈 Hide suggested answer</button>
    </div>
  );
}
