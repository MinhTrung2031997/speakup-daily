# SpeakUp Daily 🎙️

A free, private English **speaking & listening** practice app for learners who know lots of words but want to *use* them naturally, like in a real Discord chat.

- 100% static site: no server, no database, no paid backend.
- Your data (profile, topics, history, phrase bank, progress) stays **in your browser** (localStorage). Export/import a JSON backup in **Settings**.
- AI by **Google Gemini** (free tier), called directly from the browser with **your own API key**, stored only in your browser.

## Features

| Page | What it does |
|---|---|
| **Welcome** | First-run guide: get a free key at <https://aistudio.google.com/apikey>, fill in your profile, pick topics. |
| **Today** | One daily question (kept for the whole day, never repeats) in a casual Discord style, a **New question** button, and 3 idea starters from your profile. Answer by typing or by **mic** (speech-to-text). **Upgrade my answer** gives you: your own idea rewritten naturally (B2–C1, Point → Reason → Example → Wrap-up), a side-by-side **What I said vs. More natural** word diff, 3–5 highlighted phrases with meaning + example, and 2–3 gentle corrections. **Listen** reads it aloud (0.75–1.25x, English voice picker) and highlights each sentence. **Say it again** hides the model answer; you answer again and the AI scores which target phrases you used and gives one fluency tip. |
| **Chat** | Conversation practice with a friendly AI partner on today's topic: natural follow-ups, nudges to reuse today's phrases, mic input, replies read aloud, and short feedback at the end. |
| **Phrases** | Every highlighted phrase is saved automatically. Spaced repetition on days **1, 3, 7, 14, 30**: you make your own sentence (voice or text) and the AI checks it. |
| **History** | Past questions, answers, upgrades and chats. Search by text, topic and date. |
| **Progress** | Streak, answers, minutes spoken, phrases learned/mastered, 14-day charts and a 12-week practice calendar. |
| **Profile / Settings** | Edit profile and topics (presets + custom), API key and model (default `gemini-2.5-flash`), voice and speed, dark mode, backup/restore, reset. |

**Demo mode:** type `demo` as the API key to try everything with sample AI answers (no key needed).

## Run locally

Needs Node.js 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/
npm run preview    # serve dist/ locally
```

> The mic needs a **secure context**: `localhost` or `https://`. All the hosts below give you https.

## Deploy (all free)

The build uses a relative base (`./`) and hash routing (`/#/phrases`), so `dist/` works on any static host, at the root or in a subfolder. No rewrites needed.

### Option A: Netlify Drop (no account setup, ~1 minute)
1. Run `npm run build` (or use the ready-made `speakup-daily-site.zip`, unzipped).
2. Open <https://app.netlify.com/drop> and drag the **`dist` folder** (or the zip) onto the page.
3. You get a live `https://….netlify.app` link. Sign in to keep it permanently.

### Option B: GitHub Pages (auto-deploy on every push)
1. Create a new GitHub repo and push this project to the `main` branch.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow `.github/workflows/deploy.yml` builds and deploys automatically. Your site: `https://<user>.github.io/<repo>/`.

### Option C: Vercel
1. Import the GitHub repo at <https://vercel.com/new>.
2. Framework preset: **Vite** (build `npm run build`, output `dist`). Deploy.

Cloudflare Pages works the same way (build `npm run build`, output `dist`).

## Getting a free Gemini API key
1. Go to <https://aistudio.google.com/apikey> and sign in with Google.
2. Click **Create API key** and copy it (`AIza…`).
3. In the app, open **Settings** and paste it, then **Test connection**.

Free-tier limits apply. If you see a rate-limit message, wait a minute or switch the model to `gemini-2.5-flash-lite`.

## Privacy
- No backend and no tracking. Data is stored in your browser's localStorage.
- The API key is sent only to `generativelanguage.googleapis.com`.
- Because the key lives in the browser, use your own key for your own copy and don't share your device profile. Backups exclude the key unless you tick the box.

## Browser support
- **Speech-to-text (mic):** Chrome, Edge (desktop and Android) and Safari (macOS/iOS 14.5+). Firefox does not support it yet, so you can type instead. Chrome's recognition uses Google's online service, so it needs internet.
- **Read aloud:** all modern browsers; the voices available depend on your OS.

## Project structure
```
src/
  lib/        gemini.ts (REST client + errors), ai.ts (prompts), mock.ts (demo mode),
              store.tsx (localStorage state), speech.ts (STT/TTS), srs.ts, diff.ts, stats.ts
  components/ MicInput, ListenPlayer, DiffView, UpgradeResult, BarChart, Layout…
  pages/      Welcome, Today, Chat, Phrases, History, Progress, Profile, Settings
scripts/screenshots.mjs   headless smoke test in demo mode (puppeteer-core + Chrome)
```
