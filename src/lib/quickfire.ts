// Quick-fire questions for the speed meter. 45 easy + 15 open. Mostly non-work (max ~3 work/tech).
// level 'easy' = 3s start limit; 'open' = unlocked when avg start < 2s for 3 rounds.
export type QuickFire = { q: string; topic: string; level: 'easy' | 'open' };

export const QUICK_FIRE: QuickFire[] = [
  // food
  { q: 'What did you eat today?', topic: 'food', level: 'easy' },
  { q: 'Coffee or tea?', topic: 'food', level: 'easy' },
  { q: 'Sweet or salty snacks?', topic: 'food', level: 'easy' },
  { q: "What's the last thing you cooked?", topic: 'food', level: 'easy' },
  { q: 'Favorite street food?', topic: 'food', level: 'easy' },
  { q: 'Spicy food: yes or no?', topic: 'food', level: 'easy' },
  // daily life
  { q: 'What time did you wake up today?', topic: 'daily', level: 'easy' },
  { q: 'Morning person or night owl?', topic: 'daily', level: 'easy' },
  { q: 'How did you sleep last night?', topic: 'daily', level: 'easy' },
  { q: "What's the first thing you do after waking up?", topic: 'daily', level: 'easy' },
  { q: "What's in your bag right now?", topic: 'daily', level: 'easy' },
  { q: 'How do you usually get around the city?', topic: 'daily', level: 'easy' },
  { q: 'Rain or sunshine?', topic: 'weather', level: 'easy' },
  { q: "What's the weather like today?", topic: 'weather', level: 'easy' },
  // free time
  { q: 'What did you do last weekend?', topic: 'free time', level: 'easy' },
  { q: 'Any plans for tonight?', topic: 'free time', level: 'easy' },
  { q: 'Beach or mountains?', topic: 'travel', level: 'easy' },
  { q: 'Movies at home or at the cinema?', topic: 'free time', level: 'easy' },
  { q: "What's a show you're watching these days?", topic: 'free time', level: 'easy' },
  { q: 'What song is stuck in your head?', topic: 'music', level: 'easy' },
  { q: 'Do you play any sports?', topic: 'sport', level: 'easy' },
  { q: 'Cats or dogs?', topic: 'animals', level: 'easy' },
  { q: "What's your favorite way to relax?", topic: 'free time', level: 'easy' },
  { q: 'Last photo on your phone: what is it?', topic: 'daily', level: 'easy' },
  // travel
  { q: "Where's the last place you traveled?", topic: 'travel', level: 'easy' },
  { q: 'Window seat or aisle seat?', topic: 'travel', level: 'easy' },
  { q: "Where's one place you want to visit?", topic: 'travel', level: 'easy' },
  { q: 'Plan everything or go with the flow?', topic: 'travel', level: 'easy' },
  // people
  { q: 'Who did you talk to most today?', topic: 'people', level: 'easy' },
  { q: 'Big parties or small groups?', topic: 'people', level: 'easy' },
  { q: 'Text or call?', topic: 'people', level: 'easy' },
  { q: "Who's the funniest person you know?", topic: 'people', level: 'easy' },
  { q: 'When did you last see your family?', topic: 'family', level: 'easy' },
  // shopping and money
  { q: "What's the last thing you bought?", topic: 'shopping', level: 'easy' },
  { q: 'Shop online or in stores?', topic: 'shopping', level: 'easy' },
  { q: 'Save it or spend it?', topic: 'money', level: 'easy' },
  // health
  { q: 'How many steps did you walk today?', topic: 'health', level: 'easy' },
  { q: 'Gym or outdoors?', topic: 'health', level: 'easy' },
  { q: 'How much water have you had today?', topic: 'health', level: 'easy' },
  // misc
  { q: 'Summer or winter?', topic: 'weather', level: 'easy' },
  { q: 'Books or podcasts?', topic: 'learning', level: 'easy' },
  { q: "What's something that made you smile today?", topic: 'mood', level: 'easy' },
  { q: 'How are you feeling right now, in one word?', topic: 'mood', level: 'easy' },
  { q: 'Phone on silent or loud?', topic: 'tech', level: 'easy' },
  { q: 'Working from home or the office?', topic: 'work', level: 'easy' },

  // open "why" kind
  { q: "What's your favorite meal, and why?", topic: 'food', level: 'open' },
  { q: 'Would you rather live in a city or the countryside? Why?', topic: 'life', level: 'open' },
  { q: "What's one thing you'd change about your city?", topic: 'city', level: 'open' },
  { q: "What's a habit you want to start, and why?", topic: 'habits', level: 'open' },
  { q: "What's the best trip you've ever had? What made it great?", topic: 'travel', level: 'open' },
  { q: 'If you had a free day tomorrow, what would you do?', topic: 'free time', level: 'open' },
  { q: "Who's someone you admire? Why?", topic: 'people', level: 'open' },
  { q: "What's something you changed your mind about?", topic: 'opinions', level: 'open' },
  { q: 'Is it better to rent or buy a home? Why?', topic: 'money', level: 'open' },
  { q: "What's a movie everyone loves that you don't?", topic: 'free time', level: 'open' },
  { q: 'What would you do with an extra hour every day?', topic: 'life', level: 'open' },
  { q: "What's the best advice you've ever gotten?", topic: 'life', level: 'open' },
  { q: 'Should kids have phones? Why or why not?', topic: 'opinions', level: 'open' },
  { q: "What's something small that makes your day better?", topic: 'mood', level: 'open' },
  { q: "What's one skill you'd love to learn, and why?", topic: 'learning', level: 'open' },
];

// Pick 8 for a round without repeats from the last few rounds; mix topics.
export function pickQuickFire(level: 'easy' | 'open', recent: string[], seed: number): QuickFire[] {
  const pool = QUICK_FIRE.filter(x => (level === 'open' ? true : x.level === 'easy') && !recent.includes(x.q));
  const src = pool.length >= 8 ? pool : QUICK_FIRE.filter(x => level === 'open' || x.level === 'easy');
  const arr = src.slice();
  let s = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  const out: QuickFire[] = []; const seen = new Set<string>();
  for (const x of arr) { if (out.length >= 8) break; if (!seen.has(x.topic)) { out.push(x); seen.add(x.topic); } }
  for (const x of arr) { if (out.length >= 8) break; if (!out.includes(x)) out.push(x); }
  // harder rounds: about half open questions
  return out;
}
