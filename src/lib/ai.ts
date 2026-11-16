import { generateJSON, type GeminiConfig, type GeminiTurn } from './gemini';
import type { ChatFeedback, ChatMessage, Correction, PhraseItem, Profile, RetryResult, Upgrade } from './types';

const TONE = `You are "Coach Mia", a warm, encouraging English speaking coach for a Vietnamese learner (around B1–B2).
The learner knows a lot of vocabulary but struggles to USE it naturally and logically when speaking.
Always use short, simple English in explanations. Be kind and positive. Never shame mistakes.
Always reply with valid JSON only, exactly in the requested shape.`;

export function profileText(p: Profile): string {
  const lines = [
    p.name && `Name: ${p.name}`,
    p.job && `Job: ${p.job}`,
    p.city && `City: ${p.city}`,
    p.hobbies && `Hobbies: ${p.hobbies}`,
    p.goals && `Goals: ${p.goals}`,
    p.level && `English level: ${p.level}`,
    p.facts && `Facts about me: ${p.facts}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : '(The learner has not filled in a profile yet.)';
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v.trim() : d);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function phraseList(v: unknown): PhraseItem[] {
  return arr<Record<string, unknown>>(v)
    .map((p) => ({ phrase: str(p?.phrase), meaning: str(p?.meaning), example: str(p?.example) }))
    .filter((p) => p.phrase);
}

// ---------- Daily question ----------
export interface QuestionResult {
  question: string;
  starters: string[];
}

export async function generateQuestion(cfg: GeminiConfig, profile: Profile, topic: string, past: string[]): Promise<QuestionResult> {
  const prompt = `Learner profile:
${profileText(profile)}

Topic: ${topic}

Write ONE conversation question that is clearly about this topic (use the profile only to personalise it, never to change the subject), like a friendly message someone would post in a casual Discord voice/text chat.
- Natural, casual, open-ended (not yes/no), 1–2 short sentences, easy B1 words.
- It should invite a personal opinion or story, and fit the learner's real life when possible.
- It must be clearly different from all of these past questions:
${past.length ? past.slice(-60).map((q) => `  - ${q}`).join('\n') : '  (none yet)'}

Also write 3 short "idea starters": hints (3–8 words each) that help the learner think of WHAT to say, based on their profile. Hints only, not full answers.

JSON shape: {"question": string, "starters": [string, string, string]}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'question', TONE, [{ role: 'user', text: prompt }], 1.0);
  const question = str(r.question);
  if (!question) throw new Error('The AI did not return a question. Please try again.');
  return { question, starters: arr<string>(r.starters).map((s) => str(s)).filter(Boolean).slice(0, 3) };
}

// ---------- Upgrade my answer ----------
export async function upgradeAnswer(cfg: GeminiConfig, profile: Profile, question: string, answer: string): Promise<Upgrade> {
  const prompt = `Learner profile:
${profileText(profile)}

Question: ${question}
The learner's answer (may be a speech transcript with no punctuation): """${answer}"""

Help the learner say THEIR OWN idea more naturally. Keep their meaning, opinion and facts. Do not invent a different opinion.
1. "natural": rewrite it as a natural SPOKEN answer at B2–C1 level, 70–130 words, using the structure Point → Reason → Example → Wrap-up. Sound like a real person talking on Discord (contractions, friendly), not an essay. If the learner gave no example, write a short, general one that fits their profile, and never invent specific events, dates or numbers.
2. "structure": the same answer split into its 4 parts (each part is the exact sentence(s) from "natural").
3. "phrases": 3–5 useful natural phrases or linking words that appear WORD-FOR-WORD in "natural" (e.g. "the thing is", "on top of that", "to be honest"). Skip basic linkers like "for example", "because", "and", "so"; prefer natural spoken chunks a B1 learner would not use yet. For each: short simple meaning and a new short example sentence.
4. "corrections": 2–3 gentle corrections of real mistakes or unnatural parts from the learner's answer: "original" (their words), "better" (more natural), "why" (one short simple sentence). If there are few mistakes, point out a more natural word choice.
5. "encouragement": one warm sentence praising something specific they did well.

JSON shape: {"natural": string, "structure": {"point": string, "reason": string, "example": string, "wrapUp": string}, "phrases": [{"phrase": string, "meaning": string, "example": string}], "corrections": [{"original": string, "better": string, "why": string}], "encouragement": string}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'upgrade', TONE, [{ role: 'user', text: prompt }], 0.7);
  const natural = str(r.natural);
  if (!natural) throw new Error('The AI did not return an upgraded answer. Please try again.');
  const s = (r.structure || {}) as Record<string, unknown>;
  return {
    natural,
    structure: { point: str(s.point), reason: str(s.reason), example: str(s.example), wrapUp: str(s.wrapUp ?? s.wrap_up) },
    phrases: phraseList(r.phrases).slice(0, 5),
    corrections: arr<Record<string, unknown>>(r.corrections)
      .map((c): Correction => ({ original: str(c?.original), better: str(c?.better), why: str(c?.why) }))
      .filter((c) => c.better)
      .slice(0, 3),
    encouragement: str(r.encouragement),
  };
}

// ---------- Say it again ----------
export async function scoreRetry(cfg: GeminiConfig, question: string, natural: string, phrases: string[], attempt: string): Promise<RetryResult> {
  const prompt = `Question: ${question}
Model answer the learner studied: """${natural}"""
Target phrases: ${JSON.stringify(phrases)}
The learner's new attempt WITHOUT looking (may be a speech transcript): """${attempt}"""

Check which target phrases they used (allow small variations, e.g. tense or a missing word). Score 0–100 for how natural, fluent and well-structured (Point, Reason, Example, Wrap-up) the attempt is, being encouraging.
Give ONE practical tip for sounding more fluent (fewer fillers, better linking, clearer structure) and one short specific praise.

JSON shape: {"used": [string], "missed": [string], "score": number, "tip": string, "praise": string}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'retry', TONE, [{ role: 'user', text: prompt }], 0.4);
  const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
  return {
    attempt,
    used: arr<string>(r.used).map((x) => str(x)).filter(Boolean),
    missed: arr<string>(r.missed).map((x) => str(x)).filter(Boolean),
    score,
    tip: str(r.tip),
    praise: str(r.praise),
  };
}

// ---------- Conversation practice ----------
function chatSystem(profile: Profile, topic: string, question: string, phrases: string[]): string {
  return `${TONE}

You are now role-playing a friendly person chatting with the learner in a casual Discord voice channel.
Learner profile:
${profileText(profile)}

Today's topic: ${topic}
Today's question: ${question}
Phrases the learner is practising: ${phrases.length ? phrases.join('; ') : '(none yet)'}

Rules for each reply:
- "reply": 1–3 short, natural, casual sentences (like a real Discord friend). React to what they said, share a tiny bit about yourself, then ask ONE natural follow-up question. Use B1–B2 words. No lists, no lectures.
- "nudge": optional, very short tip (max 15 words) encouraging the learner to try one of the practice phrases in their next message, or "" if not needed. Do not nudge every time.
JSON shape: {"reply": string, "nudge": string}`;
}

function toTurns(messages: ChatMessage[]): GeminiTurn[] {
  const turns: GeminiTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));
  // Gemini expects the conversation to start with a user turn.
  if (!turns.length || turns[0].role !== 'user') turns.unshift({ role: 'user', text: "Hey! Let's chat." });
  return turns;
}

export async function chatReply(
  cfg: GeminiConfig,
  profile: Profile,
  topic: string,
  question: string,
  phrases: string[],
  messages: ChatMessage[],
): Promise<ChatMessage> {
  const turns = toTurns(messages);
  if (!messages.length) turns[0].text = "Hey! Start our chat: greet me casually and ask me today's question in your own words.";
  const r = await generateJSON<Record<string, unknown>>(cfg, messages.length ? 'chat' : 'chat-start', chatSystem(profile, topic, question, phrases), turns, 0.9);
  const reply = str(r.reply);
  if (!reply) throw new Error('Your chat partner went quiet. Please try again.');
  return { role: 'model', text: reply, nudge: str(r.nudge) || undefined };
}

export async function chatFeedback(cfg: GeminiConfig, topic: string, phrases: string[], messages: ChatMessage[]): Promise<ChatFeedback> {
  const transcript = messages.map((m) => `${m.role === 'user' ? 'Learner' : 'Partner'}: ${m.text}`).join('\n');
  const prompt = `Topic: ${topic}
Practice phrases: ${JSON.stringify(phrases)}
Chat transcript:
${transcript}

Give brief, warm feedback on the LEARNER's messages only.
JSON shape: {"summary": string (1–2 sentences), "goodPoints": [2 short strings], "improve": [2 short strings, each with a concrete better way to say something they said], "phrasesUsed": [practice phrases they actually used]}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'chat-feedback', TONE, [{ role: 'user', text: prompt }], 0.5);
  return {
    summary: str(r.summary),
    goodPoints: arr<string>(r.goodPoints).map((x) => str(x)).filter(Boolean),
    improve: arr<string>(r.improve).map((x) => str(x)).filter(Boolean),
    phrasesUsed: arr<string>(r.phrasesUsed).map((x) => str(x)).filter(Boolean),
  };
}

// ---------- Phrase review ----------
export interface ReviewResult {
  ok: boolean;
  feedback: string;
  better: string;
}

export async function checkSentence(cfg: GeminiConfig, phrase: string, meaning: string, sentence: string): Promise<ReviewResult> {
  const prompt = `Target phrase: "${phrase}" (meaning: ${meaning})
The learner's own sentence: """${sentence}"""

Did they use the phrase correctly and naturally (small grammar slips are OK if the phrase itself is used correctly)?
JSON shape: {"ok": boolean, "feedback": string (1–2 short, kind sentences), "better": string (a more natural version of their sentence using the phrase)}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'review', TONE, [{ role: 'user', text: prompt }], 0.3);
  return { ok: r.ok === true || r.ok === 'true', feedback: str(r.feedback), better: str(r.better) };
}

export async function testKey(cfg: GeminiConfig): Promise<string> {
  const r = await generateJSON<Record<string, unknown>>(cfg, 'ping', 'Reply with JSON only.', [{ role: 'user', text: 'Say hello to an English learner in 5 words. JSON shape: {"message": string}' }], 0.5);
  return str(r.message) || 'Connected!';
}
