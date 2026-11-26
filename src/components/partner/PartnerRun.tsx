// A running voice conversation (role-play scene or Discord group): he speaks, the partner replies in its own
// voice, and so on until the scene ends or he asks for feedback. Voice-only mode hides the partner's text.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { errorText } from '../../lib/gemini';
import { nudgeLine } from '../../lib/partner';
import type { RolePlayFeedback } from '../../lib/roleplay';
import type { PartnerSession, PartnerTurn } from '../../lib/types';
import { ErrorBox, Spinner } from '../ui';
import Icon from '../Icon';
import TurnMic from './TurnMic';
import { Bubbles, useLinePlayer, type Speaker } from './Conversation';

interface Props {
  session: PartnerSession;
  /** Play the partner's lines since his last turn when this opens (a fresh start). */
  autoPlay: boolean;
  maxTurns: number;
  speakerOf: (t: PartnerTurn) => Speaker;
  next: (turns: PartnerTurn[], turnsLeft: number) => Promise<{ lines: PartnerTurn[]; end: boolean }>;
  feedback: (turns: PartnerTurn[]) => Promise<RolePlayFeedback>;
  /** Phrases to underline in his lines (not shown in voice-only mode). */
  highlight?: string[];
  onDone: (s: PartnerSession) => void;
  onLeave: () => void;
}

export function saveSession(update: ReturnType<typeof useStore>['update'], s: PartnerSession) {
  update((st) => ({ ...st, partner: { ...st.partner, sessions: st.partner.sessions.some((x) => x.id === s.id) ? st.partner.sessions.map((x) => (x.id === s.id ? s : x)) : [...st.partner.sessions, s] } }));
}

export default function PartnerRun({ session, autoPlay, maxTurns, speakerOf, next, feedback, highlight = [], onDone, onLeave }: Props) {
  const { update, logActivity } = useStore();
  const player = useLinePlayer();
  const [cur, setCur] = useState(session);
  const curRef = useRef(session);
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');
  const [arm, setArm] = useState(0);
  const [timed, setTimed] = useState(true);
  const [showText, setShowText] = useState(false);
  const misses = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userTurns = cur.turns.filter((t) => t.role === 'user').length;
  const hidden = cur.voiceOnly && !showText;

  const save = (s: PartnerSession) => { const n = { ...s, updatedAt: Date.now() }; curRef.current = n; setCur(n); saveSession(update, n); };
  const lineOf = (t: PartnerTurn) => ({ text: t.text, speaker: speakerOf(t) });
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [cur.turns.length, busy]);

  const speakThenArm = async (lines: PartnerTurn[]) => {
    const done = await player.play(lines.map(lineOf));
    if (!done) return;
    misses.current = 0;
    setTimed(true);
    setArm((a) => a + 1);
  };

  useEffect(() => {
    if (!autoPlay) return;
    const t = cur.turns;
    let i = t.length;
    while (i > 0 && t[i - 1].role === 'ai') i--;
    void speakThenArm(t.slice(i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    player.stop();
    setEnding(true); setError('');
    try {
      const fb = await feedback(curRef.current.turns);
      const s = { ...curRef.current, feedback: fb };
      save(s);
      logActivity();
      onDone(s);
    } catch (e) { setError(errorText(e)); } finally { setEnding(false); }
  };

  const submit = async (text: string) => {
    player.stop();
    const withUser = { ...curRef.current, turns: [...curRef.current.turns, { role: 'user' as const, text }] };
    save(withUser);
    const left = maxTurns - withUser.turns.filter((t) => t.role === 'user').length;
    setBusy(true); setError('');
    try {
      const r = await next(withUser.turns, left);
      save({ ...withUser, turns: [...withUser.turns, ...r.lines] });
      setBusy(false);
      if (r.end) { await player.play(r.lines.map(lineOf)); await finish(); }
      else await speakThenArm(r.lines);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };

  // No answer within 5 seconds: one in-character nudge (no model call), then he taps the mic himself.
  const miss = async () => {
    misses.current += 1;
    if (misses.current > 1) { setTimed(false); return; }
    const lastAi = [...curRef.current.turns].reverse().find((t) => t.role === 'ai');
    const nudge: PartnerTurn = { role: 'ai', text: nudgeLine(curRef.current.turns.filter((t) => t.nudge).length), nudge: true, ...(lastAi?.speaker ? { speaker: lastAi.speaker } : {}) };
    save({ ...curRef.current, turns: [...curRef.current.turns, nudge] });
    const done = await player.play([lineOf(nudge)]);
    if (done) setArm((a) => a + 1);
  };

  const retry = () => {
    const t = curRef.current.turns;
    const last = t[t.length - 1];
    if (last?.role !== 'user') return;
    save({ ...curRef.current, turns: t.slice(0, -1) });
    void submit(last.text);
  };

  return (
    <div className="card flex flex-col gap-3 !p-3 sm:!p-4" data-testid="partner-run" data-voice-only={cur.voiceOnly ? '1' : '0'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{cur.title}</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span data-testid="turns-left">{Math.max(0, maxTurns - userTurns)} turn{maxTurns - userTurns === 1 ? '' : 's'} left</span>
          {cur.voiceOnly && <button className="font-medium text-blue-600 hover:underline dark:text-blue-300" onClick={() => setShowText((v) => !v)} data-testid="show-text">{showText ? 'Hide text' : 'Show text'}</button>}
        </div>
      </div>
      <Bubbles turns={cur.turns} speakerOf={speakerOf} hidden={hidden} speaking={player.speaking} onReplay={(t) => void player.play([lineOf(t)])} highlight={hidden ? [] : highlight} />
      {busy && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="h-3.5 w-3.5" /> {cur.kind === 'discord' ? 'the group is talking…' : 'thinking…'}</div>}
      <div ref={bottomRef} />
      <ErrorBox error={error} onRetry={cur.turns[cur.turns.length - 1]?.role === 'user' ? retry : undefined} />
      {!ending && <TurnMic voiceOnly={cur.voiceOnly} arm={arm} timed={timed} disabled={busy || (cur.voiceOnly && !!player.speaking)} onSubmit={(t) => void submit(t)} onMiss={() => void miss()} />}
      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost text-sm" onClick={() => { player.stop(); onLeave(); }}>← Leave</button>
        <button className="btn-soft" onClick={() => void finish()} disabled={ending || busy || userTurns < 1} data-testid="partner-end">{ending ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} End &amp; get feedback</button>
      </div>
    </div>
  );
}
