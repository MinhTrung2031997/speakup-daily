// "Say it better" from Vietnamese. Written by EL for ET. No imports (same style as learnPrompts.ts).
// Flow: Trung says/types a thought in Vietnamese (or mixed Viet-English) -> 3 natural English versions
// -> he picks one -> hears it (TTS) -> shadows it (pronunciationCheck) -> says it his own way
// (gradeSayItBetterPrompt) -> key phrase goes into Learn reviews (origin 'sayitbetter').

export interface SayVersion {
  style: 'casual' | 'neutral' | 'polished';
  english: string;          // the full natural sentence(s)
  keyPhrase: string;        // the most useful chunk to learn, e.g. "I'm kind of burned out"
  meaning: string;          // simple English, <= 12 words
  whyNatural: string;       // one short line: why a native speaker would say it this way
}
export interface SayItBetter {
  understood: string;       // short English gloss of what he meant (so he can check it was understood)
  literalTrap: string;      // the word-for-word English a Vietnamese speaker might say, or "" if none
  versions: SayVersion[];   // exactly 3: casual (Discord), neutral (everyday), polished (work/meeting)
  tip: string;              // one tip about the Viet->English difference here (tense, article, word order, collocation)
}

export function sayItBetterPrompt(input: string, context = ''): string {
  return `The learner is a Vietnamese adult (around B1-B2) who knows many English words passively but tends to translate word for word from Vietnamese.
He wants to say this (Vietnamese, or mixed Vietnamese and English; may be a voice transcript without accents or punctuation): """${input}"""
${context ? `Situation: ${context}\n` : ''}
1. "understood": in one short English sentence, what he means. If the input is ambiguous, pick the most likely everyday meaning.
2. "literalTrap": the unnatural word-for-word English he would probably produce (e.g. "I very like it", "It makes me feel boring"), or "" if a direct translation is already natural.
3. "versions": exactly 3 natural spoken versions that keep his meaning, not more formal than needed:
   - "casual": how a friend would say it on Discord or over coffee (contractions, light slang is fine, no rare idioms).
   - "neutral": clear everyday English that works anywhere.
   - "polished": for work, a meeting or an interview.
   Each 1-2 short sentences, high-frequency words, sounds good when spoken aloud. Do not add new facts, feelings or details he did not say.
   For each, give "keyPhrase" (the most useful reusable chunk, 2-6 words, copied exactly from "english"), "meaning", and "whyNatural" (one short line).
4. "tip": ONE practical tip about the difference between Vietnamese and English that matters here (tense, articles, plurals, word order, adjective -ed/-ing, collocation). Keep it under 25 words.

Reply with JSON only. JSON shape: {"understood": string, "literalTrap": string, "versions": [{"style": "casual"|"neutral"|"polished", "english": string, "keyPhrase": string, "meaning": string, "whyNatural": string}], "tip": string}`;
}

export interface SayGrade {
  meaningKept: boolean;
  level: 'natural' | 'understandable' | 'off';
  usedKeyPhrase: boolean;
  feedback: string;         // one short, kind line
  betterSentence: string;   // his attempt rewritten naturally, keeping his words where possible
}

// After shadowing, he says the idea again in his own words (voice transcript). Grade it.
export function gradeSayItBetterPrompt(meaning: string, target: string, keyPhrase: string, transcript: string): string {
  return `The learner wanted to say: ${meaning}
A model version was: "${target}" (key phrase: "${keyPhrase}")
Now he said it again in his own words. Voice transcript (may lack punctuation or have small recognition errors): """${transcript}"""

He does NOT need to copy the model. Judge whether his own sentence carries the same meaning and sounds natural. Tolerate transcription slips.
Levels:
- "natural": meaning kept, grammar and word choice sound like a fluent speaker.
- "understandable": meaning kept but there is a form slip (tense, article, preposition, word-for-word phrasing).
- "off": meaning lost or changed, or not really an attempt.
"usedKeyPhrase": true if the key phrase or a close variant appears.
"feedback": one short, kind, specific line (what was good or the one thing to fix). Never comment on pronunciation or fluency; you only see text.
"betterSentence": his attempt rewritten naturally, keeping his own words where possible.

Reply with JSON only. JSON shape: {"meaningKept": boolean, "level": "natural"|"understandable"|"off", "usedKeyPhrase": boolean, "feedback": string, "betterSentence": string}`;
}

// Quick-start ideas shown under the input box when it's empty (Vietnamese thoughts he might want to say).
export const SAY_STARTERS: string[] = [
  'Dạo này mình hơi mệt, chắc tại làm nhiều quá',
  'Mình không chắc lắm, để mình suy nghĩ thêm đã',
  'Quán này đồ ăn ngon mà giá cũng hợp lý',
  'Kẹt xe quá nên mình tới trễ, xin lỗi nha',
  'Mình đồng ý một phần, nhưng mình nghĩ còn tùy',
  'Cuối tuần này mình định đi đâu đó cho thư giãn',
  'Nói thật là mình chưa quen lắm với chuyện này',
  'Ý bạn là sao? Bạn nói lại được không?',
];
