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
    case 'ping':
      return { message: 'Hello! Demo mode is working 🎉' };
    default:
      return {};
  }
}
