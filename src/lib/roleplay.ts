// Voice conversation partner: role-play scenes, Story bank, Discord group.
// Written by EL for ET. No imports (same style as learnPrompts.ts / sayItBetter.ts).
// Upgrade of the existing Chat tab. Drop-in for src/lib/roleplay.ts. Do not put API keys in this file.
//
// Flow:
//   Role-play — pick a scene -> AI speaks the opener in character -> he replies by voice
//     -> rolePlayTurnPrompt (short in-character line) until the goal is met or turns run out
//     -> rolePlayFeedbackPrompt. Voice-only hides the AI text and starts a 5-second answer timer.
//   Story bank — he tells a personal story -> storyPolishPrompt (his facts only) -> retell with
//     storyRetellCheckPrompt. A saved story can be invited mid-scene via storyHookQuestion.
//   Discord group — 3 friends chat, then pause and cue him to jump in (discordGroupPrompt).
//
// Learner: Trung, Vietnamese adult in Saigon, B1–B2. He knows words passively and wants to
// speak naturally, like people on Discord. Do not centre scenes on his software job.

export type Accent = 'US' | 'UK' | 'AU';
export type SceneGroup = 'Everyday' | 'Social' | 'Travel' | 'Work' | 'Tricky moments';
export type SceneLevel = 'B1' | 'B2';

export interface AiPersona {
  name: string;
  accent: Accent;
  personality: string;
}

export interface Scene {
  id: string;
  title: string;
  emoji: string;
  group: SceneGroup;
  level: SceneLevel;
  setting: string;           // two sentences
  aiRole: string;
  aiPersona: AiPersona;
  learnerGoal: string;
  opener: string;            // the AI's first spoken line; play this with no model call
  targetPhrases: string[];   // 3–4 useful spoken chunks
  twists: string[];          // exactly 2 unexpected turns the AI may introduce, once
  successCheck: string;
}

export const SCENES: Scene[] = [
  {
    id: 'coffee-mixup',
    title: 'Coffee order mix-up',
    emoji: '☕',
    group: 'Everyday',
    level: 'B1',
    setting: 'You are at a busy café and have just been handed a drink. It is not what you ordered, and there is a short queue behind you.',
    aiRole: 'barista',
    aiPersona: { name: 'Maya', accent: 'US', personality: 'upbeat, a little rushed, friendly and easy to talk to' },
    learnerGoal: 'Politely point out the mix-up, say what you actually ordered, and confirm the fix before you leave the counter.',
    opener: "Hey, here's your iced latte! Can I get you anything else?",
    targetPhrases: ['I think this might be the wrong one', 'I actually ordered…', 'No worries, these things happen', 'Could I get that instead?'],
    twists: ['The drink he ordered is sold out now, so she offers two close alternatives.', 'She offers a free upgrade if he can wait a couple of minutes.'],
    successCheck: 'He clearly names the original order, flags the mistake politely, and agrees a fix (new drink, a wait, or something else).',
  },
  {
    id: 'return-item',
    title: 'Returning a faulty item',
    emoji: '📦',
    group: 'Everyday',
    level: 'B1',
    setting: 'You are at a shop returns desk with a small household item that stopped working after a day. You have the receipt on your phone.',
    aiRole: 'shop assistant',
    aiPersona: { name: 'Owen', accent: 'UK', personality: 'polite, a bit formal, sticks to store policy but can be reasoned with' },
    learnerGoal: 'Explain what is wrong, ask for a refund or exchange, and handle a policy wrinkle without getting stuck.',
    opener: 'Hi there, how can I help you today?',
    targetPhrases: ["It stopped working after…", "I'd like to return this", 'I still have the receipt', 'Would it be possible to…'],
    twists: ['The item is one day past the usual 7-day return window.', 'At first he only offers store credit, not a refund.'],
    successCheck: 'He describes the fault, says what he wants (refund or exchange), and responds to the policy wrinkle without giving up.',
  },
  {
    id: 'neighbour-smalltalk',
    title: 'Small talk with a neighbour',
    emoji: '👋',
    group: 'Everyday',
    level: 'B1',
    setting: 'You bump into a neighbour in the hallway of your building. You have waved before but never really stopped to chat.',
    aiRole: 'new neighbour',
    aiPersona: { name: 'Sophie', accent: 'AU', personality: 'warm, chatty, new in the building and glad to make a friend' },
    learnerGoal: 'Keep a short friendly chat going: greet her, share one thing about yourself or the area, and close naturally.',
    opener: "Oh, hey! You're in the next apartment, right? I keep meaning to say hello.",
    targetPhrases: ["I don't think we've officially met", 'How are you settling in?', 'We should catch up sometime', "Anyway, I won't keep you"],
    twists: ['She invites him over for a quick drink this weekend.', 'She asks for a recommendation for a local café or market.'],
    successCheck: 'He greets her, adds at least one personal or local detail, and either answers the invite or ends the chat politely.',
  },
  {
    id: 'party-intro',
    title: "Meeting a friend's friend",
    emoji: '🎉',
    group: 'Social',
    level: 'B1',
    setting: "You are at a birthday party at a rooftop bar. Your friend has just gone to get drinks and left you with someone you do not know.",
    aiRole: "the host's friend",
    aiPersona: { name: 'Nina', accent: 'US', personality: 'outgoing, asks lots of questions, laughs easily' },
    learnerGoal: 'Introduce yourself, find something in common, and keep the chat going for a few turns without going silent.',
    opener: "Hey! I don't think we've met. I'm Nina — I work with Mai. How do you know her?",
    targetPhrases: ['Nice to meet you', 'How do you know…?', 'What a small world', "I'll let you mingle, but it was great chatting"],
    twists: ['She thought he was someone else at first and laughs it off.', 'She offers to introduce him to another small group.'],
    successCheck: 'He introduces himself, answers how he knows the host, and asks Nina at least one question back.',
  },
  {
    id: 'directions-abroad',
    title: 'Asking for directions',
    emoji: '🗺️',
    group: 'Travel',
    level: 'B1',
    setting: 'You are in a new city on holiday and your maps app has just died. You need to get to the train station and are not sure which way to walk.',
    aiRole: 'helpful passer-by',
    aiPersona: { name: 'Tom', accent: 'UK', personality: 'friendly, talks a little fast, explains with local landmarks' },
    learnerGoal: 'Ask for the station clearly, check you understood the directions, and thank him.',
    opener: 'You look a bit lost — you all right? Need a hand?',
    targetPhrases: ["I'm trying to get to…", 'Is it within walking distance?', 'So I go straight and then…?', "Thanks, that's really helpful"],
    twists: ['The nearest station is closed, so he has to send you to another one.', 'He realises he pointed the wrong way and corrects himself.'],
    successCheck: 'He names the destination, repeats or checks at least one step of the directions, and thanks the person.',
  },
  {
    id: 'hotel-checkin',
    title: 'Hotel check-in problem',
    emoji: '🏨',
    group: 'Travel',
    level: 'B2',
    setting: 'You have just arrived at a hotel after a long trip. The receptionist cannot find your booking, and there is a queue behind you.',
    aiRole: 'hotel receptionist',
    aiPersona: { name: 'Claire', accent: 'UK', personality: 'professional, calm, slightly apologetic, wants to fix it' },
    learnerGoal: 'Stay polite, give your booking details, and get a room or a clear next step without getting angry.',
    opener: 'Good evening. Welcome. Can I have the name on the booking, please?',
    targetPhrases: ['I have a reservation under…', 'There must be some mistake', 'Is there anything you can do?', "I'd really appreciate it if…"],
    twists: ['The booking in the system is for tomorrow, not tonight.', 'Only a more expensive room is left tonight, with a possible discount.'],
    successCheck: 'He gives a name and dates, stays polite when the booking is missing, and agrees a concrete fix (a room tonight, a discount, or a call to the booking site).',
  },
  {
    id: 'doctor-appointment',
    title: 'Booking a doctor appointment',
    emoji: '🩺',
    group: 'Everyday',
    level: 'B1',
    setting: 'You are on the phone with a clinic to book a check-up. The receptionist is looking at the calendar while you talk.',
    aiRole: 'clinic receptionist',
    aiPersona: { name: 'Harper', accent: 'US', personality: 'efficient, clear, a little brisk but kind' },
    learnerGoal: 'Explain why you need an appointment, agree a day and time, and confirm the details before hanging up.',
    opener: 'Hello, Riverside Clinic, this is Harper. How can I help you today?',
    targetPhrases: ["I'd like to book an appointment", 'Is there anything available this week?', 'Mornings work better for me', "Just to confirm, that's…"],
    twists: ['The doctor he asks for is fully booked for two weeks.', 'She asks a short question about symptoms before offering a slot.'],
    successCheck: 'He states the reason, picks a time, and repeats the final day and time to confirm.',
  },
  {
    id: 'film-disagree',
    title: 'Disagreeing about a film',
    emoji: '🎬',
    group: 'Social',
    level: 'B2',
    setting: 'You are having coffee with a friend after seeing a film together, and they loved it. You did not.',
    aiRole: 'friend who loved the film',
    aiPersona: { name: 'Ben', accent: 'AU', personality: 'enthusiastic, not easily offended, enjoys a friendly debate' },
    learnerGoal: 'Disagree clearly but kindly, give one reason, and keep the conversation friendly.',
    opener: "Okay, I have to say it — that was easily one of the best films I've seen this year. You loved it too, right?",
    targetPhrases: ['I see what you mean, but…', "It didn't really work for me", 'Fair enough, we can agree to disagree', "Don't get me wrong, I liked…"],
    twists: ['He brings up a scene you actually did like and waits for your take.', "He suggests watching the director's earlier film next."],
    successCheck: 'He disagrees without being rude, gives at least one reason, and either finds a point of agreement or closes politely.',
  },
  {
    id: 'weekend-plans',
    title: 'Making weekend plans',
    emoji: '🗓️',
    group: 'Social',
    level: 'B1',
    setting: 'A friend messages you on Friday afternoon to hang out this weekend. Neither of you has a fixed plan yet.',
    aiRole: 'friend',
    aiPersona: { name: 'Amira', accent: 'UK', personality: 'easy-going, open to ideas, slightly indecisive' },
    learnerGoal: 'Suggest or accept a plan, agree a time and place, and confirm before you say goodbye.',
    opener: "Hey! I've got nothing on this weekend. Fancy doing something?",
    targetPhrases: ["I'm free on…", 'How about we…?', 'What time works for you?', "Let's pencil that in"],
    twists: ['Saturday is suddenly busy for her; only Sunday morning works.', 'She wants to bring another friend along.'],
    successCheck: 'A concrete plan exists (activity, day, time) and he has agreed or offered a clear alternative.',
  },
  {
    id: 'cancel-plans',
    title: 'Cancelling plans politely',
    emoji: '😅',
    group: 'Tricky moments',
    level: 'B2',
    setting: "You agreed to meet a friend for dinner tonight, but something has come up and you need to cancel or reschedule. You are calling a few hours beforehand.",
    aiRole: 'friend who was looking forward to dinner',
    aiPersona: { name: 'Daniel', accent: 'US', personality: 'a bit disappointed at first, reasonable if you are honest and offer a new time' },
    learnerGoal: 'Apologise, give a brief honest reason, and offer a new time.',
    opener: "Hey, I was just about to leave. We're still on for seven, right?",
    targetPhrases: ["I'm really sorry, but I have to cancel", "Something's come up", 'Can we take a rain check?', 'How about we do… instead?'],
    twists: ['He already booked a table and is halfway there.', 'He suggests meeting later tonight instead of another day.'],
    successCheck: 'He apologises, explains briefly, and proposes a new time (or clearly explains why he cannot).',
  },
  {
    id: 'old-friend',
    title: 'Catching up with an old friend',
    emoji: '🤗',
    group: 'Social',
    level: 'B1',
    setting: "You bump into someone you have not seen in a few years at a café. You used to hang out a lot.",
    aiRole: 'old friend',
    aiPersona: { name: 'Grace', accent: 'US', personality: 'warm, curious, a little nostalgic' },
    learnerGoal: 'Catch up: share what you have been up to, ask about their life, and keep the chat going.',
    opener: "Wait — no way! I haven't seen you in years. How have you been?",
    targetPhrases: ["It's been ages", "I've been meaning to get in touch", 'What have you been up to?', 'We should hang out properly sometime'],
    twists: ['She brings up a shared memory he may have half forgotten.', 'She is moving away next month and wants to meet once more.'],
    successCheck: 'He shares at least one update about his life, asks about hers, and reacts to the twist.',
  },
  {
    id: 'interview-yourself',
    title: 'Tell me about yourself',
    emoji: '💼',
    group: 'Work',
    level: 'B2',
    setting: 'You are in a first-round interview for a new role on a general team, not a tech or coding job. The interviewer has just sat down with a notebook.',
    aiRole: 'interviewer',
    aiPersona: { name: 'Ken', accent: 'UK', personality: 'professional, calm, asks clear follow-ups, not unfriendly' },
    learnerGoal: 'Give a short, clear self-introduction (background, what you do well, why you are here) and handle one follow-up.',
    opener: "Thanks for coming in today. To start us off, could you just tell me a little about yourself?",
    targetPhrases: ['To give you a bit of background…', 'What I enjoy most is…', "I'm looking for a role where…", 'One thing I bring is…'],
    twists: ['He asks why you are leaving your current job.', 'He asks for an example of working with a difficult teammate.'],
    successCheck: 'He gives a structured intro (who he is, what he does, why this role) without rambling, and answers the follow-up.',
  },
  {
    id: 'colleague-help',
    title: 'Asking a colleague for help',
    emoji: '🙋',
    group: 'Work',
    level: 'B1',
    setting: 'You are at work, stuck on a task at your desk, and a colleague nearby looks free. This is a general workplace, not a coding team.',
    aiRole: 'colleague',
    aiPersona: { name: 'Rosa', accent: 'US', personality: 'helpful but busy, will help if you ask clearly and specifically' },
    learnerGoal: 'Interrupt politely, explain the problem in one or two sentences, and ask for a specific kind of help.',
    opener: "Hey, you all right? You look like you're in the middle of something.",
    targetPhrases: ['Have you got a minute?', 'I could use a hand with…', "I've already tried…", "I don't want to take up too much of your time"],
    twists: ["She's heading into a meeting in five minutes.", 'She can help later this afternoon if he explains exactly what he needs.'],
    successCheck: "He asks for help politely, says what he's stuck on, and agrees a time or a next step.",
  },
  {
    id: 'funny-story',
    title: 'Telling a funny story',
    emoji: '😂',
    group: 'Social',
    level: 'B2',
    setting: "You are on a voice call with a friend who has just told a clumsy story, and now it is your turn. If you have a polished story in the Story bank, you can use it.",
    aiRole: 'friend on a call',
    aiPersona: { name: 'Felix', accent: 'AU', personality: 'laughs easily, asks for details, a good listener' },
    learnerGoal: 'Tell a short personal story with a beginning, what happened, and an ending, then handle a follow-up question.',
    opener: "Okay, your turn — you've got to have a story like that. What's the funniest thing that's happened to you lately?",
    targetPhrases: ['So, what happened was…', "I couldn't believe it", 'Long story short…', "Looking back, it's funny now"],
    twists: ["He thinks he's heard this story before and jumps in, then realises he hasn't.", 'He asks you to tell the ending again because he was laughing too hard.'],
    successCheck: 'He tells a story with a setup, a what-happened, and an ending, not just one sentence.',
  },
  {
    id: 'noise-complaint',
    title: 'Complaining about noise',
    emoji: '🔊',
    group: 'Tricky moments',
    level: 'B2',
    setting: 'It is late on a weeknight, the neighbour upstairs is playing loud music, and you have to be up early. You are at their door.',
    aiRole: 'neighbour making noise',
    aiPersona: { name: 'Ana', accent: 'US', personality: 'slightly defensive at first, calms down if you stay polite and clear' },
    learnerGoal: 'Explain the problem calmly, say what you need, and reach an agreement without starting a fight.',
    opener: "Oh, hey. Is everything okay? I wasn't expecting anyone.",
    targetPhrases: ["I don't mean to be rude, but…", "It's been going on for a while", 'Would you mind turning it down?', 'I really need to be up early'],
    twists: ["She's having a small birthday gathering and offers to finish by a set time.", "She didn't realise it was that loud and gets embarrassed."],
    successCheck: 'He states the problem and a clear request, stays calm if she pushes back, and agrees a compromise or a time.',
  },
  {
    id: 'repeat-slow-down',
    title: 'Asking someone to slow down',
    emoji: '🎧',
    group: 'Tricky moments',
    level: 'B1',
    setting: 'You are at a ticket desk abroad. The clerk is explaining the options quickly in English, and you have only caught half of it.',
    aiRole: 'ticket clerk',
    aiPersona: { name: 'Mo', accent: 'UK', personality: 'means well, talks fast, will slow down and repeat if you ask clearly' },
    learnerGoal: 'Interrupt politely, ask them to slow down or repeat, and check you have understood the key details (price, time, or ticket type).',
    opener: "Right, so you've got the 14:10 express, that's thirty-eight fifty, or the 14:40 stopping service for twenty-two even, but you'll need to change at Central — which d'you want?",
    targetPhrases: ['Sorry, could you say that again?', 'Could you slow down a little?', 'Do you mean…?', "Just to make sure I've got this right"],
    twists: ['The cheaper ticket is about to sell out.', 'He switches to even more hurried instructions about a platform change.'],
    successCheck: 'He asks the clerk to repeat or slow down at least once, and confirms at least one key detail (time, price, or ticket type).',
  },
];

export interface RolePlayTurn {
  role: 'ai' | 'user';
  text: string;
}

export interface RolePlayTurnOpts {
  voiceOnly: boolean;
  turnsLeft: number;
}

export interface RolePlayTurnResult {
  line: string;
  goalMet: boolean;
  usedTwist: boolean;
  end: boolean;
}

function formatRolePlayHistory(history: RolePlayTurn[]): string {
  if (!history.length) return 'The scene has not started yet. For "line", use the opener (or a very close natural variant).';
  return history.map((t) => `${t.role === 'ai' ? 'Partner' : 'Learner'}: ${t.text}`).join('\n');
}

export function rolePlayTurnPrompt(scene: Scene, history: RolePlayTurn[], opts: RolePlayTurnOpts): string {
  const voiceRules = opts.voiceOnly
    ? `Voice-only mode is ON: the learner cannot read your line, only hear it. Keep it even shorter (one clear sentence plus a short question). Do not refer to anything on a screen. If you offer a choice, give at most two options, spoken clearly.`
    : `Voice-only mode is OFF: he may also see the text, but still write for the ear, not the page.`;
  const closeRule = opts.turnsLeft <= 0
    ? `He has 0 turns left. This line MUST close the scene naturally in character (thanks, a confirmation, a goodbye). Set "end" to true. Set "goalMet" from the success check. Do not start a new question.`
    : `He has ${opts.turnsLeft} learner turn(s) left after this reply. If the goal is already met, you may close now ("end": true) or ask one last short confirm and then end. Otherwise keep the scene going.`;

  return `You are role-playing as ${scene.aiPersona.name}, a ${scene.aiPersona.personality} ${scene.aiRole} (speaking with a ${scene.aiPersona.accent} accent, but do not mention the accent).
Stay in character the whole time. Never break to coach, correct, or comment on his English.

Scene: ${scene.title}
Setting: ${scene.setting}
The learner's goal: ${scene.learnerGoal}
Success check: ${scene.successCheck}
The opener you already used, or will use if the scene has not started: "${scene.opener}"
Target phrases he may try (do not force them, and never list them to him): ${JSON.stringify(scene.targetPhrases)}
Twists you may introduce, at most ONE per scene, and only after he has had at least 2 turns: ${JSON.stringify(scene.twists)}

Transcript so far (his lines are voice transcripts and may lack punctuation or have small recognition errors):
${formatRolePlayHistory(history)}

${voiceRules}
${closeRule}

Write your next spoken line.
- 1–2 short sentences, natural spoken English, contractions. B1–B2 words. Light slang is fine; no rare idioms, no lectures.
- React to what he actually just said. Then ask ONE short follow-up that keeps him talking, unless you are closing the scene.
- If his latest reply is empty, nonsense, or too unclear to follow, respond like a real person ("Sorry, did you say…?") and do not mark the goal met or end the scene (unless he has 0 turns left).
- You may use a twist once. If a previous partner line already introduced one, do not add another; set "usedTwist" to false. Set "usedTwist" true only when THIS line introduces a twist.
- Never correct his grammar or wording mid-scene. No nudges, no "you mean…". Save that for later feedback.
- Do not invent facts about him. Do not mention that this is practice. Do not assume he is a software engineer or bring up coding unless he says it first.
- "goalMet": true only if the transcript already satisfies the success check.
- "end": true when you are closing the scene (goal met, or 0 turns left, or he clearly wants to leave).

Reply with JSON only. JSON shape: {"line": string, "goalMet": boolean, "usedTwist": boolean, "end": boolean}`;
}

export interface RolePlayFix {
  his: string;
  better: string;
  why: string;
}

export interface RolePlayFeedback {
  goalMet: boolean;
  doneWell: string[];       // exactly 2, only from the transcript
  fixes: RolePlayFix[];     // up to 3
  phrasesUsed: string[];
  phrasesMissed: string[];
  nextTimeTry: string;
  score: number;            // 1–10
  scoreReason: string;      // one line
}

export function rolePlayFeedbackPrompt(scene: Scene, history: RolePlayTurn[]): string {
  return `The learner (a Vietnamese adult, around B1–B2) has just finished this role-play.

Scene: ${scene.title}
Setting: ${scene.setting}
His goal: ${scene.learnerGoal}
Success check: ${scene.successCheck}
Target phrases: ${JSON.stringify(scene.targetPhrases)}

Transcript (his lines are voice transcripts and may lack punctuation or have small recognition errors):
${formatRolePlayHistory(history)}

Give brief, warm feedback on the LEARNER's lines only. Use ONLY what is in the transcript. Never comment on pronunciation, fluency, confidence, pauses or speed; you only see text. Do not invent things he did not say. Do not mention his job unless he did.

1. "goalMet": true if the success check is satisfied by his lines.
2. "doneWell": exactly 2 short, concrete things he did well, each pointing at something in the transcript. If the transcript is very thin, still find two honest positives (for example, he greeted clearly, he asked a question back).
3. "fixes": up to 3 "say it better" items, only for lines he actually said. "his" is an exact quote from his transcript, "better" is a natural spoken rewrite that keeps his meaning, "why" is one short line. If there is nothing to fix, return [].
4. "phrasesUsed" / "phrasesMissed": split the target phrases. Count a phrase as used if it or a close variant (inflection or a small transcription slip) appears.
5. "nextTimeTry": ONE practical line for the next attempt (a phrase, a move, or a clearer structure).
6. "score": 1–10 for how natural and complete his wording and ideas were (not pronunciation). Be honest; a very short or incomplete attempt should stay at 3–5.
7. "scoreReason": one short line.

Reply with JSON only. JSON shape: {"goalMet": boolean, "doneWell": [string], "fixes": [{"his": string, "better": string, "why": string}], "phrasesUsed": [string], "phrasesMissed": [string], "nextTimeTry": string, "score": number, "scoreReason": string}`;
}

// ---------- Story bank ----------

export interface StoryPrompt {
  id: string;
  title: string;
  prompt: string;   // the question that elicits the story
  hint: string;
}

export const STORY_PROMPTS: StoryPrompt[] = [
  {
    id: 'a-trip',
    title: 'A trip I took',
    prompt: 'Tell me about a trip you took — near or far. Where did you go, and what stuck with you?',
    hint: 'Start with where and when, then one thing that happened, and how you felt about it.',
  },
  {
    id: 'funny-fail',
    title: 'A funny fail',
    prompt: "Tell me about a time something went wrong and it's funny now. What happened?",
    hint: 'Set the scene, say what went wrong, and end with how you felt looking back.',
  },
  {
    id: 'changed-mind',
    title: 'A time I changed my mind',
    prompt: 'Tell me about a time you changed your mind about someone, something, or a plan. What made you rethink it?',
    hint: 'Say what you used to think, what happened, and what you think now.',
  },
  {
    id: 'best-meal',
    title: "The best meal I've had",
    prompt: "What's the best meal you've had? Where were you, and what made it so good?",
    hint: 'Name the food and the place, add one detail (who you were with, or why it hit the spot).',
  },
  {
    id: 'challenge',
    title: 'A challenge I overcame',
    prompt: 'Tell me about a challenge you overcame. What was hard, and what did you do?',
    hint: 'Keep it personal but everyday — a skill, a fear, a move, or a tough week. Not a speech.',
  },
  {
    id: 'childhood',
    title: 'A childhood memory',
    prompt: "What's a memory from when you were a kid that you still think about? What happened?",
    hint: 'Pick one small scene, not your whole childhood. Who was there, and why do you remember it?',
  },
  {
    id: 'recent-weekend',
    title: 'A recent weekend',
    prompt: 'What did you get up to on a recent weekend? Anything you actually enjoyed?',
    hint: 'Pick one part of the weekend and tell it as a short story, not a full timetable.',
  },
  {
    id: 'mistake',
    title: 'A mistake I learned from',
    prompt: 'Tell me about a mistake you made and what you learned from it. What would you do differently?',
    hint: 'Be honest and brief. What went wrong, what you took from it, and how you handle it now.',
  },
  {
    id: 'meeting-someone',
    title: 'Meeting someone interesting',
    prompt: 'Tell me about a time you met someone interesting. How did you end up talking, and what stuck with you?',
    hint: 'Where you were, how the conversation started, and one thing you remember about them.',
  },
  {
    id: 'job-school-change',
    title: 'A job or school change',
    prompt: 'Tell me about a time you changed jobs or schools. Why did you make the move, and how did it feel at first?',
    hint: 'Keep it about the change and how you felt, not a formal career history. Do not turn it into a tech talk unless that is really the story.',
  },
];

export interface StoryPolish {
  polished: string;
  structure: string;         // Hook -> Context -> What happened -> How it ended -> Point
  phrasesToKeep: string[];   // exactly 3, copied from the polished version
  beats: string[];           // exactly 4 short retell checklist labels
}

export function storyPolishPrompt(slot: StoryPrompt, transcript: string): string {
  return `The learner is a Vietnamese adult (around B1–B2) practising a personal story he can retell in conversation (Discord, a party, a catch-up).

Story slot: ${slot.title}
The question he was answering: ${slot.prompt}
His telling (voice transcript, may lack punctuation or have small recognition errors): """${transcript}"""

Write a polished spoken version of HIS story.
- Keep his facts, people, places, order and feelings. Do not invent details, names, numbers or emotions he did not say. If the transcript is thin, keep the polished version short rather than padding it.
- Length: about 45–60 seconds when spoken aloud (roughly 90–130 words). Contractions, high-frequency words, sounds good out loud. B1–B2, not formal.
- "structure": label the shape as "Hook -> Context -> What happened -> How it ended -> Point" (or a close fit if a part is genuinely missing, and do not invent the missing part).
- "phrasesToKeep": exactly 3 reusable spoken chunks copied exactly from "polished" (2–6 words each) that will help him retell it naturally.
- "beats": exactly 4 short checklist labels he can glance at while retelling (not full sentences), covering the hook, what happened, how it ended, and the point.

Reply with JSON only. JSON shape: {"polished": string, "structure": string, "phrasesToKeep": [string], "beats": [string]}`;
}

export interface StoryRetellCheck {
  beatsCovered: string[];
  beatsMissed: string[];
  phrasesReused: string[];
  fix: RolePlayFix;          // if nothing to fix, use empty strings
}

export function storyRetellCheckPrompt(polished: string, beats: string[], transcript: string): string {
  return `The learner practised retelling his own polished story. He does not need to copy it word for word. Judge whether the beats and useful phrases came through.

Polished version he had practised:
"""${polished}"""

Retell checklist beats: ${JSON.stringify(beats)}

His new telling (voice transcript, may lack punctuation or have small recognition errors): """${transcript}"""

- "beatsCovered" / "beatsMissed": split the checklist beats. A beat is covered if the idea is clearly there, even in different words.
- "phrasesReused": phrases from the polished version (or close variants, including inflection or a small transcription slip) that actually appear in this retell. Do not list phrases that are absent.
- "fix": ONE most useful wording upgrade. "his" is an exact quote from his transcript, "better" is a natural rewrite that keeps his meaning, "why" is one short line. If the retell is already natural and complete, use empty strings.
Use only the transcript. Never comment on pronunciation, fluency, pauses or speed.

Reply with JSON only. JSON shape: {"beatsCovered": [string], "beatsMissed": [string], "phrasesReused": [string], "fix": {"his": string, "better": string, "why": string}}`;
}

// How the role-play / Discord partner can invite a saved story mid-conversation.
export const storyInConversation =
  'When a role-play or Discord turn could naturally invite a personal story, pick one saved Story bank slot (if any) and ask storyHookQuestion(slot.title). Good fits: the "Telling a funny story" and "Catching up with an old friend" scenes, and sometimes "Tell me about yourself", "Meeting a friend\'s friend", or "Making weekend plans"; also a Discord turn with cueType "story". Do not force a story into a task scene (coffee, hotel, doctor, returns, tickets, noise). After he tells it, react like a friend, then continue the scene. If he has no saved story yet, ask a normal question instead.';

const STORY_HOOKS: Record<string, string> = {
  'a-trip': "Hey, you went somewhere a while back, didn't you? How was the trip?",
  'funny-fail': "You've got to tell me about that time things went wrong — what happened?",
  'changed-mind': "Didn't you use to think something totally different about that? What made you change your mind?",
  'best-meal': "What's the best meal you've had? I'm always looking for something good to eat.",
  'challenge': "You got through something pretty tough once, didn't you? How did you handle it?",
  'childhood': "What's a memory from when you were a kid that still makes you smile?",
  'recent-weekend': 'So what did you get up to last weekend?',
  'mistake': 'Have you ever messed something up and actually learned from it? What happened?',
  'meeting-someone': 'Have you met anyone interesting lately? How did you end up talking?',
  'job-school-change': 'What was it like when you changed jobs or schools? How did you decide?',
};

/** Casual question a partner can ask to invite a saved story. Accepts a slot title or id. */
export function storyHookQuestion(slotTitle: string): string {
  const key = slotTitle.trim().toLowerCase();
  if (STORY_HOOKS[key]) return STORY_HOOKS[key];
  const slot = STORY_PROMPTS.find((s) => s.id.toLowerCase() === key || s.title.toLowerCase() === key);
  if (slot && STORY_HOOKS[slot.id]) return STORY_HOOKS[slot.id];
  const label = (slot ? slot.title : slotTitle).trim() || 'that';
  return `Hey, you were going to tell me about ${label.toLowerCase()} — what happened?`;
}

// ---------- Discord group ----------

export interface DiscordFriend {
  name: string;
  accent: Accent;
  vibe: string;
}

export const DISCORD_FRIENDS: DiscordFriend[] = [
  { name: 'Jake', accent: 'US', vibe: 'laid-back gamer, easy-going, keeps things light' },
  { name: 'Priya', accent: 'UK', vibe: 'chatty foodie, curious, jumps in with opinions' },
  { name: 'Liam', accent: 'AU', vibe: 'joker, teases gently, cuts in with asides' },
];

export const DISCORD_TOPICS: string[] = [
  'Weekend plans',
  "A viral video everyone's seen",
  'Food or a new restaurant',
  'A game people are into',
  'A new phone',
  'A short trip or travel idea',
  'A film or show',
  'The rain and weather in Saigon',
  'A concert or live music',
  'Getting back into exercise',
  'A new café nearby',
  'Staying up too late',
];

export type DiscordCueType = 'agree/disagree' | 'follow-up' | 'story' | 'opinion';

export interface DiscordLine {
  speaker: string;   // a friend name, or "Trung" for the learner
  text: string;
}

export interface DiscordTurnResult {
  lines: DiscordLine[];
  cueForTrung: string;
  cueType: DiscordCueType;
  end: boolean;
}

function formatDiscordHistory(history: DiscordLine[]): string {
  if (!history.length) return 'The call has not started yet. Open the topic naturally, then cue Trung.';
  return history.map((l) => `${l.speaker}: ${l.text}`).join('\n');
}

export function discordGroupPrompt(
  topic: string,
  friends: DiscordFriend[],
  history: DiscordLine[],
  turnsLeft: number,
): string {
  const roster = friends.map((f) => `${f.name} (${f.accent}, ${f.vibe})`).join('; ');
  const names = friends.map((f) => f.name);
  const closeRule = turnsLeft <= 0
    ? `This is the last beat. Write 1–2 wrap-up lines (someone has to go, they say bye). The last item in "lines" can be a short sign-off to Trung. Copy that sign-off into "cueForTrung". Set "end" to true. cueType can be "follow-up".`
    : `Trung has ${turnsLeft} jump-in(s) left after this cue. Keep the chat going. Set "end" to false unless he has clearly left.`;

  return `You are writing the next burst of a casual Discord voice-call between friends, then a pause for Trung to jump in.
Friends on the call: ${roster}
Topic: ${topic}
Trung is a Vietnamese adult (around B1–B2) in the same call. Write like real friends, not like a teacher.

Transcript so far (Trung's lines are voice transcripts and may lack punctuation or have small recognition errors):
${formatDiscordHistory(history)}

${closeRule}

Write the next 2–4 short chat lines BETWEEN the friends, then a pause aimed at Trung.
- Each line is 1 short spoken sentence, slang-light, natural, contractions, B1–B2 words. No heavy internet slang, no swearing, no lectures.
- Interruptions are fine: end a cut-off line with "—" and let the next speaker come in.
- React to what Trung last said. Do not ignore him, and do not correct his English.
- Rotate who talks. Only use these speakers: ${JSON.stringify(names)}.
- Do not make the topic about coding or his job unless he brings it up.
- The LAST item in "lines" is the pause: one friend throws a question or a clear opinion at Trung. "cueForTrung" copies that line's text exactly (no speaker prefix). "cueType" is one of: "agree/disagree" (he should take a side), "follow-up" (a question about something just said), "story" (invites a short personal story), "opinion" (asks what he thinks).
- If a story cue fits and you need a question, keep it casual and everyday.

Reply with JSON only. JSON shape: {"lines": [{"speaker": string, "text": string}], "cueForTrung": string, "cueType": "agree/disagree"|"follow-up"|"story"|"opinion", "end": boolean}`;
}
