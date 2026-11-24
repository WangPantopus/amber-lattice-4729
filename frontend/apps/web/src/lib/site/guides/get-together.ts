import type { Guide } from './types';

const READ = '2026-11-23';

export const getTogether: Guide = {
  slug: 'how-to-plan-a-get-together',
  title: 'How to plan a get-together | Pantopus',
  description:
    'How to plan a get-together people actually come to: pick the kind, find a date that works, invite personally, share a bring list and send a reminder.',
  h1: 'How to plan a get-together',
  lede: 'Most get-togethers that never happen die in a group chat, somewhere between “we should” and a date. Here is how to get from one to the other.',
  written: '2026-11-23',
  checked: '2026-11-23',
  sections: [
    {
      h2: 'Why it is worth the trouble',
      blocks: [
        { p: 'People spend less time together than they used to. In the U.S. Bureau of Labor Statistics’ American Time Use Survey, 30 percent of people spent time socializing and communicating on an average day in 2025, down from 38 percent in 2015, and the time spent fell from 41 minutes to 35 ([BLS, American Time Use Survey Summary](https://www.bls.gov/news.release/atus.nr0.htm), released June 25, 2026, read November 23, 2026). Someone has to make the plan. It might as well be you.' },
      ],
    },
    {
      h2: 'Pick the kind before the date',
      blocks: [
        { p: '“Let’s get together” has no answer. “Game night at mine” does. Decide what it is first, because the kind decides everything else: how many people, how long, indoors or out, whether children come.' },
        {
          ul: [
            'Small and easy: a walk and a coffee, a pickup game, a study group.',
            'At home: a dinner, a potluck, a game night, a watch party.',
            'An occasion: a birthday, Friendsgiving, a gift exchange, New Year’s Eve.',
          ],
        },
      ],
    },
    {
      h2: 'Find a date that works',
      blocks: [
        { p: 'Don’t ask “when is everyone free?”. Offer three dates and ask people to tick every one they could make, with a deadline to answer. Then pick the date most people can make, and announce it. Waiting for a date that suits everyone is how plans die.' },
      ],
    },
    {
      h2: 'Choose the place',
      blocks: [
        { p: 'For people who don’t know each other well, a public place is easier on everyone: a park, a café, a court. Give the exact spot to the people who said yes rather than posting it everywhere. For a plan at home, share the address only with the guests.' },
      ],
    },
    {
      h2: 'Invite people one by one',
      blocks: [
        { p: 'A message to one person is harder to leave unanswered than a message to a group, where everyone can wait for someone else to reply. Say what, when, where, and what to bring. Ask for a yes or no by a date. A link that opens without an app helps people who don’t use the one you do.' },
      ],
    },
    {
      h2: 'Share a bring list',
      blocks: [
        { p: 'For a potluck or a dinner, list what is needed (a main, a salad, dessert, drinks, ice, chairs) and let people claim items, so you don’t end up with four desserts. Ask about allergies when people say yes; our [meals guide](/guides/how-to-organize-meals-for-a-family) lists the nine major ones.' },
      ],
    },
    {
      h2: 'Remind people, then do it again',
      blocks: [
        { p: 'A short reminder the day before, or a couple of hours before, saves most no-shows. Afterwards, say thank you and set the next one while the evening is fresh. The easiest get-together to plan is the one that repeats: the same table, the same night, every other week.' },
      ],
    },
    {
      h2: 'Planning it with Pantopus',
      blocks: [
        { p: '[Plans](/plans) on iPhone and Android do these steps for you. Pick a kind: a watch party, a game night, food and drinks, a pickup game, a walk and coffee, a playdate, a study group or something else. Make it private, repeating or online. Find a date with tick boxes, share a bring list, and invite by text, email or link; guests can answer in a browser without the app. Strangers see only an area until the host says yes, and a home’s address only once they are in. A chat opens at the first yes, and a reminder goes out two hours before, or at 7 p.m. the night before a morning plan.' },
      ],
    },
  ],
  questions: [
    { q: 'How do I pick a date for a group?', a: 'Offer three dates, ask everyone to tick every one they can make, set a deadline, then pick the date most people can make.' },
    { q: 'How far ahead should I invite people?', a: 'For a casual plan, a week is usually enough. For an occasion like a birthday or a holiday dinner, two to three weeks.' },
    { q: 'How do I stop everyone bringing dessert?', a: 'Share a bring list with categories, a main, sides, dessert, drinks, and let each person claim one item.' },
    { q: 'How do I get people to actually show up?', a: 'Invite people one by one rather than in a group, ask for a yes or no by a date, and send a short reminder the day before or a few hours before.' },
    { q: 'Do my guests need the Pantopus app?', a: 'No. Guests can answer an invitation in a browser. Hosting a plan is on iPhone and Android.' },
    { q: 'Is it safe to plan with people I don’t know well?', a: 'Meet in a public place first. On Pantopus, people who haven’t been accepted see only an area and a distance, never the exact spot.' },
  ],
  sources: [
    { publisher: 'U.S. Bureau of Labor Statistics', title: 'American Time Use Survey Summary, 2025 results', url: 'https://www.bls.gov/news.release/atus.nr0.htm', read: READ },
  ],
  pantopus: {
    title: 'Make plans with the people in your life',
    text: 'Find a date, share a bring list, invite by text, email or link. The exact spot shows once the host says yes.',
    href: '/plans',
    label: 'How Plans work',
  },
  related: [
    { href: '/plans', label: 'Plans' },
    { href: '/social-network', label: 'A social network of real people' },
    { href: '/guides/how-to-organize-meals-for-a-family', label: 'How to organize meals for a family' },
    { href: '/guides/how-to-send-a-christmas-card-online', label: 'How to send a Christmas card online' },
  ],
};
