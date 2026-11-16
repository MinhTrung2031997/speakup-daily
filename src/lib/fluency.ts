import type { FluencyStats } from './types';
import type { SpeechSample } from './speech';

/* Local, AI-free fluency analysis of spoken answers (works in demo mode too). */

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .split(/\s+/)
    .map((w) => ({ raw: w, w: w.replace(/[^\p{L}\p{N}']/gu, '') }))
    .filter((t) => t.w);

/** Single-word hesitation sounds. Variants like "ummm" / "uhhh" are folded in. */
const SOUND_FILLERS: Record<string, string> = { uhm: 'uhm', um: 'um', umm: 'um', uh: 'uh', uhh: 'uh', ah: 'ah', ahh: 'ah', er: 'er', erm: 'er', hmm: 'hmm', mm: 'hmm' };
const foldSound = (w: string) => SOUND_FILLERS[w] || SOUND_FILLERS[w.replace(/(.)\1+$/, '$1$1')] || SOUND_FILLERS[w.replace(/(.)\1+$/, '$1')];

// Words before "like" that make it a real verb ("I like") or comparison ("looks like").
const LIKE_VERB_PREV = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'would', "i'd", "you'd", "we'd", "they'd", "he'd", "she'd", 'do', "don't", 'does', "doesn't", 'did', "didn't", 'really', 'also', 'to', 'not', 'people', 'kids', 'who', 'always', 'never', 'still', 'actually', 'should', 'might', 'will', "won't"]);
const LIKE_COMPARE_PREV = new Set(['look', 'looks', 'looked', 'sound', 'sounds', 'sounded', 'feel', 'feels', 'felt', 'seem', 'seems', 'seemed', 'something', 'anything', 'nothing', 'things', 'stuff', 'more', 'much', 'most', 'exactly', 'just', 'taste', 'tastes', 'smell', 'smells', 'what']);
const DETERMINERS = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'these', 'those', 'me', 'him', 'them', 'us', 'it']);
const BE = new Set(['is', 'was', 'are', 'were', 'be', "it's", "that's", "he's", "she's"]);
const KIND_PREV = new Set(['what', 'this', 'that', 'a', 'the', 'any', 'some', 'every', 'which', 'one', 'same', 'different', 'these', 'those', 'all']);
const KNOW_NEXT = new Set(['how', 'what', 'why', 'where', 'when', 'who', 'if', 'whether', 'him', 'her', 'them', 'it', 'about', 'anything', 'something', 'nothing']);

/** Count filler words/phrases. "like", "kind of", "you know"... are only counted when used as fillers. */
export function countFillers(text: string): { total: number; byWord: Record<string, number> } {
  const toks = tokenize(text);
  const byWord: Record<string, number> = {};
  const add = (k: string) => (byWord[k] = (byWord[k] || 0) + 1);
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i].w;
    const prev = toks[i - 1]?.w || '';
    const next = toks[i + 1]?.w || '';
    const prevEndsClause = !prev || /[,.!?;:…]$/.test(toks[i - 1]?.raw || '');
    const sound = foldSound(w);
    if (sound) {
      add(sound);
    } else if (w === 'like') {
      const isVerb = !prevEndsClause && LIKE_VERB_PREV.has(prev);
      const isCompare = !prevEndsClause && (LIKE_COMPARE_PREV.has(prev) || (BE.has(prev) && DETERMINERS.has(next)) || next === 'this' || next === 'that');
      if (!isVerb && !isCompare) add('like');
    } else if (w === 'you' && next === 'know') {
      if (!['do', 'did', "don't", "didn't", 'if', 'would', 'to'].includes(prev) && !KNOW_NEXT.has(toks[i + 2]?.w || '')) add('you know');
      i++;
    } else if (w === 'i' && next === 'mean') {
      const pausedAfter = /[,.!?;:…]$/.test(toks[i + 1].raw);
      if (prev !== 'what' && prev !== 'that' && (pausedAfter || (toks[i + 2]?.w || '') !== 'it')) add('I mean');
      i++;
    } else if ((w === 'kind' || w === 'sort') && next === 'of') {
      if (!KIND_PREV.has(prev)) add(`${w} of`);
      i++;
    }
  }
  return { total: Object.values(byWord).reduce((a, b) => a + b, 0), byWord };
}

// Legit doubles we shouldn't call restarts.
const OK_REPEATS = new Set(['had had', 'that that', 'bye bye', 'ha ha', 'haha haha', 'very very', 'so so', 'no no']);

/** Back-to-back repeats like "I think I think" or "the the" (hesitation sounds in between are ignored). */
export function findRestarts(text: string): string[] {
  // Don't match across sentence ends ("…I mean? I mean, …").
  return text.split(/[.!?…]+/).flatMap(restartsIn);
}

function restartsIn(text: string): string[] {
  const t = tokenize(text).map((x) => x.w).filter((w) => !foldSound(w));
  const found: string[] = [];
  let i = 0;
  while (i < t.length) {
    let hit = 0;
    for (let len = 4; len >= 1; len--) {
      if (i + len * 2 > t.length) continue;
      const a = t.slice(i, i + len).join(' ');
      const b = t.slice(i + len, i + len * 2).join(' ');
      if (a === b && !OK_REPEATS.has(`${a} ${b}`)) {
        hit = len;
        found.push(a);
        break;
      }
    }
    i += hit || 1;
  }
  return found;
}

/** Speaking time for one sample: from just before the first recognised word to the last result. */
function speakingSeconds(s: SpeechSample): number {
  const start = s.firstResultAt ? Math.max(s.startedAt, s.firstResultAt - 1000) : s.startedAt;
  const end = s.lastResultAt && s.lastResultAt - start >= 1500 ? s.lastResultAt : s.endedAt;
  return Math.max(1, (end - start) / 1000);
}

export function fluencyTip(f: Omit<FluencyStats, 'tip' | 'createdAt'>): string {
  const per100 = (n: number) => (f.words ? (n / f.words) * 100 : 0);
  const topFiller = Object.entries(f.fillerWords).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (f.words < 12) return 'Try to say a bit more: aim for 3–4 sentences with a point, a reason and an example.';
  if (per100(f.fillers) >= 6) {
    const top = Object.entries(f.fillerWords).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => `"${w}"`).join(', ');
    return `You used ${f.fillers} fillers (${top}). When you need time to think, pause silently or use a linking phrase like "The thing is…" instead.`;
  }
  if (f.restarts >= 2) return `You restarted a few times (like "${f.restartExamples[0]}"). Decide your first few words, then keep going even if it isn't perfect.`;
  if (f.pauses >= 2) return 'You had some long pauses. Fill thinking time naturally with "Let me think…" or "Well, honestly…", and plan Point → Reason → Example.';
  if (f.wpm < 90) return 'Your pace is a little slow. Try saying whole chunks like "on top of that" in one breath to sound smoother.';
  if (f.wpm > 170) return 'You speak quite fast! Slow down a little and pause at commas so people can follow your ideas.';
  if (f.fillers > 0) return `Nice flow! Just ${f.fillers} filler${f.fillers > 1 ? 's' : ''}. Try replacing "${topFiller}" with a short silent pause.`;
  return 'Great flow: steady pace, no fillers and no restarts. Keep it up! 🎉';
}

/** Combine the mic sessions of one answer into fluency stats. Returns null if nothing was spoken. */
export function analyzeFluency(samples: SpeechSample[]): FluencyStats | null {
  const spoken = samples.filter((s) => s.transcript.trim());
  if (!spoken.length) return null;
  const text = spoken.map((s) => s.transcript).join(' ');
  const words = tokenize(text).length;
  const seconds = spoken.reduce((a, s) => a + speakingSeconds(s), 0);
  const fill = countFillers(text);
  const restarts = findRestarts(text);
  const pauses = spoken.flatMap((s) => s.pauses);
  const base = {
    words,
    seconds: Math.round(seconds),
    wpm: Math.round(words / (seconds / 60)),
    fillers: fill.total,
    fillerWords: fill.byWord,
    restarts: restarts.length,
    restartExamples: Array.from(new Set(restarts)).slice(0, 3),
    pauses: pauses.length,
    longestPause: pauses.length ? Math.round(Math.max(...pauses) / 100) / 10 : 0,
  };
  return { ...base, tip: fluencyTip(base), createdAt: Date.now() };
}
