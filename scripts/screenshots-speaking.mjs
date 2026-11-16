// Headless smoke test + screenshots for the speaking features (shadowing, fluency stats),
// using demo (mock) AI mode, Chrome's fake mic, and a scripted fake SpeechRecognition.
// Usage: serve the repo root on :8765, then `node scripts/screenshots-speaking.mjs`
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/dist/index.html';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 2 });

// Fake speech recognition: each start() plays the next scripted plan of [delayMs, finalText] results.
await page.evaluateOnNewDocument(() => {
  window.__speechPlans = [];
  // Plan item: [silenceBeforeMs, speakingMs, finalText]. Interim results fire every 300ms while "speaking".
  class FakeSR {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; this._t = []; this._res = []; }
    _emit(r) {
      const results = { length: this._res.length + (r.isFinal ? 1 : 1) };
      this._res.forEach((x, i) => (results[i] = x));
      results[this._res.length] = r;
      if (r.isFinal) this._res.push(r);
      this.onresult && this.onresult({ resultIndex: this._res.length - (r.isFinal ? 1 : 0), results });
    }
    start() {
      const plan = window.__speechPlans.shift() || [];
      let t = 0;
      for (const [silence, speakMs, text] of plan) {
        t += silence;
        const words = text.split(' ');
        for (let s = 300; s < speakMs; s += 300) {
          const part = words.slice(0, Math.ceil((s / speakMs) * words.length)).join(' ');
          this._t.push(setTimeout(() => this._emit({ isFinal: false, 0: { transcript: part }, length: 1 }), t + s));
        }
        t += speakMs;
        this._t.push(setTimeout(() => this._emit({ isFinal: true, 0: { transcript: text }, length: 1 }), t));
      }
    }
    stop() { this._t.forEach(clearTimeout); setTimeout(() => this.onend && this.onend(), 30); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
});

const shot = async (name, full = true) => {
  await sleep(400);
  const vp = page.viewport();
  if (full) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ ...vp, height: Math.max(vp.height, h) });
    await sleep(300);
  }
  await page.screenshot({ path: `${OUT}${name}.png` });
  if (full) await page.setViewport(vp);
  console.log('saved', name);
};
const clickText = async (text, scope = 'button, a') => {
  const ok = await page.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().includes(t) && !b.disabled);
    if (el) { el.click(); return true; }
    return false;
  }, text, scope);
  if (!ok) throw new Error(`Could not click "${text}"`);
};
const waitText = (t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), { timeout }, t);
const plan = (p) => page.evaluate((x) => window.__speechPlans.push(x), p);

// Onboarding with the demo key
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await page.type('input[type=password]', 'demo');
await clickText('Next');
await sleep(200);
const inputs = await page.$$('input.input');
await inputs[0].type('Trung');
await inputs[1].type('software developer');
await inputs[2].type('Ho Chi Minh City');
await clickText('Next');
await sleep(200);
await clickText('Start speaking');
await waitText('Idea starters');

// Answer by "voice"
await plan([
  [800, 4500, 'uhm I think I think Notion is the app I can not live without'],
  [300, 5000, 'because my job have like many small task and uh it help me remember'],
  [2600, 5500, 'you know last week I have three deadline and the the app help me a lot'],
]);
await page.click('button[title="Answer by voice"]');
await sleep(19200);
await page.click('button[title="Stop recording"]');
await sleep(400);
if (process.env.FLUENCY !== '0') {
  await waitText('Fluency');
}
await clickText('Upgrade my answer');
await waitText('What I said');

// Shadowing
await clickText('Start shadowing');
await waitText('Sentence 1 of');
{
  const sec = await page.evaluateHandle(() => document.querySelector('[data-testid=shadowing]').closest('section'));
  await page.evaluate((e) => e.scrollIntoView({ block: 'center' }), sec);
  await sleep(300);
  await sec.asElement().screenshot({ path: `${OUT}12-shadowing-start.png` });
  console.log('saved 12-shadowing-start');
}
await plan([[300, 1000, "Honestly I'd say Notion is the one app I couldn't live without"]]);
await clickText('Listen & repeat');
await page.waitForFunction(() => document.body.innerText.includes('Recording…'), { timeout: 15000 });
await sleep(1500);
await clickText('Stop');
await waitText('I heard:');
await clickText('Next →');
await plan([[300, 1000, 'the thing is my job as a developer is full of tasks and if I write them down I forget half']]);
await clickText('Listen & repeat');
await page.waitForFunction(() => document.body.innerText.includes('Recording…'), { timeout: 15000 });
await sleep(1500);
await clickText('Stop');
await waitText('I heard:');
await page.evaluate(() => document.querySelector('[data-testid=shadowing]').scrollIntoView({ block: 'center' }));
const hasCompare = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Model + me')));
console.log('compare button present:', hasCompare);
const el = await page.$('[data-testid=shadowing]');
await sleep(300);
await el.screenshot({ path: `${OUT}13-shadowing-scored.png` });
console.log('saved 13-shadowing-scored');

if (process.env.FLUENCY !== '0') {
  // Fluency card right after the answer
  await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('Your answer')).scrollIntoView({ block: 'start' }));
  const card = await page.evaluateHandle(() => [...document.querySelectorAll('section.card')].find((s) => s.textContent.includes('Your answer')));
  await sleep(300);
  await card.asElement().screenshot({ path: `${OUT}14-fluency-after-answer.png` });
  console.log('saved 14-fluency-after-answer');

  // Seed past answers with fluency stats so trend charts have data
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('speakup:v1'));
    const ds = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const base = s.entries[0];
    const days = [[13, 72, 9, 4, 3], [11, 78, 8, 3, 3], [9, 85, 7, 3, 2], [8, 83, 6, 2, 2], [6, 92, 5, 2, 1], [5, 96, 4, 1, 2], [3, 101, 4, 1, 1], [2, 104, 3, 1, 0], [1, 110, 2, 0, 1]];
    for (const [n, wpm, fillers, restarts, pauses] of days) {
      const words = 60 + n;
      s.entries.push({ ...base, id: `seed${n}`, date: ds(n), questionId: `q${n}`, createdAt: Date.now() - n * 86400000, retry: undefined,
        fluency: { words, seconds: Math.round((words / wpm) * 60), wpm, fillers, fillerWords: { uhm: fillers }, restarts, restartExamples: [], pauses, longestPause: pauses ? 2.6 : 0, tip: '', createdAt: Date.now() - n * 86400000 } });
      s.speakingLog[ds(n)] = Math.round((words / wpm) * 60) + 120;
    }
    localStorage.setItem('speakup:v1', JSON.stringify(s));
  });
  await page.goto(BASE + '#/progress', { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Fluency trends');
  await shot('15-progress-fluency');
}

console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'No page errors');
await browser.close();
