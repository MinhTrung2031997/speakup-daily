// Voice partner walkthrough (Chat tab): role-play scene (text mode) -> voice-only scene with the 5-second timer, a nudge and auto-send -> Discord group (3 voices) -> Story bank polish + retell -> persistence + delete.
// Usage: TEST_EMAIL=... TEST_PASSWORD=... node --experimental-strip-types scripts/screenshots-partner.mjs  (demo -> 105-*; REAL=1 -> 106-*; REAL=1 BASE=prod -> 107-*)
import puppeteer from 'puppeteer-core';
import { CATALOGUE } from '../src/lib/topics.ts';
import { SCENES, STORY_PROMPTS } from '../src/lib/roleplay.ts';
const norm = (q) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const BANK = new Set(CATALOGUE.flatMap((c) => c.questions.map((q) => norm(q.text))));

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const WAV = process.env.WAV || '';
const PREFIX = process.env.PREFIX || (REAL ? (process.env.BASE ? '107' : '106') : '105');
const OUT = process.env.OUT || new URL('../screenshots/', import.meta.url).pathname;
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// What the test clip says (with planted slips: "ask" for asked, "tree" for three, "tink" for think)
// and what Chrome's recogniser would type (it drops fillers and auto-corrects).
const SAID = 'so I work as a developer last month I asked my team about the three things we think matter it was really useful';
const CLIP_MS = WAV ? 18000 : 4000;
// Demo run uses the UK accent (Listen tab choice) to check tips/playback follow it; the real run uses the default (US).
const ACCENT = process.env.ACCENT || (REAL ? 'US' : 'UK');

const args = ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
if (WAV) args.push(`--use-file-for-fake-audio-capture=${WAV}%noloop`);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await page.evaluateOnNewDocument(() => {
  const voices = [{ name: 'Fake US Joanna', lang: 'en-US', voiceURI: 'us1', default: true, localService: true }, { name: 'Fake UK Amy', lang: 'en-GB', voiceURI: 'gb1', default: false, localService: true }, { name: 'Fake AU Karen', lang: 'en-AU', voiceURI: 'au1', default: false, localService: true }];
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; } };
  let timers = [];
  const synth = {
    speak(u) { window.__spoken.push({ text: u.text, rate: u.rate, lang: u.lang, pitch: u.pitch }); timers.push(setTimeout(() => u.onend && u.onend(), 150)); },
    cancel() { timers.forEach(clearTimeout); timers = []; },
    getVoices: () => voices,
    addEventListener() {}, removeEventListener() {},
    speaking: false, pending: false, paused: false,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
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
      (window.__srLangs = window.__srLangs || []).push(this.lang);
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
const timings = {};
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); console.log(results.at(-1)); };
const clickText = async (text, scope = 'button, a') => {
  const done = await page.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().includes(t) && !b.disabled);
    if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
    return false;
  }, text, scope);
  if (!done) throw new Error(`Could not click "${text}"`);
};
const waitText = (t, timeout = 90000) => page.waitForFunction((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), { timeout }, t);
const bodyHas = (t) => page.evaluate((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), t);
const shotEl = async (name, selector, index = 0) => {
  await sleep(500);
  await page.addStyleTag({ content: 'header, nav { position: static !important; }' });
  const box = await page.evaluate((sel, i) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    el.scrollIntoView({ block: 'start' });
    const r = el.getBoundingClientRect();
    return { x: 0, y: Math.max(0, r.top + window.scrollY - 8), width: window.innerWidth, height: r.height + 16 };
  }, selector, index);
  if (box) await page.screenshot({ path: `${OUT}${name}.png`, clip: box, captureBeyondViewport: true });
  else await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  console.log('saved', name);
};

/** Record with the fake mic: speech recognition types `text`, MediaRecorder records the (WAV) mic. */
const speakIntoMic = async (text, ms = CLIP_MS, last = false) => {
  await page.evaluate((s, d) => window.__speechPlans.push([[400, Math.max(600, d - 1200), s]]), text, ms);
  await page.evaluate((l) => { const all = document.querySelectorAll('button[title="Answer by voice"]'); const b = all[l ? all.length - 1 : 0]; b.scrollIntoView({ block: 'center' }); b.click(); }, last);
  await sleep(ms);
  await page.evaluate(() => document.querySelector('button[title="Stop recording"]').click());
  await sleep(800);
};


const confirmDialog = async (okBtn) => {
  await page.waitForSelector('[data-testid="confirm-dialog"]', { timeout: 5000 });
  const txt = await page.evaluate(() => document.querySelector('[data-testid="confirm-dialog"]').innerText);
  await page.click(okBtn ? '[data-testid="confirm-ok"]' : '[data-testid="confirm-cancel"]');
  await sleep(500);
  return { txt };
};


const T = (s) => page.evaluate((x) => document.querySelector(x)?.innerText || '', s);
const clickSel = async (sel, i = 0) => {
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.evaluate((s, n) => { const all = [...document.querySelectorAll(s)].filter((b) => !b.disabled); const b = n < 0 ? all.at(-1) : all[n]; b.scrollIntoView({ block: 'center' }); b.click(); }, sel, i);
  await sleep(350);
};

// Wait until the app has finished saving to the cloud (a hard reload before that would lose the last change).
const synced = async () => { await sleep(1200); await page.waitForFunction(() => document.documentElement.dataset.saving === '0', { timeout: 60000 }); await sleep(800); await page.waitForFunction(() => document.documentElement.dataset.saving === '0', { timeout: 60000 }); };

// Real run: which accent + voice each natural-voice clip asked for.
const ttsCalls = [];
page.on('request', (r) => { if (r.url().includes('/functions/v1/tts') && r.method() === 'POST') { try { ttsCalls.push(JSON.parse(r.postData() || '{}')); } catch { /* ignore */ } } });
const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const spokenLangs = () => page.evaluate(() => window.__spoken.map((s) => s.lang));
const plan = (text, delay = 400) => page.evaluate((t, d) => window.__speechPlans.push(t ? [[d, 1200, t]] : []), text, delay);
const sendText = async (text) => {
  await speakIntoMic(text, 3000);
  await page.evaluate(() => document.querySelector('button[title="Send"]').click());
};

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); localStorage.setItem('speakup.todayMode', 'daily'); }, REAL);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Sign in to keep your practice saved');
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await page.waitForFunction(() => !document.body.innerText.includes('Sign in to keep your practice saved'), { timeout: 30000 });
  await page.waitForFunction(() => /Tell me about you|Your answer|Get today's question/.test(document.body.innerText), { timeout: 90000 });
  if (await bodyHas('Tell me about you')) {
    await page.type('input[placeholder="Trung"]', 'Trung');
    await page.type('input[placeholder="e.g. software developer"]', 'software developer');
    await clickText('Next');
    await clickText('Start speaking');
    await sleep(1500);
  }

  // 1) Chat tab: 4 modes, free chat still there
  await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="chat-modes"]');
  ok('Chat tab has 4 modes (today\'s topic, role-play, story bank, discord)', (await count('[data-testid="chat-mode"]')) === 4);
  ok('free chat on today\'s topic still works as before', await bodyHas('Start chatting'));

  // 2) Role-play, text mode
  await clickSel('[data-testid="chat-mode"][data-mode="scene"]');
  await page.waitForSelector('[data-testid="scene-card"]');
  ok('16 scenes in 5 groups', (await count('[data-testid="scene-card"]')) === 16 && /tricky moments/i.test(await T('main')), `${await count('[data-testid="scene-card"]')}`);
  await shotEl(`${PREFIX}-1-scenes`, 'main');
  const coffee = SCENES.find((s) => s.id === 'coffee-mixup');
  await clickSel('[data-testid="scene-card"][data-id="coffee-mixup"]');
  await page.waitForSelector('[data-testid="scene-intro"]');
  ok('scene intro shows setting, goal and target phrases', (await T('[data-testid="scene-intro"]')).includes(coffee.learnerGoal) && !!(await page.$('[data-testid="scene-targets"]')));
  const voBox = await page.$eval('[data-testid="voice-only"]', (e) => e.checked);
  if (voBox) await clickSel('[data-testid="voice-only"]');
  const spoken0 = (await page.evaluate(() => window.__spoken.length));
  await clickSel('[data-testid="scene-start"]');
  await page.waitForSelector('[data-testid="turn-ai"]');
  ok('opener shown and played with no model call', (await T('[data-testid="turn-ai"]')).includes(coffee.opener.slice(0, 20)));
  const target = coffee.targetPhrases[0];
  await sleep(REAL ? 6000 : 800);
  await sendText(`Hi, ${target} I ordered an oat latte but this one has regular milk.`);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="turn-ai"]').length >= 2, { timeout: 90000 });
  await sleep(REAL ? 7000 : 800);
  await sendText('Could you make a new one with oat milk please? No worries, I can wait.');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="turn-ai"]').length >= 3, { timeout: 90000 });
  ok('partner replies in character after each turn', (await count('[data-testid="turn-user"]')) === 2 && (await count('[data-testid="turn-ai"]')) >= 3);
  ok('turns left counts down from 8', /6 turns left/.test(await T('[data-testid="turns-left"]')), await T('[data-testid="turns-left"]'));
  await shotEl(`${PREFIX}-2-scene-chat`, '[data-testid="partner-run"]');
  await sleep(REAL ? 6000 : 500);
  await clickSel('[data-testid="partner-end"]');
  await page.waitForSelector('[data-testid="partner-feedback"]', { timeout: 120000 });
  const fb = await T('[data-testid="partner-feedback"]');
  ok('feedback: goal, score, done well, phrases used/missed', !!(await page.$('[data-testid="goal-met"]')) && /\d+\/10/.test(fb) && (await count('[data-testid="fb-done-well"] li')) === 2 && !!(await page.$('[data-testid="fb-phrases"]')), fb.replace(/\s+/g, ' ').slice(0, 300));
  await shotEl(`${PREFIX}-3-scene-feedback`, '[data-testid="partner-feedback"]');

  await synced();
  // 3) Voice-only scene (AU persona): hidden text, 5-second timer, a nudge after a miss, auto-send after a pause
  await page.goto(`${BASE}/chat?mode=scene`, { waitUntil: 'networkidle0' });
  await clickSel('[data-testid="scene-card"][data-id="neighbour-smalltalk"]');
  await clickSel('[data-testid="voice-only"]');
  ok('voice-only hides the target phrases', !(await page.$('[data-testid="scene-targets"]')));
  await plan('');                          // 1st turn: he says nothing -> miss
  await plan("Hi Sophie, nice to meet you. I'm Trung, I live just down the hall.", 1500); // after the nudge
  await plan('Yeah it is a nice building. Do you know a good place for coffee around here?', 800); // next turn
  const s1 = await page.evaluate(() => window.__spoken.length);
  await clickSel('[data-testid="scene-start"]');
  await page.waitForSelector('[data-testid="start-timer"]', { timeout: 60000 });
  ok('mic opens by itself with a 5-second start timer', /^[1-5]$/.test(await T('[data-testid="start-timer"]')), await T('[data-testid="start-timer"]'));
  const nb = SCENES.find((x) => x.id === 'neighbour-smalltalk');
  ok('voice-only: partner text hidden', (await count('[data-testid="hidden-line"]')) >= 1 && !(await T('[data-testid="partner-turns"]')).includes(nb.opener.slice(0, 15)));
  await shotEl(`${PREFIX}-4-voice-only-timer`, '[data-testid="partner-run"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="turn-ai"]').length >= 2, { timeout: 20000 });
  const nudge = await page.evaluate(() => document.querySelectorAll('[data-testid="turn-ai"]')[1].innerText);
  ok('missed the 5 seconds -> an in-character nudge (no model call), then the timer restarts', /nudge/.test(nudge), nudge.replace(/\s+/g, ' '));
  await page.waitForSelector('[data-testid="turn-user"]', { timeout: 30000 });
  ok('his turn is sent by itself after a short pause', (await T('[data-testid="turn-user"]')).includes('down the hall'));
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="turn-user"]').length >= 2, { timeout: 120000 });
  ok('second voice-only turn: next line, mic again, auto-send', (await count('[data-testid="turn-user"]')) >= 2);
  if (!REAL) {
    const langs = (await page.evaluate(() => window.__spoken.map((s) => s.lang))).slice(s1);
    ok('AU persona speaks with an Australian voice (browser fallback in demo)', langs.length > 0 && langs.every((l) => l === 'en-AU'), langs.join(','));
  }
  await clickSel('[data-testid="show-text"]');
  ok('"Show text" escape reveals the lines', (await count('[data-testid="hidden-line"]')) === 0);
  await page.waitForFunction(() => !document.querySelector('[data-testid="partner-end"]')?.disabled, { timeout: 90000 });
  await sleep(500);
  await clickSel('[data-testid="partner-end"]');
  await page.waitForSelector('[data-testid="partner-feedback"]', { timeout: 120000 });
  ok('voice-only scene ends with feedback', true);

  await synced();
  // 4) Discord group: 3 friends, 3 accents, distinct voices
  await page.goto(`${BASE}/chat?mode=discord`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="discord-setup"]');
  ok('Discord: Jake 🇺🇸, Priya 🇬🇧, Liam 🇦🇺 and 12 topics', /Jake.*Priya.*Liam/s.test(await T('[data-testid="discord-friends"]')) && (await count('[data-testid="discord-topic"]')) === 12);
  if (await page.$eval('[data-testid="voice-only"]', (e) => e.checked)) await clickSel('[data-testid="voice-only"]');
  await clickSel('[data-testid="discord-topic"]', 2);
  const s2 = await page.evaluate(() => window.__spoken.length);
  const t2 = ttsCalls.length;
  await clickSel('[data-testid="discord-start"]');
  await page.waitForSelector('[data-testid="turn-ai"]', { timeout: 90000 });
  const speakers = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-testid="turn-ai"]')].map((e) => e.dataset.speaker))]);
  ok('friends chat (2–4 lines) before the cue for him', (await count('[data-testid="turn-ai"]')) >= 2 && speakers.every((s) => ['Jake', 'Priya', 'Liam'].includes(s)), speakers.join(','));
  await sleep(REAL ? 12000 : 1200);
  if (!REAL) {
    const sp = (await page.evaluate(() => window.__spoken)).slice(s2);
    ok('each friend speaks in their own accent (demo: browser voices)', new Set(sp.map((s) => s.lang)).size >= 2, sp.map((s) => `${s.lang}/${s.pitch}`).join(', '));
  } else {
    const calls = ttsCalls.slice(t2);
    ok('each friend gets a distinct natural voice + accent', new Set(calls.map((c) => `${c.accent}/${c.voice}`)).size >= 2 && calls.every((c) => c.voice), calls.map((c) => `${c.accent}/${c.voice}`).join(', '));
  }
  await sendText('Honestly I think it is a bit overrated, but the cakes are really good.');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="turn-user"]').length >= 1 && document.querySelectorAll('[data-testid="turn-ai"]').length >= 4, { timeout: 120000 });
  ok('they react to him and cue him again', (await count('[data-testid="turn-ai"]')) >= 4);
  ok('5 jump-ins per call', /4 turns left/.test(await T('[data-testid="turns-left"]')), await T('[data-testid="turns-left"]'));
  await shotEl(`${PREFIX}-5-discord`, '[data-testid="partner-run"]');
  await sleep(REAL ? 12000 : 800);
  await page.waitForFunction(() => !document.querySelector('[data-testid="partner-end"]')?.disabled, { timeout: 90000 });
  await clickSel('[data-testid="partner-end"]');
  await page.waitForSelector('[data-testid="partner-feedback"]', { timeout: 120000 });
  ok('Discord call ends with feedback', /\d+\/10/.test(await T('[data-testid="partner-feedback"]')));

  await synced();
  // 5) Story bank: tell -> polish -> retell -> check
  await page.goto(`${BASE}/chat?mode=story`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="story-slot"]');
  ok('10 story slots', (await count('[data-testid="story-slot"]')) === 10);
  await clickSel('[data-testid="story-slot"][data-id="funny-fail"]');
  await page.waitForSelector('[data-testid="story-tell"]');
  await speakIntoMic('uhm last year I went to Da Lat with my friends and we got lost in the rain for two hours because my phone died and then we found a tiny cafe and it was the best coffee ever', 4000);
  await clickSel('[data-testid="story-polish"]');
  await page.waitForSelector('[data-testid="story-polished"]', { timeout: 120000 });
  const pol = await T('[data-testid="story-polished"]');
  ok('polished version keeps his facts (Da Lat, rain, phone)', /Da Lat/i.test(pol) && /rain/i.test(pol) && /phone/i.test(pol), pol.replace(/\s+/g, ' ').slice(0, 200));
  ok('4 beats + phrases to keep', (await count('[data-testid="story-beats"] li')) === 4 && /Keep these/.test(pol));
  await shotEl(`${PREFIX}-6-story`, '[data-testid="story-view"]');
  const keep = await page.evaluate(() => [...document.querySelectorAll('[data-testid="story-polished"] .chip')].map((c) => c.textContent.trim()));
  await speakIntoMic(`So ${keep[0] || 'this one time'}, we went to Da Lat, got lost in the rain because my phone died, and ${keep[1] || 'in the end'} we found a tiny cafe. ${keep[2] || ''}`, 4000);
  await clickSel('[data-testid="story-check"]');
  await page.waitForSelector('[data-testid="story-check-result"]', { timeout: 120000 });
  const chk = await T('[data-testid="story-check-result"]');
  ok('retell checked: beats covered + phrases kept + retold 1×', /\d\/4 beats/.test(chk) && /retold 1×/.test(chk), chk.replace(/\s+/g, ' ').slice(0, 200));
  await shotEl(`${PREFIX}-7-retell`, '[data-testid="story-retell"]');

  // 6) Persistence + delete
  await synced();
  await page.goto(`${BASE}/chat?mode=story`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="story-slot"]');
  ok('story saved (reload): Polished · retold 1×', /retold 1×/.test(await T('[data-testid="story-slot"][data-id="funny-fail"]')));
  await page.goto(`${BASE}/chat?mode=scene`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="recent-item"]');
  const n0 = await count('[data-testid="recent-item"]');
  ok('scene sessions saved with feedback (reload)', n0 === 2, `${n0}`);
  await clickSel('[data-testid="recent-item"] button');
  await page.waitForSelector('[data-testid="partner-feedback"]');
  ok('reopening a past session shows its feedback', true);
  await clickSel('[data-testid="recent-delete"]');
  await confirmDialog(true);
  await synced();
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="scene-card"]');
  ok('delete (with confirm) removes the session for good', (await count('[data-testid="recent-item"]')) === n0 - 1);
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  await clickText('All phrases');
  await sleep(800);
  const ph = await T('main');
  ok('used target phrases / kept story phrases go to the Phrase Bank', /Role-play|Story bank/.test(ph), (ph.match(/🎭 Role-play|📖 Story bank/g) || []).join(','));

  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.goto(`${BASE}/chat?mode=discord`, { waitUntil: 'networkidle0' });
  const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
  ok('no horizontal scroll at 390px', sw <= 390 && sw2 <= 390, `${sw}/${sw2}`);
  const errs = errors.filter((e) => !/favicon|ERR_ABORTED|status of 4\d\d/.test(e));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  console.log('ERROR', e.message);
  await page.screenshot({ path: `${OUT}${PREFIX}-error.png`, fullPage: true }).catch(() => {});
  results.push('FAIL crashed: ' + e.message);
}
await browser.close();
const pass = results.filter((r) => r.startsWith('PASS')).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
