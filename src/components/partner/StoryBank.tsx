// 📖 Story bank: 10 personal stories. Tell one by voice -> a polished 45–60 s version of HIS facts ->
// listen, shadow, retell with a beat checklist -> check. Saved per slot; the partner can invite them in role-play.
import { useState } from 'react';
import { useStore } from '../../lib/store';
import { useAIConfig } from '../../lib/hooks';
import { errorText } from '../../lib/gemini';
import { STORY_PROMPTS, type StoryPrompt } from '../../lib/roleplay';
import { storyPolish, storyRetellCheck } from '../../lib/partner';
import type { StoryEntry } from '../../lib/types';
import { speakNatural, stopVoice } from '../../lib/tts';
import MicInput from '../MicInput';
import ShadowPractice from '../ShadowPractice';
import { askConfirm } from '../ConfirmDialog';
import { ErrorBox, Spinner } from '../ui';
import Icon from '../Icon';

export default function StoryBank() {
  const { state } = useStore();
  const [slotId, setSlotId] = useState<string | null>(null);
  const slot = STORY_PROMPTS.find((s) => s.id === slotId);
  if (slot) return <StorySlot key={slot.id} slot={slot} onBack={() => { stopVoice(); setSlotId(null); }} />;
  const done = state.partner.stories.filter((s) => s.polished).length;
  return (
    <div className="space-y-3">
      <div className="card space-y-1">
        <h2 className="h-section">Your stories, ready to tell</h2>
        <p className="muted text-sm">Polish a few personal stories once, then retell them until they flow. Your role-play and Discord friends may ask for one. {done}/10 ready.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {STORY_PROMPTS.map((s) => {
          const e = state.partner.stories.find((x) => x.slot === s.id);
          return (
            <button key={s.id} className="card flex items-center gap-3 !p-3 text-left transition hover:border-blue-300" onClick={() => setSlotId(s.id)} data-testid="story-slot" data-id={s.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{s.title}</span>
                <span className="block text-xs text-slate-500">{e?.polished ? `Polished${e.retells ? ` · retold ${e.retells}×` : ''}` : 'Not told yet'}</span>
              </span>
              <span className={`chip ${e?.polished ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{e?.polished ? '✓' : '+'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StorySlot({ slot, onBack }: { slot: StoryPrompt; onBack: () => void }) {
  const { state, update, addPhrases, logActivity } = useStore();
  const ai = useAIConfig();
  const entry = state.partner.stories.find((s) => s.slot === slot.id);
  const [tell, setTell] = useState('');
  const [retell, setRetell] = useState('');
  const [busy, setBusy] = useState<'polish' | 'check' | null>(null);
  const [error, setError] = useState('');
  const [redo, setRedo] = useState(false);
  const [shadow, setShadow] = useState(false);
  const say = (t: string) => speakNatural(t, { voiceURI: state.settings.voiceURI, rate: state.settings.rate });

  const save = (e: StoryEntry) => update((s) => ({ ...s, partner: { ...s.partner, stories: s.partner.stories.some((x) => x.slot === e.slot) ? s.partner.stories.map((x) => (x.slot === e.slot ? e : x)) : [...s.partner.stories, e] } }));

  const polish = async () => {
    const t = tell.trim();
    if (!t) return;
    setBusy('polish'); setError('');
    try {
      const p = await storyPolish(ai, slot, t);
      const now = Date.now();
      save({ slot: slot.id, transcript: t, polished: p.polished, structure: p.structure, phrasesToKeep: p.phrasesToKeep, beats: p.beats, retell: '', retells: 0, createdAt: entry?.createdAt || now, updatedAt: now });
      setTell(''); setRedo(false); setRetell('');
      logActivity();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };

  const check = async () => {
    const t = retell.trim();
    if (!t || !entry) return;
    setBusy('check'); setError('');
    try {
      const c = await storyRetellCheck(ai, entry.polished, entry.beats, t);
      save({ ...entry, retell: t, check: c, retells: entry.retells + 1, updatedAt: Date.now() });
      // Phrases he reused from his polished story go to the Phrase Bank.
      const reused = entry.phrasesToKeep.filter((p) => c.phrasesReused.some((r) => r.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(r.toLowerCase())));
      if (reused.length) addPhrases(reused.map((p) => ({ phrase: p, meaning: '', example: '' })), `Story bank: ${slot.title}`, 'story');
      setRetell('');
      logActivity();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };

  const remove = async () => {
    if (!(await askConfirm({ title: 'Delete this story?', body: "Your telling and the polished version will be removed. This can't be undone.", confirmLabel: 'Delete', danger: true }))) return;
    update((s) => ({ ...s, partner: { ...s.partner, stories: s.partner.stories.filter((x) => x.slot !== slot.id) } }));
  };

  const telling = !entry?.polished || redo;
  return (
    <div className="space-y-4" data-testid="story-view">
      <div className="card space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{slot.title}</h2>
          <button className="btn-ghost text-sm" onClick={onBack}>All stories</button>
        </div>
        <p className="text-[15px]">
          {slot.prompt}
          <button onClick={() => say(slot.prompt)} className="ml-2 inline-flex align-middle text-slate-400 hover:text-blue-600" title="Hear it" aria-label="Hear it"><Icon name="play" className="h-3.5 w-3.5" /></button>
        </p>
        <p className="text-xs text-slate-500">💡 {slot.hint}</p>
      </div>

      {telling ? (
        <div className="card space-y-3" data-testid="story-tell">
          <p className="text-sm font-semibold">🎙️ Tell it your way (about a minute, any order is fine)</p>
          <MicInput value={tell} onChange={setTell} rows={4} placeholder="Tap the mic and tell the story, or type it…" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => void polish()} disabled={!tell.trim() || !!busy || !ai.hasKey} data-testid="story-polish">{busy === 'polish' ? <Spinner /> : '✨'} Polish my story</button>
            {redo && <button className="btn-ghost" onClick={() => setRedo(false)}>Cancel</button>}
          </div>
          <ErrorBox error={error} onRetry={() => void polish()} />
        </div>
      ) : entry && (
        <>
          <div className="card space-y-3" data-testid="story-polished">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">✨ Your story, polished</p>
              <button className="btn-soft !py-1 text-sm" onClick={() => say(entry.polished)} data-testid="story-listen"><Icon name="play" className="h-4 w-4" /> Listen</button>
            </div>
            <p className="text-[15px] leading-relaxed"><Highlight text={entry.polished} phrases={entry.phrasesToKeep} /></p>
            <p className="text-xs text-slate-500">Shape: {entry.structure}</p>
            {entry.phrasesToKeep.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">Keep these:</span>
                {entry.phrasesToKeep.map((p) => <span key={p} className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{p}</span>)}
              </div>
            )}
            {!shadow
              ? <button className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-300" onClick={() => setShadow(true)}>🗣️ Shadow it line by line</button>
              : <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700"><ShadowPractice text={entry.polished} phrases={entry.phrasesToKeep} onClose={() => setShadow(false)} /></div>}
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500">What you said first</summary>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{entry.transcript}</p>
            </details>
          </div>

          <div className="card space-y-3" data-testid="story-retell">
            <p className="text-sm font-semibold">🔁 Retell it without reading</p>
            <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="story-beats">
              {entry.beats.map((b) => {
                const st = entry.check ? (entry.check.beatsCovered.includes(b) ? '✅' : '⭕') : '▫️';
                return <li key={b}>{st} {b}</li>;
              })}
            </ul>
            <MicInput value={retell} onChange={setRetell} rows={3} placeholder="Tap the mic and retell it…" />
            <button className="btn-primary" onClick={() => void check()} disabled={!retell.trim() || !!busy || !ai.hasKey} data-testid="story-check">{busy === 'check' ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Check my retell</button>
            <ErrorBox error={error} onRetry={() => void check()} />
            {entry.check && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60" data-testid="story-check-result">
                <p><b>{entry.check.beatsCovered.length}/{entry.beats.length} beats</b> covered{entry.retells ? ` · retold ${entry.retells}×` : ''}</p>
                {entry.check.phrasesReused.length > 0 && <p>Phrases you kept: {entry.check.phrasesReused.map((p) => <span key={p} className="chip mr-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ {p}</span>)}</p>}
                {entry.check.fix.his && entry.check.fix.better && (
                  <div>
                    <p className="text-slate-500 line-through decoration-rose-300">“{entry.check.fix.his}”</p>
                    <p className="font-medium">→ {entry.check.fix.better}</p>
                    {entry.check.fix.why && <p className="text-xs text-slate-500">{entry.check.fix.why}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-soft" onClick={() => setRedo(true)}>Tell it again from scratch</button>
            <button className="btn-ghost text-rose-600" onClick={() => void remove()} data-testid="story-delete"><Icon name="trash" className="h-4 w-4" /> Delete</button>
          </div>
        </>
      )}
    </div>
  );
}

function Highlight({ text, phrases }: { text: string; phrases: string[] }) {
  if (!phrases.length) return <>{text}</>;
  const re = new RegExp(`(${phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{text.split(re).map((c, i) => (i % 2 ? <b key={i} className="underline decoration-amber-300 decoration-2 underline-offset-2">{c}</b> : <span key={i}>{c}</span>))}</>;
}
