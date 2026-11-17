// Runs EL's Replay/Learn prompts against the deployed `ai` Edge Function (real Gemini, key stays in Supabase).
// TEST_EMAIL/TEST_PASSWORD = a throwaway user; VITE_SUPABASE_URL/ANON_KEY from .env.local.
// node --experimental-strip-types scripts/test-learn-prompts.mjs [check|fill|situation|speed|compare|all]
import { createClient } from '@supabase/supabase-js';
import * as P from '../src/lib/learnPrompts.ts';

const URL = process.env.VITE_SUPABASE_URL;
const sb = createClient(URL, process.env.VITE_SUPABASE_ANON_KEY);
const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD });
if (error) throw error;
const token = auth.session.access_token;
const TONE = `You are "Coach Mia", a warm, encouraging English speaking coach for a Vietnamese learner (around B1–B2).
The learner knows a lot of vocabulary but struggles to USE it naturally and logically when speaking.
Always use short, simple English in explanations. Be kind and positive. Never shame mistakes.
Always reply with valid JSON only, exactly in the requested shape.`;

export async function ask(prompt, temperature = 0.4) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${URL}/functions/v1/ai`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', apikey: process.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ system: TONE, turns: [{ role: 'user', text: prompt }], temperature, json: true }) });
    const j = await r.json();
    if (r.ok) { try { return { ...JSON.parse(j.text.replace(/^```(json)?|```$/g, '')), _model: j.model }; } catch { continue; } }
    if (i === 2) throw new Error(JSON.stringify(j));
  }
}

const which = process.argv[2] || 'check';
const REPEAT = Number(process.env.REPEAT || 1);
const BOUNCE = 'share ideas with someone to get their reaction and improve them';
export const CHECK_CASES = [
  // ES's 4 required boundary cases
  ['bounce ideas off', BOUNCE, 'I bounce ideas off my teammates before I code', 'natural', 'ES-1'],
  ['bounce ideas off', BOUNCE, 'I bounce ideas with my teammates', 'understandable', 'ES-2 wrong preposition'],
  ['bounce ideas off', BOUNCE, 'I bounced off ideas from my boss', 'understandable', 'ES-3 word order'],
  ['bounce ideas off', BOUNCE, 'The ball bounced off the wall', 'off', 'ES-4 different meaning'],
  // transcription slips / inflection
  ['get used to', 'become familiar with something so it is no longer strange', 'i got used to working from home after a few months', 'natural', 'slip: got used to'],
  ['get used to', 'become familiar with something so it is no longer strange', 'im getting use to wake up early', 'understandable', 'use to + base verb'],
  ['get used to', 'become familiar with something so it is no longer strange', 'i used to play football when i was a kid', 'off', 'used to = past habit'],
  ['on top of that', 'in addition, besides that (often something bad)', 'the traffic was terrible and on top of that it started raining', 'natural', 'natural no punctuation'],
  ['on top of that', 'in addition, besides that (often something bad)', 'on top of that my laptop is on the desk', 'off', 'physical location'],
  ['on top of that', 'in addition, besides that (often something bad)', 'on the top of that the meeting run late', 'understandable', 'extra "the" + grammar'],
  ['the trade-off is', 'the downside you accept to get a benefit', 'i like remote work but the trade off is i feel lonely sometimes', 'natural', 'hyphen dropped'],
  ['the trade-off is', 'the downside you accept to get a benefit', 'the trade off is that i trade my old phone for a new one', 'off', 'literal trade'],
  ['the trade-off is', 'the downside you accept to get a benefit', 'working from home is cheap the trade off are less teamwork', 'understandable', 'agreement error'],
  ['to be honest', 'saying what you really think', 'to be honestly i dont like meetings', 'understandable', 'honestly form'],
  ['keep in mind', 'remember / consider something', 'i keep my phone in mind when i go out', 'off', 'wrong meaning'],
  ['keep in mind', 'remember / consider something', 'keep in mind that the deadline is friday', 'natural', 'imperative'],
  ['get used to', 'become familiar with something so it is no longer strange', 'i really like coffee in the morning', 'off', 'not used'],
];

if (which === 'check' || which === 'all') {
  let pass = 0, n = 0;
  for (const [w, m, s, want, label] of CHECK_CASES) {
    const got = [];
    for (let k = 0; k < REPEAT; k++) {
      const r = await ask(P.checkWordUsagePrompt(w, m, s), 0.4);
      got.push(r.level); n++; if (r.level === want) pass++;
      if (k === 0) console.log(`${r.level === want ? 'OK  ' : 'MISS'} [${label}] "${s}" -> ${r.level} (want ${want}) used=${r.used} | ${r.feedback} | better: ${r.betterSentence}`);
    }
    if (REPEAT > 1) console.log(`     runs: ${got.join(', ')}`);
  }
  console.log(`checkWordUsage: ${pass}/${n} as expected`);
}

if (which === 'compare' || which === 'all') {
  const bank = ['the trade-off is', 'on top of that', 'bounce ideas off', 'get used to', 'to be honest', 'the thing is'];
  const cases = [
    ['Do you prefer working from home or at the office?', 'i prefer home because no traffic', 'i prefer hybrid work the trade off is i get less quiet time but on top of that i can bounce ideas off my team two days a week so i dont feel stuck', ['the trade-off is', 'get used to'], { targets: ['natural', 'off'], better: true }],
    ['Do you prefer working from home or at the office?', 'i prefer home because no traffic', 'i like hybrid because i can bounce ideas with my team and i got used to the quiet mornings at home', ['bounce ideas off', 'get used to'], { targets: ['understandable', 'natural'], better: true }],
    ['Do you use AI tools at work?', 'yes i use ai tools every day for example copilot helps me write tests faster so i have more time for design', 'ai is good yes i use it', ['to be honest', 'the thing is'], { targets: ['off', 'off'], better: false }],
  ];
  for (const [q, o, n, t, want] of cases) {
    const r = await ask(P.compareAnswersPrompt(q, o, n, bank, t), 0.4);
    const used = P.filterWordsUsed(bank, r.wordsUsed || [], n);
    const lv = (r.targets || []).map((x) => x.level);
    const okT = JSON.stringify(lv) === JSON.stringify(want.targets);
    const okS = want.better ? r.score.new > r.score.old : r.score.new <= r.score.old && r.improved.length === 0;
    console.log(`${okT && okS ? 'OK  ' : 'MISS'} compare "${n.slice(0, 50)}…" targets=${lv.join('/')} (want ${want.targets.join('/')}) score ${r.score.old}->${r.score.new} improved=${r.improved.length} model wordsUsed=${JSON.stringify(r.wordsUsed)} filtered=${JSON.stringify(used)}\n     fixNext: ${r.fixNext}\n     targets: ${r.targets.map((x) => x.fix).join(' | ')}`);
  }
}

if (which === 'fill' || which === 'all') {
  const items = [
    ['on top of that', 'in addition, besides that (often something bad)', 'The project is late, and on top of that the client changed the design.'],
    ['bounce ideas off', BOUNCE, 'I like to bounce ideas off my team before I start coding.'],
    ['get used to', 'become familiar with something', 'It took me a month to get used to the new office.'],
    ['the trade-off is', 'the downside you accept to get a benefit', 'Remote work is flexible, but the trade-off is that I feel lonely.'],
  ];
  for (const [p, m, src] of items) {
    let r = await ask(P.fillInBlankPrompt(p, m, src), 0.8);
    let prob = P.fillBlankProblem(r, p, src);
    if (prob === 'answer index wrong') { r = P.repairFillBlank(r, p); prob = P.fillBlankProblem(r, p, src) + (prob ? ' (index repaired)' : ''); }
    console.log(`${prob && !prob.startsWith(' ') ? 'MISS' : 'OK  '} fill [${p}] ${prob || 'valid'} | ${r.blanked} | ${JSON.stringify(r.options)} -> ${r.options?.[r.answer]}`);
  }
}

if (which === 'situation' || which === 'all') {
  const list = [{ phrase: 'the trade-off is', meaning: 'the downside you accept' }, { phrase: 'bounce ideas off', meaning: BOUNCE }, { phrase: 'get used to', meaning: 'become familiar with' }, { phrase: 'on top of that', meaning: 'in addition (often bad)' }];
  for (let k = 0; k < 3; k++) {
    const r = await ask(P.situationPromptText('Name: Trung\nJob: software developer\nCity: Ho Chi Minh City', list), 0.9);
    const inList = list.some((x) => x.phrase === r.intended);
    const leak = P.sceneLeaks(r.scene, list.map((x) => x.phrase));
    console.log(`${inList && !leak ? 'OK  ' : 'MISS'} situation (${r.setting}) "${r.scene}" say: ${r.sayThis} -> ${r.intended} alsoOk=${JSON.stringify(r.alsoOk)}${leak ? ' LEAK' : ''}`);
  }
}

if (which === 'speed' || which === 'all') {
  const ph = [{ phrase: 'the trade-off is', meaning: 'the downside you accept' }, { phrase: 'bounce ideas off', meaning: BOUNCE }, { phrase: 'get used to', meaning: 'become familiar with' }];
  const cases = [
    ['i work from home now the trade off is i miss my team so sometimes i bounce ideas with them on discord', ['natural', 'understandable', 'off']],
    ['the trade off is less money but more time i always bounce ideas off my friend and i got used to waking up at six', ['natural', 'natural', 'natural']],
    ['uh i like coffee and um i used to play games a lot', ['off', 'off', 'off']],
  ];
  for (const [t, want] of cases) {
    const r = await ask(P.speedRoundPrompt(ph, t), 0.4);
    const lv = r.results.map((x) => x.level);
    console.log(`${JSON.stringify(lv) === JSON.stringify(want) ? 'OK  ' : 'MISS'} speed ${lv.join('/')} (want ${want.join('/')}) tip: ${r.tip}`);
  }
}
