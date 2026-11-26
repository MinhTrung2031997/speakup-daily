// Active word hunt + overused-words tracker. Written by EL for ET. No imports.
// A target word counts toward "active" only when graded "natural" in an answer to a question
// that did NOT spell the word out (3 different answers => active). Overused words come from code
// counting (cheap), the AI only suggests swaps.

export type HuntLevel = 'natural' | 'forced' | 'misused' | 'absent';
export interface HuntResult {
  word: string;
  level: HuntLevel;
  evidence: string;   // the exact clause from the transcript, or ""
  note: string;       // one short line: why natural/forced/misused
  better: string;     // for forced/misused: the clause rewritten so the word fits naturally; else ""
}

export function wordHuntPrompt(question: string, transcript: string, targets: { phrase: string; meaning: string }[]): string {
  return `Question the learner answered out loud: ${question}
Voice transcript (may have no punctuation or small recognition errors): """${transcript}"""
Target phrases he was hoping to use (he chose them; they were not shown inside the question): ${JSON.stringify(targets)}

For EACH target, decide one level:
- "absent": the phrase or a close variant (inflection, small transcription slip) does not appear.
- "misused": it appears but with the wrong meaning or a broken form that changes the meaning.
- "forced": correct meaning and grammar, BUT it does not serve what he is saying. Signs of forced use:
   * it could be deleted and the answer would lose nothing, or it repeats what the previous clause already said;
   * it is dropped in as a separate showcase sentence unrelated to the question ("Also, I want to say I get the hang of things");
   * the register clashes badly (a stiff idiom in a casual answer, or slang in a serious point);
   * it is stacked with other target phrases in one sentence just to tick them off;
   * he defines or comments on the phrase instead of using it ("as the phrase 'hit the spot' says").
- "natural": correct meaning and form AND it does real work in his answer: it carries a point, a reason, an example or a reaction that fits the question and the surrounding sentences. Small grammar slips elsewhere in the sentence do not matter.
When unsure between natural and forced, ask: would a fluent speaker answering this question plausibly say this clause? If yes, "natural".
"evidence": copy the clause containing the phrase exactly from the transcript ("" if absent). "note": one short line. "better": for forced or misused, rewrite that clause so the phrase fits naturally in HIS answer; otherwise "".
Use only what is in the transcript. Do not comment on pronunciation or fluency.

Reply with JSON only. JSON shape: {"results": [{"word": string, "level": "natural"|"forced"|"misused"|"absent", "evidence": string, "note": string, "better": string}]}`;
}

// ---- Overused words (code side) ----
// Count these per answer (case-insensitive, word boundaries); flag a word when it appears in >=40% of
// his last 10 answers or >=3 times in one answer. Fillers are counted but shown separately.
export const OVERUSED_CANDIDATES: string[] = [
  'very', 'really', 'so', 'good', 'bad', 'nice', 'thing', 'things', 'stuff', 'a lot', 'many',
  'i think', 'maybe', 'just', 'actually', 'basically', 'important', 'interesting', 'make', 'get', 'because', 'and then',
];
export const FILLERS: string[] = ['uh', 'uhm', 'um', 'er', 'like', 'you know', 'i mean', 'kind of', 'sort of'];

export interface Swap { word: string; swaps: { phrase: string; example: string }[] }

// Ask once per flagged word (cache per word); feed 2 of his real sentences so swaps fit his style.
export function overusedSwapsPrompt(word: string, hisSentences: string[]): string {
  return `A B1-B2 learner overuses the word "${word}". Two of his real sentences: ${JSON.stringify(hisSentences.slice(0, 2))}
Give 3 natural spoken alternatives that a fluent speaker would actually use in sentences like his (not rare or bookish words; phrases are fine, e.g. "very tired" -> "exhausted", "worn out", "running on empty").
For each, rewrite ONE of his sentences using it ("example"), keeping his meaning.

Reply with JSON only. JSON shape: {"word": string, "swaps": [{"phrase": string, "example": string}]}`;
}
