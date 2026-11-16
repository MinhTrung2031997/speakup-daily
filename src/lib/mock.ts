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
      const sentences = BUILDER_ANSWER.parts;
      const parts = slots.map((slot, i) => ({ slot, text: i === slots.length - 1 ? sentences.slice(i).join(' ') : sentences[i] || '' })).filter((p) => p.text);
      return { answer: sentences.join(' '), parts, phrases: BUILDER_ANSWER.phrases };
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
