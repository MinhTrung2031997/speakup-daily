// End-to-end test against the real Supabase project (never run against real users' accounts).
// Needs a confirmed throwaway user. Usage:
//   npm run build && npx vite preview --port 4173 &
//   TEST_EMAIL=... TEST_PASSWORD=... node scripts/e2e-supabase.mjs
// Covers: sign-in, first-sign-in import of old browser data, re-import dedupe, demo-mode AI,
// upgrade + phrases + fluency, shadowing attempt + recording upload, reload persistence,
// the "AI key not set up yet" message, and sign-out.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = new URL('../screenshots/', import.meta.url).pathname;

const ds = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const flu = (wpm) => ({ words: 60, seconds: 40, wpm, fillers: 3, fillerWords: { uhm: 2, like: 1 }, restarts: 1, restartExamples: ['I think... I think'], pauses: 1, longestPause: 2.4, tip: 'Link ideas with "so".', createdAt: Date.now() - 86400000 });
const legacy = {
  version: 1,
  profile: { name: 'Trung Test', job: 'software developer', city: 'Ho Chi Minh City', hobbies: 'games', goals: 'sound fluent on Discord', level: 'B1–B2 (intermediate)', facts: '' },
  topics: [
    { id: 'work', name: 'Work & Career', emoji: '💼', active: true }, { id: 'tech', name: 'Technology', emoji: '💻', active: false },
    { id: 'daily', name: 'Daily Life', emoji: '☕', active: true }, { id: 'travel', name: 'Travel', emoji: '✈️', active: true },
    { id: 'opinions', name: 'Opinions & Debates', emoji: '🗣️', active: true }, { id: 'hobbies', name: 'Hobbies', emoji: '🎮', active: true },
    { id: 'food', name: 'Food & Culture', emoji: '🍜', active: true }, { id: 'k3j2h1x9abcd', name: 'Football', emoji: '⭐', active: true, custom: true },
  ],
  settings: { apiKey: 'demo', model: 'gemini-flash-lite-latest', dark: false, voiceURI: '', rate: 0.9, onboarded: true, fastMode: true },
  questions: [
    { id: 'oldq1', date: ds(2), topicId: 'work', topicName: '💼 Work & Career', question: 'What does a normal workday look like for you?', starters: ['a', 'b', 'c'], createdAt: Date.now() - 2 * 86400000 },
    { id: 'oldq2', date: ds(1), topicId: 'k3j2h1x9abcd', topicName: '⭐ Football', question: 'Which football team do you follow?', starters: ['a', 'b', 'c'], createdAt: Date.now() - 86400000 },
  ],
  entries: [
    { id: 'olde1', date: ds(2), questionId: 'oldq1', question: 'What does a normal workday look like for you?', topicName: '💼 Work & Career', answer: 'I start at 9 and I code a lot', createdAt: Date.now() - 2 * 86400000,
      upgrade: { natural: 'Honestly, my day starts at nine.', structure: { point: 'p', reason: 'r', example: 'e', wrapUp: 'w' }, phrases: [{ phrase: 'to be honest', meaning: 'm', example: 'e' }], corrections: [], encouragement: 'Nice!' },
      retry: { attempt: 'again', used: ['to be honest'], missed: [], score: 80, tip: 't', praise: 'p', fluency: flu(95) }, fluency: flu(80) },
    { id: 'olde2', date: ds(1), questionId: 'oldq2', question: 'Which football team do you follow?', topicName: '⭐ Football', answer: 'I like Arsenal', createdAt: Date.now() - 86400000 },
  ],
  phrases: [
    { id: 'oldp1', phrase: 'to be honest', meaning: 'm', example: 'e', source: 'q', createdAt: Date.now() - 2 * 86400000, addedDate: ds(2), stage: 1, due: ds(-2), reviews: [{ date: ds(1), sentence: 'To be honest, I love it.', ok: true, feedback: 'Great' }] },
    { id: 'oldp2', phrase: 'on top of that', meaning: 'm', example: 'e', source: 'q', createdAt: Date.now() - 2 * 86400000, addedDate: ds(2), stage: 0, due: ds(1), reviews: [] },
    { id: 'oldp3', phrase: 'the thing is', meaning: 'm', example: 'e', source: 'q', createdAt: Date.now() - 2 * 86400000, addedDate: ds(2), stage: 5, due: '9999-12-31', reviews: [] },
  ],
  chats: [{ id: 'oldc1', date: ds(1), topicName: '⭐ Football', question: 'Which football team do you follow?', messages: [{ role: 'model', text: 'Hey! Who do you support?' }, { role: 'user', text: 'Arsenal!' }], createdAt: Date.now() - 86400000 }],
  speakingLog: { [ds(2)]: 120, [ds(1)]: 60 },
  activityLog: { [ds(2)]: 3, [ds(1)]: 2 },
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });

// Fake speech recognition (same idea as screenshots-speaking.mjs).
await page.evaluateOnNewDocument(() => {
  window.__speechPlans = [];
  class FakeSR {
    constructor() { this._t = []; this._res = []; }
    _emit(r) {
      const results = { length: this._res.length + 1 };
      this._res.forEach((x, i) => (results[i] = x));
      results[this._res.length] = r;
      if (r.isFinal) this._res.push(r);
      this.onresult && this.onresult({ resultIndex: this._res.length - (r.isFinal ? 1 : 0), results });
    }
    start() {
      const plan = window.__speechPlans.shift() || [];
      let t = 0;
      for (const [silence, speakMs, text] of plan) { t += silence + speakMs; this._t.push(setTimeout(() => this._emit({ isFinal: true, 0: { transcript: text }, length: 1 }), t)); }
    }
    stop() { this._t.forEach(clearTimeout); setTimeout(() => this.onend && this.onend(), 30); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
});

const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); console.log(results.at(-1)); };
const clickText = async (text, scope = 'button, a') => {
  const done = await page.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().includes(t) && !b.disabled);
    if (el) { el.click(); return true; }
    return false;
  }, text, scope);
  if (!done) throw new Error(`Could not click "${text}"`);
};
const waitText = (t, timeout = 20000) => page.waitForFunction((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), { timeout }, t);
const bodyHas = (t) => page.evaluate((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), t);

try {
  // Old browser data from the pre-Supabase version
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('speakup:v1', JSON.stringify(s)); }, legacy);
  await page.reload({ waitUntil: 'networkidle0' });

  // 1. Auth required
  await waitText('Sign in to keep your practice saved');
  ok('auth page shown when signed out', true);
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  ok('deep link /phrases also requires sign-in', await bodyHas('Sign in to keep your practice saved'));
  await page.screenshot({ path: `${OUT}20-auth.png` });

  // wrong password
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', 'wrong-password-123');
  await page.click('form button.btn-primary');
  await waitText('Wrong email or password');
  ok('wrong password shows friendly error', true);

  // 2. Sign in
  await page.$eval('#password', (el) => { el.value = ''; });
  await page.click('#password', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await waitText('We found practice saved in this browser');
  ok('signed in; import offer shown on first sign-in', true);
  await page.screenshot({ path: `${OUT}21-import-offer.png` });

  // 3. Import
  await clickText('Import my saved practice');
  await page.waitForFunction(() => !document.body.innerText.includes('We found practice saved'), { timeout: 30000 });
  await page.evaluate(() => { localStorage.setItem('speakup.demo', '1'); });
  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle0' });
  await waitText('Which football team do you follow?');
  ok('imported history visible', await bodyHas('What does a normal workday look like for you?'));
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  await clickText('All phrases');
  await waitText('on top of that');
  ok('imported phrases visible', (await bodyHas('the thing is')) && (await bodyHas('to be honest')));
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle0' });
  ok('imported custom topic visible', await page.evaluate(() => document.body.innerText.includes('Football')));
  ok('empty profile fields filled from old data', await page.evaluate(() => [...document.querySelectorAll('input')].some((i) => i.value === 'software developer')));
  ok('import offer not shown again', !(await bodyHas('We found practice saved')));

  // 4. Re-import the same data as a JSON file → dedupe
  const file = '/tmp/speakup-legacy-backup.json';
  fs.writeFileSync(file, JSON.stringify(legacy));
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  const input = await page.$('input[type=file]');
  await input.uploadFile(file);
  await waitText('Imported ✓', 30000);
  const msg = await page.evaluate(() => [...document.querySelectorAll('p')].find((p) => p.textContent.includes('Imported ✓'))?.textContent || '');
  ok('re-import skips duplicates', /0 new answers, 0 new phrases, 0 new chats/.test(msg), msg);

  // 5. Demo-mode AI: question, upgrade, phrases, fluency (voice answer)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitText('Idea starters', 20000);
  await page.evaluate(() => window.__speechPlans.push([[600, 3000, 'uhm I think I think Notion is the app I use every day'], [2600, 3000, 'because it help me remember like many task']]));
  await page.evaluate(() => { const b = document.querySelector('button[title="Answer by voice"]'); b.scrollIntoView({ block: 'center' }); b.click(); });
  await sleep(10000);
  await page.evaluate(() => document.querySelector('button[title="Stop recording"]').click());
  await sleep(500);
  await clickText('Upgrade my answer');
  await waitText('What I said');
  ok('demo upgrade works', true);

  // Shadowing: one take with the fake mic (uploads a recording)
  await clickText('Start shadowing');
  await waitText('Sentence 1 of');
  await page.evaluate(() => window.__speechPlans.push([[300, 1000, 'Honestly I would say Notion is the one app I could not live without']]));
  await clickText('Listen & repeat');
  await page.waitForFunction(() => document.body.innerText.includes('Recording…'), { timeout: 15000 });
  await sleep(2000);
  await clickText('Stop');
  await waitText('I heard:');
  ok('shadowing take recorded', true);
  await sleep(4000); // let background saves finish

  // 6. Reload → still there (from the database)
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('What I said', 20000);
  ok('answer + upgrade persist after reload', true);
  await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle0' });
  await waitText('Fluency', 20000);
  await page.screenshot({ path: `${OUT}22-progress-from-db.png`, fullPage: true });
  ok('progress page renders', true);

  // 7. Real AI path without the secret → clear message
  await page.evaluate(() => localStorage.removeItem('speakup.demo'));
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  const demoBox = await page.evaluate(() => [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Demo mode'))?.querySelector('input')?.checked);
  if (demoBox) await page.evaluate(() => [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Demo mode')).querySelector('input').click());
  await sleep(300);
  await clickText('Test connection');
  await page.waitForFunction(() => /AI key not set up yet|Connected:/.test(document.body.innerText), { timeout: 60000 });
  const aiMsg = await page.evaluate(() => (document.body.innerText.match(/(AI key not set up yet[^\n]*|Connected:[^\n]*)/) || [''])[0]);
  ok('AI via edge function responds (nokey message or connected)', true, aiMsg);
  await page.screenshot({ path: `${OUT}23-settings.png`, fullPage: true });

  // 8. Sign out
  await clickText('Sign out');
  await waitText('Sign in to keep your practice saved');
  ok('sign out returns to auth page', true);
} catch (e) {
  ok('unexpected error', false, String(e));
  await page.screenshot({ path: '/tmp/e2e-fail.png', fullPage: true }).catch(() => {});
}

const real = errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of (400|401|503)/.test(e));
console.log(real.length ? `PAGE ERRORS:\n${real.join('\n')}` : 'No page errors');
console.log(results.filter((r) => r.startsWith('FAIL')).length ? 'SOME TESTS FAILED' : 'ALL PASSED');
await browser.close();
