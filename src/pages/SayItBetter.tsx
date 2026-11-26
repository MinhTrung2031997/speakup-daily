// "Say it better" from Vietnamese (EL's prompts, ES's flow):
// say or type a thought in Vietnamese (or mixed) -> what the AI understood, the word-for-word trap and 3 natural versions
// -> pick one and hear it (natural voice) -> shadow it (pronunciation check) -> say it your own way (graded Natural/Understandable/Off)
// -> the key phrase goes into the Phrase Bank (origin 'say') with review dates set in code (srs.ts).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { gradeSayIt, sayItBetter } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { scheduleLevel } from '../lib/srs';
import { prettyDate, todayStr, uid } from '../lib/date';
import { cleanPhrase } from '../lib/diff';
import { SAY_STARTERS, type SayVersion } from '../lib/sayItBetter';
import { stopVoice } from '../lib/tts';
import { useVoicePlayer } from '../lib/useVoicePlayer';
import type { SaySession } from '../lib/types';
import ShadowPractice from '../components/ShadowPractice';
import MicInput from '../components/MicInput';
import { askConfirm } from '../components/ConfirmDialog';
import { LEVEL_UI, LevelChip } from '../components/LearnDrills';
import { Empty, ErrorBox, PageTitle, Spinner } from '../components/ui';
import Icon from '../components/Icon';
import { HuntResult } from '../components/HuntCards';
import { useHunt } from '../lib/useHunt';

const STYLE_UI: Record<SayVersion['style'], { icon: string; label: string; hint: string }> = {
  casual: { icon: '🎮', label: 'Casual', hint: 'friends, Discord' },
  neutral: { icon: '💬', label: 'Everyday', hint: 'works anywhere' },
  polished: { icon: '💼', label: 'Polished', hint: 'work, meetings' },
};
const key = (p: string) => cleanPhrase(p).toLowerCase();

export default function SayItBetter() {
  const { state, update } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const sessions = useMemo(() => [...state.saySessions].sort((a, b) => b.createdAt - a.createdAt), [state.saySessions]);
  const open = sessions.find((s) => s.id === openId) || null;

  const patch = (id: string, p: Partial<SaySession>) =>
    update((s) => ({ ...s, saySessions: s.saySessions.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const remove = async (x: SaySession) => {
    if (!(await askConfirm({ title: 'Delete this session?', body: "This can't be undone. The phrase stays in your Phrase Bank.", confirmLabel: 'Delete', danger: true }))) return;
    if (openId === x.id) setOpenId(null);
    update((s) => ({ ...s, saySessions: s.saySessions.filter((y) => y.id !== x.id) }));
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Say it better" subtitle="Say it in Vietnamese. Hear how a native would say it, then say it yourself." />
      {open ? (
        <>
          <button className="btn-ghost !px-3" onClick={() => { stopVoice(); setOpenId(null); }} data-testid="say-new"><Icon name="plus" className="h-4 w-4" /> New thought</button>
          <Flow key={open.id} session={open} patch={(p) => patch(open.id, p)} />
        </>
      ) : (
        <Composer onDone={(s) => { update((st) => ({ ...st, saySessions: [...st.saySessions, s] })); setOpenId(s.id); }} />
      )}

      <section className="space-y-2" data-testid="say-history">
        <h2 className="h-section">Past sessions {sessions.length > 0 && <span className="muted text-sm font-normal">({sessions.length})</span>}</h2>
        {sessions.length === 0 ? (
          <Empty icon="🗣️" title="No sessions yet" text="Your thoughts and the versions you practised will be listed here." />
        ) : (
          <ul className="space-y-2">
            {sessions.map((x) => {
              const v = x.picked != null ? x.result.versions[x.picked] : null;
              return (
                <li key={x.id} className={`card flex items-start gap-2 !p-3 ${x.id === openId ? 'ring-2 ring-blue-300 dark:ring-blue-800' : ''}`} data-testid="say-history-item">
                  <button className="min-w-0 flex-1 text-left" onClick={() => { stopVoice(); setOpenId(x.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <span className="block truncate font-medium text-slate-900 dark:text-white" lang={x.inputLang}>{x.input}</span>
                    <span className="mt-0.5 block truncate text-sm text-slate-500">{v ? `“${v.english}”` : x.result.understood}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span>{prettyDate(x.date)}</span>
                      {v && <span className="chip bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200">{v.keyPhrase}</span>}
                      {x.grade && <LevelChip level={x.grade.level} />}
                      {!x.grade && v && <span>not graded yet</span>}
                    </span>
                  </button>
                  <button className="btn-ghost !p-2 text-slate-400 hover:text-rose-600" onClick={() => remove(x)} aria-label="Delete session" data-testid="say-delete" title="Delete session"><Icon name="trash" className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Composer({ onDone }: { onDone: (s: SaySession) => void }) {
  const ai = useAIConfig();
  const [text, setText] = useState('');
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const starters = [0, 1, 2, 3].map((i) => SAY_STARTERS[(offset + i) % SAY_STARTERS.length]);

  const go = async () => {
    const input = text.trim();
    if (!input) return;
    setBusy(true); setError('');
    try {
      const result = await sayItBetter(ai, input);
      onDone({ id: uid(), date: todayStr(), input, inputLang: lang, result, createdAt: Date.now() });
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <section className="card space-y-3" data-testid="say-composer">
      <div>
        <h2 className="h-section">What do you want to say?</h2>
        <p className="muted">Type it or tap the mic. Vietnamese is fine, or a mix of Vietnamese and English.</p>
      </div>
      <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800" role="group" aria-label="Microphone language">
        {([['vi', '🇻🇳 Tiếng Việt'], ['en', '🇬🇧 English mic']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setLang(k)} aria-pressed={lang === k} data-testid={`mic-${k}`}
            className={`rounded-lg px-3 py-1 font-medium ${lang === k ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>
      <MicInput value={text} onChange={setText} rows={3} lang={lang === 'vi' ? 'vi-VN' : 'en-US'} placeholder={lang === 'vi' ? 'Ví dụ: Dạo này mình hơi mệt, chắc tại làm nhiều quá' : 'Say it with a mix of languages…'} disabled={busy} />
      {!text.trim() && (
        <div className="space-y-1.5" data-testid="say-starters">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Need an idea?</p>
          <div className="flex flex-wrap gap-2">
            {starters.map((s) => (
              <button key={s} type="button" onClick={() => { setText(s); setLang('vi'); }} className="chip !whitespace-normal bg-slate-100 text-left text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200" lang="vi" data-testid="say-starter">{s}</button>
            ))}
            <button type="button" onClick={() => setOffset((o) => (o + 4) % SAY_STARTERS.length)} className="chip bg-transparent text-blue-700 dark:text-blue-300" aria-label="More ideas"><Icon name="refresh" className="h-3.5 w-3.5" /> More</button>
          </div>
        </div>
      )}
      <ErrorBox error={error} onRetry={go} />
      <button className="btn-primary w-full" onClick={go} disabled={!text.trim() || busy || !ai.hasKey} data-testid="say-go">
        {busy ? <Spinner /> : <Icon name="sparkles" className="h-4 w-4" />} {busy ? 'Finding natural ways to say it…' : 'Say it better'}
      </button>
    </section>
  );
}

function Flow({ session, patch }: { session: SaySession; patch: (p: Partial<SaySession>) => void }) {
  const { play, playing } = useVoicePlayer();
  const { result } = session;
  const picked = session.picked != null ? result.versions[session.picked] : null;

  const pick = (i: number) => {
    if (session.picked !== i) patch({ picked: i, shadowed: false, grade: undefined });
    play([result.versions[i].english], `v${i}`);
  };

  return (
    <div className="space-y-4" data-testid="say-flow">
      <section className="card space-y-3" data-testid="say-understood">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">You said</p>
        <p className="text-slate-900 dark:text-white" lang={session.inputLang}>{session.input}</p>
        <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950/50 dark:text-blue-100"><span className="font-semibold">I understood:</span> {result.understood}</div>
        {result.literalTrap && (
          <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100" data-testid="say-trap">❌ <span className="font-semibold">Word for word:</span> <s>{result.literalTrap}</s></div>
        )}
        {result.tip && <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="say-tip">💡 {result.tip}</p>}
      </section>

      <section className="space-y-2" data-testid="say-versions">
        <h2 className="h-section">1 · Pick a version and hear it</h2>
        {result.versions.map((v, i) => {
          const u = STYLE_UI[v.style];
          const on = session.picked === i;
          return (
            <div key={i} className={`card space-y-2 !p-3 ${on ? 'ring-2 ring-blue-500' : ''}`} data-testid="say-version" data-picked={on ? '1' : '0'}>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-semibold">{u.icon} {u.label} · {u.hint}</span>
                <button type="button" onClick={() => play([v.english], `v${i}`)} data-testid="say-play" data-state={playing === `v${i}` ? 'playing' : 'idle'} aria-label={playing === `v${i}` ? 'Stop' : `Hear the ${u.label} version`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${playing === `v${i}` ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200'}`}>
                  <span aria-hidden>{playing === `v${i}` ? '⏹' : '🔊'}</span> {playing === `v${i}` ? 'Stop' : 'Hear it'}
                </button>
              </div>
              <p className="text-lg font-medium leading-snug text-slate-900 dark:text-white">{v.english}</p>
              <p className="text-sm"><span className="chip bg-blue-50 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">{v.keyPhrase}</span> <span className="text-slate-600 dark:text-slate-300">{v.meaning}</span></p>
              {v.whyNatural && <p className="text-xs text-slate-500">{v.whyNatural}</p>}
              <button type="button" className={on ? 'btn-soft w-full' : 'btn-primary w-full'} onClick={() => pick(i)} aria-pressed={on} data-testid="say-pick">{on ? '✓ Practising this one' : 'Practise this one'}</button>
            </div>
          );
        })}
      </section>

      {picked ? (
        <>
          <section className="card space-y-3" data-testid="say-shadow">
            <h2 className="h-section">2 · Say it after the voice</h2>
            <p className="muted">Listen, repeat it out loud, then check your pronunciation.</p>
            <ShadowPractice key={picked.english} text={picked.english} phrases={[picked.keyPhrase]} onTake={() => { if (!session.shadowed) patch({ shadowed: true }); }} />
            {session.shadowed && <p className="text-xs text-emerald-700 dark:text-emerald-300" data-testid="say-shadowed">✓ Shadowing saved</p>}
          </section>
          <OwnWay session={session} version={picked} patch={patch} />
        </>
      ) : (
        <p className="muted text-center text-sm">Pick a version to practise it.</p>
      )}
    </div>
  );
}

function OwnWay({ session, version, patch }: { session: SaySession; version: SayVersion; patch: (p: Partial<SaySession>) => void }) {
  const { update, addPhrases, logActivity } = useStore();
  const ai = useAIConfig();
  const hunt = useHunt();
  const [text, setText] = useState('');
  const [voiced, setVoiced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const g = !retry ? session.grade : undefined;

  const check = async () => {
    const said = text.trim();
    if (!said) return;
    setBusy(true); setError('');
    try {
      const r = await gradeSayIt(ai, session.result.understood, version.english, version.keyPhrase, said);
      // Key phrase -> Phrase Bank (skipped if already there), then a graded review. Dates come from srs.ts, never from the AI.
      addPhrases([{ phrase: version.keyPhrase, meaning: version.meaning, example: version.english }], `Say it better · ${session.date}`, 'say');
      const k = key(version.keyPhrase);
      update((s) => ({
        ...s,
        phrases: s.phrases.map((p) => key(p.phrase) !== k ? p : {
          ...p, ...scheduleLevel(p, r.level),
          learnedByVoice: p.learnedByVoice || (r.level === 'natural' && voiced),
          reviews: [...p.reviews, { date: todayStr(), sentence: said, ok: r.level === 'natural', feedback: r.feedback, level: r.level, drill: 'use' as const }],
        }),
      }));
      patch({ grade: { ...r, transcript: said, voiced, gradedAt: Date.now() } });
      setRetry(false);
      logActivity();
      if (voiced) void hunt.run({ ref: `say:${session.id}`, source: 'say', question: `Say this idea in English: ${session.result.understood}`, transcript: said });
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <section className="card space-y-3" data-testid="say-own">
      <h2 className="h-section">3 · Now say it your way</h2>
      {g ? (
        <div className={`rounded-xl p-3 text-sm ${LEVEL_UI[g.level].cls}`} data-testid="say-result" data-level={g.level}>
          <p className="font-semibold">{LEVEL_UI[g.level].icon} {LEVEL_UI[g.level].label}</p>
          {g.transcript && <p className="mt-1 italic opacity-80">“{g.transcript}”</p>}
          {g.feedback && <p className="mt-1">{g.feedback}</p>}
          {g.betterSentence && g.level !== 'natural' && <p className="mt-2"><span className="text-xs font-semibold uppercase tracking-wide opacity-70">More natural:</span> {g.betterSentence}</p>}
          <p className="mt-2 text-xs opacity-70">
            “{version.keyPhrase}” is in your Phrase Bank. {LEVEL_UI[g.level].note}
            {g.level === 'natural' && g.voiced ? ' 🎙️ Learned by voice!' : g.level === 'natural' ? ' Say it with the mic to mark it learned by voice.' : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => { setRetry(true); setText(''); setVoiced(false); }} data-testid="say-retry"><Icon name="refresh" className="h-4 w-4" /> Try again</button>
            <Link to="/phrases" className="btn-soft">Phrase Bank</Link>
          </div>
          <div className="mt-3"><HuntResult refId={`say:${session.id}`} busy={hunt.busyRef} error={hunt.error} /></div>
        </div>
      ) : (
        <>
          <p className="muted">Say the same idea again in your own words. Try to use “{version.keyPhrase}”. It does not have to match the model.</p>
          <MicInput value={text} onChange={setText} onSpeech={() => setVoiced(true)} rows={2} placeholder="Tap the mic and say it in English…" />
          <ErrorBox error={error} onRetry={check} />
          <button className="btn-primary w-full" onClick={check} disabled={!text.trim() || busy || !ai.hasKey} data-testid="say-check">
            {busy ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Check my sentence
          </button>
        </>
      )}
    </section>
  );
}
