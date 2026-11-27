// Reminder copy for Today's plan push notifications. Written by EL for ET. No imports.
// Pick deterministically by date so it varies daily but is stable within a day:
//   pickReminder(kind, seed = 'YYYY-MM-DD', vars) -> { title, body }
// Placeholders: {name} {left} {mins} {q} {reviews} {streak}
// {left} = human summary built in code, e.g. "1 question + 6 reviews"; {q} = daily question (trim to ~60 chars).

export type ReminderKind = 'first' | 'evening' | 'streakRisk' | 'onlyReviews' | 'comeback' | 'done';

export const REMINDERS: Record<ReminderKind, { title: string; body: string }[]> = {
  first: [
    { title: "Today's English is ready 🎧", body: '{left}, about {mins} min. Start with: "{q}"' },
    { title: 'Quick question for you', body: '"{q}" Say it out loud, then {reviews} reviews. ~{mins} min.' },
    { title: 'Your 10-minute English break', body: "{left}. Grab a coffee and let's talk." },
    { title: 'Hey {name}, got a sec?', body: "Today's question is waiting: \"{q}\"" },
    { title: 'Small step, big streak', body: '{left} today, about {mins} min. You can knock it out before dinner.' },
    { title: 'Time to speak up 🗣️', body: "One question, a few reviews, done. {left}." },
    { title: 'Practice o\'clock', body: '{mins} minutes today: {left}. Easy win.' },
  ],
  evening: [
    { title: 'Still time tonight 🌙', body: '{left} left, about {mins} min. Finish it to keep your streak.' },
    { title: 'Before you call it a day', body: 'Answer "{q}" out loud. Two minutes, tops.' },
    { title: 'Quick one before bed?', body: "Today's question is still open. Say your answer, then your {reviews} reviews." },
    { title: "Don't leave it hanging", body: '{left} to go. Future you will thank you.' },
    { title: 'Last call for today', body: '{left} keeps the habit alive. About {mins} min.' },
  ],
  streakRisk: [
    { title: '🔥 {streak}-day streak at risk', body: '{left} keeps it alive. About {mins} min.' },
    { title: "Don't break the chain", body: '{streak} days in a row! The question plus {reviews} reviews keeps it going.' },
    { title: 'Save your streak', body: '{streak} days so far. Answer "{q}", do your reviews, and you\'re safe.' },
  ],
  onlyReviews: [
    { title: '{reviews} phrases want to say hi', body: 'Quick review, about {mins} min. Use them out loud and they stick.' },
    { title: 'Review time ⏱️', body: '{reviews} phrases are due. Say each one in your own sentence.' },
    { title: 'Keep the words alive', body: '{reviews} reviews today. Passive to active, one sentence at a time.' },
  ],
  comeback: [
    { title: 'Welcome back, {name} 👋', body: "Today's plan is short: just {left}. Easy restart." },
    { title: 'No pressure, just one question', body: 'Missed a day? Happens. Answer "{q}" and you\'re back on track.' },
    { title: 'Pick up where you left off', body: 'A lighter plan today: {left}, about {mins} min.' },
  ],
  done: [
    { title: 'Nice work today ✅', body: 'Plan done. {streak}-day streak. See you tomorrow!' },
    { title: 'That\'s a wrap 🎉', body: "You spoke English today. That's how it sticks." },
    { title: 'Done and dusted', body: '{streak} days in a row. Keep it rolling!' },
  ],
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickReminder(kind: ReminderKind, seed: string, vars: Record<string, string | number>): { title: string; body: string } {
  const list = REMINDERS[kind];
  const t = list[hash(kind + seed) % list.length];
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined && vars[k] !== '' ? String(vars[k]) : ''));
  return { title: fill(t.title).replace(/\s+,/g, ',').replace(/Hey ,/, 'Hey,').trim(), body: fill(t.body).trim() };
}

// Which kind to send (code side):
// first reminder: missed yesterday ? 'comeback' : (question answered ? 'onlyReviews' : 'first')
// streak rule (Nov 27): streak day = daily question + all due reviews done. If reviews = 0, code should drop the 'reviews' wording or use {left}.
// evening nudge (only if daily question not answered): streak >= 3 ? 'streakRisk' : 'evening'
// 'done' is optional (in-app toast when the plan completes, not a push).
