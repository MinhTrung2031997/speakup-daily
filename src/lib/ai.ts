import { generateJSON, type GeminiConfig, type GeminiTurn } from './gemini';
import type { BuilderLength, BuilderLevel, BuilderPart, ChatFeedback, ChatMessage, Correction, ListenDrill, ListenLine, PhraseItem, Profile, PronunciationResult, PronWord, QuestionType, RetellResult, RetryResult, Upgrade } from './types';

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
export async function scoreRetry(
  cfg: GeminiConfig,
  question: string,
  natural: string,
  phrases: string[],
  attempt: string,
  structure = 'Point, Reason, Example, Wrap-up',
  task = 'retry',
): Promise<RetryResult> {
  const prompt = `Question: ${question}
Model answer the learner studied: """${natural}"""
Target phrases: ${JSON.stringify(phrases)}
The learner's new attempt WITHOUT looking (may be a speech transcript): """${attempt}"""

Check which target phrases they used (allow small variations, e.g. tense or a missing word). Score 0–100 for how natural, fluent and well-structured (${structure}) the attempt is, being encouraging.
Give ONE practical tip for sounding more fluent (fewer fillers, better linking, clearer structure) and one short specific praise.

JSON shape: {"used": [string], "missed": [string], "score": number, "tip": string, "praise": string}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, task, TONE, [{ role: 'user', text: prompt }], 0.4);
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

// ---------- Answer builder (prompts by EL, tested Nov 16, 2026) ----------
export const QUESTION_TYPES: { type: QuestionType; label: string; hint: string; emoji: string }[] = [
  { type: 'Opinion', label: 'Opinion', hint: 'Is X good or bad?', emoji: '💭' },
  { type: 'Experience', label: 'Experience', hint: 'Tell me about a time…', emoji: '📖' },
  { type: 'Compare', label: 'Compare', hint: 'A or B?', emoji: '⚖️' },
  { type: 'Describe', label: 'Describe', hint: 'What is X like?', emoji: '🖼️' },
  { type: 'Hypothetical', label: 'What would you do', hint: 'What would you do if…?', emoji: '🔮' },
  { type: 'Small talk', label: 'Small talk', hint: 'Light everyday chat', emoji: '☕' },
];

/** Default answer structure per question type (used if the AI leaves "slots" out). */
export const DEFAULT_SLOTS: Record<QuestionType, string[]> = {
  Opinion: ['Stance', 'Reason', 'Example', 'Wrap-up'],
  Experience: ['Situation', 'What happened', 'How I felt', 'Lesson'],
  Compare: ['Both sides', 'My pick', 'Why'],
  Describe: ['Overview', 'Detail 1', 'Detail 2', 'Why it matters'],
  Hypothetical: ['My choice', 'Reason', 'My plan'],
  'Small talk': ['Quick answer', 'A bit more', 'Question back'],
};

export const LENGTH_WORDS: Record<BuilderLength, number> = { 20: 50, 45: 110, 90: 220 };
const LEVEL_TEXT: Record<BuilderLevel, string> = { Simple: 'Simple (B1)', Natural: 'Natural (B2)', Fluent: 'Fluent (C1)' };

export interface BuilderQuestion {
  question: string;
  slots: string[];
}

export async function builderQuestion(cfg: GeminiConfig, profile: Profile, topic: string, qtype: QuestionType, past: string[]): Promise<BuilderQuestion> {
  const prompt = `Learner profile:
${profileText(profile)}

Topic: ${topic}
Question type: ${qtype}

Write ONE casual conversation question of this type, like a friendly message in a Discord voice chat.
- It must clearly be about the topic; use the profile only to personalise it.
- It must truly match the question type: Opinion = is X good/bad, should X happen; Experience = tell me about a time; Compare = A or B; Describe = what is X like; Hypothetical = what would you do if; Small talk = light everyday chat.
- 1-2 short sentences, easy B1 words, open-ended (not yes/no).
- Clearly different from these past questions: ${past.length ? past.slice(-40).map((q) => `"${q}"`).join('; ') : '(none yet)'}
Also return "slots": the answer structure for this question type, in order:
- Opinion: ["Stance","Reason","Example","Wrap-up"]
- Experience: ["Situation","What happened","How I felt","Lesson"]
- Compare: ["Both sides","My pick","Why"]
- Describe: ["Overview","Detail 1","Detail 2","Why it matters"]
- Hypothetical: ["My choice","Reason","My plan"]
- Small talk: ["Quick answer","A bit more","Question back"]
JSON shape: {"question": string, "slots": [string]}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'builder-question', TONE, [{ role: 'user', text: prompt }], 1.0);
  const question = str(r.question);
  if (!question) throw new Error('The AI did not return a question. Please try again.');
  const slots = arr<string>(r.slots).map((x) => str(x)).filter(Boolean).slice(0, 5);
  return { question, slots: slots.length >= 2 ? slots : DEFAULT_SLOTS[qtype] };
}

export interface IdeaRow {
  slot: string;
  options: string[];
}

export async function builderIdeas(cfg: GeminiConfig, profile: Profile, qtype: QuestionType, question: string, slots: string[]): Promise<IdeaRow[]> {
  const prompt = `Learner profile:
${profileText(profile)}

Question (${qtype}): ${question}
Answer parts: ${JSON.stringify(slots)}

For EACH answer part, give 4 short idea options the learner can tap (3-8 words each, plain English, no full sentences).
- Options must be meaningfully different (e.g. for a stance: agree, disagree, it depends, mixed).
- Make at least 2 options per part fit the learner's real life from the profile; never state invented specific events, dates or numbers.
- Use everyday words a B1 learner already knows passively.
JSON shape: {"rows": [{"slot": string, "options": [string, string, string, string]}]}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'builder-ideas', TONE, [{ role: 'user', text: prompt }], 0.9);
  const rows = arr<Record<string, unknown>>(r.rows).map((x) => ({ slot: str(x?.slot), options: arr<string>(x?.options).map((o) => str(o)).filter(Boolean).slice(0, 5) }));
  // Keep the slot order we asked for; match rows by name, then by position.
  const out = slots.map((slot, i) => {
    const row = rows.find((x) => x.slot.toLowerCase() === slot.toLowerCase()) || rows[i];
    return { slot, options: row?.options || [] };
  });
  if (!out.some((x) => x.options.length)) throw new Error('The AI did not return any ideas. Please try again.');
  return out;
}

export interface BuilderAnswer {
  answer: string;
  parts: BuilderPart[];
  phrases: PhraseItem[];
  /** slot -> the idea actually used (the learner's picks, or what the AI chose). */
  ideas: Record<string, string>;
}

/** Where the ideas come from: the learner's picks, the AI (auto-pick), or the daily question's idea starters. */
export type IdeaSource = 'picked' | 'auto' | 'starters';

/** Guess the question type from its wording (no AI call); Opinion when unsure. */
export function inferQuestionType(q: string): QuestionType {
  const t = q.toLowerCase();
  if (/\b(what would you|would you rather|if you (could|had|were|won)|imagine)\b/.test(t)) return 'Hypothetical';
  if (/\b(tell me about a time|have you ever|the last time|a time when|what happened when|describe a time)\b/.test(t)) return 'Experience';
  if (/\b(prefer|which is better|which do you|\bvs\.?\b|better:)/.test(t)) return 'Compare';
  if (/\b(what('s| is| are) .{1,40} like|describe)\b/.test(t)) return 'Describe';
  if (/\b(do you think|should|is it|are .{1,30} (good|bad)|agree|opinion|worth it|overrated|replace)\b/.test(t)) return 'Opinion';
  if (/\b(how was your|what are you up to|weekend|any plans|how's your)\b/.test(t)) return 'Small talk';
  return 'Opinion';
}

export async function builderAnswer(
  cfg: GeminiConfig,
  profile: Profile,
  qtype: QuestionType,
  question: string,
  slots: string[],
  picks: Record<string, string>,
  level: BuilderLevel,
  seconds: BuilderLength,
  source: IdeaSource = 'picked',
): Promise<BuilderAnswer> {
  // Ideas line by source (EL's notes, Nov 17): picked ideas, idea starters, or the AI chooses (saves the ideas call).
  const ideasLine =
    source === 'auto'
      ? 'The learner skipped picking ideas. For each answer part, choose one natural, realistic idea that fits their profile; still never invent specific events, dates or numbers.'
      : source === 'starters'
        ? `The learner was given these idea starters: ${JSON.stringify(picks)}\nThe learner did not pick ideas. Choose the most natural stance yourself and build the answer from the idea starters given.`
        : `The learner picked these ideas (part -> idea): ${JSON.stringify(picks)}`;
  const prompt = `Learner profile:
${profileText(profile)}

Question (${qtype}): ${question}
Answer parts in order: ${JSON.stringify(slots)}
${ideasLine}
Level: ${LEVEL_TEXT[level]}. Target length: about ${seconds} seconds of speech (~${LENGTH_WORDS[seconds]} words).

Write a natural SPOKEN answer, like a real person on Discord (contractions, friendly), built ONLY from ${source === 'picked' ? 'the picked ideas' : 'these ideas'}, in the order of the answer parts. Do not add new opinions, events, dates or numbers; you may add small natural connecting words and a general example.
Level guide: Simple = short sentences, B1 words; Natural = B2, a few idioms; Fluent = C1, varied linking and idioms.
Then:
- "parts": the answer split into the answer parts (exact sentences from "answer").
- "phrases": 3-5 natural spoken chunks that appear WORD-FOR-WORD in "answer". Skip basic linkers (for example, because, and, so, but). Each with a short simple meaning and a new short example.${source === 'picked' ? '' : '\n- "ideas": for each answer part, the idea you used, as a short label (3-8 plain words).'}
JSON shape: {"answer": string, "parts": [{"slot": string, "text": string}], "phrases": [{"phrase": string, "meaning": string, "example": string}]${source === 'picked' ? '' : ', "ideas": {"<part>": string}'}}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'builder-answer', TONE, [{ role: 'user', text: prompt }], 0.7);
  const answer = str(r.answer);
  if (!answer) throw new Error('The AI did not return a model answer. Please try again.');
  const parts = arr<Record<string, unknown>>(r.parts).map((p) => ({ slot: str(p?.slot), text: str(p?.text) })).filter((p) => p.text);
  // Only keep phrases that really appear in the answer, so the highlight and the scoring line up.
  const low = answer.toLowerCase();
  const all = phraseList(r.phrases);
  const exact = all.filter((p) => low.includes(p.phrase.toLowerCase().replace(/[.,!?…"']+$/, '')));
  const rawIdeas = r.ideas && typeof r.ideas === 'object' && !Array.isArray(r.ideas) ? (r.ideas as Record<string, unknown>) : {};
  const ideaFor = (slot: string) => str(rawIdeas[slot]) || str(Object.entries(rawIdeas).find(([k]) => k.toLowerCase() === slot.toLowerCase())?.[1]);
  const ideas = Object.fromEntries(slots.map((s) => [s, source === 'picked' ? picks[s] || '' : ideaFor(s)]).filter(([, v]) => v));
  return { answer, parts, phrases: (exact.length ? exact : all).slice(0, 5), ideas };
}

// ---------- Listen tab (prompts by EL, tested Nov 16, 2026) ----------
export const LISTEN_LENGTHS: Record<number, number> = { 45: 110, 75: 190, 120: 300 };

export async function listenDrill(cfg: GeminiConfig, profile: Profile, topic: string, level: BuilderLevel, seconds = 75, past: string[] = []): Promise<ListenDrill> {
  const words = LISTEN_LENGTHS[seconds] || 190;
  const prompt = `Learner profile:
${profileText(profile)}

Topic: ${topic}
Level: ${LEVEL_TEXT[level]}

Write a short, natural spoken dialogue (about ${seconds} seconds, ~${words} words) between two friends, Alex and Sam, chatting casually like on a Discord voice call. It must clearly be about the topic.
- Real spoken English: contractions, short turns, reactions ("Oh nice", "Wait, really?"), 1-2 common idioms or phrasal verbs.
- About 9 turns (8-10), taking turns Alex, Sam, Alex... No narration, no names inside the lines.
- Level guide: Simple = B1 words, short sentences; Natural = B2; Fluent = C1, faster-sounding, more idioms.${past.length ? `\n- Make it clearly different from these earlier dialogues: ${past.slice(-10).map((t) => `"${t}"`).join('; ')}` : ''}
Then:
- "questions": 3 multiple-choice questions (4 options, one correct, "answer" = index 0-3): one about the main idea, one about a detail, one about a speaker's feeling or opinion. The answer must be clear from the audio alone.
- "dictation": ONE key sentence copied WORD-FOR-WORD from a line, 8-14 words.
- "keyIdeas": 3-4 short key ideas that are clearly stated in the lines (no guesses), for scoring a retell.
- "phrases": 3-4 natural spoken chunks that appear WORD-FOR-WORD in the lines (skip basic linkers), each with a simple meaning and a new short example.
JSON shape: {"title": string, "lines": [{"speaker": "Alex"|"Sam", "text": string}], "questions": [{"q": string, "options": [string,string,string,string], "answer": number}], "dictation": string, "keyIdeas": [string], "phrases": [{"phrase": string, "meaning": string, "example": string}]}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'listen-drill', TONE, [{ role: 'user', text: prompt }], 0.9);
  const lines: ListenLine[] = arr<Record<string, unknown>>(r.lines)
    .map((l, i) => ({ speaker: (/sam/i.test(str(l?.speaker)) ? 'Sam' : /alex/i.test(str(l?.speaker)) ? 'Alex' : i % 2 ? 'Sam' : 'Alex') as ListenLine['speaker'], text: str(l?.text) }))
    .filter((l) => l.text);
  if (lines.length < 3) throw new Error('The AI did not return a dialogue. Please try again.');
  const questions = arr<Record<string, unknown>>(r.questions)
    .map((q) => {
      const options = arr<string>(q?.options).map((o) => str(o)).filter(Boolean).slice(0, 4);
      const answer = Math.round(Number(q?.answer));
      return { q: str(q?.q ?? q?.question), options, answer: answer >= 0 && answer < options.length ? answer : 0 };
    })
    .filter((q) => q.q && q.options.length >= 2)
    .slice(0, 3);
  const all = lines.map((l) => l.text).join(' ');
  let dictation = str(r.dictation);
  // The dictation sentence must really be in the audio; otherwise use the longest line that fits.
  const flat = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!dictation || !flat(all).includes(flat(dictation))) {
    const cands = lines.flatMap((l) => l.text.match(/[^.!?]+[.!?]*/g) || []).map((x) => x.trim()).filter((x) => { const n = x.split(/\s+/).length; return n >= 6 && n <= 16; });
    dictation = cands.sort((a, b) => b.length - a.length)[0] || lines[0].text;
  }
  const low = all.toLowerCase();
  const ph = phraseList(r.phrases);
  const exact = ph.filter((p) => low.includes(p.phrase.toLowerCase().replace(/[.,!?…"']+$/, '')));
  return {
    title: str(r.title) || 'Listening drill',
    lines,
    questions,
    dictation,
    keyIdeas: arr<string>(r.keyIdeas).map((x) => str(x)).filter(Boolean).slice(0, 4),
    phrases: (exact.length ? exact : ph).slice(0, 4),
  };
}

export async function scoreRetell(cfg: GeminiConfig, drill: ListenDrill, retell: string): Promise<RetellResult> {
  const prompt = `Dialogue the learner heard:
${drill.lines.map((l) => `${l.speaker}: ${l.text}`).join('\n')}
Key ideas: ${JSON.stringify(drill.keyIdeas)}
Target phrases: ${JSON.stringify(drill.phrases.map((p) => p.phrase))}
The learner's 60-second retell (speech transcript, may have no punctuation): """${retell}"""

Score the retell kindly. Count which key ideas they covered (meaning matters, not exact words) and which target phrases they used (allow small variations).
Give ONE practical fluency tip and one short specific praise about something actually visible in the transcript (never claim things you cannot know, like how long or smoothly they spoke). Score 0 ideas covered means a score under 30. Then write a 4-sentence model retell in simple natural spoken English (third person: "Alex and Sam were talking about...") that the learner can shadow.
JSON shape: {"ideasCovered": [string], "ideasMissed": [string], "phrasesUsed": [string], "score": number (0-100), "tip": string, "praise": string, "modelRetell": string}`;
  const r = await generateJSON<Record<string, unknown>>(cfg, 'listen-retell', TONE, [{ role: 'user', text: prompt }], 0.4);
  const list = (v: unknown) => arr<string>(v).map((x) => str(x)).filter(Boolean);
  return {
    retell,
    ideasCovered: list(r.ideasCovered),
    ideasMissed: list(r.ideasMissed),
    phrasesUsed: list(r.phrasesUsed),
    score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
    tip: str(r.tip),
    praise: str(r.praise),
    modelRetell: str(r.modelRetell),
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

// ---------- Pronunciation (audio) ----------
/** 1 = same word, 0 = nothing in common (Levenshtein). */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}
export const PRON_ISSUES = ['final-consonant', 'th', 's-sh', 'stress', 'vowel', 'other'] as const;

/**
 * Pronunciation, fluency and rhythm feedback from the learner's own recording (Gemini inline audio).
 * `expected` = the text they were trying to say (shadowing / builder model answer), if any;
 * `transcript` = what Chrome speech recognition heard (a hint only; it auto-corrects a lot).
 * One call returns: score, short notes, 3–5 problem words, ONE rhythm/linking tip, fillers, long pauses, WPM.
 */
export async function pronunciationCheck(
  cfg: GeminiConfig,
  audio: { mimeType: string; data: string; seconds: number; measured?: { pauses: number; longestPause: number; speechSeconds: number } },
  opts: { expected?: string; transcript?: string; context?: string; accent?: 'US' | 'UK' },
): Promise<PronunciationResult> {
  const accent = opts.accent === 'UK' ? 'UK' : 'US';
  const accentName = accent === 'UK' ? 'British (UK)' : 'American (US)';
  const prompt = `You are listening to a recording of a Vietnamese learner of English (B1–B2) speaking${opts.context ? ` (${opts.context})` : ''}.
${opts.expected ? `They were trying to say: """${opts.expected.slice(0, 1500)}"""` : 'They were answering freely (no script).'}
${opts.transcript ? `Browser speech recognition heard (a rough hint only: it auto-corrects mistakes and drops fillers, so trust the AUDIO, not this text): """${opts.transcript.slice(0, 1500)}"""` : ''}
The recording is about ${Math.round(audio.seconds)} seconds long.
The learner is copying a standard ${accentName} accent: judge sounds against that accent and write every tip and IPA for it.

Step 1 – transcribe EXACTLY what you hear, word for word, including every hesitation (um, uh, er) and filler phrase (like, you know, I mean). Use normal spelling.
Step 2 – coach their pronunciation. Prioritise the problems Vietnamese speakers typically have:
1. dropped or swallowed FINAL consonants and endings (-s, -ed, -k, -t, -nths: "asked" said as "ask", "months" as "mon"),
2. "th" said as t/d/s/z ("think" as "tink", "three" as "tree", "the" as "de"),
3. s vs sh confusion (see/she, sort/short),
4. wrong WORD STRESS and flat sentence intonation.
Only report problems you clearly hear in THIS audio. Do not invent problems, do not repeat these examples unless you really hear them, and never comment on grammar or word choice.

Rules:
- "words": the 3 to 5 most useful problem words (fewer if the speech was good; never more than 5). "word" = the word they MEANT, spelled correctly (if the hint or your transcript contains the mispronounced form, e.g. "tree" for three or "ask" for asked, still give the intended word). For each: "heard" = roughly what it sounded like (simple spelling), "issue" = one of ${JSON.stringify(PRON_ISSUES)}, "tip" = ONE short, simple, practical tip for that word (max 14 words; show stress with capitals, e.g. "de-VEL-op"), "ipa" = standard ${accent} IPA of the word.
- "rhythmTip": ONE linking/rhythm tip for the whole answer using a phrase they actually said (e.g. "want to → wanna", "a lot of → a-lo-dəv"). Max 20 words.
- "wellDone": one specific thing they did well (max 15 words).
- "clarity", "intonation", "pace": one short sentence each (max 14 words).
- "fillers": counts of every hesitation/filler you transcribed, e.g. {"um": 2, "uh": 1, "like": 1, "you know": 1}. Count "like"/"so" only when used as a filler. {} if none.
- "longPauses": number of silent gaps longer than 1.5 seconds between words (ignore silence at the very start and end). "longestPause": the longest gap in seconds (0 if none).
- "wpm": speaking speed in words per minute if you can estimate it, else 0.
- "score": 0–100 overall pronunciation (85+ very clear, 70–84 clear with a few slips, 50–69 understandable but effortful, under 50 hard to understand). If there is no speech: score 0, empty lists.
Keep every note short and kind: this is coaching, not a wall of red.
JSON shape: {"transcript": string, "fillers": {"<filler>": number}, "longPauses": number, "longestPause": number, "wpm": number, "score": number, "clarity": string, "intonation": string, "pace": string, "words": [{"word": string, "heard": string, "issue": string, "tip": string, "ipa": string}], "rhythmTip": string, "wellDone": string}`;
  const turns: GeminiTurn[] = [{ role: 'user', text: prompt, audio: { mimeType: audio.mimeType, data: audio.data } }];
  const r = await generateJSON<Record<string, unknown>>(cfg, 'pronunciation', TONE, turns, 0.2);
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fillers: Record<string, number> = {};
  const rawF = r.fillers && typeof r.fillers === 'object' && !Array.isArray(r.fillers) ? (r.fillers as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(rawF)) {
    const key = k.toLowerCase().replace(/[^a-z ]/g, '').trim();
    const c = Math.max(0, Math.round(n(v)));
    if (key && c) fillers[key] = (fillers[key] || 0) + c;
  }
  // Models sometimes return the word as it sounded ("tink"); map it back to the word the learner meant
  // using the script / speech-recognition hint (which spells words correctly).
  const hintWords = Array.from(new Set(`${opts.expected || ''} ${opts.transcript || ''}`.toLowerCase().match(/[a-z']+/g) || []));
  const fixWord = (w: string): string => {
    const k = w.toLowerCase();
    if (!hintWords.length || hintWords.includes(k)) return w;
    let best = '', bestSim = 0;
    for (const h of hintWords) { const sim = similarity(k, h); if (sim > bestSim) { best = h; bestSim = sim; } }
    return bestSim >= 0.6 ? best : w;
  };
  const seen = new Set<string>();
  const words: PronWord[] = arr<Record<string, unknown>>(r.words)
    .map((w) => ({
      word: fixWord(str(w?.word).replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '')),
      heard: str(w?.heard),
      issue: (PRON_ISSUES as readonly string[]).includes(str(w?.issue)) ? str(w?.issue) : 'other',
      tip: str(w?.tip),
      ipa: str(w?.ipa).replace(/^\/|\/$/g, ''),
    }))
    // A "th" problem reported on a word with no "th" is the heard form ("tree", "tink"): restore it.
    .map((w) => {
      if (w.issue !== 'th' || /th/i.test(w.word) || !/^[td]/i.test(w.word)) return w;
      const fixed = w.word.replace(/^[td]/i, 'th');
      // Only when the repaired word was really said/meant (so "to"/"do" never become "tho").
      return hintWords.includes(fixed.toLowerCase()) ? { ...w, heard: w.heard || w.word, word: fixed } : w;
    })
    .filter((w) => w.word && w.tip && !seen.has(w.word.toLowerCase()) && seen.add(w.word.toLowerCase()))
    .slice(0, 5);
  const transcript = str(r.transcript) || opts.transcript || '';
  // Pauses and speed: measured from the waveform when possible (models are poor at timing silence).
  const m = audio.measured;
  const fillerWords = Object.values(fillers).reduce((a, b) => a + b, 0);
  const spoken = transcript.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length - fillerWords;
  const rawWpm = m && m.speechSeconds >= 3 && spoken > 3 ? Math.round((spoken / m.speechSeconds) * 60) : 0;
  const measuredWpm = rawWpm >= 40 && rawWpm <= 260 ? rawWpm : 0; // outside this range the measurement is not trustworthy
  const wpm = measuredWpm || Math.round(n(r.wpm));
  return {
    score: Math.max(0, Math.min(100, Math.round(n(r.score)))),
    transcript,
    clarity: str(r.clarity),
    intonation: str(r.intonation),
    pace: str(r.pace),
    wpm: wpm > 20 && wpm < 400 ? wpm : undefined,
    fillers,
    fillerTotal: Object.values(fillers).reduce((a, b) => a + b, 0),
    longPauses: m ? m.pauses : Math.max(0, Math.round(n(r.longPauses))),
    longestPause: m ? (m.longestPause || undefined) : n(r.longestPause) > 0 ? Math.round(n(r.longestPause) * 10) / 10 : undefined,
    words,
    rhythmTip: str(r.rhythmTip),
    wellDone: str(r.wellDone),
    seconds: audio.seconds,
    createdAt: Date.now(),
  };
}
