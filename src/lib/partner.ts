// Voice conversation partner: AI calls for EL's role-play, Story bank and Discord prompts (roleplay.ts),
// plus voices (accent + a distinct prebuilt voice per persona / friend) and small helpers.
import { generateJSON, type GeminiConfig } from './gemini';
import * as RP from './roleplay';
import type { PartnerTurn } from './types';
import type { Accent } from './tts';

const SYSTEM = 'You write natural spoken English for a speaking-practice app used by a Vietnamese adult learner (around B1–B2). Follow the instructions exactly. Reply with JSON only.';
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v.trim() : d);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const strs = (v: unknown, max = 10) => arr<unknown>(v).map((x) => str(x)).filter(Boolean).slice(0, max);
const bool = (v: unknown) => v === true || v === 'true';

export const ROLEPLAY_TURNS = 8;
export const DISCORD_TURNS = 5;
export const START_SECONDS = 5;

/* ---------- Voices ---------- */
const FEMALE = new Set(['maya', 'sophie', 'nina', 'claire', 'harper', 'amira', 'grace', 'rosa', 'ana', 'priya']);
const VOICES: Record<Accent, { m: string; f: string }> = {
  US: { m: 'Puck', f: 'Kore' },
  UK: { m: 'Charon', f: 'Aoede' },
  AU: { m: 'Fenrir', f: 'Leda' },
};
/** A prebuilt voice for a persona: matches the accent and (by name) a male or female voice. */
export function personaVoice(name: string, accent: Accent): string {
  const v = VOICES[accent] || VOICES.US;
  return FEMALE.has(name.trim().toLowerCase()) ? v.f : v.m;
}
/** Browser-voice fallback: a different pitch per speaker so they still sound distinct. */
export function personaPitch(name: string): number {
  const n = name.trim().toLowerCase();
  return FEMALE.has(n) ? 1.15 : n === 'liam' ? 0.85 : 1;
}
export const FLAG: Record<Accent, string> = { US: '🇺🇸', UK: '🇬🇧', AU: '🇦🇺' };

/* ---------- Nudges after a missed 5-second start (no model call) ---------- */
const NUDGES = ['You still there?', 'Hello? Did I lose you?', 'Take your time. What do you think?'];
export const nudgeLine = (n: number) => NUDGES[n % NUDGES.length];

/** History for EL's role-play prompts (nudges are not sent: they are not part of the scene). */
export const rpHistory = (turns: PartnerTurn[]): RP.RolePlayTurn[] => turns.filter((t) => !t.nudge).map((t) => ({ role: t.role, text: t.text }));
export const discordHistory = (turns: PartnerTurn[]): RP.DiscordLine[] => turns.filter((t) => !t.nudge).map((t) => ({ speaker: t.role === 'user' ? 'Trung' : t.speaker || 'Jake', text: t.text }));

/* ---------- Story hook inside role-play scenes ---------- */
const STORY_SCENES = new Set(['funny-story', 'old-friend', 'interview-yourself', 'party-intro', 'weekend-plans']);
export const sceneFitsStory = (sceneId: string) => STORY_SCENES.has(sceneId);

function storyRule(slotIds: string[], hookUsed: boolean): string {
  if (!slotIds.length || hookUsed) return '';
  const slots = slotIds.map((id) => RP.STORY_PROMPTS.find((s) => s.id === id)).filter((s): s is RP.StoryPrompt => !!s);
  if (!slots.length) return '';
  return `\n\nStory bank: ${RP.storyInConversation}
He has these saved stories: ${slots.map((s) => `"${s.title}" (ask: "${RP.storyHookQuestion(s.id)}")`).join('; ')}.
If it fits naturally now (he has had at least 2 turns and you have not invited a story yet), you may ask ONE of those questions in your own words instead of another question. Only once per scene.`;
}

/* ---------- Role-play ---------- */
export async function rolePlayTurn(cfg: GeminiConfig, scene: RP.Scene, turns: PartnerTurn[], opts: RP.RolePlayTurnOpts & { stories?: string[]; hookUsed?: boolean }): Promise<RP.RolePlayTurnResult> {
  const extra = sceneFitsStory(scene.id) ? storyRule(opts.stories || [], !!opts.hookUsed) : '';
  const prompt = RP.rolePlayTurnPrompt(scene, rpHistory(turns), { voiceOnly: opts.voiceOnly, turnsLeft: Math.max(0, opts.turnsLeft) }) + extra;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'roleplay-turn', SYSTEM, [{ role: 'user', text: prompt }], 0.9);
  const line = str(r.line);
  if (!line) throw new Error(`${scene.aiPersona.name} went quiet. Please try again.`);
  return { line, goalMet: bool(r.goalMet), usedTwist: bool(r.usedTwist), end: bool(r.end) || opts.turnsLeft <= 0 };
}

function feedbackFrom(r: Record<string, unknown>, targets: string[]): RP.RolePlayFeedback {
  const used = strs(r.phrasesUsed).filter((p) => !targets.length || targets.some((t) => t.toLowerCase() === p.toLowerCase()));
  return {
    goalMet: bool(r.goalMet),
    doneWell: strs(r.doneWell, 2),
    fixes: arr<Record<string, unknown>>(r.fixes).map((f) => ({ his: str(f?.his), better: str(f?.better), why: str(f?.why) })).filter((f) => f.his && f.better).slice(0, 3),
    phrasesUsed: used,
    phrasesMissed: targets.length ? targets.filter((t) => !used.some((u) => u.toLowerCase() === t.toLowerCase())) : strs(r.phrasesMissed),
    nextTimeTry: str(r.nextTimeTry),
    score: Math.min(10, Math.max(1, Math.round(Number(r.score) || 1))),
    scoreReason: str(r.scoreReason),
  };
}

export async function rolePlayFeedback(cfg: GeminiConfig, scene: RP.Scene, turns: PartnerTurn[]): Promise<RP.RolePlayFeedback> {
  const r = await generateJSON<Record<string, unknown>>(cfg, 'roleplay-feedback', SYSTEM, [{ role: 'user', text: RP.rolePlayFeedbackPrompt(scene, rpHistory(turns)) }], 0.4);
  return feedbackFrom(r, scene.targetPhrases);
}

/* ---------- Discord group ---------- */
export const discordScene = (topic: string): RP.Scene => ({
  id: 'discord', title: `Discord group chat: ${topic}`, emoji: '🎧', group: 'Social', level: 'B1',
  setting: `A casual Discord voice call between friends (${RP.DISCORD_FRIENDS.map((f) => f.name).join(', ')}) and Trung. They chat about: ${topic}.`,
  aiRole: 'group of friends', aiPersona: { name: 'The group', accent: 'US', personality: 'friendly' },
  learnerGoal: 'Jump in naturally and keep the chat going: agree or disagree, answer the questions, ask a follow-up.',
  opener: '', targetPhrases: [], twists: [],
  successCheck: 'He answered most cues with a relevant reply of at least one full sentence, and at least once added an opinion, a reason or a follow-up question.',
});

export async function discordBurst(cfg: GeminiConfig, topic: string, turns: PartnerTurn[], turnsLeft: number): Promise<RP.DiscordTurnResult> {
  const names = RP.DISCORD_FRIENDS.map((f) => f.name);
  const prompt = RP.discordGroupPrompt(topic, RP.DISCORD_FRIENDS, discordHistory(turns), Math.max(0, turnsLeft));
  const r = await generateJSON<Record<string, unknown>>(cfg, 'discord', SYSTEM, [{ role: 'user', text: prompt }], 0.9);
  const lines = arr<Record<string, unknown>>(r.lines)
    .map((l) => ({ speaker: str(l?.speaker), text: str(l?.text) }))
    .filter((l) => l.text && l.speaker.toLowerCase() !== 'trung')
    .map((l) => ({ ...l, speaker: names.find((n) => n.toLowerCase() === l.speaker.toLowerCase()) || names[0] }))
    .slice(0, 5);
  if (!lines.length) throw new Error('The group went quiet. Please try again.');
  const types: RP.DiscordCueType[] = ['agree/disagree', 'follow-up', 'story', 'opinion'];
  const cueType = (types as string[]).includes(str(r.cueType)) ? (str(r.cueType) as RP.DiscordCueType) : 'opinion';
  return { lines, cueForTrung: lines[lines.length - 1].text, cueType, end: bool(r.end) || turnsLeft <= 0 };
}

export async function discordFeedback(cfg: GeminiConfig, topic: string, turns: PartnerTurn[]): Promise<RP.RolePlayFeedback> {
  const scene = discordScene(topic);
  // The feedback prompt only knows "ai" vs "user": keep who said it inside the text.
  const hist = turns.filter((t) => !t.nudge).map((t) => ({ role: t.role, text: t.role === 'ai' ? `${t.speaker || 'Friend'}: ${t.text}` : t.text }));
  const r = await generateJSON<Record<string, unknown>>(cfg, 'roleplay-feedback', SYSTEM, [{ role: 'user', text: RP.rolePlayFeedbackPrompt(scene, hist) }], 0.4);
  return feedbackFrom(r, []);
}

/* ---------- Story bank ---------- */
export async function storyPolish(cfg: GeminiConfig, slot: RP.StoryPrompt, transcript: string): Promise<RP.StoryPolish> {
  const r = await generateJSON<Record<string, unknown>>(cfg, 'story-polish', SYSTEM, [{ role: 'user', text: RP.storyPolishPrompt(slot, transcript.trim().slice(0, 4000)) }], 0.5);
  const polished = str(r.polished);
  if (!polished) throw new Error("I couldn't polish that story. Please try again.");
  // Phrases to keep must really be in the polished text (so they can be heard and reused).
  const keep = strs(r.phrasesToKeep, 6).filter((p) => polished.toLowerCase().includes(p.toLowerCase())).slice(0, 3);
  return { polished, structure: str(r.structure) || 'Hook -> Context -> What happened -> How it ended -> Point', phrasesToKeep: keep, beats: strs(r.beats, 4) };
}

export async function storyRetellCheck(cfg: GeminiConfig, polished: string, beats: string[], transcript: string): Promise<RP.StoryRetellCheck> {
  const r = await generateJSON<Record<string, unknown>>(cfg, 'story-retell', SYSTEM, [{ role: 'user', text: RP.storyRetellCheckPrompt(polished, beats, transcript.trim().slice(0, 4000)) }], 0.3);
  const said = strs(r.beatsCovered).map((b) => b.toLowerCase());
  const covered = beats.filter((b) => said.includes(b.toLowerCase()));
  const fix = (r.fix && typeof r.fix === 'object' ? r.fix : {}) as Record<string, unknown>;
  return {
    beatsCovered: covered,
    beatsMissed: beats.filter((b) => !covered.includes(b)),
    phrasesReused: strs(r.phrasesReused),
    fix: { his: str(fix.his), better: str(fix.better), why: str(fix.why) },
  };
}
