// Shared pieces of the voice partner: the line player (each speaker in their own accent and voice),
// the transcript bubbles (hidden in voice-only mode), the feedback card and the recent-sessions list.
import { useCallback, useEffect, useRef, useState } from 'react';
import { speakNatural, stopVoice, naturalSpeechUrl, type Accent } from '../../lib/tts';
import { getDemoMode } from '../../lib/gemini';
import { FLAG, personaPitch, personaVoice } from '../../lib/partner';
import type { RolePlayFeedback } from '../../lib/roleplay';
import type { PartnerSession, PartnerTurn } from '../../lib/types';
import { useStore } from '../../lib/store';
import { askConfirm } from '../ConfirmDialog';
import Icon from '../Icon';

export interface Speaker { name: string; accent: Accent }
export interface SpokenLine { text: string; speaker: Speaker }

/** Plays lines one after another, each in the speaker's accent + voice. Returns false if it was cancelled. */
export function useLinePlayer() {
  const { state } = useStore();
  const token = useRef(0);
  const [speaking, setSpeaking] = useState<string | null>(null);
  useEffect(() => () => { token.current++; stopVoice(); }, []);
  const stop = useCallback(() => { token.current++; stopVoice(); setSpeaking(null); }, []);
  const play = useCallback(async (lines: SpokenLine[]): Promise<boolean> => {
    const mine = ++token.current;
    // Fetch every clip at once so the next speaker is ready when the previous one stops.
    if (!getDemoMode()) lines.forEach((l) => naturalSpeechUrl(l.text, l.speaker.accent, personaVoice(l.speaker.name, l.speaker.accent)).catch(() => {}));
    for (const l of lines) {
      if (token.current !== mine) return false;
      setSpeaking(l.text);
      const how = await speakNatural(l.text, {
        accent: l.speaker.accent, voice: personaVoice(l.speaker.name, l.speaker.accent), pitch: personaPitch(l.speaker.name),
        voiceURI: state.settings.voiceURI, rate: state.settings.rate, clipEnd: /[—–-]\s*$/.test(l.text),
      });
      if (how === 'blocked' && token.current === mine) { setSpeaking(null); return true; }
    }
    if (token.current !== mine) return false;
    setSpeaking(null);
    return true;
  }, [state.settings.voiceURI, state.settings.rate]);
  return { play, stop, speaking };
}

const COLORS = ['bg-slate-100 dark:bg-slate-800', 'bg-violet-100 dark:bg-violet-900/40', 'bg-emerald-100 dark:bg-emerald-900/40', 'bg-amber-100 dark:bg-amber-900/30'];

export function Bubbles({ turns, speakerOf, hidden, speaking, onReplay, highlight = [] }: {
  turns: PartnerTurn[];
  speakerOf: (t: PartnerTurn) => Speaker;
  hidden: boolean;
  speaking: string | null;
  onReplay: (t: PartnerTurn) => void;
  highlight?: string[];
}) {
  const names: string[] = [];
  return (
    <div className="space-y-2.5" data-testid="partner-turns">
      {turns.map((t, i) => {
        const me = t.role === 'user';
        const sp = me ? null : speakerOf(t);
        if (sp && !names.includes(sp.name)) names.push(sp.name);
        const color = sp ? COLORS[names.indexOf(sp.name) % COLORS.length] : '';
        const live = !me && speaking === t.text;
        return (
          <div key={i} className={`flex ${me ? 'justify-end' : 'justify-start'}`} data-testid={me ? 'turn-user' : 'turn-ai'} data-speaker={sp?.name || 'me'}>
            <div className="max-w-[88%] space-y-0.5">
              {sp && <p className="px-1 text-[11px] font-semibold text-slate-500">{sp.name} {FLAG[sp.accent]}{t.nudge ? ' · nudge' : ''}</p>}
              <div className={`rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed ${me ? 'rounded-br-md bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : `rounded-bl-md text-slate-800 dark:text-slate-100 ${color}`} ${t.nudge ? 'opacity-70' : ''} ${live ? 'ring-2 ring-blue-400' : ''}`}>
                {!me && hidden ? (
                  <span className="text-slate-500" data-testid="hidden-line">{live ? '🔊 speaking…' : '🎧 (listen)'}</span>
                ) : me ? <Marked text={t.text} phrases={highlight} /> : t.text}
                {!me && (
                  <button onClick={() => onReplay(t)} className="ml-2 inline-flex align-middle text-slate-400 hover:text-blue-600" title="Play again" aria-label="Play again">
                    <Icon name="play" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Marked({ text, phrases }: { text: string; phrases: string[] }) {
  const hit = phrases.filter((p) => text.toLowerCase().includes(p.toLowerCase()));
  if (!hit.length) return <>{text}</>;
  const re = new RegExp(`(${hit.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{text.split(re).map((c, i) => (i % 2 ? <b key={i} className="underline decoration-amber-300 decoration-2 underline-offset-2">{c}</b> : <span key={i}>{c}</span>))}</>;
}

export function PartnerFeedback({ fb, title, onPlay }: { fb: RolePlayFeedback; title: string; onPlay: (text: string) => void }) {
  return (
    <div className="card space-y-3 border-emerald-200 dark:border-emerald-900" data-testid="partner-feedback">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-section">🎉 {title}</h2>
        <div className="flex items-center gap-2">
          <span className={`chip ${fb.goalMet ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200'}`} data-testid="goal-met" data-met={fb.goalMet ? '1' : '0'}>{fb.goalMet ? '✅ Goal met' : '⏳ Goal not met yet'}</span>
          <span className="chip bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" data-testid="fb-score">{fb.score}/10</span>
        </div>
      </div>
      {fb.scoreReason && <p className="text-sm text-slate-600 dark:text-slate-300">{fb.scoreReason}</p>}
      {fb.doneWell.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Done well</p>
          <ul className="space-y-1 text-sm" data-testid="fb-done-well">{fb.doneWell.map((g) => <li key={g}>✅ {g}</li>)}</ul>
        </div>
      )}
      {fb.fixes.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Say it better</p>
          <ul className="space-y-2" data-testid="fb-fixes">
            {fb.fixes.map((f, i) => (
              <li key={i} className="rounded-xl bg-slate-50 p-2.5 text-sm dark:bg-slate-800/60" data-testid="fb-fix">
                <p className="text-slate-500 line-through decoration-rose-300">“{f.his}”</p>
                <p className="font-medium">
                  → {f.better}
                  <button onClick={() => onPlay(f.better)} className="ml-2 inline-flex align-middle text-slate-400 hover:text-blue-600" title="Play" aria-label="Play"><Icon name="play" className="h-3.5 w-3.5" /></button>
                </p>
                {f.why && <p className="text-xs text-slate-500">{f.why}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(fb.phrasesUsed.length > 0 || fb.phrasesMissed.length > 0) && (
        <div className="flex flex-wrap gap-1.5" data-testid="fb-phrases">
          {fb.phrasesUsed.map((p) => <span key={p} className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ {p}</span>)}
          {fb.phrasesMissed.map((p) => <span key={p} className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">○ {p}</span>)}
        </div>
      )}
      {fb.nextTimeTry && <p className="text-sm">👉 <b>Next time:</b> {fb.nextTimeTry}</p>}
    </div>
  );
}

export function RecentSessions({ kind, onOpen }: { kind: PartnerSession['kind']; onOpen: (s: PartnerSession) => void }) {
  const { state, update } = useStore();
  const list = state.partner.sessions.filter((s) => s.kind === kind && s.feedback).slice(-6).reverse();
  if (!list.length) return null;
  const remove = async (id: string) => {
    if (!(await askConfirm({ title: 'Delete this conversation?', body: "This can't be undone. Phrases already saved stay in your Phrase Bank.", confirmLabel: 'Delete', danger: true }))) return;
    update((s) => ({ ...s, partner: { ...s.partner, sessions: s.partner.sessions.filter((x) => x.id !== id) } }));
  };
  return (
    <div className="card space-y-2" data-testid="partner-recent">
      <h2 className="h-section">Recent</h2>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2" data-testid="recent-item">
            <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(s)}>
              <p className="truncate text-sm font-medium">{s.title}</p>
              <p className="text-xs text-slate-500">{s.date} · {s.turns.filter((t) => t.role === 'user').length} turns{s.voiceOnly ? ' · 🎧 voice-only' : ''} · {s.feedback?.score}/10{s.feedback?.goalMet ? ' · ✅' : ''}</p>
            </button>
            <button className="btn-ghost !p-2 text-slate-400 hover:text-rose-600" onClick={() => remove(s.id)} title="Delete" aria-label="Delete" data-testid="recent-delete"><Icon name="trash" className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
