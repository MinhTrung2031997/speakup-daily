# SpeakUp Daily 🎙️

A free English **speaking & listening** practice app for learners who know lots of words but want to *use* them naturally, like in a real Discord chat.

- **React + Vite + TypeScript + Tailwind**, hosted on **Vercel**.
- **Supabase** for sign-in (email + password or magic link), the database (everything is saved permanently per user, with row-level security) and private storage for shadowing recordings.
- **Google Gemini** for AI, called through a Supabase **Edge Function** (`ai`), so the API key stays on the server and never reaches the browser.

## Features

| Page | What it does |
|---|---|
| **Sign in** | Email + password, or a magic sign-in link. Every page requires sign-in. |
| **Welcome** | First-run setup: profile and topics. If the browser has data from the old browser-only version, a one-click **Import my saved practice** copies it into the account (no duplicates if run twice). |
| **Today** | One daily question (kept for the whole day, never repeats) in a casual Discord style, a **New question** button, and 3 idea starters from your profile. Answer by typing or by **mic** (speech-to-text). **Upgrade my answer** gives you: your own idea rewritten naturally (B2–C1, Point → Reason → Example → Wrap-up), a side-by-side **What I said vs. More natural** word diff, 3–5 highlighted phrases with meaning + example, and 2–3 gentle corrections. **Listen** reads it aloud (0.75–1.25x, English voice picker) and highlights each sentence. **Say it again** hides the model answer; you answer again and the AI scores which target phrases you used and gives one fluency tip. |
| **Chat** | Conversation practice with a friendly AI partner on today's topic: natural follow-ups, nudges to reuse today's phrases, mic input, replies read aloud, and short feedback at the end. |
| **Phrases** | Every highlighted phrase is saved automatically. Spaced repetition on days **1, 3, 7, 14, 30**: you make your own sentence (voice or text) and the AI checks it. |
| **History** | Past questions, answers, upgrades and chats. Search by text, topic and date. |
| **Progress** | Streak, answers, minutes spoken, phrases learned/mastered, 14-day charts and a 12-week practice calendar. |
| **Profile / Settings** | Edit profile and topics (presets + custom), AI model (default `gemini-flash-lite-latest`) and demo mode, voice and speed, dark mode, JSON export/import, sign out, delete all practice data. |

**Demo mode:** tick *Demo mode* in Settings to try everything with sample AI answers (saved per device; no AI calls).

## Architecture

```
Browser (Vercel static site)
  ├─ supabase-js ── Auth (email/password, magic link, PKCE)
  │              ── Postgres tables (RLS: each user sees only their own rows)
  │              ── Storage bucket "recordings" (private, <user_id>/...)
  └─ POST /functions/v1/ai  (user JWT) ── Edge Function "ai" ── Gemini API (GEMINI_API_KEY secret)
```

Tables: `profiles`, `user_settings`, `topics`, `daily_questions`, `answers`, `fluency_stats`, `shadowing_attempts`, `phrases`, `phrase_reviews`, `chat_sessions`, `chat_messages`, `daily_activity`. SQL is in `supabase/migrations/`, generated types in `supabase/database.types.ts`. A trigger creates the profile, settings and 7 preset topics for every new user.

The app keeps one in-memory state (`src/lib/store.tsx`); every change is diffed and written to Supabase in the background (`src/lib/db.ts`). If a save fails, a red banner appears and it retries on the next change.

## Environment variables

Only **public** values go in the frontend. Copy them from Supabase → Project Settings → API (or *Connect*):

| Name | Where | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` and Vercel | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`) | `.env.local` and Vercel | the anon / publishable key (safe to expose; RLS protects data) |
| `GEMINI_API_KEY` | **Supabase Edge Function secret only** | your Gemini key. Never put it in a `VITE_` variable: those are bundled into the public site. |

Never put the `service_role` / secret key anywhere in this project.

## Run locally

Needs Node.js 18+.

```bash
cp .env.example .env.local   # then fill in the two values
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/
```

> The mic needs a **secure context**: `localhost` or `https://`.

## Supabase setup (one time)

1. **Schema:** apply the SQL files in `supabase/migrations/` in order (SQL editor, or `supabase db push` with the CLI).
2. **Gemini key:** get one at <https://aistudio.google.com/apikey>, then in the dashboard open **Edge Functions → Secrets** and add `GEMINI_API_KEY`.
   CLI alternative: `supabase secrets set GEMINI_API_KEY=... --project-ref <ref>`.
   Until it's set, the app shows "AI key not set up yet".
3. **Edge Function:** `supabase functions deploy ai --project-ref <ref>` (JWT verification stays on; the function also checks the user with `auth.getUser`). It accepts text turns and optional `audio/*` inline data (for future pronunciation feedback), with a ~12 MB request limit.
4. **Auth URLs:** Authentication → URL Configuration:
   - **Site URL:** your Vercel URL, e.g. `https://speakup-daily.vercel.app`
   - **Redirect URLs:** add `https://speakup-daily.vercel.app/**`, `https://*-<your-vercel-team>.vercel.app/**` (preview deploys) and `http://localhost:5173/**`.
   Magic links and sign-up confirmation emails redirect back to these.
5. **Email:** the built-in Supabase email sender is only for testing (very low hourly limit). For real use, add custom SMTP (Authentication → Emails → SMTP), e.g. Resend or Brevo free tier. Alternatively turn off *Confirm email* if only you will use the app.

## Deploy to Vercel

1. Import the GitHub repo at <https://vercel.com/new>. Framework preset **Vite** (build `npm run build`, output `dist`), already set in `vercel.json`.
2. Add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Production + Preview), then deploy.
3. `vercel.json` rewrites every path to `index.html`, so routes like `/phrases` work on refresh.
4. Put the Vercel URL into Supabase Auth URL settings (step 4 above).

## Moving old browser data

Data from the old browser-only version (localStorage key `speakup:v1`) is detected on first sign-in in that browser, and **Import my saved practice** copies it into the account. Each item keeps its old id in `client_id`, so importing again (or importing the same JSON backup from Settings) skips what's already there. **Settings → Export JSON** still downloads a full backup.

## Browser support
- **Speech-to-text (mic):** Chrome, Edge (desktop and Android) and Safari (macOS/iOS 14.5+). Firefox does not support it yet, so you can type instead. Chrome's recognition uses Google's online service, so it needs internet.
- **Read aloud:** all modern browsers; the voices available depend on your OS.

## Project structure
```
src/
  lib/        supabase.ts (client), auth.tsx (sign-in gate), db.ts (load / diff-save / import / reset),
              store.tsx (app state + background saving), gemini.ts (calls the `ai` Edge Function, demo mode),
              ai.ts (prompts), mock.ts (demo answers), speech.ts, recorder.ts, fluency.ts, srs.ts, diff.ts, stats.ts
  components/ MicInput, ListenPlayer, ShadowPractice, FluencyCard, ImportBanner, Layout…
  pages/      Auth, Welcome, Today, Chat, Phrases, History, Progress, Profile, Settings
supabase/
  migrations/         schema, RLS, signup trigger, storage bucket
  functions/ai/       Gemini proxy Edge Function
  database.types.ts   generated types
scripts/
  e2e-supabase.mjs    end-to-end test against Supabase with a throwaway user (puppeteer-core + Chrome)
  screenshots*.mjs    older demo-mode screenshot scripts (written for the browser-only version)
```
