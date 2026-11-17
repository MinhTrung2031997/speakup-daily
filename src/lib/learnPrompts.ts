// Prompts for Replay (re-answer) and Learn highlighted words. Written by EL (el-notes/replay-learn.md),
// tested by ET through the `ai` Edge Function (scripts/test-learn-prompts.mjs). Kept free of imports so the
// test script can load this file directly with Node's type stripping.

export type UsageLevel = 'natural' | 'understandable' | 'off';

export const LEVEL_RUBRIC = `Levels (pick one):
- "natural": meaning, grammar and collocation are all correct. Full review credit.
- "understandable": the meaning is right but the form or collocation is off (e.g. "bounce ideas with my team"). Half credit. Put the fixed sentence in "betterSentence".
- "off": wrong meaning or context, or the phrase was not used. One-line explanation in "feedback". Review next day.`;

export function checkWordUsagePrompt(word: string, meaning: string, userSentence: string): string {
  return `Target phrase: ${word}
Meaning: ${meaning || '(not given)'}

The learner was asked to say a new sentence using this phrase. This is their voice transcript (may have no punctuation or small recognition errors): """${userSentence}"""

Grade the attempt. Be tolerant of transcription slips and minor inflection (e.g. "got used to" or "getting used to" counts as using "get used to"; a missing "the" is fine). Do not count it as natural unless the meaning, grammar and collocation all fit.

${LEVEL_RUBRIC}

Decide in this order:
1. Did they try the phrase (or a close variant)? If not → "off".
2. Does it carry the MEANING above? A literal or physical sense, or a different idiom that shares words (e.g. "used to" for a past habit vs "get used to"), is wrong meaning → "off", even when the grammar is perfect. Also "off" if the phrase is dropped into a sentence where its meaning does not fit what they say (e.g. "in the long run I ate breakfast this morning": nothing about the future, so the phrase's meaning does not fit).
3. Only if the meaning is right: everything correct → "natural"; any form slip (wrong preposition, word order, tense, agreement, an extra or missing small word) → "understandable". Form mistakes alone never make it "off".
"betterSentence": always give their sentence rewritten naturally with correct punctuation (keep their idea); for "off", give a short correct example with the phrase.

Set "used" to true if the phrase or a close variant appears, even if the use is off; false if they never tried it.
"nextReviewDays" is only a hint; the app should apply the schedule below, not the model's number, if they disagree.

JSON shape: {"used": boolean, "level": "natural"|"understandable"|"off", "feedback": string, "betterSentence": string, "nextReviewDays": number}`;
}

// ---------- Compare old vs new answer (Replay) ----------
export interface CompareResult {
  improved: string[];
  fixNext: string;
  wordsUsed: string[];
  structureOld: string;
  structureNew: string;
  score: { old: number; new: number };
  upgradedSentence: string;
  targets: { phrase: string; level: UsageLevel; fix: string }[];
}

export function compareAnswersPrompt(question: string, oldAnswer: string, newAnswer: string, wordBank: string[], targets: string[]): string {
  return `Question: ${question}

The learner's OLD answer (speech transcript, may have no punctuation): """${oldAnswer}"""
The learner's NEW answer (speech transcript, may have no punctuation): """${newAnswer}"""

Word-bank phrases to detect (presence only): ${JSON.stringify(wordBank)}
Target phrases the learner was asked to use (grade each): ${JSON.stringify(targets)}

Compare the two answers fairly. Use ONLY what is visible in the two transcripts. Never praise fluency, confidence, pronunciation, pauses or length unless those words are in the text. Do not invent facts.

1. "improved": 0-3 short, concrete improvements that appear in the new answer but not the old one (for example: added a reason, used a clearer example, fixed a phrase). If the new answer is not better, return [].
2. "fixNext": ONE practical tip for the next attempt, pointing at a real weakness in the new transcript (structure, a missing idea, an unnatural phrase).
3. "wordsUsed": word-bank phrases that actually appear in the NEW answer (allow small inflection or transcription slips, e.g. "got used to" for "get used to"). Do not list phrases that are absent.
4. "structureOld" / "structureNew": a short label for the shape of each answer, e.g. "Point only", "Stance + reason", "Point → Reason → Example → Wrap-up", "Unclear / off topic".
5. "score": old and new scores from 1-10 for ideas, structure and natural wording (not pronunciation). Be honest; a short, thin answer should stay at 3-5. The new score may be lower if the new answer is weaker.
6. "upgradedSentence": pick ONE sentence from the NEW answer and rewrite it more naturally, keeping the same meaning. If the new answer is empty, return "".
7. "targets": one object per target phrase, in the same order:
   - "phrase": the target phrase
   - "level": "natural" | "understandable" | "off". natural = meaning, grammar and collocation all correct (small inflection or transcription slips are fine). understandable = right meaning but the form is off (wrong preposition, word order, tense, agreement). off = not used, or used with a different meaning (form mistakes alone never make it off).
   - "fix": if natural, a short confirmation of how they used it; if understandable, the corrected phrase or clause; if off, one line explaining the miss and a short correct example.

JSON shape: {"improved": [string], "fixNext": string, "wordsUsed": [string], "structureOld": string, "structureNew": string, "score": {"old": number, "new": number}, "upgradedSentence": string, "targets": [{"phrase": string, "level": "natural"|"understandable"|"off", "fix": string}]}`;
}

// ---------- Fill in the blank ----------
export interface FillBlank { sentence: string; blanked: string; options: string[]; answer: number }

export function fillInBlankPrompt(phrase: string, meaning: string, sourceSentence: string): string {
  return `Phrase: ${phrase}
Meaning: ${meaning || '(not given)'}
The sentence this phrase originally came from (do NOT reuse it): """${sourceSentence || ''}"""

Write a NEW, short, everyday spoken sentence that uses the phrase WORD-FOR-WORD and fits the same meaning. Keep the phrase's words together exactly as written above (no extra words inside it, e.g. not "bounce some ideas off" for "bounce ideas off"). Then blank the phrase out with "____" and give 4 options: the correct phrase plus 3 plausible distractors (same kind of phrase, easy to confuse, not joke answers). Each distractor must be clearly WRONG or unnatural in this exact sentence, so only one option fits (no near-synonyms like "the catch is" for "the trade-off is"). Shuffle the options. "answer" is the 0-based index of the correct phrase in "options".

JSON shape: {"sentence": string, "blanked": string, "options": [string, string, string, string], "answer": number}`;
}

// ---------- Situation prompt ----------
export interface Situation { setting: 'work' | 'daily'; scene: string; sayThis: string; intended: string; alsoOk: string[] }

export function situationPromptText(profile: string, phrases: { phrase: string; meaning?: string }[]): string {
  return `Learner profile:
${profile || '(none)'}

Phrase list (the learner can see these and must pick one): ${JSON.stringify(phrases)}

Invent ONE short situation, like a real moment at work or in daily life in the learner's city, where the most natural thing is to use ONE of the phrases. Do not write any of the phrases in the scene itself. Keep the scene to 1-2 short sentences, then a clear "what you should say" instruction (reply in 2-3 spoken sentences).
Return "intended" (the best-fitting phrase from the list, copied exactly) and "alsoOk" (other list phrases that would also fit, or []).

JSON shape: {"setting": "work"|"daily", "scene": string, "sayThis": string, "intended": string, "alsoOk": [string]}`;
}

// ---------- Speed round ----------
export interface SpeedResult { results: { phrase: string; level: UsageLevel; feedback: string; better: string }[]; tip: string }

export function speedRoundPrompt(phrases: { phrase: string; meaning?: string }[], transcript: string): string {
  return `Target phrases: ${JSON.stringify(phrases)}

The learner had 60 seconds to speak and try to use all three phrases. Voice transcript (may have no punctuation or small recognition errors): """${transcript}"""

Grade EACH phrase with the same three levels (natural / understandable / off), in the same order as the list. Be tolerant of transcription slips and minor inflection. natural = meaning, grammar and collocation all correct. understandable = right meaning but the form is off (wrong preposition, word order, tense, agreement). off = missing, or used with a different meaning (form mistakes alone never make it off). Do not praise things you cannot see in the transcript (confidence, speed, pauses).
"better": a natural sentence with the phrase (fix theirs if they tried it).

Give ONE short tip about reaching for the phrases faster or linking them more naturally, based only on the transcript.

JSON shape: {"results": [{"phrase": string, "level": "natural"|"understandable"|"off", "feedback": string, "better": string}], "tip": string}`;
}

// ---------- Code-side checks (never trust the model alone) ----------
const STEM: Record<string, string> = {
  got: 'get', gotten: 'get', getting: 'get', gets: 'get', used: 'use', using: 'use', uses: 'use',
  ideas: 'idea', bounced: 'bounce', bouncing: 'bounce', bounces: 'bounce', felt: 'feel', feeling: 'feel', feels: 'feel',
  caught: 'catch', catching: 'catch', catches: 'catch', made: 'make', making: 'make', took: 'take', taken: 'take', taking: 'take',
  went: 'go', gone: 'go', going: 'go', kept: 'keep', keeping: 'keep', thought: 'think', brought: 'bring', ran: 'run', came: 'come',
};
const tokens = (s: string) => (s || '').toLowerCase().match(/[a-z0-9']+/g) || [];
const stem = (w: string) => STEM[w] || (w.length > 4 && w.endsWith('ed') ? w.slice(0, -2) : w.length > 4 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** True if the phrase (or a light inflection / a couple of inserted words) appears in the text. */
export function phraseInText(phrase: string, text: string, allowMissing = 0): boolean {
  const pw = tokens(phrase).map(stem);
  const tw = tokens(text).map(stem);
  if (!pw.length) return false;
  for (let i = 0; i + pw.length <= tw.length; i++) if (pw.every((w, k) => tw[i + k] === w)) return true;
  // In order, at most 2 extra words between phrase words.
  const inOrder = (pw2: string[]) => {
    for (let start = 0; start < tw.length; start++) {
      if (tw[start] !== pw2[0]) continue;
      let i = 1, gap = 0;
      for (let t = start + 1; t < tw.length && i < pw2.length && gap <= 2; t++) {
        if (tw[t] === pw2[i]) { i++; gap = 0; } else gap++;
      }
      if (i >= pw2.length) return true;
    }
    return false;
  };
  if (inOrder(pw)) return true;
  // Optionally: one small function word swapped or missing ("bounce ideas with" for "bounce ideas off"),
  // but every content word must still be there, and there must be at least 2 of them.
  if (allowMissing > 0) {
    const content = pw.filter((w) => !FUNCTION_WORDS.has(w));
    if (content.length >= 2 && content.length < pw.length && inOrder(content)) return true;
  }
  return false;
}

const FUNCTION_WORDS = new Set(['to', 'be', 'the', 'a', 'an', 'of', 'off', 'on', 'in', 'at', 'with', 'for', 'from', 'up', 'out', 'into', 'about', 'is', 'it', 'that', 'this', 'and', 'or', 'by', 'as']);

/** Keep only bank phrases really present in the answer (one word may be wrong in phrases of 3+ words). */
export function filterWordsUsed(bank: string[], modelList: string[], text: string): string[] {
  const set = new Set(modelList.map((p) => p.toLowerCase().trim()));
  return bank.filter((p) => phraseInText(p, text) || ((set.has(p.toLowerCase().trim()) || tokens(p).length >= 3) && tokens(p).length >= 3 && phraseInText(p, text, 1)));
}

const norm = (s: string) => tokens(s).join(' ');
/** Validate a fill-in-the-blank item; returns a reason string when it should be regenerated. */
export function fillBlankProblem(f: FillBlank | null | undefined, phrase: string, source: string): string {
  if (!f || typeof f.sentence !== 'string' || typeof f.blanked !== 'string' || !Array.isArray(f.options) || f.options.length !== 4) return 'shape';
  if (!norm(f.sentence).includes(norm(phrase))) return 'phrase not in sentence';
  if (norm(f.blanked).includes(norm(phrase))) return 'blank still shows the phrase';
  if (!f.blanked.includes('__')) return 'no blank';
  if (norm(f.options[f.answer] || '') !== norm(phrase)) return 'answer index wrong';
  if (new Set(f.options.map(norm)).size !== 4) return 'duplicate options';
  const a = new Set(tokens(f.sentence)), b = new Set(tokens(source));
  const overlap = [...a].filter((w) => b.has(w)).length / Math.max(1, Math.min(a.size, b.size));
  if (source && (norm(f.sentence) === norm(source) || overlap > 0.8)) return 'too close to source';
  return '';
}

/** Fix an answer index the model got wrong (common), instead of regenerating. */
export function repairFillBlank(f: FillBlank, phrase: string): FillBlank {
  const i = f.options.findIndex((o) => norm(o) === norm(phrase));
  return i >= 0 ? { ...f, answer: i } : f;
}

/** True if the scene leaks one of the list phrases. */
export function sceneLeaks(scene: string, phrases: string[]): boolean {
  return phrases.some((p) => norm(scene).includes(norm(p)));
}
