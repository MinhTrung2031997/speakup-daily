// 🎧 Discord group (ES's idea, EL's prompts): Jake (US), Priya (UK) and Liam (AU) chat in their own voices,
// then pause on a question for him. He jumps in; 5 jump-ins, then feedback.
import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useAIConfig } from '../../lib/hooks';
import { errorText } from '../../lib/gemini';
import { todayStr, uid } from '../../lib/date';
import { DISCORD_FRIENDS, DISCORD_TOPICS, storyHookQuestion } from '../../lib/roleplay';
import { DISCORD_TURNS, FLAG, discordBurst, discordFeedback } from '../../lib/partner';
import type { PartnerSession, PartnerTurn } from '../../lib/types';
import { speakNatural } from '../../lib/tts';
import PartnerRun, { saveSession } from './PartnerRun';
import { PartnerFeedback, RecentSessions } from './Conversation';
import { Transcript } from './RolePlay';
import { VoiceOnlyToggle } from './VoiceOnlyToggle';
import { ErrorBox, Spinner } from '../ui';
import Icon from '../Icon';

const speakerOf = (t: PartnerTurn) => {
  const f = DISCORD_FRIENDS.find((x) => x.name === t.speaker) || DISCORD_FRIENDS[0];
  return { name: f.name, accent: f.accent };
};

export default function DiscordGroup() {
  const { state, update } = useStore();
  const ai = useAIConfig();
  const [topic, setTopic] = useState(DISCORD_TOPICS[0]);
  const [voiceOnly, setVoiceOnly] = useState(() => localStorage.getItem('speakup.voiceOnly') === '1');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [run, setRun] = useState<{ id: string; fresh: boolean } | null>(() => {
    const open = [...state.partner.sessions].reverse().find((s) => s.kind === 'discord' && !s.feedback && s.date === todayStr());
    return open ? { id: open.id, fresh: false } : null;
  });
  const [doneId, setDoneId] = useState<string | null>(null);
  const session = run ? state.partner.sessions.find((s) => s.id === run.id) : undefined;
  const done = doneId ? state.partner.sessions.find((s) => s.id === doneId) : undefined;
  const stories = useMemo(() => state.partner.stories.filter((s) => s.polished).map((s) => s.slot), [state.partner.stories]);
  const setVO = (v: boolean) => { setVoiceOnly(v); localStorage.setItem('speakup.voiceOnly', v ? '1' : '0'); };

  /** A burst of friend lines; a "story" cue becomes an invite to one of his saved stories (once per call). */
  const burst = async (t: string, turns: PartnerTurn[], left: number) => {
    const r = await discordBurst(ai, t, turns, left);
    const lines: PartnerTurn[] = r.lines.map((l) => ({ role: 'ai', speaker: l.speaker, text: l.text }));
    const hooks = stories.map((id) => storyHookQuestion(id));
    if (r.cueType === 'story' && !r.end && stories.length && !turns.some((x) => hooks.includes(x.text))) {
      const unused = stories.find((id) => !state.partner.sessions.some((s) => s.turns.some((x) => x.text === storyHookQuestion(id)))) || stories[0];
      lines[lines.length - 1] = { ...lines[lines.length - 1], text: storyHookQuestion(unused) };
    }
    return { lines, end: r.end };
  };

  const start = async (t = topic) => {
    setStarting(true); setError('');
    try {
      const r = await burst(t, [], DISCORD_TURNS);
      const s: PartnerSession = { id: uid(), date: todayStr(), kind: 'discord', ref: t, title: `🎧 Discord: ${t}`, voiceOnly, turns: r.lines, createdAt: Date.now(), updatedAt: Date.now() };
      saveSession(update, s);
      setDoneId(null);
      setRun({ id: s.id, fresh: true });
    } catch (e) { setError(errorText(e)); } finally { setStarting(false); }
  };

  if (session) {
    return (
      <PartnerRun
        key={session.id}
        session={session}
        autoPlay={!!run?.fresh}
        maxTurns={DISCORD_TURNS}
        speakerOf={speakerOf}
        next={(turns, left) => burst(session.ref, turns, left)}
        feedback={(turns) => discordFeedback(ai, session.ref, turns)}
        onDone={(s) => { setRun(null); setDoneId(s.id); }}
        onLeave={() => setRun(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {done?.feedback && (
        <div className="space-y-2">
          <PartnerFeedback fb={done.feedback} title={done.title} onPlay={(t) => speakNatural(t)} />
          <Transcript s={done} />
        </div>
      )}
      <div className="card space-y-3" data-testid="discord-setup">
        <div>
          <h2 className="h-section">Jump into a group call</h2>
          <p className="muted text-sm">Three friends chat at natural speed, cut in on each other, then throw you a question. Jump in: agree, disagree, ask back or tell a quick story.</p>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="discord-friends">
          {DISCORD_FRIENDS.map((f) => <span key={f.name} className="chip bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" title={f.vibe}>{f.name} {FLAG[f.accent]}</span>)}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Topic</p>
          <div className="flex flex-wrap gap-1.5">
            {DISCORD_TOPICS.map((t) => (
              <button key={t} onClick={() => setTopic(t)} data-testid="discord-topic" aria-pressed={t === topic}
                className={`chip ${t === topic ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'}`}>{t}</button>
            ))}
          </div>
        </div>
        <VoiceOnlyToggle value={voiceOnly} onChange={setVO} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void start()} disabled={starting || !ai.hasKey} data-testid="discord-start">{starting ? <Spinner /> : <Icon name="mic" className="h-4 w-4" />} Join the call</button>
          <button className="btn-soft" disabled={starting || !ai.hasKey} data-testid="discord-random"
            onClick={() => { const t = DISCORD_TOPICS[Math.floor(Math.random() * DISCORD_TOPICS.length)]; setTopic(t); void start(t); }}>🎲 Random topic</button>
        </div>
        <ErrorBox error={error} onRetry={() => void start()} />
      </div>
      <RecentSessions kind="discord" onOpen={(s) => setDoneId(s.id)} />
    </div>
  );
}
