import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { builderAnswer, DEFAULT_SLOTS, inferQuestionType, LENGTH_LABEL, lengthText, nextStance } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { loadBuilderPrefs } from '../lib/builderPrefs';
import { cleanPhrase } from '../lib/diff';
import { uid } from '../lib/date';
import type { BuilderLength, BuilderLevel, DailyQuestion, PhraseItem, SuggestedAnswer as Suggested } from '../lib/types';
import BuilderResult from './BuilderResult';
import { ShadowCard } from './ShadowPractice';
import { ErrorBox, Spinner } from './ui';
import Icon from './Icon';

export const MAX_VERSIONS = 5;
const LEVELS: BuilderLevel[] = ['Simple', 'Natural', 'Fluent'];
const LENGTHS: BuilderLength[] = [20, 45, 90, 120];
const pill = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs transition ${on
    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500 dark:text-slate-950'
    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'}`;

/** Build one suggested answer from the daily question's idea starters (one builderAnswer call). */
async function suggest(
  ai: ReturnType<typeof useAIConfig>,
  profile: Parameters<typeof builderAnswer>[1],
  q: DailyQuestion,
  level: BuilderLevel,
  seconds: BuilderLength,
  earlier: Suggested[] = [],
  stance?: string,
): Promise<Suggested> {
  const qtype = inferQuestionType(q.question);
  const base = DEFAULT_SLOTS[qtype];
  const starters = q.starters.filter((s) => s.trim());
  const more = { earlier: earlier.map((v) => v.answer), stance };
  const r = starters.length
    ? await builderAnswer(ai, profile, qtype, q.question, base, { 'Ideas to use': starters.join('; ') }, level, seconds, 'starters', more)
    : await builderAnswer(ai, profile, qtype, q.question, base, {}, level, seconds, 'auto', more);
  const parts = r.parts.length ? r.parts : [{ slot: r.slots[0], text: r.answer }];
  return { id: uid(), ...(stance ? { stance } : {}), qtype, slots: r.slots, ideas: r.ideas, level, seconds, answer: r.answer, parts, phrases: r.phrases, createdAt: Date.now() };
}

/** All phrases across every suggested version (deduped). */
export function allSuggestedPhrases(list: Suggested[] | undefined): PhraseItem[] {
  const seen = new Set<string>();
  return (list || []).flatMap((v) => v.phrases).filter((p) => {
    const k = cleanPhrase(p.phrase).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Which suggested phrases (from every version) appear in the learner's own answer. */
export function reusedPhrases(list: Suggested[] | undefined, answer: string) {
  const phrases = allSuggestedPhrases(list);
  if (!phrases.length || !answer.trim()) return [];
  const norm = (t: string) => ` ${t.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const a = norm(answer);
  return phrases.map((p) => ({ phrase: p.phrase, used: a.includes(norm(cleanPhrase(p.phrase))) }));
}

const versionLabel = (v: Suggested, i: number) => `V${i + 1} · ${v.level} · ${LENGTH_LABEL[v.seconds] || `${v.seconds}s`}${v.stance ? ` · ${v.stance}` : ''}`;

/**
 * Suggested answers for a daily question: a list of versions (V1…V5) kept on the question.
 * The open version has a level / length switcher (rewrites that version); "➕ Another angle" adds a new
 * version below with a rotated stance and new phrases; each version can be deleted.
 */
export default function SuggestedAnswer({ q, onClose, autoStart = true }: { q: DailyQuestion; onClose?: () => void; autoStart?: boolean }) {
  const { state, update, addPhrases } = useStore();
  const ai = useAIConfig();
  const list = q.suggestions || [];
  const [openId, setOpenId] = useState(list[list.length - 1]?.id || '');
  const [busy, setBusy] = useState<'' | 'rewrite' | 'add'>('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<() => void>(() => () => {});

  const save = (next: Suggested[]) => update((st) => ({ ...st, questions: st.questions.map((x) => (x.id === q.id ? { ...x, suggestions: next } : x)) }));
  const current = () => state.questions.find((x) => x.id === q.id)?.suggestions || [];

  const run = async (kind: 'rewrite' | 'add', fn: () => Promise<void>) => {
    setBusy(kind);
    setError('');
    setRetry(() => () => run(kind, fn));
    try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };

  /** Rewrite one version at a new level / length (keeps its place and stance). */
  const rewrite = (v: Suggested, level: BuilderLevel, seconds: BuilderLength) => run('rewrite', async () => {
    const others = current().filter((x) => x.id !== v.id);
    const nv = await suggest(ai, state.profile, q, level, seconds, others, v.stance);
    save(current().map((x) => (x.id === v.id ? { ...nv, id: v.id } : x)));
    addPhrases(nv.phrases, q.question, 'suggested'); // auto-collect highlighted phrases into the word bank
  });

  /** First version, or "➕ Another angle": a new version added below the others. */
  const add = (level: BuilderLevel, seconds: BuilderLength) => run('add', async () => {
    const prev = current();
    if (prev.length >= MAX_VERSIONS) return;
    const nv = await suggest(ai, state.profile, q, level, seconds, prev, prev.length ? nextStance(prev.map((x) => x.stance)) : undefined);
    save([...prev, nv]);
    addPhrases(nv.phrases, q.question, 'suggested'); // auto-collect highlighted phrases into the word bank
    setOpenId(nv.id);
    setTimeout(() => document.getElementById(`sv-${nv.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  });

  const remove = (v: Suggested, i: number) => {
    if (!confirm(`Delete suggested answer V${i + 1}?`)) return;
    const next = current().filter((x) => x.id !== v.id);
    save(next);
    if (openId === v.id) setOpenId(next[next.length - 1]?.id || '');
  };

  // First open: build V1 (Natural or the last builder level, 45s); later opens reuse the saved versions.
  useEffect(() => {
    if (autoStart && !list.length && ai.hasKey) add(loadBuilderPrefs().level, 45);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  const open = list.find((v) => v.id === openId) || list[list.length - 1];

  return (
    <div className="space-y-3" id="suggested-answer">
      {!list.length && (
        <section className="card">
          <h2 className="h-section mb-2">💡 Suggested answer</h2>
          {busy ? <div className="flex items-center gap-3 py-4 text-slate-500"><Spinner /> Writing a model answer from the idea starters…</div> : <p className="muted">No suggested answer yet.</p>}
        </section>
      )}

      {list.map((v, i) => {
        const isOpen = open?.id === v.id;
        if (!isOpen) {
          return (
            <button key={v.id} id={`sv-${v.id}`} data-version={i + 1} className="card flex w-full scroll-mt-20 items-center justify-between gap-2 !py-3 text-left" onClick={() => setOpenId(v.id)}>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">💡 {versionLabel(v, i)}</span>
                <span className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{v.answer}</span>
              </span>
              <Icon name="chevron-down" className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          );
        }
        const controls = (
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {LEVELS.map((l) => <button key={l} className={pill(v.level === l)} disabled={!!busy} onClick={() => l !== v.level && rewrite(v, l, v.seconds)}>{l}</button>)}
              <span className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-700" />
              {LENGTHS.map((n) => <button key={n} className={pill(v.seconds === n)} disabled={!!busy} onClick={() => n !== v.seconds && rewrite(v, v.level, n)}>{LENGTH_LABEL[n]}</button>)}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500" data-testid="version-label">{versionLabel(v, i)}</span>
              <button className="btn-ghost !px-2 !py-1 text-xs text-rose-600 dark:text-rose-400" disabled={!!busy} onClick={() => remove(v, i)} title="Delete this version"><Icon name="trash" className="h-3.5 w-3.5" /> Delete</button>
            </div>
          </div>
        );
        return (
          <div key={v.id} id={`sv-${v.id}`} data-version={i + 1} data-open="1" className="scroll-mt-20 space-y-3">
            <BuilderResult
              entry={{ upgrade: { natural: v.answer, phrases: v.phrases }, builder: { qtype: v.qtype, slots: v.slots, picks: v.ideas, level: v.level, seconds: v.seconds, parts: v.parts, source: 'starters' } }}
              title={list.length > 1 ? `💡 Suggested answer V${i + 1}` : '💡 Suggested answer'}
              controls={controls}
              busy={busy === 'rewrite'}
              onSave={(items) => addPhrases(items, q.question, 'suggested')}
            />
            {busy !== 'rewrite' && <ShadowCard text={v.answer} phrases={v.phrases.map((p) => p.phrase)} hint="Shadow the suggested answer one sentence at a time, then answer in your own words." />}
          </div>
        );
      })}

      {busy === 'add' && list.length > 0 && (
        <section className="card flex items-center gap-3 text-slate-500"><Spinner /> Writing V{list.length + 1} with a different angle and new phrases…</section>
      )}
      <ErrorBox error={error} onRetry={retry} />

      <div className="flex flex-wrap items-center gap-2">
        {list.length > 0 && (
          <button className="btn-soft !py-1.5 text-sm" disabled={!!busy || list.length >= MAX_VERSIONS || !ai.hasKey} onClick={() => add(open?.level || loadBuilderPrefs().level, open?.seconds || 45)}>
            ➕ Another angle
          </button>
        )}
        {list.length >= MAX_VERSIONS && <span className="muted text-xs">Max {MAX_VERSIONS} versions. Delete one to add more.</span>}
        {list.length > 0 && list.length < MAX_VERSIONS && <span className="muted text-xs">{list.length}/{MAX_VERSIONS} versions · {lengthText(open?.seconds || 45)}</span>}
        {onClose && <button className="btn-ghost ml-auto !px-2.5 !py-1.5 text-xs" onClick={onClose}>🙈 Hide</button>}
      </div>
    </div>
  );
}
