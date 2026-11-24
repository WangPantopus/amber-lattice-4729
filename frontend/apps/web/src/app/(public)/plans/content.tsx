// ─────────────────────────────────────────────────────────────────────────────
// /plans: make plans with friends and family. The homepage's Plans section (heading, lines and groups as approved on
// 2026-11-18), with what each line is underneath, read from the code: backend/services/plans/planRules.js (kinds,
// distance bands, when the spot shows, limits, reminders), planService.js (asking to join, the host's rules),
// planSeries.js (repeating plans), planChat.js, planOccasions.js, planBusiness.js, planDeals.js, routes/plans.js
// (invitations), ios/Plans/**, the web's Plans (/app/plans: components/plans/PlansWorkspace.tsx, PlanForm.tsx, the plan
// page with ask to join, waitlist and chat) and its shared plan page ((site)/plans/[id]). One line ("Trips, parties and
// anything else") carries no sentence of its own: the homepage's words are the whole claim.
// ─────────────────────────────────────────────────────────────────────────────

import type { PillarContent } from '../_components/PillarPage';

export const PLANS: PillarContent = {
  key: 'plans',
  path: '/plans',
  name: 'Plans',
  icon: 'plans',
  title: (
    <>
      Make plans with the people <em>in your life.</em>
    </>
  ),
  lede: 'Friends, family, the team, the people nearby. Pick a kind and a time. The exact spot shows once the host says yes.',
  more: 'A game night, a pickup game, Thanksgiving dinner or a walk with coffee: Plans finds a date, keeps the guest list and the bring list, opens a group chat at the first yes and reminds everyone on the day.',
  action: 'app',
  route: 'pillar:plans',
  glance: [
    { value: 'Nine kinds', label: 'of plan, from watch parties to study groups' },
    { value: 'After the yes', label: 'the exact spot shows only once the host says yes' },
    { value: 'Repeats itself', label: 'a weekly plan posts its next date and invites last time’s people' },
    { value: 'No app needed', label: 'invited guests can answer in a browser' },
  ],
  clip: { name: 'plans', label: 'The Plans tab: someone asks to join, the host says yes and the exact spot appears', caption: 'Plans · the spot shows after the yes' },
  can: {
    title: (
      <>
        What can you plan, <em>and how?</em>
      </>
    ),
    intro: 'Any kind of plan, everything a host needs, and plans with the places you like.',
    groups: [
      {
        title: 'Any kind of plan',
        items: [
          {
            text: 'Watch parties, game nights and dinners',
            small: 'A watch party, a game night with board games, cards or trivia, or food and drinks from brunch to a barbecue.',
          },
          { text: 'Pickup games, hikes, runs and rides', small: 'A pickup game in one of seven sports, or a hike, a run or a bike ride.' },
          {
            text: 'Walks and coffee, playdates, study groups',
            small: 'A walk, a dog walk or a stroller walk; a playdate, whose time stays hidden until the family is in; a study group.',
          },
          { text: 'Trips, parties and anything else' },
          {
            text: 'Thanksgiving, Friendsgiving, gift exchanges, New Year’s Eve, birthdays',
            small: 'Occasions with their own set-up, such as a gift exchange with its own draw.',
          },
        ],
      },
      {
        title: 'Everything a host needs',
        items: [
          {
            text: 'Private, repeating and online plans',
            small: 'A private plan only invited people see; a plan that repeats weekly, every two weeks or monthly; a plan joined by link.',
          },
          {
            text: 'Find a date, a bring list, chip in',
            small: 'Guests tick the dates that work and pick what they bring. To share costs, you post your own payment link; no money passes through Pantopus.',
          },
          { text: 'Invite by text, email or link', small: 'Your connections, people who came to your plans before, anyone by email, or one person by text.' },
          { text: 'Guests answer in a browser, without the app', small: 'An invited guest says yes, no or maybe on a web page, with how many adults and kids are coming.' },
          { text: 'A chat that opens at the first yes', small: 'The host and everyone in get a group chat. It closes a day after the plan ends.' },
          {
            text: 'Reminders with buttons on the lock screen',
            small: 'Two hours before, or the evening before a morning plan, with On my way and Can’t make it right on the notice.',
          },
          { text: 'Same people again, and photos afterwards', small: 'Host the same group again in a tap, and share the photos after.' },
        ],
      },
      {
        title: 'With local businesses',
        biz: true,
        items: [
          { text: 'Plans hosted by the places you like', small: 'A verified business hosts at its own place, and its page lists its upcoming plans.' },
          { text: 'Deals and discounts for your group', small: 'One deal per plan: something free for everyone, or a group deal once enough people are in.' },
          { text: 'Paid spots, held for you', small: 'A price per spot, held for ten minutes while you pay, refunded in full until a day before.' },
          { text: 'Pay the bill together, tip included', small: 'Settle up at the place, tip and all, from the plan.' },
        ],
      },
    ],
  },
  how: {
    title: (
      <>
        How do you make <em>a plan?</em>
      </>
    ),
    steps: [
      { title: 'Pick a kind and a time', text: 'A game night on Friday, a hike on Saturday morning, dinner every other Sunday.' },
      { title: 'Invite, or post it nearby', text: 'Invite friends and family by text, email or link, or post it for people nearby to ask to join.' },
      { title: 'Say yes', text: 'The exact spot appears for the people you say yes to, and a group chat opens for everyone in.' },
      { title: 'Meet, then do it again', text: 'Reminders on the day, photos after, and the same people again whenever you like.' },
    ],
  },
  privacy: {
    title: (
      <>
        Who sees <em>where you’ll be?</em>
      </>
    ),
    quote: 'The exact spot shows once the host says yes.',
    items: [
      { title: 'Strangers see an area and a distance,', text: 'never the exact spot.' },
      { title: 'A home’s address comes only once you’re in.', text: 'Until then it is an area.' },
      { title: 'A playdate’s time stays hidden', text: 'until the family is in.' },
      { title: 'A private plan', text: 'is seen only by the people invited.' },
      { title: 'The host decides who comes:', text: 'a yes each time, or rules such as verified addresses or people they hosted before.' },
      { title: 'The plan’s chat closes', text: 'a day after the plan ends.' },
    ],
  },
  questions: {
    title: (
      <>
        What people ask about <em>making plans</em>
      </>
    ),
    items: [
      {
        q: 'What’s a good app to make plans with friends?',
        a: 'Plans in Pantopus: pick a kind and a time, invite friends by text, email or link, and a group chat opens at the first yes. Invited guests can answer in a browser, without the app.',
      },
      { q: 'How do I find a date that works for everyone?', a: 'Add Find a date to the plan and each guest ticks the dates that work for them.' },
      { q: 'How do I organize who brings what?', a: 'Add a bring list to the plan. Each guest picks what they bring, so nobody brings the same dish.' },
      { q: 'Can I make a plan only my friends can see?', a: 'Yes. A private plan is seen only by the people you invite.' },
      {
        q: 'Can I plan a game night with people near me?',
        a: 'Yes. Post a public plan and people nearby ask to join; you say yes or no. The exact spot shows only after your yes.',
      },
      { q: 'Do my guests need the app?', a: 'No. Someone you invite can answer on a web page, with how many adults and kids are coming.' },
      {
        q: 'Can a plan repeat every week?',
        a: 'Yes: weekly on the days you choose, every two weeks or monthly. Each date posts the next, and last time’s people are invited again.',
      },
      {
        q: 'Is Plans on the web?',
        a: 'Yes. On the web you can find plans on a map or in a list, host one, ask to join, and talk in its chat. Plans is in the iPhone and Android apps too, and invited guests can answer on a web page without an account.',
      },
    ],
  },
  related: ['support-train', 'chat', 'pulse'],
  close: {
    title: (
      <>
        Then go and do <em>something.</em>
      </>
    ),
    text: 'Thousands of windows, and behind each one somebody with a free Saturday. Make a plan.',
  },
};
