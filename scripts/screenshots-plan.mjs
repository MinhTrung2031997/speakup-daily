// Today's plan + answer review + reminders walkthrough.
// Usage: TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-plan.mjs   (seed first with scripts/seed-plan.mjs)
// demo -> 108-*; REAL=1 -> 109-*. BASE defaults to the local preview (vite preview --port 4173).
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const PREFIX = process.env.PREFIX || (REAL ? '109' : '108');
const OUT = process.env.OUT || new URL('../screenshots/', import.meta.url).pathname;
const DL = new URL('../.tmp/dl/', import.meta.url).pathname;
fs.mkdirSync(DL, { recursive: true });
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
await browser.defaultBrowserContext().overridePermissions(new URL(BASE).origin, ['notifications']);
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }));

await page.evaluateOnNewDocument(() => {
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  const synth = { speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 100); }, cancel() {}, getVoices: () => [{ name: 'Fake', lang: 'en-US', voiceURI: 'us', default: true, localService: true }], addEventListener() {}, removeEventListener() {}, speaking: false, pending: false, paused: false };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
});

const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); console.log(results.at(-1)); };
const T = (s) => page.evaluate((x) => document.querySelector(x)?.innerText || '', s);
const bodyHas = (t) => page.evaluate((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), t);
const waitText = (t, timeout = 90000) => page.waitForFunction((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), { timeout }, t);
const clickText = async (text, scope = 'button, a') => {
  const done = await page.evaluate((t, sel) => { const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().includes(t) && !b.disabled); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; } return false; }, text, scope);
  if (!done) throw new Error(`Could not click "${text}"`);
};
const clickSel = async (sel, i = 0) => {
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.evaluate((s, n) => { const all = [...document.querySelectorAll(s)].filter((b) => !b.disabled); const b = n < 0 ? all.at(-1) : all[n]; b.scrollIntoView({ block: 'center' }); b.click(); }, sel, i);
  await sleep(350);
};
const setTextarea = (sel, value) => page.evaluate((s, v) => { const t = document.querySelector(s); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, v); t.dispatchEvent(new Event('input', { bubbles: true })); }, sel, value);
const shotEl = async (name, selector) => {
  await sleep(500);
  await page.addStyleTag({ content: 'header, nav { position: static !important; }' });
  const box = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; el.scrollIntoView({ block: 'start' }); const r = el.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top + window.scrollY - 8), width: window.innerWidth, height: r.height + 16 }; }, selector);
  if (box) await page.screenshot({ path: `${OUT}${name}.png`, clip: box, captureBeyondViewport: true }); else await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  console.log('saved', name);
};
const items = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="plan-item"]')].map((li) => ({ kind: li.dataset.kind, done: li.dataset.done === '1', text: li.innerText.replace(/\s+/g, ' ') })));
const itemDone = (kind) => page.waitForFunction((k) => document.querySelector(`[data-testid="plan-item"][data-kind="${k}"]`)?.dataset.done === '1', { timeout: 30000 }, kind).then(() => true).catch(() => false);
const goHome = async () => { await page.evaluate(() => [...document.querySelectorAll('header a, nav a')].find((a) => a.getAttribute('href') === '/').click()); await page.waitForSelector('[data-testid="plan-card"]', { timeout: 30000 }); await sleep(600); };

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); }, REAL);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Sign in to keep your practice saved');
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await page.waitForSelector('[data-testid="plan-card"]', { timeout: 90000 });
  await sleep(1500);

  // 1) The plan card
  let it = await items();
  const kinds = it.map((x) => x.kind).join(',');
  ok('plan card on Home with question + reviews + redo (overdue) + extra', kinds === 'question,reviews,redo,extra', kinds);
  ok('reviews step = the 2 due phrases', /Review 2 phrases/.test(it.find((x) => x.kind === 'reviews')?.text || ''));
  ok('extra picked from the weakest area (few active words -> Say it better)', /Say it better/.test(it.find((x) => x.kind === 'extra')?.text || ''), it.find((x) => x.kind === 'extra')?.text);
  const msg = await T('[data-testid="plan-message"]');
  ok('in-app line comes from EL\'s reminders.ts with what is left', msg.length > 10 && !/\{|\}/.test(msg), msg.replace(/\s+/g, ' '));
  ok('plan card is above the daily question', await page.evaluate(() => document.querySelector('[data-testid="plan-card"]').compareDocumentPosition(document.querySelector('[role="tablist"]')) & Node.DOCUMENT_POSITION_FOLLOWING));
  await shotEl(`${PREFIX}-1-plan`, '[data-testid="plan-card"]');

  // 2) Daily question -> ticks
  if (await bodyHas("Get today's question")) { await clickText("Get today's question"); }
  await page.waitForFunction(() => document.querySelector('#question p.text-xl, #question h2, #question [data-testid="spoken-question"]') || !document.body.innerText.includes("Get today's question"), { timeout: 90000 });
  await sleep(1500);
  await clickSel('[data-testid="plan-item"][data-kind="question"] [data-testid="plan-go"]');
  await sleep(800);
  const qVisible = await page.evaluate(() => { const r = document.getElementById('question').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  ok('Start on the question step scrolls to the question', qVisible);
  await page.waitForSelector('textarea', { timeout: 30000 });
  await setTextarea('textarea', 'Honestly my favourite way to relax is walking around the lake near my house in the evening. It clears my head after a long day, and sometimes I call my parents while I walk.');
  await clickText('Upgrade my answer');
  await page.waitForFunction(() => !/Upgrade my answer/.test([...document.querySelectorAll('button')].map((b) => b.innerText).join('|')) || document.body.innerText.includes('Upgrade again'), { timeout: 120000 });
  ok('question step ticks after the answer is saved', await itemDone('question'));

  // 3) Reviews: 2 due phrases on Learn
  await clickSel('[data-testid="plan-item"][data-kind="reviews"] [data-testid="plan-go"]');
  for (let k = 0; k < 2; k++) {
    await page.waitForSelector('[data-testid="use-card"]', { timeout: 30000 });
    const ph = await page.$eval('[data-testid="use-card"]', (e) => e.dataset.phrase);
    await setTextarea('[data-testid="use-card"] textarea', `I was ${ph} about moving to a new apartment last month, honestly.`);
    await clickText('Check my sentence');
    await page.waitForSelector('[data-testid="use-result"]', { timeout: 120000 });
    await clickText('Next phrase');
    await sleep(800);
  }
  await goHome();
  ok('reviews step ticks after 2 reviews', await itemDone('reviews'));
  const streakTxt = await T('[data-testid="plan-streak"]');
  ok('streak counts today now (question + reviews): 2 days', /2 days/.test(streakTxt), streakTxt);

  // 4) Redo an old answer: plays old recording first (none here), hides the old transcript, then compares
  await clickSel('[data-testid="plan-item"][data-kind="redo"] [data-testid="plan-go"]');
  await page.waitForSelector('[data-testid="replay-question"]', { timeout: 30000 });
  const reviewOld = await T('[data-testid="review-old"]');
  ok('review screen: old-answer card first (no recording -> says so)', /no recording/i.test(reviewOld), reviewOld.replace(/\s+/g, ' ').slice(0, 100));
  ok('old transcript hidden before answering', !(await bodyHas('I miss pho from my hometown')));
  await shotEl(`${PREFIX}-2-review`, 'main');
  await setTextarea('textarea', 'The food I miss most from my hometown is the beef pho my mum makes. The broth simmers all night, and the smell fills the whole house on Sunday mornings. Nothing in the city tastes quite like it.');
  await clickSel('[data-testid="replay-submit"]');
  await page.waitForSelector('[data-testid="then-vs-now"]', { timeout: 120000 });
  const rr = await page.$eval('[data-testid="review-result"]', (e) => ({ r: e.dataset.result, t: e.innerText })).catch(() => null);
  ok('then vs now shown + review rescheduled', !!rr && /comes back|done/.test(rr.t), rr && `${rr.r}: ${rr.t.replace(/\s+/g, ' ').slice(0, 90)}`);
  ok('old transcript visible after answering', await page.evaluate(() => document.querySelector('[data-testid="col-then"]')?.innerText.includes('Transcript')));
  await shotEl(`${PREFIX}-3-then-vs-now`, '[data-testid="then-vs-now"]');
  await goHome();
  ok('redo step ticks', await itemDone('redo'));

  // 5) Extra: Say it better -> plan complete -> celebration
  await clickSel('[data-testid="plan-item"][data-kind="extra"] [data-testid="plan-go"]');
  await page.waitForSelector('[data-testid="say-composer"]', { timeout: 30000 });
  await setTextarea('[data-testid="say-composer"] textarea', 'Dạo này mình hơi mệt, chắc tại làm nhiều quá');
  await clickSel('[data-testid="say-go"]');
  await page.waitForSelector('[data-testid="say-flow"]', { timeout: 120000 });
  await sleep(1500);
  await goHome();
  ok('extra ticks', await itemDone('extra'));
  const complete = await page.$eval('[data-testid="plan-card"]', (e) => e.dataset.complete);
  const confetti = !!(await page.$('[data-testid="plan-confetti"]'));
  ok('plan complete + celebration', complete === '1' && confetti, `${await T('[data-testid="plan-message"]')}`.replace(/\s+/g, ' '));
  await sleep(300);
  await shotEl(`${PREFIX}-4-done`, '[data-testid="plan-card"]');

  // 6) Saved to the database (plan row) -> survives reload
  await sleep(2500);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="plan-card"]', { timeout: 60000 });
  await sleep(1000);
  it = await items();
  ok('after reload the plan is the same and still done', it.length === 4 && it.every((x) => x.done), it.map((x) => `${x.kind}:${x.done}`).join(','));

  // 7) Progress: plan streak + this week
  await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="this-week"]', { timeout: 30000 });
  const wk = await T('[data-testid="this-week"]');
  const todayState = await page.evaluate(() => [...document.querySelectorAll('[data-testid="week-day"]')].map((d) => d.dataset.state));
  ok('Progress: this week shows streak days, minutes, reviews, improved', /Streak days/.test(wk) && /Reviews done/.test(wk) && /Answers improved/.test(wk), wk.replace(/\s+/g, ' ').slice(0, 160));
  ok('Progress: today marked done in the week strip', todayState.includes('done'), todayState.join(','));
  ok('Progress: reviews done this week = 2 phrases (+targets) + 1 old answer', /old answer/.test(wk), await T('[data-testid="week-reviews"]'));
  await shotEl(`${PREFIX}-5-week`, '[data-testid="this-week"]');

  // 8) Settings: reminders, push on this device, test push, calendar
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="reminders"]', { timeout: 30000 });
  await sleep(1500);
  const defTime = await page.$eval('[data-testid="rem-time"]', (e) => e.value);
  const defTz = await page.$eval('[data-testid="rem-tz"]', (e) => e.value);
  ok('defaults: 8:00 PM, Asia/Saigon, every day, evening nudge 9:30 PM', defTime === '20:00' && defTz === 'Asia/Saigon' && (await page.$$('[data-testid="rem-day"][aria-pressed="true"]')).length === 7 && (await page.$eval('[data-testid="rem-evening-time"]', (e) => e.value)) === '21:30', `${defTime} ${defTz}`);
  await page.waitForSelector('[data-testid="push-on"]', { timeout: 15000 }).catch(() => {});
  const devTxt = await T('[data-testid="device-status"]');
  if (await page.$('[data-testid="push-on"]')) {
    await clickSel('[data-testid="push-on"]');
    await page.waitForSelector('[data-testid="push-msg"]', { timeout: 30000 });
    const pm = await T('[data-testid="push-msg"]');
    ok('turn on notifications -> subscribed and saved', /on for this device/.test(pm), pm);
    const enabled = await page.$eval('[data-testid="rem-enabled"]', (e) => e.checked);
    ok('reminders switched on', enabled);
    if (await page.$('[data-testid="push-test"]')) {
      await clickSel('[data-testid="push-test"]');
      await page.waitForFunction(() => /Sent:|push service|failed|no device/i.test(document.querySelector('[data-testid="push-msg"]')?.innerText || ''), { timeout: 30000 });
      const tm = await T('[data-testid="push-msg"]');
      ok('Send test notification -> push service accepted it', /^Sent:/.test(tm), tm);
      const shown = await page.evaluate(async () => { for (let i = 0; i < 20; i++) { const reg = await navigator.serviceWorker.getRegistration('/'); const n = reg ? await reg.getNotifications() : []; if (n.length) return n.map((x) => `${x.title} | ${x.body} | ${x.data?.url}`); await new Promise((r) => setTimeout(r, 500)); } return []; });
      // Headless Chrome has no push connection, so delivery is checked by scripts/push-live.mjs (headful, Xvfb).
      console.log(`INFO service worker notifications: ${shown[0] || 'none (headless: no push delivery)'}`);
    }
  } else ok('device status shown', !!devTxt, devTxt);
  // change time + a day -> saved
  await page.$eval('[data-testid="rem-time"]', (e) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, '07:30'); e.dispatchEvent(new Event('input', { bubbles: true })); });
  await clickSel('[data-testid="rem-day"]', 0);
  await page.waitForFunction(() => /Saved/.test(document.querySelector('[data-testid="rem-saved"]')?.innerText || ''), { timeout: 15000 }).catch(() => {});
  ok('settings auto-save', /Saved/.test(await T('[data-testid="rem-saved"]')));
  await clickSel('[data-testid="add-calendar"]');
  await sleep(1500);
  const ics = fs.existsSync(`${DL}speakup-daily-reminder.ics`) ? fs.readFileSync(`${DL}speakup-daily-reminder.ics`, 'utf8') : '';
  ok('Add to calendar downloads a repeating .ics at the chosen time', /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA/.test(ics) && /DTSTART;TZID=Asia\/Saigon:\d{8}T073000/.test(ics), ics.split('\r\n').filter((l) => /RRULE|DTSTART/.test(l)).join(' '));
  await shotEl(`${PREFIX}-6-reminders`, '[data-testid="reminders"]');
  // put defaults back (8 PM, every day)
  await page.$eval('[data-testid="rem-time"]', (e) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, '20:00'); e.dispatchEvent(new Event('input', { bubbles: true })); });
  await clickSel('[data-testid="rem-day"]', 0);
  await sleep(1500);

  // 9) iPhone Safari outside the Home Screen -> instructions
  const ios = await browser.newPage();
  await ios.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1');
  await ios.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ios.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  await ios.waitForSelector('[data-testid="ios-a2hs"]', { timeout: 30000 }).catch(() => {});
  const a2hs = await ios.evaluate(() => document.querySelector('[data-testid="ios-a2hs"]')?.innerText || '');
  ok('iPhone Safari: Add to Home Screen steps', /Add to Home Screen/.test(a2hs), a2hs.split('\n')[0]);
  if (a2hs) {
    await ios.addStyleTag({ content: 'header, nav { position: static !important; }' });
    const el = await ios.$('[data-testid="reminders"]');
    await el.screenshot({ path: `${OUT}${PREFIX}-7-iphone.png` });
  }
  await ios.close();

  // 10) manifest + sw served
  const mf = await page.evaluate(async () => { const r = await fetch('/manifest.webmanifest'); return r.ok ? (await r.json()).display : ''; });
  const sw = await page.evaluate(async () => (await fetch('/sw.js')).headers.get('content-type'));
  ok('manifest (standalone) + service worker served', mf === 'standalone' && /javascript/.test(sw || ''), `${mf} ${sw}`);

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  ok('run finished', false, String(e).slice(0, 300));
  await page.screenshot({ path: `${OUT}${PREFIX}-error.png`, fullPage: true }).catch(() => {});
} finally {
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  await browser.close();
}
