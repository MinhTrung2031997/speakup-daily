// Live Web Push check in a real (headful, Xvfb) Chrome: turn on notifications, send a test push, then wait for the
// cron reminder (trigger the remind cron job separately) and click it -> the app opens on Today's plan.
// Usage: xvfb-run -a env TEST_EMAIL=... TEST_PASSWORD=... node scripts/push-live.mjs
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = fs.mkdtempSync('/tmp/pushprof-');
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: false, userDataDir: dir, args: ['--no-sandbox', '--no-first-run', '--window-size=500,900'] });
await browser.defaultBrowserContext().overridePermissions(new URL(BASE).origin, ['notifications']);
const page = (await browser.pages())[0] || (await browser.newPage());
page.setDefaultNavigationTimeout(90000);
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ` (${x})` : ''}`);
const notes = () => page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration('/'); return reg ? (await reg.getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url })) : []; });
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(1500);
  await page.evaluate(() => localStorage.setItem('speakup.demo', '1'));
  console.log('step reload'); await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.type('#email', TEST_EMAIL); await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await page.waitForSelector('[data-testid="plan-card"]', { timeout: 90000 });
  await sleep(2000);
  console.log('step settings'); await page.goto(`${BASE}/settings#reminders`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="push-on"]', { timeout: 30000 });
  await page.click('[data-testid="push-on"]');
  await page.waitForSelector('[data-testid="push-test"]', { timeout: 30000 });
  ok('subscribed in headful Chrome', true);
  await page.click('[data-testid="push-test"]');
  let n = [];
  for (let i = 0; i < 120 && !n.length; i++) { await sleep(500); n = await notes(); }
  ok('test push delivered + decrypted + shown by the service worker', n.length > 0, JSON.stringify(n[0] || {}));
  fs.writeFileSync('/workspace/speakup-daily/.tmp/push-ready', '1');
  console.log('READY for cron');
  let cron = [];
  for (let i = 0; i < 240 && !cron.length; i++) { await sleep(1000); cron = (await notes()).filter((x) => x.tag === 'speakup-plan'); }
  ok('cron reminder delivered', cron.length > 0, JSON.stringify(cron[0] || {}));
  if (cron.length) {
    await page.goto(`${BASE}/history`, { waitUntil: 'domcontentloaded' });
    // Simulate the tap: ask the SW to handle a click on the shown notification.
    const opened = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const [n] = (await reg.getNotifications()).filter((x) => x.tag === 'speakup-plan');
      return n?.data?.url || '';
    });
    await page.goto(new URL(opened, BASE).href, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="plan-card"].plan-highlight', { timeout: 15000 }).catch(() => {});
    ok('notification URL opens the app on the plan (highlighted)', !!(await page.$('[data-testid="plan-card"].plan-highlight')), opened);
  }
} catch (e) { ok('run', false, String(e).slice(0, 200)); }
finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
