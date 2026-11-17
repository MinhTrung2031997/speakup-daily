// Topic catalogue (ES's 17 topics in 4 groups) + 12 seed questions per topic.
// Written by EL, 17 Nov 2026. Drop-in replacement for src/lib/topics.ts
// (keeps ET's helpers and slugs; swaps the placeholder 10-string seeds
// for typed questions: { text, type, level }).
//
// Daily question: rotate through unused seeds (nextSeed) before generateQuestion
// writes a new one. The `group` field is the section in the topic filter.
import type { QuestionType, Topic } from './types';

export const TOPIC_GROUPS = ['Work & tech', 'Daily life', 'Culture & places', 'Opinions & small talk'] as const;
export type TopicGroup = (typeof TOPIC_GROUPS)[number];
/** Same as TopicGroup; some notes call this `section`. */
export type TopicSection = TopicGroup;

export interface BankQuestion {
  text: string;
  type: QuestionType;
  level?: 'B1' | 'B2';
}

export interface CatalogueTopic {
  id: string;
  name: string;
  emoji: string;
  /** Section in the topic filter (ES's 4 groups). */
  group: TopicGroup;
  questions: BankQuestion[];
}

// Old preset slugs are reused for the closest new topic, so existing rows (topic_id) keep filtering correctly:
// work → Career growth, tech → Software engineering, daily → Daily routine & habits, travel → Travel,
// opinions → Debates, hobbies → Movies, music & games, food → Food & cooking.
export const CATALOGUE: CatalogueTopic[] = [
  { id: 'tech', name: "Software engineering", emoji: '💻', group: 'Work & tech', questions: [
    { text: "What's the hardest bug you've ever fixed?", type: 'Experience', level: 'B2' },
    { text: "Do you prefer building new features or fixing bugs?", type: 'Compare', level: 'B1' },
    { text: "What does a good pull request look like to you?", type: 'Describe', level: 'B2' },
    { text: "If you could ban one habit on a coding team, what would it be?", type: 'Hypothetical', level: 'B2' },
    { text: "What are you building or learning on the code side lately?", type: 'Small talk', level: 'B1' },
    { text: "Is writing tests worth the time, or do they slow you down too much?", type: 'Opinion', level: 'B2' },
    { text: "Tell me about a time a tight deadline almost broke a project.", type: 'Experience', level: 'B2' },
    { text: "Would you rather work mostly on the frontend or the backend?", type: 'Compare', level: 'B1' },
    { text: "Walk me through how you usually start a new feature.", type: 'Describe', level: 'B1' },
    { text: "If you had to ship a small side project in one weekend, what would you build?", type: 'Hypothetical', level: 'B1' },
    { text: "Should juniors be allowed to push straight to main?", type: 'Opinion', level: 'B2' },
    { text: "How's the code been treating you this week? Anything interesting?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'ai', name: "AI & the future", emoji: '🤖', group: 'Work & tech', questions: [
    { text: "Would you trust AI to review your code?", type: 'Opinion', level: 'B1' },
    { text: "Tell me about a time an AI tool was confidently wrong. What did you do?", type: 'Experience', level: 'B2' },
    { text: "Do you find AI chatbots more helpful or more distracting at work?", type: 'Compare', level: 'B1' },
    { text: "What does a normal day with AI tools look like for you?", type: 'Describe', level: 'B1' },
    { text: "If AI could do half of your job next year, what would you spend that time on?", type: 'Hypothetical', level: 'B2' },
    { text: "Have you tried any new AI tool lately, or are you sticking with the same ones?", type: 'Small talk', level: 'B1' },
    { text: "Should companies tell customers when a reply was written by AI?", type: 'Opinion', level: 'B2' },
    { text: "Have you ever used an AI tool that actually saved you a lot of time? What happened?", type: 'Experience', level: 'B1' },
    { text: "Would you rather have a strong AI coding assistant or one extra teammate?", type: 'Compare', level: 'B1' },
    { text: "How would you explain AI to a friend who doesn't work in tech?", type: 'Describe', level: 'B1' },
    { text: "If you could train an AI on only one skill of yours, which skill would you pick?", type: 'Hypothetical', level: 'B2' },
    { text: "Are people around you excited about AI, or a bit tired of the hype?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'work', name: "Career growth", emoji: '📈', group: 'Work & tech', questions: [
    { text: "Where do you see yourself in 5 years?", type: 'Hypothetical', level: 'B1' },
    { text: "Would you rather become a specialist or a generalist?", type: 'Compare', level: 'B2' },
    { text: "Tell me about a skill you learned that really helped your career.", type: 'Experience', level: 'B1' },
    { text: "What does a good manager look like to you?", type: 'Describe', level: 'B2' },
    { text: "Do you think certifications are worth the time for developers?", type: 'Opinion', level: 'B2' },
    { text: "How's work going this week? Anything you're proud of?", type: 'Small talk', level: 'B1' },
    { text: "Is it better to change jobs every few years, or to stay longer in one place?", type: 'Compare', level: 'B2' },
    { text: "Tell me about a time you asked for more responsibility, or wish you had.", type: 'Experience', level: 'B2' },
    { text: "What does career progress mean to you, beyond a new title?", type: 'Describe', level: 'B2' },
    { text: "If your company paid for any course next month, what would you take?", type: 'Hypothetical', level: 'B1' },
    { text: "Should performance reviews happen often, or is once a year enough?", type: 'Opinion', level: 'B2' },
    { text: "What are you hoping to get better at this year, work-wise?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'remote', name: "Remote work & teams", emoji: '🏠', group: 'Work & tech', questions: [
    { text: "How do you handle disagreements with a teammate?", type: 'Describe', level: 'B1' },
    { text: "Do you work better from home, in the office, or with a mix of both?", type: 'Compare', level: 'B1' },
    { text: "Tell me about a time a chat message was completely misunderstood.", type: 'Experience', level: 'B2' },
    { text: "Should cameras be on in every meeting, or is that too much?", type: 'Opinion', level: 'B1' },
    { text: "If your team could keep only one chat or meeting tool, which one would you keep?", type: 'Hypothetical', level: 'B1' },
    { text: "How was your last team meeting? Short and useful, or a bit long?", type: 'Small talk', level: 'B1' },
    { text: "What does a healthy remote team look like to you?", type: 'Describe', level: 'B2' },
    { text: "Have you ever had to give a teammate difficult feedback? How did it go?", type: 'Experience', level: 'B2' },
    { text: "Is it easier to build trust in person, or can it work just as well over chat?", type: 'Compare', level: 'B2' },
    { text: "Should companies let people work from another country, or only from home in the same city?", type: 'Opinion', level: 'B2' },
    { text: "If you were leading a new team tomorrow, what's the first habit you'd set?", type: 'Hypothetical', level: 'B2' },
    { text: "What's your usual setup when you work from home?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'interviews', name: "Job interviews", emoji: '🎤', group: 'Work & tech', questions: [
    { text: "Tell me about a project you're proud of.", type: 'Experience', level: 'B1' },
    { text: "Are take-home assignments fair, or do they just take unpaid time?", type: 'Opinion', level: 'B2' },
    { text: "Would you rather have a tough live coding interview or a long take-home task?", type: 'Compare', level: 'B2' },
    { text: "What does a good interview question look like to you?", type: 'Describe', level: 'B2' },
    { text: "If you could redesign interviews at a company, what would you change?", type: 'Hypothetical', level: 'B2' },
    { text: "Have you been thinking about interviews lately, or are you settled for now?", type: 'Small talk', level: 'B1' },
    { text: "Tell me about a time an interview question really surprised you.", type: 'Experience', level: 'B2' },
    { text: "Should interviews test algorithms, or only the kind of work you'd do on the job?", type: 'Opinion', level: 'B2' },
    { text: "What's more important in a candidate: clear communication or strong technical skill?", type: 'Compare', level: 'B1' },
    { text: "Walk me through how you usually prepare for an interview.", type: 'Describe', level: 'B1' },
    { text: "If you had an interview tomorrow morning, how would you spend tonight?", type: 'Hypothetical', level: 'B1' },
    { text: "What's one question you'd want to ask the interviewer?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'daily', name: "Daily routine & habits", emoji: '☕', group: 'Daily life', questions: [
    { text: "What does a productive day look like for you?", type: 'Describe', level: 'B1' },
    { text: "Are you more of a morning person or a night owl?", type: 'Compare', level: 'B1' },
    { text: "Tell me about a habit you tried to start this year. Did it stick?", type: 'Experience', level: 'B1' },
    { text: "Is checking your phone first thing in the morning a bad habit, or is it fine?", type: 'Opinion', level: 'B1' },
    { text: "If you could add one hour to every day, how would you use it?", type: 'Hypothetical', level: 'B1' },
    { text: "How's your week been? Busy, or pretty relaxed?", type: 'Small talk', level: 'B1' },
    { text: "Walk me through a normal weekday from the moment you wake up.", type: 'Describe', level: 'B1' },
    { text: "Have you ever completely changed your sleep schedule? How did that go?", type: 'Experience', level: 'B2' },
    { text: "Do you prefer a strict routine, or do you like days that stay flexible?", type: 'Compare', level: 'B1' },
    { text: "Should weekends stay completely free of work, or is a little work okay?", type: 'Opinion', level: 'B2' },
    { text: "If you had to drop one daily habit to feel less tired, which one would go?", type: 'Hypothetical', level: 'B2' },
    { text: "What are you usually up to in the evening?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'food', name: "Food & cooking", emoji: '🍜', group: 'Daily life', questions: [
    { text: "What Vietnamese dish would you recommend to a foreigner?", type: 'Opinion', level: 'B1' },
    { text: "Tell me about the best meal you've had recently.", type: 'Experience', level: 'B1' },
    { text: "Do you prefer cooking at home or eating out?", type: 'Compare', level: 'B1' },
    { text: "What's your typical lunch on a workday like?", type: 'Describe', level: 'B1' },
    { text: "If you had to eat only one cuisine for a month, which would you pick?", type: 'Hypothetical', level: 'B1' },
    { text: "Had anything tasty today, or are you still waiting for the next meal?", type: 'Small talk', level: 'B1' },
    { text: "Is food delivery worth the money, or is it a bad habit?", type: 'Opinion', level: 'B2' },
    { text: "Have you ever tried to cook something ambitious and it went completely wrong?", type: 'Experience', level: 'B1' },
    { text: "Coffee or tea in the morning, and how do you like it?", type: 'Compare', level: 'B1' },
    { text: "What's your favourite place to eat nearby, and what's it like?", type: 'Describe', level: 'B1' },
    { text: "If a friend came over and the fridge was almost empty, what would you cook in 20 minutes?", type: 'Hypothetical', level: 'B1' },
    { text: "What's a snack you always go back to?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'health', name: "Health & fitness", emoji: '💪', group: 'Daily life', questions: [
    { text: "How do you stay healthy with a desk job?", type: 'Describe', level: 'B1' },
    { text: "Do you think standing desks and walking meetings actually help, or is that just hype?", type: 'Opinion', level: 'B2' },
    { text: "Tell me about a time you tried to get fitter. What worked, and what didn't?", type: 'Experience', level: 'B1' },
    { text: "Would you rather work out at home or go to a gym?", type: 'Compare', level: 'B1' },
    { text: "If your doctor said you had to move more every day, what would you actually do?", type: 'Hypothetical', level: 'B1' },
    { text: "How have your energy levels been this week? Sleeping okay?", type: 'Small talk', level: 'B1' },
    { text: "What does \"feeling healthy\" look like in your week, food and movement included?", type: 'Describe', level: 'B2' },
    { text: "Have you ever been so busy that your health clearly suffered? What happened?", type: 'Experience', level: 'B2' },
    { text: "Is sleep more important than exercise, or do they matter about the same?", type: 'Compare', level: 'B2' },
    { text: "Should companies give employees time to exercise during the workday?", type: 'Opinion', level: 'B2' },
    { text: "If you could fix one thing about your energy or health, what would it be?", type: 'Hypothetical', level: 'B1' },
    { text: "Doing anything active this weekend, or keeping it chill?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'money', name: "Money & shopping", emoji: '💰', group: 'Daily life', questions: [
    { text: "Are you a saver or a spender?", type: 'Compare', level: 'B1' },
    { text: "Do you think people spend too much on coffee and eating out?", type: 'Opinion', level: 'B1' },
    { text: "Tell me about a purchase you were really happy with.", type: 'Experience', level: 'B1' },
    { text: "What's your usual approach when you want to buy something expensive?", type: 'Describe', level: 'B2' },
    { text: "If you suddenly got two months of extra salary, what would you do with it?", type: 'Hypothetical', level: 'B1' },
    { text: "Bought anything interesting lately, or are you trying not to shop?", type: 'Small talk', level: 'B1' },
    { text: "Should online shops make returns very easy, or do people abuse that?", type: 'Opinion', level: 'B2' },
    { text: "Have you ever regretted a purchase almost immediately? What was it?", type: 'Experience', level: 'B1' },
    { text: "Do you prefer paying with cash, a card, or an e-wallet?", type: 'Compare', level: 'B1' },
    { text: "What does \"being good with money\" mean to you?", type: 'Describe', level: 'B2' },
    { text: "If you had to cut your monthly spending by 20%, where would you start?", type: 'Hypothetical', level: 'B2' },
    { text: "Anything you've been wanting to buy but talking yourself out of?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'travel', name: "Travel", emoji: '✈️', group: 'Culture & places', questions: [
    { text: "What's the best trip you've ever taken?", type: 'Experience', level: 'B1' },
    { text: "Is it better to plan every day of a trip, or just figure it out when you arrive?", type: 'Compare', level: 'B1' },
    { text: "What kind of traveller are you: food, nature, cities, or just relaxing?", type: 'Describe', level: 'B1' },
    { text: "Is it worth paying more for a nicer hotel, or should you spend that money on food and experiences?", type: 'Opinion', level: 'B2' },
    { text: "If you could go anywhere next month, where would you go and why?", type: 'Hypothetical', level: 'B1' },
    { text: "Got any trips coming up, or is this a stay-at-home season?", type: 'Small talk', level: 'B1' },
    { text: "Tell me about a time something went wrong while travelling. How did you handle it?", type: 'Experience', level: 'B2' },
    { text: "Would you rather take many short trips or one long trip a year?", type: 'Compare', level: 'B1' },
    { text: "What's the first thing you notice when you arrive in a new place?", type: 'Describe', level: 'B2' },
    { text: "Should people travel more in their own country before going abroad?", type: 'Opinion', level: 'B2' },
    { text: "If you had to travel with only a small backpack for two weeks, what would you leave out?", type: 'Hypothetical', level: 'B2' },
    { text: "Been anywhere fun recently, even just a short weekend trip?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'vietnam', name: "Life in Vietnam & Saigon", emoji: '🇻🇳', group: 'Culture & places', questions: [
    { text: "What would you tell someone moving to Saigon?", type: 'Hypothetical', level: 'B1' },
    { text: "What do you like most about living in Vietnam, and what can be tiring?", type: 'Describe', level: 'B1' },
    { text: "Is life in a huge city like Saigon better than in a smaller city, or does it depend?", type: 'Compare', level: 'B1' },
    { text: "Should motorbikes stay the main way to get around Saigon, or is it time for more public transport?", type: 'Opinion', level: 'B2' },
    { text: "Tell me about a moment when you felt really proud of Vietnam, or really frustrated.", type: 'Experience', level: 'B2' },
    { text: "How's the weather in the city been lately? Surviving it okay?", type: 'Small talk', level: 'B1' },
    { text: "If you could change one thing about daily life in Saigon, what would it be?", type: 'Hypothetical', level: 'B2' },
    { text: "How would you describe the pace of life here to someone who's never visited?", type: 'Describe', level: 'B2' },
    { text: "Would you rather live in the busy centre, a quieter neighbourhood, or a bit outside the city?", type: 'Compare', level: 'B2' },
    { text: "Have you ever shown a visitor around? What did you take them to see?", type: 'Experience', level: 'B1' },
    { text: "Do you think Saigon is becoming too expensive for young people?", type: 'Opinion', level: 'B2' },
    { text: "What's a small everyday thing here that you'd miss if you lived abroad?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'hobbies', name: "Movies, music & games", emoji: '🎮', group: 'Culture & places', questions: [
    { text: "What's a show you'd recommend, and why?", type: 'Opinion', level: 'B1' },
    { text: "Tell me about a game, film or album that you got completely into.", type: 'Experience', level: 'B1' },
    { text: "After a long day, do you usually put on a series, a game, or some music?", type: 'Compare', level: 'B1' },
    { text: "What kind of stories or games are you usually into?", type: 'Describe', level: 'B1' },
    { text: "If you could only keep one — a streaming app, a music app, or your favourite game — which would you keep?", type: 'Hypothetical', level: 'B1' },
    { text: "Watching or playing anything good this week?", type: 'Small talk', level: 'B1' },
    { text: "Are remakes and sequels ruining movies, or are some of them actually great?", type: 'Opinion', level: 'B2' },
    { text: "Have you ever quit a show or a game halfway through? What made you stop?", type: 'Experience', level: 'B1' },
    { text: "Would you rather go to the cinema or watch something at home?", type: 'Compare', level: 'B1' },
    { text: "What's the soundtrack or playlist of your workday like?", type: 'Describe', level: 'B2' },
    { text: "If you had a free evening and zero chores, what would you put on?", type: 'Hypothetical', level: 'B1' },
    { text: "Anyone around you hyped about a new game or a new season right now?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'social', name: "Social media", emoji: '📱', group: 'Culture & places', questions: [
    { text: "Has social media made us more or less connected?", type: 'Compare', level: 'B1' },
    { text: "Should people post less about their private life, or is sharing just normal now?", type: 'Opinion', level: 'B2' },
    { text: "Tell me about a time social media actually helped you, or really wasted your day.", type: 'Experience', level: 'B1' },
    { text: "What does your phone's home screen look like? Lots of social apps, or have you cut down?", type: 'Describe', level: 'B1' },
    { text: "If every social app shut down for a month, how would you spend that time?", type: 'Hypothetical', level: 'B1' },
    { text: "Been scrolling a lot this week, or did you stay off your phone?", type: 'Small talk', level: 'B1' },
    { text: "Do you think content creators have a real job, or is that not \"real work\"?", type: 'Opinion', level: 'B2' },
    { text: "Have you ever posted something you later wished you hadn't?", type: 'Experience', level: 'B2' },
    { text: "Would you rather get your news from social media or from regular news sites?", type: 'Compare', level: 'B1' },
    { text: "How do you usually decide what to follow and what to mute?", type: 'Describe', level: 'B2' },
    { text: "If you could only keep one social app, which one would it be?", type: 'Hypothetical', level: 'B1' },
    { text: "Seen anything funny or weird online lately?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'opinions', name: "Debates", emoji: '🗣️', group: 'Opinions & small talk', questions: [
    { text: "Should university be free?", type: 'Opinion', level: 'B1' },
    { text: "What's more important for a good life: a high salary or a lot of free time?", type: 'Compare', level: 'B1' },
    { text: "Tell me about a discussion at work or with friends that got surprisingly heated.", type: 'Experience', level: 'B2' },
    { text: "What does a fair argument look like to you?", type: 'Describe', level: 'B2' },
    { text: "If you were on a debate stage tonight, what topic would you actually want to argue?", type: 'Hypothetical', level: 'B2' },
    { text: "Heard any interesting news or debates this week?", type: 'Small talk', level: 'B1' },
    { text: "Should the government tax junk food more heavily?", type: 'Opinion', level: 'B2' },
    { text: "Have you ever had to stay polite in a discussion when you strongly disagreed? How did you manage it?", type: 'Experience', level: 'B2' },
    { text: "Is it better to speak up in a group, or to listen first and talk less?", type: 'Compare', level: 'B1' },
    { text: "How do you usually react when someone disagrees with you in person?", type: 'Describe', level: 'B2' },
    { text: "If comment sections disappeared from the internet for a week, would that be better or worse?", type: 'Hypothetical', level: 'B2' },
    { text: "What's a hot topic your friends keep talking about lately?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'whatif', name: "What would you do", emoji: '🤔', group: 'Opinions & small talk', questions: [
    { text: "If you had a year off, what would you do?", type: 'Hypothetical', level: 'B1' },
    { text: "Would you rather live in a tiny apartment in a city you love, or a big house in a quiet town?", type: 'Compare', level: 'B1' },
    { text: "Tell me about a time you had to make a difficult choice with no perfect option.", type: 'Experience', level: 'B2' },
    { text: "Is \"follow your passion\" good advice, or is it a bit unrealistic?", type: 'Opinion', level: 'B2' },
    { text: "What would your days look like if you didn't have to work for money?", type: 'Describe', level: 'B2' },
    { text: "What's a random \"what if\" you've been thinking about lately?", type: 'Small talk', level: 'B1' },
    { text: "Have you ever said yes to something risky and been glad you did?", type: 'Experience', level: 'B1' },
    { text: "Would you rather travel to the past or to the future?", type: 'Compare', level: 'B1' },
    { text: "Should people take a long break from work at least once in their life?", type: 'Opinion', level: 'B1' },
    { text: "Describe your perfect day if there were no messages, no meetings and no chores.", type: 'Describe', level: 'B1' },
    { text: "If you could have one superpower at work, what would it be?", type: 'Hypothetical', level: 'B1' },
    { text: "What's a favourite \"would you rather\" question you like asking other people?", type: 'Small talk', level: 'B1' }
  ] },
  { id: 'smalltalk', name: "Discord small talk", emoji: '💬', group: 'Opinions & small talk', questions: [
    { text: "What got you into coding?", type: 'Small talk', level: 'B1' },
    { text: "How did you find the Discord servers or online communities you hang out in now?", type: 'Experience', level: 'B1' },
    { text: "Do you prefer voice chat, text chat, or just lurking?", type: 'Compare', level: 'B1' },
    { text: "What does a good Discord server feel like to you?", type: 'Describe', level: 'B2' },
    { text: "Is spending a lot of time on Discord healthy, or can it get in the way?", type: 'Opinion', level: 'B2' },
    { text: "If you could start a new server about anything, what would it be about?", type: 'Hypothetical', level: 'B1' },
    { text: "What are you up to on Discord lately? Any fun conversations?", type: 'Small talk', level: 'B1' },
    { text: "Tell me about a time you met someone online who actually helped you in real life.", type: 'Experience', level: 'B2' },
    { text: "Would you rather hang out on Discord or meet friends in person after a long day?", type: 'Compare', level: 'B1' },
    { text: "How do you usually introduce yourself in a new server?", type: 'Describe', level: 'B1' },
    { text: "If voice chat died and you had to keep the conversation in text only, would you mind?", type: 'Hypothetical', level: 'B1' },
    { text: "Should servers have strict rules, or is a relaxed vibe better?", type: 'Opinion', level: 'B2' }
  ] },
  { id: 'stories', name: "Personal stories", emoji: '📖', group: 'Opinions & small talk', questions: [
    { text: "Tell me about a time you changed your mind.", type: 'Experience', level: 'B1' },
    { text: "What's a story from your life that friends often ask you to tell?", type: 'Describe', level: 'B2' },
    { text: "Do you think people learn more from mistakes or from success?", type: 'Compare', level: 'B1' },
    { text: "Should we be honest about failures at work, or is it safer to keep them quiet?", type: 'Opinion', level: 'B2' },
    { text: "If you could relive one day of your life, which day would you pick and why?", type: 'Hypothetical', level: 'B2' },
    { text: "Got a random story from this week worth telling?", type: 'Small talk', level: 'B1' },
    { text: "Tell me about a person who had a big influence on you.", type: 'Experience', level: 'B1' },
    { text: "Are you someone who remembers small details in stories, or just the big picture?", type: 'Compare', level: 'B1' },
    { text: "What was a turning point in your life, and what was it like at the time?", type: 'Describe', level: 'B2' },
    { text: "If you wrote a short memoir with only one chapter, what would that chapter be about?", type: 'Hypothetical', level: 'B2' },
    { text: "Is it useful to talk about the past a lot, or is it better to move on quickly?", type: 'Opinion', level: 'B2' },
    { text: "Heard a good story from a friend or a coworker lately?", type: 'Small talk', level: 'B1' }
  ] }
];

const BY_ID = new Map(CATALOGUE.map((t) => [t.id, t]));

/** Old topic names (before the catalogue) and old/new display names → catalogue id. */
const NAME_TO_ID = new Map<string, string>([
  ['work & career', 'work'], ['technology', 'tech'], ['daily life', 'daily'], ['travel', 'travel'],
  ['opinions & debates', 'opinions'], ['hobbies', 'hobbies'], ['food & culture', 'food'],
  ...CATALOGUE.map((t) => [t.name.toLowerCase(), t.id] as [string, string]),
]);

const stripEmoji = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase();

/** Catalogue id for a stored topic (id first, then the display name, e.g. "☕ Daily Life"). '' if unknown/custom. */
export function topicIdOf(topicId: string | undefined, topicName: string | undefined): string {
  if (topicId && BY_ID.has(topicId)) return topicId;
  return NAME_TO_ID.get(stripEmoji(topicName || '')) || '';
}

export const catalogueTopic = (id: string) => BY_ID.get(id);
export const topicGroup = (id: string): TopicGroup | 'Your topics' => BY_ID.get(id)?.group || 'Your topics';
export const topicLabel = (t: Pick<Topic, 'emoji' | 'name'>) => `${t.emoji} ${t.name}`;

/** Fallback idea starters when a seed is used as-is (no AI call). */
export const SEED_STARTERS: Record<QuestionType, [string, string, string]> = {
  Opinion: ['My view is…', 'The main reason…', 'For example…'],
  Experience: ['When it happened…', 'What I did…', 'What I learned…'],
  Compare: ['Both sides…', 'My pick is…', 'Because…'],
  Describe: ['The overall picture…', 'One detail…', 'Why it matters…'],
  Hypothetical: ['I would…', 'The reason is…', 'My plan would be…'],
  'Small talk': ['Quick answer…', 'A bit more…', 'And you?'],
};

/** Merge the saved topics with the catalogue: catalogue names/emoji win, saved on/off + favourite are kept, custom topics stay. */
export function mergeCatalogue(saved: Topic[]): Topic[] {
  const byId = new Map(saved.map((t) => [t.id, t]));
  const out: Topic[] = CATALOGUE.map((c) => {
    const s = byId.get(c.id);
    return { id: c.id, name: c.name, emoji: c.emoji, active: s ? s.active : true, ...(s?.favorite ? { favorite: true } : {}) };
  });
  for (const t of saved) if (!BY_ID.has(t.id)) out.push(t.custom ? t : { ...t, custom: true });
  return out;
}

/** Group topics for pickers/filters (catalogue order, custom topics last). */
export function groupTopics<T extends { id: string }>(topics: T[]): { group: string; topics: T[] }[] {
  const groups: { group: string; topics: T[] }[] = [...TOPIC_GROUPS, 'Your topics'].map((g) => ({ group: g, topics: [] }));
  for (const t of topics) groups.find((g) => g.group === topicGroup(t.id))!.topics.push(t);
  return groups.filter((g) => g.topics.length);
}

const normQ = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function askedSet(pastQuestions: { question: string; seed?: string }[]): Set<string> {
  return new Set(pastQuestions.flatMap((q) => [normQ(q.question), q.seed ? normQ(q.seed) : '']).filter(Boolean));
}

/** Next unused seed question for a topic (in order), or '' when all seeds were asked. */
export function nextSeed(topicId: string, pastQuestions: { question: string; seed?: string }[]): string {
  return nextBankQuestion(topicId, pastQuestions)?.text || '';
}

/** Next unused bank question (optionally of one type). Used by the Answer builder too. */
export function nextBankQuestion(
  topicId: string,
  pastQuestions: { question: string; seed?: string }[],
  qtype?: QuestionType,
): BankQuestion | undefined {
  const c = BY_ID.get(topicId);
  if (!c) return undefined;
  const asked = askedSet(pastQuestions);
  return c.questions.find((q) => !asked.has(normQ(q.text)) && (!qtype || q.type === qtype));
}

export function hasUnusedSeed(topicId: string, pastQuestions: { question: string; seed?: string }[]): boolean {
  return !!nextBankQuestion(topicId, pastQuestions);
}

/** Pick the daily topic: active ones, favourites 3× as likely, not the same as last time.
 *  If `past` is passed, prefer topics that still have unused seeds so the AI is only a fallback. */
export function pickDailyTopic(topics: Topic[], lastTopicId?: string, rand = Math.random, past?: { question: string; seed?: string; topicId?: string }[]): Topic | undefined {
  const active = topics.filter((t) => t.active);
  const pool0 = active.length ? active : topics;
  const pool = pool0.length > 1 ? pool0.filter((t) => t.id !== lastTopicId) : pool0;
  const unused = past ? pool.filter((t) => hasUnusedSeed(t.id, past)) : pool;
  const chosen = unused.length ? unused : pool;
  const weighted = chosen.flatMap((t) => (t.favorite ? [t, t, t] : [t]));
  return weighted[Math.floor(rand() * weighted.length)];
}

