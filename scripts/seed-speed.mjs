// Seeds a test account for the Reply speed e2e: onboarded, plus speed rounds 3, 2 and 1 days ago
// (1.8 s, 1.9 s, then a slow 3.2 s) so today's plan picks the speed round as the extra and the level stays easy.
// Usage: TEST_EMAIL=... TEST_PASSWORD=... node scripts/seed-speed.mjs [fast]   ("fast": 3 more rounds under 2 s -> harder level)
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD });
if (error) throw error;
const uid = auth.user.id;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const must = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.message}`); return r; };
const fast = process.argv[2] === 'fast';
if (!fast) {
  must(await sb.from('profiles').upsert({ user_id: uid, name: 'Trung', job: 'software developer' }), 'profile');
  must(await sb.from('user_settings').upsert({ user_id: uid, onboarded: true }), 'settings');
}
const ans = (q, start) => ({ q, level: 'easy', start, missed: start > 3, seconds: 6, speechSeconds: 4, fillers: 1, fillersPerMin: 15, fillerSource: 'gemini', longestPause: 0.6, transcript: 'seeded' });
const rows = (fast ? [[-1, 1.7], [-1, 1.6], [-1, 1.5]] : [[-3, 1.8], [-2, 1.9], [-1, 3.2]]).map(([d, avg], i) => ({
  user_id: uid, round_date: day(d), level: 'easy', start_limit: 3, avg_start: avg, fillers_per_min: 6, longest_pause: 0.9, misses: avg > 3 ? 3 : 0,
  answers: ['Coffee or tea?', 'Beach or mountains?'].map((q) => ans(q, avg)), best_index: 0, worst_index: 1, filler_source: 'gemini',
  created_at: new Date(Date.now() - (10 - i) * 3600e3).toISOString(),
}));
must(await sb.from('quickfire_rounds').insert(rows), 'rounds');
console.log('seeded', uid, fast ? 'fast rounds' : 'base');
