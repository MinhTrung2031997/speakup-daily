export type DiffPart = { text: string; type: 'same' | 'added' | 'removed' };

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/** Word-level diff (LCS) between what the user said and the natural version. */
export function wordDiff(a: string, b: string): { left: DiffPart[]; right: DiffPart[] } {
  const A = a.split(/\s+/).filter(Boolean);
  const B = b.split(/\s+/).filter(Boolean);
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = norm(A[i]) === norm(B[j]) && norm(A[i]) !== '' ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const left: DiffPart[] = [];
  const right: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(A[i]) === norm(B[j]) && norm(A[i]) !== '') {
      left.push({ text: A[i], type: 'same' });
      right.push({ text: B[j], type: 'same' });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      left.push({ text: A[i++], type: 'removed' });
    } else {
      right.push({ text: B[j++], type: 'added' });
    }
  }
  while (i < n) left.push({ text: A[i++], type: 'removed' });
  while (j < m) right.push({ text: B[j++], type: 'added' });
  return { left, right };
}

export function splitSentences(text: string): string[] {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g);
  return (parts || [text]).map((s) => s.trim()).filter(Boolean);
}

export function cleanPhrase(p: string): string {
  return p.replace(/[.…]+$/g, '').replace(/^[.…]+/g, '').trim();
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split text into chunks, marking parts that match any of the phrases (case-insensitive). */
export function markPhrases(text: string, phrases: string[]): { text: string; hit: boolean }[] {
  const cleaned = phrases.map(cleanPhrase).filter((p) => p.length > 1).sort((a, b) => b.length - a.length);
  if (!cleaned.length) return [{ text, hit: false }];
  const re = new RegExp(`(${cleaned.map(escapeRegExp).join('|')})`, 'gi');
  const out: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx), hit: false });
    out.push({ text: m[0], hit: true });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

/** How much of a model sentence the user said: % of its words found (in order) in the transcript. */
export function matchScore(sentence: string, transcript: string): { score: number; words: { text: string; hit: boolean }[] } {
  const { right } = wordDiff(transcript, sentence);
  const words = right.map((p) => ({ text: p.text, hit: p.type === 'same' }));
  const counted = words.filter((w) => norm(w.text) !== '');
  const hits = counted.filter((w) => w.hit).length;
  return { score: counted.length ? Math.round((hits / counted.length) * 100) : 0, words };
}
