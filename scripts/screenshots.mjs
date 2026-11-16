// Headless smoke test + screenshots using demo (mock) AI mode.
// Usage: serve the repo root on :8765, then `node scripts/screenshots.mjs`
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/dist/index.html';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 2 });

const shot = async (name, full = true) => {
  await sleep(400);
  const vp = page.viewport();
  if (full) {
    // Grow the viewport to the page height so fixed header/nav stay at the edges.
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ ...vp, height: Math.max(vp.height, h) });
    await sleep(300);
  }
  await page.screenshot({ path: `${OUT}${name}.png` });
  if (full) await page.setViewport(vp);
  console.log('saved', name);
};
const clickText = async (text) => {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().includes(t) && !b.disabled);
    if (el) { el.click(); return true; }
    return false;
  }, text);
  if (!ok) throw new Error(`Could not click "${text}"`);
};

// 1. First-run welcome screen
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await shot('01-welcome', false);

// Go through onboarding with the demo key
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
await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('Idea starters'.toLowerCase()), { timeout: 10000 });
await shot('02-today');

// 2. Answer + upgrade (mock AI)
await page.type('textarea', 'I think Notion is app I can not live without because my job have many small task and it help me remember. Last week I have three deadline and it help me a lot.');
await clickText('Upgrade my answer');
await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('What I said'.toLowerCase()), { timeout: 10000 });
await shot('03-upgrade-result');

// 3. Say it again
await clickText('Hide answer');
await sleep(200);
const tas = await page.$$('textarea');
await tas[tas.length - 1].type('Honestly, Notion is the app I could not live without. The thing is, I have lots of small tasks. On top of that I plan my English there. At the end of the day it helps me a lot.');
await clickText('Check my attempt');
await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('target phrases used'.toLowerCase()), { timeout: 10000 });
await shot('04-say-it-again');

// 4. Seed some past activity so Progress & Phrase Bank have data, and make phrases due
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('speakup:v1'));
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10).replace(/(\d+)-(\d+)-(\d+)/, (m) => { const t = new Date(x.getFullYear(), x.getMonth(), x.getDate()); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; }); };
  const base = s.entries[0];
  for (const [n, count] of [[1, 2], [2, 1], [3, 1], [5, 2], [6, 1], [8, 1], [9, 3], [12, 1]]) {
    for (let i = 0; i < count; i++) s.entries.push({ ...base, id: `seed${n}-${i}`, date: d(n), questionId: `q${n}-${i}`, question: 'What do you usually do to relax after a long day?', topicName: '☕ Daily Life', createdAt: Date.now() - n * 86400000 });
    s.speakingLog[d(n)] = 60 * (count * 2 + 1);
  }
  s.speakingLog[d(0)] = (s.speakingLog[d(0)] || 0) + 240;
  s.phrases.forEach((p, i) => { p.due = d(0); p.stage = [0, 1, 2, 5, 3][i % 5]; if (p.stage === 5) p.due = '9999-12-31'; });
  localStorage.setItem('speakup:v1', JSON.stringify(s));
});
await page.goto(BASE + '#/phrases', { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('Make your own sentence'.toLowerCase()), { timeout: 10000 });
await page.type('textarea', 'The thing is, I need to practise speaking every day, not just reading.');
await clickText('Check my sentence');
await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('More natural'.toLowerCase()), { timeout: 10000 });
await shot('05-phrase-review');
await clickText('All phrases');
await shot('06-phrase-bank');

// 5. Progress
await page.goto(BASE + '#/progress', { waitUntil: 'networkidle0' });
await shot('07-progress');

// 6. Conversation practice
await page.goto(BASE + '#/chat', { waitUntil: 'networkidle0' });
await clickText('Start chatting');
await page.waitForFunction(() => document.querySelectorAll('textarea').length > 0, { timeout: 10000 });
await page.type('textarea', 'Definitely Notion. The thing is, I use it for everything at work.');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('sticky-notes'.toLowerCase()), { timeout: 10000 });
await shot('08a-chat', false);
await clickText('End & get feedback');
await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('Chat feedback'.toLowerCase()), { timeout: 10000 });
await shot('08b-chat-feedback');

// 7. History, Settings, dark mode, desktop
await page.goto(BASE + '#/history', { waitUntil: 'networkidle0' });
await shot('09-history', false);
await page.goto(BASE + '#/settings', { waitUntil: 'networkidle0' });
await shot('10-settings');
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('speakup:v1')); s.settings.dark = true; localStorage.setItem('speakup:v1', JSON.stringify(s)); });
await page.goto(BASE + '#/', { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
await shot('11-today-dark-desktop');

console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'No page errors');
await browser.close();
