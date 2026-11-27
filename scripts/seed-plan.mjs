// Seeds a test account for the Today's plan e2e: 2 old daily answers (yesterday + 10 days ago, so a redo is overdue),
// 2 phrases due for review, onboarded. Usage: TEST_EMAIL=... TEST_PASSWORD=... node scripts/seed-plan.mjs
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD });
if (error) throw error;
const uid = auth.user.id;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const must = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.message}`); return r; };
must(await sb.from('profiles').upsert({ user_id: uid, name: 'Trung', job: 'software developer' }), 'profile');
must(await sb.from('user_settings').upsert({ user_id: uid, onboarded: true }), 'settings');
const long = (s) => `${s} ${'Honestly I think it depends on the day, but most of the time I try to keep things simple and enjoy the small moments with my friends and family because that is what matters to me in the end.'.repeat(2)}`;
const qs = [
  { d: -10, q: 'What is a food from your hometown that you miss the most?', a: long('I miss pho from my hometown a lot.'), topic: 'Food' },
  { d: -1, q: 'How do you usually spend a rainy Sunday?', a: long('On a rainy Sunday I usually stay home and read.'), topic: 'Weekend' },
];
for (const x of qs) {
  const q = must(await sb.from('daily_questions').insert({ user_id: uid, topic_name: x.topic, question: x.q, starters: [], question_date: day(x.d) }).select('id').single(), 'question');
  must(await sb.from('answers').insert({ user_id: uid, question_id: q.data.id, question: x.q, topic_name: x.topic, answer: x.a, answer_date: day(x.d), input_mode: 'text', upgrade: null }), 'answer');
}
for (const [p, m] of [['on the fence', 'not sure yet'], ['a game changer', 'something that changes a lot']]) {
  must(await sb.from('phrases').insert({ user_id: uid, phrase: p, meaning: m, example: `It was ${p}.`, source: 'seed', added_date: day(-3), stage: 1, due: day(-1), origin: 'manual' }), 'phrase');
}
console.log('seeded', uid);
