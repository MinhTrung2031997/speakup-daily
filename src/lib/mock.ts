import type { GeminiTurn } from './gemini';

/** Canned responses used in demo mode (API key "demo") and for testing without a key. */
const QUESTIONS = [
  { question: "Okay real talk: what's one app or tool you use every day that you honestly couldn't live without? 😄", starters: ['A tool you use at work', 'How it saves you time', 'What life was like before it'] },
  { question: "If you could work from anywhere for a month, where would you go and why?", starters: ['A city you dream about', 'Cafés, weather, or cost of living', 'How you would balance work and fun'] },
  { question: "What's a Vietnamese dish you'd recommend to a foreigner trying it for the first time?", starters: ['Your favourite street food', 'Where to eat it in your city', 'A funny food memory'] },
  { question: "Do you think AI will make our jobs easier or harder in the next five years?", starters: ['Something AI already helps you with', 'A worry you have', 'Skills that will still matter'] },
  { question: "What do you usually do to relax after a long day?", starters: ['A hobby that clears your head', 'Games, music, or going out', 'Why it works for you'] },
];
let qi = 0;

export function mockResponse(task: string, turns: GeminiTurn[]): unknown {
  const last = turns[turns.length - 1]?.text || '';
  switch (task) {
    case 'question': {
      const seed = last.match(/Seed question: "([^"]+)"/)?.[1];
      if (seed) return { question: seed, starters: ['Think about your work as a developer', 'One real example from last month', 'How you feel about it now'] };
      const q = QUESTIONS[qi % QUESTIONS.length];
      qi++;
      return q;
    }
    case 'upgrade':
      return {
        natural:
          "Honestly, I'd say Notion is the one app I couldn't live without. The thing is, my job as a developer is full of small tasks, and if I don't write them down, I forget half of them. On top of that, I use it to plan my English practice too. For example, last week I had three deadlines at the same time, and having everything in one place really kept me from panicking. So yeah, at the end of the day, it's basically my second brain.",
        structure: {
          point: "Honestly, I'd say Notion is the one app I couldn't live without.",
          reason: "The thing is, my job as a developer is full of small tasks, and if I don't write them down, I forget half of them. On top of that, I use it to plan my English practice too.",
          example: 'For example, last week I had three deadlines at the same time, and having everything in one place really kept me from panicking.',
          wrapUp: "So yeah, at the end of the day, it's basically my second brain.",
        },
        phrases: [
          { phrase: 'The thing is', meaning: 'Used to introduce the main reason or problem.', example: "The thing is, I don't have much free time on weekdays." },
          { phrase: 'On top of that', meaning: 'In addition; used to add another point.', example: "It's cheap, and on top of that, it's really fast." },
          { phrase: 'kept me from panicking', meaning: 'Stopped me from feeling very stressed.', example: 'Making a list kept me from panicking before the exam.' },
          { phrase: 'at the end of the day', meaning: 'When everything is considered; finally.', example: "At the end of the day, health is more important than money." },
          { phrase: 'my second brain', meaning: 'A tool that remembers things for you.', example: 'My phone is like my second brain.' },
        ],
        corrections: [
          { original: 'I can not live without', better: "I couldn't live without", why: "We use \"couldn't\" for imagined situations, and it sounds more natural when speaking." },
          { original: 'it help me remember', better: 'it helps me remember', why: 'Add -s to the verb after "it" in the present simple.' },
          { original: 'many small task', better: 'lots of small tasks', why: '"Task" needs -s here, and "lots of" sounds more casual.' },
        ],
        encouragement: 'Great job giving a real reason from your own work. That makes your answer sound personal and believable!',
      };
    case 'retry':
      return {
        used: ['The thing is', 'On top of that', 'at the end of the day'],
        missed: ['kept me from panicking', 'my second brain'],
        score: 78,
        tip: 'Try pausing briefly instead of saying "uh" between ideas, and link your example with "For example, last week...".',
        praise: 'You used three new phrases naturally and kept a clear structure. Nice work!',
      };
    case 'builder-retry': {
      const targets: string[] = JSON.parse(last.match(/Target phrases: (\[.*\])/)?.[1] || '[]');
      const attempt = (last.split('WITHOUT looking')[1] || '').toLowerCase();
      const used = targets.filter((t) => attempt.includes(t.toLowerCase()));
      return {
        used,
        missed: targets.filter((t) => !used.includes(t)),
        score: Math.min(95, 55 + used.length * 10),
        tip: 'Pause for a second between parts instead of saying "uh", and start your wrap-up with "At the end of the day…".',
        praise: used.length ? `Nice! You used "${used[0]}" naturally.` : 'Good start! Your idea was clear and easy to follow.',
      };
    }
    case 'chat-start':
      return { reply: "Hey! 👋 Quick question for you: what's one app you literally use every single day?", nudge: '' };
    case 'chat':
      return {
        reply: /notion|app|tool/i.test(last)
          ? "Oh nice, I love that! I'm more of a sticky-notes person, haha. What's the first thing you open it for in the morning?"
          : "Haha, that makes sense. I feel the same sometimes. So what got you into that in the first place?",
        nudge: 'Try using "The thing is…" to explain your reason.',
      };
    case 'chat-feedback':
      return {
        summary: 'You kept the chat going naturally and shared real details about your life. Well done!',
        goodPoints: ['You answered with clear reasons.', 'You asked a question back, which keeps the conversation alive.'],
        improve: ['Instead of "I very like it", say "I really like it".', 'Link ideas with "On top of that" instead of starting every sentence with "And".'],
        phrasesUsed: ['The thing is'],
      };
    case 'wordcheck': {
      const phrase = (last.match(/Target phrase: (.+)/)?.[1] || '').trim();
      const said = (last.match(/"""([\s\S]*?)"""/)?.[1] || '').toLowerCase();
      const has = !!phrase && said.includes(phrase.toLowerCase());
      const close = !has && phrase.split(' ').filter((w) => w.length > 3).some((w) => said.includes(w.toLowerCase()));
      const lvl = has ? 'natural' : close ? 'understandable' : 'off';
      return {
        used: has || close, level: lvl,
        feedback: lvl === 'natural' ? 'Nice! You used it naturally.' : lvl === 'understandable' ? 'The meaning is right; just fix the form a little.' : `You didn't use "${phrase}" here. Try once more with the exact phrase.`,
        betterSentence: `Honestly, ${phrase} is something I say a lot at work now.`, nextReviewDays: 3,
      };
    }
    case 'compare': {
      const targets = JSON.parse(last.match(/Target phrases the learner was asked to use \(grade each\): (\[.*\])/)?.[1] || '[]') as string[];
      const newA = (last.match(/NEW answer[^"]*"""([\s\S]*?)"""/)?.[1] || '').toLowerCase();
      return {
        improved: ['Added a clear reason', 'Gave a concrete example from work'],
        fixNext: 'Finish with a one-line wrap-up so the listener knows you are done.',
        wordsUsed: [], structureOld: 'Point only', structureNew: 'Point → Reason → Example',
        score: { old: 4, new: 7 },
        upgradedSentence: 'The thing is, I learn faster when I explain my ideas out loud.',
        targets: targets.map((t) => ({ phrase: t, level: newA.includes(t.toLowerCase()) ? 'natural' : 'off', fix: newA.includes(t.toLowerCase()) ? 'Used clearly and in the right place.' : `Not used. Try: "${t}, I think it really helps."` })),
      };
    }
    case 'fillblank': {
      const phrase = (last.match(/Phrase: (.+)/)?.[1] || 'on top of that').trim();
      const sentence = `I missed the bus, and ${phrase} it started to rain.`;
      return { sentence, blanked: sentence.replace(phrase, '____'), options: ['in the long run', phrase, 'as a matter of fact', 'by the way'], answer: 1 };
    }
    case 'situation': {
      const list = JSON.parse(last.match(/Phrase list \(the learner can see these and must pick one\): (\[.*\])/)?.[1] || '[]') as { phrase: string }[];
      return { setting: 'work', scene: 'Your teammate on Discord asks why you moved your stand-up to the afternoon.', sayThis: 'Reply in 2–3 spoken sentences. Pick the phrase from your list that fits best.', intended: list[0]?.phrase || '', alsoOk: [] };
    }
    case 'speedround': {
      const list = JSON.parse(last.match(/Target phrases: (\[.*\])/)?.[1] || '[]') as { phrase: string }[];
      const said = (last.match(/"""([\s\S]*?)"""/)?.[1] || '').toLowerCase();
      return { results: list.map((p) => ({ phrase: p.phrase, level: said.includes(p.phrase.toLowerCase()) ? 'natural' : 'off', feedback: said.includes(p.phrase.toLowerCase()) ? 'Used naturally.' : 'Missing.', better: `I think ${p.phrase} fits here.` })), tip: 'Link the phrases with "and" or "so" instead of starting a new sentence each time.' };
    }
    case 'meanings': {
      const list = JSON.parse(last.match(/Phrases: (\[.*\])/)?.[1] || '[]') as string[];
      return { items: list.map((p) => ({ phrase: p, meaning: `a natural way to say "${p}" in conversation`, example: `I use "${p}" when I chat with my team.` })) };
    }
    case 'review':
      return {
        ok: last.length > 15,
        feedback: last.length > 15 ? 'Nice! You used the phrase naturally in your own sentence.' : 'Good try! Your sentence is a bit short. Try adding a reason.',
        better: "The thing is, I really need more practice speaking, not just reading.",
      };
    case 'builder-question': {
      const type = (last.match(/Question type: (.+)/)?.[1] || 'Opinion').trim();
      const b = BUILDER[type] || BUILDER.Opinion;
      return { question: b.question, slots: b.rows.map((r) => r.slot) };
    }
    case 'builder-ideas': {
      const slots: string[] = JSON.parse(last.match(/Answer parts: (\[.*\])/)?.[1] || '[]');
      const all = Object.values(BUILDER).flatMap((b) => b.rows);
      return { rows: slots.map((slot, i) => ({ slot, options: (all.find((r) => r.slot === slot) || BUILDER.Opinion.rows[i % 4]).options })) };
    }
    case 'builder-answer': {
      const slots: string[] = JSON.parse(last.match(/Answer parts in order: (\[.*\])/)?.[1] || '[]');
      // "➕ Another angle": a different stance and different phrases; longer answers fill the extra parts.
      const stance = last.match(/Stance for this version: (agree|disagree|it depends)/)?.[1] || '';
      const alt = /Write a NEW version/.test(last) ? BUILDER_ALT[stance] || BUILDER_ALT.disagree : null;
      const base = alt || BUILDER_ANSWER;
      const extraText: Record<string, string> = {
        'Reason 2': "On top of that, it's kind of a learning tool, since you can ask it why something works.",
        'Example 2': 'Last month I picked up a new library way faster just by asking it questions.',
        'Personal touch': "For me personally, it's taken a lot of stress off my plate.",
        'On the other hand': "On the other hand, I get why some people worry that juniors won't learn the basics.",
        'Second point': "Another thing is that it's just more fun to work this way.",
        'Short example': 'Like, I fixed a weird bug in ten minutes instead of an hour.',
      };
      const main = base.parts;
      let k = 0;
      const parts = slots.map((slot, i) => {
        if (extraText[slot]) return { slot, text: extraText[slot] };
        const isLast = i === slots.length - 1;
        const text = isLast ? main.slice(k).join(' ') : main[k] || '';
        k++;
        return { slot, text };
      }).filter((p) => p.text).map((p, i) => (/Length matters/.test(last) ? { ...p, text: `${p.text} ${LONG_FILL[i % LONG_FILL.length]}` } : p));
      const ideaLabels = alt ? ['I mostly disagree', 'You stop thinking', 'Copy-paste bugs', 'Learn the basics first', 'A bit more'] : ['It really depends', 'Saves time on boring work', 'Writing tests at work', 'Use it, but check it', 'A bit more'];
      const ideas = /"ideas":/.test(last) ? Object.fromEntries(slots.map((s, i) => [s, extraText[s] ? s.toLowerCase() : ideaLabels[i % ideaLabels.length]])) : undefined;
      return { answer: parts.map((p) => p.text).join(' '), parts, phrases: base.phrases, ...(ideas ? { ideas } : {}) };
    }
    case 'listen-drill':
      return LISTEN_DRILL;
    case 'pronunciation':
      return mockPronunciation(last);
    case 'listen-retell': {
      const retell = (last.split('60-second retell')[1] || '').toLowerCase();
      const covered = LISTEN_DRILL.keyIdeas.filter((k) => k.toLowerCase().split(' ').filter((w) => w.length > 4).some((w) => retell.includes(w)));
      const used = LISTEN_DRILL.phrases.map((p) => p.phrase).filter((p) => retell.includes(p.toLowerCase()));
      return {
        ideasCovered: covered,
        ideasMissed: LISTEN_DRILL.keyIdeas.filter((k) => !covered.includes(k)),
        phrasesUsed: used,
        score: covered.length ? Math.min(95, 40 + covered.length * 12 + used.length * 5) : 25,
        tip: 'Start with the big picture ("They were talking about…"), then add one detail for each speaker.',
        praise: covered.length ? 'You caught the main idea of the chat. Nice listening!' : 'Good effort! Try to say who wanted what.',
        modelRetell: "Alex and Sam were talking about working from home. Alex said it saves a ton of time because there's no traffic, but sometimes it gets a bit lonely. Sam prefers the office because chatting with the team keeps him going. In the end, they agreed that a mix of both is probably the sweet spot.",
      };
    }
    case 'sayitbetter':
      return {
        understood: "I've been tired lately, probably because I work too much.",
        literalTrap: 'Recently I am a little tired, maybe because I work many.',
        versions: [
          { style: 'casual', english: "I've been pretty wiped out lately. I think I'm just working too much.", keyPhrase: 'wiped out', meaning: 'Very tired.', whyNatural: 'Friends say "wiped out" or "worn out" when they are tired.' },
          { style: 'neutral', english: "I've been feeling tired lately, probably because I've been working too much.", keyPhrase: "I've been feeling tired", meaning: 'I have felt tired for some time.', whyNatural: '"Lately" goes with the present perfect, not the simple present.' },
          { style: 'polished', english: "I've been run down recently, most likely because of my workload.", keyPhrase: 'run down', meaning: 'Tired and a bit unwell from stress.', whyNatural: '"Workload" sounds right in a meeting or an email.' },
        ],
        tip: 'Use the present perfect with "lately" or "recently": "I\'ve been tired", not "I am tired lately".',
      };
    case 'saygrade': {
      const said = (last.match(/"""([\s\S]*?)"""/)?.[1] || '').toLowerCase();
      const key = (last.match(/key phrase: "([^"]+)"/)?.[1] || '').toLowerCase();
      const words = said.split(/\s+/).filter(Boolean).length;
      const has = !!key && said.includes(key);
      const lvl = has ? 'natural' : words >= 4 ? 'understandable' : 'off';
      return {
        meaningKept: words >= 4, level: lvl, usedKeyPhrase: has,
        feedback: lvl === 'natural' ? 'Nice, that sounds natural and keeps your meaning.' : lvl === 'understandable' ? 'Your meaning is clear. Try using the key phrase from the model.' : "I couldn't hear the idea. Try saying the whole thought again.",
        betterSentence: "I've been pretty wiped out lately because I'm working too much.",
      };
    }
    case 'ping':
      return { message: 'Hello! Demo mode is working 🎉' };
    default:
      return {};
  }
}

/** Demo data for the Answer builder (one sample question + idea rows per question type). */
const BUILDER: Record<string, { question: string; rows: { slot: string; options: string[] }[] }> = {
  Opinion: {
    question: 'Do you think AI coding tools make developers better or just lazier? 🤔',
    rows: [
      { slot: 'Stance', options: ['Mostly better, honestly', 'A bit lazier, sadly', 'It depends on the person', 'Both, at the same time'] },
      { slot: 'Reason', options: ['Saves time on boring code', 'Easy to stop thinking deeply', 'Helps me learn new libraries', 'Junior devs skip the basics'] },
      { slot: 'Example', options: ['Writing tests with AI at work', 'Fixing a bug I did not understand', 'Learning a new framework quickly', 'Copying code without reading it'] },
      { slot: 'Wrap-up', options: ['Use it, but check everything', 'It is a tool, not a brain', 'Ask what others think', 'Still learning how to use it'] },
    ],
  },
  Experience: {
    question: 'Tell me about a time a new app or tool really changed how you work.',
    rows: [
      { slot: 'Situation', options: ['A busy week at work', 'Starting a new project', 'Working from home', 'Learning something new'] },
      { slot: 'What happened', options: ['Tried an AI tool for the first time', 'The team moved to a new app', 'A tool fixed a slow task', 'Everything broke at first'] },
      { slot: 'How I felt', options: ['Surprised and a bit excited', 'Stressed at first', 'Relieved and more relaxed', 'Proud of learning it'] },
      { slot: 'Lesson', options: ['Try new tools early', 'Give changes some time', 'Good tools save energy', 'Ask the team for tips'] },
    ],
  },
  Compare: {
    question: 'Working from home or working at the office: which one works better for you?',
    rows: [
      { slot: 'Both sides', options: ['Home is quiet but lonely', 'Office is social but noisy', 'Home saves travel time', 'Office helps me focus'] },
      { slot: 'My pick', options: ['Home, most days', 'The office, honestly', 'A mix of both', 'Depends on the week'] },
      { slot: 'Why', options: ['No traffic in the morning', 'I like chatting with my team', 'Easier to focus on code', 'More time for hobbies'] },
    ],
  },
  Describe: {
    question: "What's your favourite place to work or study in your city like?",
    rows: [
      { slot: 'Overview', options: ['A small quiet coffee shop', 'My desk at home', 'A coworking space', 'The office near my home'] },
      { slot: 'Detail 1', options: ['Fast Wi-Fi and good coffee', 'Lots of light and plants', 'Not too many people', 'Close to where I live'] },
      { slot: 'Detail 2', options: ['Soft music in the background', 'Comfortable chairs', 'Friendly staff', 'Cheap drinks'] },
      { slot: 'Why it matters', options: ['I focus much better there', 'It helps me relax', 'It feels like my second home', 'Good place to meet friends'] },
    ],
  },
  Hypothetical: {
    question: 'If you could learn any new skill in one month, what would you pick?',
    rows: [
      { slot: 'My choice', options: ['Speaking English fluently', 'Building my own app', 'Cooking real Vietnamese food', 'Playing the guitar'] },
      { slot: 'Reason', options: ['Useful for my career', 'Fun to do with friends', 'I always wanted to try it', 'Helps me relax after work'] },
      { slot: 'My plan', options: ['Practise a little every day', 'Find an online course', 'Join a group or club', 'Ask a friend to teach me'] },
    ],
  },
  'Small talk': {
    question: "How's your week going so far? Anything fun coming up this weekend?",
    rows: [
      { slot: 'Quick answer', options: ['Pretty busy, to be honest', 'Not bad at all', 'A bit tiring', 'Really good so far'] },
      { slot: 'A bit more', options: ['Lots of meetings at work', 'Finally finished a big task', 'Playing games at night', 'Trying a new café'] },
      { slot: 'Question back', options: ['What about you?', 'Any plans for the weekend?', 'How is your work going?', 'Seen any good shows lately?'] },
    ],
  },
};

const BUILDER_ANSWER = {
  parts: [
    "Honestly, I'd say they make us better, mostly.",
    "The thing is, they save a ton of time on boring code, so I can focus on the parts that actually need my brain.",
    "Like at work, I use AI to write tests, and it gets the first draft done in no time.",
    "But at the end of the day, it's a tool, not a brain, so I always double-check what it gives me.",
  ],
  phrases: [
    { phrase: 'The thing is', meaning: 'Used to introduce the main reason.', example: "The thing is, I don't have much free time." },
    { phrase: 'a ton of time', meaning: 'A lot of time.', example: 'This shortcut saves a ton of time.' },
    { phrase: 'in no time', meaning: 'Very quickly.', example: "You'll learn it in no time." },
    { phrase: 'at the end of the day', meaning: 'When you think about what matters most.', example: "At the end of the day, practice is what counts." },
    { phrase: 'double-check', meaning: 'Check again to be sure.', example: 'Always double-check the address before you send it.' },
  ],
};

/** Demo data for the Listen tab. */
const LISTEN_DRILL = {
  title: 'Home or office?',
  lines: [
    { speaker: 'Alex', text: "Hey Sam, are you still working from home these days?" },
    { speaker: 'Sam', text: "Nah, I'm back at the office three days a week now. What about you?" },
    { speaker: 'Alex', text: "Still home, honestly. No traffic in the morning saves me a ton of time." },
    { speaker: 'Sam', text: "Oh nice, that's a big plus. Doesn't it get lonely, though?" },
    { speaker: 'Alex', text: "Yeah, sometimes. Some days I don't talk to anyone until lunch, which is kind of weird." },
    { speaker: 'Sam', text: "That's exactly why I went back. Chatting with the team really keeps me going." },
    { speaker: 'Alex', text: "Fair enough. But I focus way better when it's quiet, so I get more done at home." },
    { speaker: 'Sam', text: "Makes sense. Maybe a mix of both is the sweet spot." },
    { speaker: 'Alex', text: "Totally. I might try going in on Fridays and see how it goes." },
  ],
  questions: [
    { q: 'What are Alex and Sam mainly talking about?', options: ['Working from home or at the office', 'Their favourite lunch places', 'A new project at work', 'Traffic in the city'], answer: 0 },
    { q: 'How many days a week is Sam at the office now?', options: ['One', 'Two', 'Three', 'Five'], answer: 2 },
    { q: 'How does Sam feel about working with the team in person?', options: ['It makes him tired', 'It keeps him motivated', "He doesn't care", 'It is too noisy'], answer: 1 },
  ],
  dictation: 'No traffic in the morning saves me a ton of time.',
  keyIdeas: ['Alex works from home and saves time with no traffic', 'Working from home can feel lonely', 'Sam went back to the office to chat with the team', 'They agree a mix of both is best'],
  phrases: [
    { phrase: 'a ton of time', meaning: 'A lot of time.', example: 'Cooking at home takes a ton of time.' },
    { phrase: 'keeps me going', meaning: 'Gives me energy to continue.', example: 'Good music keeps me going at the gym.' },
    { phrase: 'the sweet spot', meaning: 'The best balance.', example: 'Two coffees a day is my sweet spot.' },
    { phrase: 'see how it goes', meaning: 'Try it and wait for the result.', example: "Let's try the new plan and see how it goes." },
  ],
};

/* Demo pronunciation check: picks believable problem words from what was said. */
const PRON_BANK: Record<string, { heard: string; issue: string; tip: string; ipa: string }> = {
  work: { heard: 'wor', issue: 'final-consonant', tip: 'Finish with a clear /k/: wor-K.', ipa: 'wɜːrk' },
  asked: { heard: 'ask', issue: 'final-consonant', tip: 'Say both endings: ask-T (sounds like "askt").', ipa: 'æskt' },
  months: { heard: 'mon', issue: 'final-consonant', tip: 'Keep the "-nths" ending: mun-THS.', ipa: 'mʌnθs' },
  think: { heard: 'tink', issue: 'th', tip: 'Tongue between your teeth, then blow: TH-ink.', ipa: 'θɪŋk' },
  three: { heard: 'tree', issue: 'th', tip: 'Tongue between your teeth for "th", not "t".', ipa: 'θriː' },
  things: { heard: 'tings', issue: 'th', tip: 'Soft "th" plus a buzzing /z/ at the end.', ipa: 'θɪŋz' },
  developer: { heard: 'DE-ve-lo-per', issue: 'stress', tip: 'Stress the 2nd syllable: de-VEL-o-per.', ipa: 'dɪˈveləpər' },
  develop: { heard: 'DE-ve-lop', issue: 'stress', tip: 'Stress the 2nd syllable: de-VEL-op.', ipa: 'dɪˈveləp' },
  she: { heard: 'see', issue: 's-sh', tip: 'Round your lips and push air: "shh-ee".', ipa: 'ʃiː' },
  short: { heard: 'sort', issue: 's-sh', tip: 'Round your lips for "sh": SH-ort.', ipa: 'ʃɔːrt' },
  finished: { heard: 'finis', issue: 'final-consonant', tip: 'End with "sht": fi-ni-SHT.', ipa: 'ˈfɪnɪʃt' },
  project: { heard: 'pro-JECT', issue: 'stress', tip: 'As a noun, stress the 1st syllable: PRO-ject.', ipa: 'ˈprɑːdʒekt' },
  important: { heard: 'im-por-tan', issue: 'final-consonant', tip: 'Stress POR and finish the /t/: im-POR-tant.', ipa: 'ɪmˈpɔːrtənt' },
  because: { heard: 'bi-cau', issue: 'final-consonant', tip: 'End with a buzzing /z/: be-CAUZ.', ipa: 'bɪˈkɔːz' },
  this: { heard: 'dis', issue: 'th', tip: 'Voiced "th": tongue between teeth, then hum.', ipa: 'ðɪs' },
};

function mockPronunciation(prompt: string): unknown {
  const said = (prompt.match(/recognition heard[^"]*"""([\s\S]*?)"""/)?.[1] || prompt.match(/trying to say: """([\s\S]*?)"""/)?.[1] || '').trim();
  const words = said.split(/\s+/).map((w) => w.replace(/[^A-Za-z']/g, '')).filter(Boolean);
  const picked: Array<Record<string, string>> = [];
  const seen = new Set<string>();
  for (const w of words) {
    const k = w.toLowerCase();
    if (PRON_BANK[k] && PRON_BANK[k].tip && !seen.has(k)) { seen.add(k); picked.push({ word: w, ...PRON_BANK[k] }); }
    if (picked.length >= 4) break;
  }
  // Fill up to 3 with words ending in a consonant cluster (a typical final-consonant slip).
  for (const w of words) {
    if (picked.length >= 3) break;
    const k = w.toLowerCase();
    if (seen.has(k) || w.length < 4 || !/(ed|ks|ts|st|nd|ct|ld|ps)$/i.test(w)) continue;
    seen.add(k);
    picked.push({ word: w, heard: w.slice(0, -1), issue: 'final-consonant', tip: `Don't drop the end: say the final "${w.slice(-1)}" clearly.`, ipa: '' });
  }
  const fillers: Record<string, number> = {};
  for (const f of ['um', 'uh', 'like', 'you know']) {
    const c = (said.toLowerCase().match(new RegExp(`\\b${f}\\b`, 'g')) || []).length;
    if (c) fillers[f] = c;
  }
  if (!Object.keys(fillers).length && words.length > 12) fillers.um = 1;
  const n = words.length;
  return {
    transcript: said,
    score: n ? Math.max(55, 86 - picked.length * 4) : 0,
    clarity: 'Mostly clear. A few word endings got swallowed.',
    intonation: 'Good rise and fall, a little flat on long sentences.',
    pace: 'Comfortable pace; slow down slightly on key words.',
    wpm: n ? 118 : 0,
    fillers,
    longPauses: n > 15 ? 1 : 0,
    longestPause: n > 15 ? 1.8 : 0,
    words: picked,
    rhythmTip: /want to/i.test(said) ? 'Link "want to" → "wanna" in casual speech.' : 'Link words together: "a lot of" → "a-lo-dəv". Stress the key words, not every word.',
    wellDone: 'Your vowels are clear and your sentences sound confident.',
  };
}

/** Demo "➕ Another angle" versions (different stance, different phrases). */
const BUILDER_ALT: Record<string, { parts: string[]; phrases: { phrase: string; meaning: string; example: string }[] }> = {
  disagree: {
    parts: [
      "To be honest, I'm not so sure they make us better.",
      'A lot of people just stop thinking and take whatever it spits out.',
      "I've seen code that was copy-pasted straight from AI and nobody really got how it worked.",
      'So yeah, I think you gotta learn the basics first, then let the tool help.',
    ],
    phrases: [
      { phrase: "I'm not so sure", meaning: 'a soft way to disagree', example: "I'm not so sure that's a good idea." },
      { phrase: 'spits out', meaning: 'produces quickly, without care', example: 'The printer spits out ten pages a minute.' },
      { phrase: 'nobody really got', meaning: 'nobody understood', example: 'Nobody really got the joke.' },
      { phrase: 'you gotta', meaning: 'you have to (casual)', example: 'You gotta try this coffee.' },
    ],
  },
  'it depends': {
    parts: [
      'Honestly, it kind of depends on how you use it.',
      "If you treat it like a teammate, it's super helpful, but if you let it do everything, you get rusty.",
      'Like, when I review its code line by line, I actually learn new tricks.',
      "So I'd say it's a double-edged sword, and it's on us to use it well.",
    ],
    phrases: [
      { phrase: 'it kind of depends', meaning: 'the answer is not simple', example: 'It kind of depends on the weather.' },
      { phrase: 'get rusty', meaning: 'become worse at a skill from not using it', example: 'My French got rusty.' },
      { phrase: 'a double-edged sword', meaning: 'something with good and bad sides', example: 'Remote work is a double-edged sword.' },
      { phrase: "it's on us", meaning: "it's our responsibility", example: "It's on us to finish this today." },
    ],
  },
  agree: {
    parts: [
      "Yeah, I'm all for it, to be honest.",
      'It frees up so much headspace for the stuff that matters.',
      'The other day it wrote all my boilerplate while I focused on the tricky logic.',
      "So for me it's a no-brainer: use it, just keep your eyes open.",
    ],
    phrases: [
      { phrase: "I'm all for it", meaning: 'I fully support it', example: "A four-day week? I'm all for it." },
      { phrase: 'frees up', meaning: 'gives you more of something', example: 'Cooking on Sunday frees up my week.' },
      { phrase: 'a no-brainer', meaning: 'an easy decision', example: "Taking the job was a no-brainer." },
      { phrase: 'keep your eyes open', meaning: 'stay careful and alert', example: 'Keep your eyes open for typos.' },
    ],
  },
};

/** Demo: extra sentences so "Extended" answers reach ~250 words. */
const LONG_FILL = [
  "And I don't think that's going to change any time soon.",
  'That alone saves me a good hour or two every single week.',
  "It's not perfect, but it's way better than doing it all by hand.",
  'Even my teammates noticed I was shipping things a lot faster.',
  'I try to read every line it writes, just to stay sharp myself.',
  'It honestly made my workdays feel a lot less stressful than before.',
  "And to be fair, that's a pretty reasonable worry to have.",
  "That's pretty much how I see it right now, anyway.",
];
