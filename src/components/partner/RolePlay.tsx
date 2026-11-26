// 🎭 Role-play scenes (EL's 16 scenes): pick a scene, hear the opener in the persona's voice, talk it through, get feedback.
import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useAIConfig } from '../../lib/hooks';
import { todayStr, uid } from '../../lib/date';
import { SCENES, type Scene, type SceneGroup } from '../../lib/roleplay';
import { FLAG, ROLEPLAY_TURNS, rolePlayFeedback, rolePlayTurn, sceneFitsStory } from '../../lib/partner';
import type { PartnerSession, PartnerTurn } from '../../lib/types';
import { speakNatural } from '../../lib/tts';
import PartnerRun, { saveSession } from './PartnerRun';
import { PartnerFeedback, RecentSessions } from './Conversation';
import { VoiceOnlyToggle } from './VoiceOnlyToggle';
import Icon from '../Icon';

const GROUPS: SceneGroup[] = ['Everyday', 'Social', 'Travel', 'Work', 'Tricky moments'];

export default function RolePlay() {
  const { state, update, addPhrases } = useStore();
  const ai = useAIConfig();
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [voiceOnly, setVoiceOnly] = useState(() => localStorage.getItem('speakup.voiceOnly') === '1');
  const [run, setRun] = useState<{ id: string; fresh: boolean } | null>(() => {
    const open = [...state.partner.sessions].reverse().find((s) => s.kind === 'scene' && !s.feedback && s.date === todayStr());
    return open ? { id: open.id, fresh: false } : null;
  });
  const [doneId, setDoneId] = useState<string | null>(null);
  const scene = SCENES.find((s) => s.id === sceneId);
  const session = run ? state.partner.sessions.find((s) => s.id === run.id) : undefined;
  const done = doneId ? state.partner.sessions.find((s) => s.id === doneId) : undefined;
  const stories = useMemo(() => state.partner.stories.filter((s) => s.polished).map((s) => s.slot), [state.partner.stories]);

  const setVO = (v: boolean) => { setVoiceOnly(v); localStorage.setItem('speakup.voiceOnly', v ? '1' : '0'); };

  const start = (sc: Scene) => {
    // The opener is played as written: no model call for the first line.
    const s: PartnerSession = { id: uid(), date: todayStr(), kind: 'scene', ref: sc.id, title: `${sc.emoji} ${sc.title}`, voiceOnly, turns: [{ role: 'ai', text: sc.opener }], createdAt: Date.now(), updatedAt: Date.now() };
    saveSession(update, s);
    setDoneId(null);
    setRun({ id: s.id, fresh: true });
  };

  if (session) {
    const sc = SCENES.find((s) => s.id === session.ref) || SCENES[0];
    const speaker = { name: sc.aiPersona.name, accent: sc.aiPersona.accent };
    return (
      <PartnerRun
        key={session.id}
        session={session}
        autoPlay={!!run?.fresh}
        maxTurns={ROLEPLAY_TURNS}
        speakerOf={() => speaker}
        highlight={sc.targetPhrases}
        next={async (turns: PartnerTurn[], left: number) => {
          const r = await rolePlayTurn(ai, sc, turns, { voiceOnly: session.voiceOnly, turnsLeft: left, stories: sceneFitsStory(sc.id) ? stories : [] });
          return { lines: [{ role: 'ai', text: r.line }], end: r.end };
        }}
        feedback={(turns) => rolePlayFeedback(ai, sc, turns)}
        onDone={(s) => {
          // Target phrases he used go to the Phrase Bank (same SRS as other phrases).
          if (s.feedback?.phrasesUsed.length) addPhrases(s.feedback.phrasesUsed.map((p) => ({ phrase: p, meaning: '', example: '' })), `Role-play: ${sc.title}`, 'roleplay');
          setRun(null); setDoneId(s.id); setSceneId(sc.id);
        }}
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
      {scene ? (
        <div className="card space-y-3" data-testid="scene-intro">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{scene.group} · {scene.level}</p>
              <h2 className="text-lg font-semibold">{scene.emoji} {scene.title}</h2>
            </div>
            <button className="btn-ghost text-sm" onClick={() => { setSceneId(null); setDoneId(null); }}>All scenes</button>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{scene.setting}</p>
          <p className="text-sm">🎯 <b>Your goal:</b> {scene.learnerGoal}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">You're talking to <b>{scene.aiPersona.name}</b> {FLAG[scene.aiPersona.accent]} ({scene.aiRole}).</p>
          {!voiceOnly ? (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="scene-targets">
              <span className="text-xs text-slate-500">Try to use:</span>
              {scene.targetPhrases.map((p) => <span key={p} className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{p}</span>)}
            </div>
          ) : <p className="text-xs text-slate-500">🎧 Voice-only: the partner's lines and the target phrases stay hidden until the feedback.</p>}
          <VoiceOnlyToggle value={voiceOnly} onChange={setVO} />
          <button className="btn-primary w-full sm:w-auto" onClick={() => start(scene)} disabled={!ai.hasKey} data-testid="scene-start"><Icon name="mic" className="h-4 w-4" /> Start the scene</button>
        </div>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SCENES.filter((s) => s.group === g).map((s) => {
                  const best = Math.max(0, ...state.partner.sessions.filter((x) => x.ref === s.id && x.feedback).map((x) => x.feedback!.score));
                  return (
                    <button key={s.id} className="card flex items-start gap-3 !p-3 text-left transition hover:border-blue-300" onClick={() => setSceneId(s.id)} data-testid="scene-card" data-id={s.id}>
                      <span className="text-2xl">{s.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{s.title}</span>
                        <span className="block text-xs text-slate-500">{s.aiPersona.name} {FLAG[s.aiPersona.accent]} · {s.level}{best ? ` · best ${best}/10` : ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <RecentSessions kind="scene" onOpen={(s) => { setDoneId(s.id); setSceneId(s.ref); }} />
    </div>
  );
}

export function Transcript({ s }: { s: PartnerSession }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card !p-3">
      <button className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-300" onClick={() => setOpen((v) => !v)} data-testid="show-transcript">{open ? 'Hide transcript' : 'Show transcript'}</button>
      {open && (
        <ul className="mt-2 space-y-1 text-sm" data-testid="transcript">
          {s.turns.map((t, i) => <li key={i} className={t.role === 'user' ? 'font-medium' : 'text-slate-600 dark:text-slate-300'}>{t.role === 'user' ? 'You' : t.speaker || 'Partner'}: {t.text}</li>)}
        </ul>
      )}
    </div>
  );
}
