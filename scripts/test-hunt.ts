// Unit tests for the word tracker logic (pure code, no network).
// Run: npx esbuild scripts/test-hunt.ts --bundle --platform=node --outfile=/tmp/test-hunt.cjs && node /tmp/test-hunt.cjs
import { activationDates, analyzeOverused, countPhrase, naturalCount, pickTargets, sentencesWith, type SpokenAnswer } from '../src/lib/hunt';
import type { HuntDay, HuntUse, Phrase } from '../src/lib/types';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };

const ph = (phrase: string, createdAt: number): Phrase => ({ id: phrase, phrase, meaning: 'm', example: '', source: '', createdAt, addedDate: '2026-11-20', stage: 0, due: '2026-11-21', reviews: [] });
const use = (phrase: string, ref: string, level: HuntUse['level'], at: number, date = '2026-11-26'): HuntUse => ({ id: `${ref}|${phrase}`, date, phrase, ref, source: 'daily', level, evidence: '', note: '', better: '', question: '', createdAt: at });

// Active only after Natural in 3 DIFFERENT answers
let uses: HuntUse[] = [use('wiped out', 'a1', 'natural', 1), use('wiped out', 'a1', 'natural', 2), use('wiped out', 'a2', 'natural', 3)];
ok('same answer twice counts once', naturalCount(uses, 'wiped out') === 2);
uses.push(use('wiped out', 'a3', 'forced', 4));
ok('forced/misused/absent do not count', naturalCount(uses, 'wiped out') === 2);
uses.push(use('wiped out', 'a4', 'natural', 5, '2026-11-28'));
ok('3 different natural answers = active', naturalCount(uses, 'wiped out') === 3);
ok('activation date is the 3rd distinct answer', activationDates(uses).get('wiped out') === '2026-11-28');

// Target picking
const phrases = [ph('wiped out', 1), ph('pay off', 5), ph('take the lead', 4), ph('out of my depth', 3), ph('run down', 2), ph('a very long phrase that has too many words', 9)];
const t1 = pickTargets(phrases, uses, [], 'What do you do to relax?', '2026-11-29').map((t) => t.phrase);
ok('picks 3 newest, not the active one, not too long', t1.length === 3 && !t1.includes('wiped out') && !t1.some((p) => p.split(' ').length > 6) && t1[0] === 'pay off', t1.join(' | '));
const t2 = pickTargets(phrases, uses, [], 'Is it worth it to pay off a loan early?', '2026-11-29').map((t) => t.phrase);
ok('a word spelled out in the question is skipped', !t2.includes('pay off'), t2.join(' | '));
const prog = [use('run down', 'b1', 'natural', 1, '2026-11-25')];
const t3 = pickTargets(phrases, [...uses, ...prog], [], 'q', '2026-11-29').map((t) => t.phrase);
ok('one in-progress word comes first', t3[0] === 'run down', t3.join(' | '));
const days: HuntDay[] = [{ id: 'd', date: '2026-11-28', targets: [{ phrase: 'pay off', meaning: '' }, { phrase: 'take the lead', meaning: '' }, { phrase: 'out of my depth', meaning: '' }], createdAt: 1 }];
const t4 = pickTargets(phrases, uses, days, 'q', '2026-11-29').map((t) => t.phrase);
ok('yesterday’s targets rotate out when others exist', t4[0] === 'run down' && !t4.slice(0, 1).includes('pay off'), t4.join(' | '));
ok('no phrases saved -> no targets', pickTargets([], [], [], 'q', '2026-11-29').length === 0);

// Counting
ok('countPhrase: whole words, case-insensitive', countPhrase('Very very good. Everything is very nice, a lot.', 'very') === 3 && countPhrase('every', 'very') === 0);
ok('countPhrase: multi-word', countPhrase('I think it works. I  think so. I thought', 'i think') === 2);
ok('countPhrase: apostrophes are kept inside words', countPhrase("it's real", 'it') === 0);

const mk = (i: number, text: string): SpokenAnswer => ({ id: `x${i}`, date: '2026-11-2' + (i % 10), text, at: i });
const few = [mk(1, 'very good very good very good'), mk(2, 'very nice')];
ok('fewer than 3 answers -> nothing flagged', analyzeOverused(few).rows.length === 0);
const many = [
  mk(1, 'It was very good. I think it is nice.'), mk(2, 'Actually the food was very nice and really good.'), mk(3, 'I think we should go. It was a good trip, very good.'),
  mk(4, 'Um, I like it. It was very good, you know.'), mk(5, 'We went home.'), mk(6, 'I think so, very much.'),
];
const rep = analyzeOverused(many);
const top = rep.rows[0];
ok('flags words in >=40% of answers, most frequent first', top?.total === 5 && rep.rows.some((r) => r.word === 'very' && r.total === 5 && r.inAnswers === 5) && rep.rows.every((r, i, a) => i === 0 || a[i - 1].total >= r.total), rep.rows.map((r) => `${r.word}×${r.total}`).join(', '));
ok('"i think" flagged separately', rep.rows.some((r) => r.word === 'i think' && r.total === 3));
ok('top 5 at most', rep.rows.length <= 5);
ok('fillers counted separately', rep.fillers.some((f) => f.word === 'um' && f.total === 1) && rep.fillers.some((f) => f.word === 'you know'), rep.fillers.map((f) => `${f.word}×${f.total}`).join(', '));
const trendy = [...Array.from({ length: 5 }, (_, i) => mk(i + 1, 'It was fine.')), ...Array.from({ length: 5 }, (_, i) => mk(i + 6, 'It was very very good, very nice.'))];
ok('trend goes up when recent answers use it more', analyzeOverused(trendy).rows.find((r) => r.word === 'very')?.trend === 'up');
const oneBig = [mk(1, 'x'), mk(2, 'y'), mk(3, 'z'), mk(4, 'It was really, really, really long.')];
ok('flagged when >=3 times in one answer', analyzeOverused(oneBig).rows.some((r) => r.word === 'really' && r.max === 3));
ok('sentencesWith finds his own sentences', sentencesWith(many, 'very', 2).length === 2 && sentencesWith(many, 'very', 2).every((s) => /very/i.test(s)));

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
