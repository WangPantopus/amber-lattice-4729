// ─────────────────────────────────────────────────────────────────────────────
// /support-train: organize meals for someone. The homepage's Support Train section (heading, lines, groups and its
// drawn card, as approved on 2026-11-18), with what each line is underneath, read from the code:
// backend/routes/supportTrains.js (what help a train organizes, schedules, the recipient's details, who can see it,
// the address kept to helpers, sign-up by email), backend/jobs/supportTrainReminders.js (the evening-before and day-of
// reminders, train-local time), backend/services/supportTrainNotifications.js (letters in Mail), the web's
// support-trains/new page ("Draft from my story"). Never another product's name: "organize meals for someone".
// One line ("Gift funds…") carries no sentence of its own: the homepage's words are the whole claim.
// ─────────────────────────────────────────────────────────────────────────────

import home from '../../_components/home.module.css';
import type { PillarContent } from '../_components/PillarPage';
import styles from '../_components/public.module.css';

// The homepage's drawn card (_components/HomeLevelsTwoThree.tsx), with its made-up family and organizer.
const TRAIN_DAYS: Array<[string, boolean]> = [
  ['S', true], ['M', true], ['T', false], ['W', true], ['T', true], ['F', false], ['S', true],
  ['S', true], ['M', false], ['T', true], ['W', true], ['T', false], ['F', true], ['S', false],
];

function TrainCard() {
  return (
    <div className={`${home.card} ${home.train}`} role="img" aria-label="A Support Train: two weeks of dinners for a family after surgery, 9 of 14 dinners covered">
      <span className={home.eyebrow}>Support Train</span>
      {/* Not a heading here: the card is a picture beside the page's h1. */}
      <strong className={styles.trainTitle}>Dinners for the Parkers after surgery</strong>
      <p>Organized by Lee · two weeks of dinners · no nuts</p>
      <div className={home.days}>
        {TRAIN_DAYS.map(([day, on], i) => (
          <i key={i} data-on={on ? '' : undefined}>
            {day}
          </i>
        ))}
      </div>
      <div className={home.bar}>
        <b />
      </div>
      <div className={home.mini}>
        <span>9 of 14 dinners covered</span>
        <b>5 days still open</b>
      </div>
    </div>
  );
}

export const SUPPORT_TRAIN: PillarContent = {
  key: 'support-train',
  path: '/support-train',
  name: 'Support Train',
  icon: 'heart',
  title: (
    <>
      When someone needs help, <em>show up.</em>
    </>
  ),
  lede: 'A new baby, a surgery, a loss. Organize meals, groceries and the things a household needs, one day at a time, so nobody has to ask twice.',
  more: 'A Support Train is a meal calendar the people around a family can sign up for: one helper a day, the allergies and favorites written down once, reminders sent for you, and the address kept to the people bringing food.',
  action: 'app',
  route: 'pillar:support-train',
  glance: [
    { value: 'One helper a day', label: 'on a calendar nobody has to ask twice about' },
    { value: 'Up to 90 days', label: 'of meals, from ready-made schedules' },
    { value: 'Name and email', label: 'is all a helper needs to sign up' },
    { value: 'Address kept close', label: 'only the people bringing food see it' },
  ],
  visual: <TrainCard />,
  can: {
    title: (
      <>
        How do you organize meals <em>for a family?</em>
      </>
    ),
    intro: 'Organizing it, and helping with it.',
    groups: [
      {
        title: 'Organize it',
        items: [
          { text: 'Home-cooked meals, takeout and groceries', small: 'Each day is a home-cooked meal, takeout from a restaurant, or groceries.' },
          {
            text: 'A calendar of days, one helper each',
            small: 'Breakfast, lunch, dinner or grocery days, or a ready schedule such as every dinner or weekly groceries, up to 90 days at a time.',
          },
          {
            text: 'Allergies, favorites, drop-off window, contactless',
            small: 'Household size, diets and allergies, favorite meals and restaurants, when to drop off, and whether to leave it at the door.',
          },
          { text: 'Write the page from your story with Pantopus AI', small: 'Tell what happened in your own words, and a first draft of the page is written for you to edit.' },
          { text: 'Gift funds for what a meal cannot cover' },
        ],
      },
      {
        title: 'Help with it',
        items: [
          { text: 'Sign up by email, no account and no app', small: 'A helper picks a day with a name and an email, and gets links to confirm or cancel.' },
          {
            text: 'The address goes only to the people helping',
            small: 'Everyone else sees the city. The organizer shares the address with each helper, who is told if it changes.',
          },
          { text: 'Reminders the evening before and on the day', small: 'In the train’s own time zone, by notification or by email.' },
          { text: 'Updates with photos, and a group chat', small: 'The organizer posts how things are going, and helpers talk in the train’s own chat.' },
          { text: 'Thank-you letters arrive in Mail', small: 'The invitation, the thank-you and the closing note come as letters.' },
        ],
      },
    ],
  },
  how: {
    title: (
      <>
        How does a <em>Support Train work?</em>
      </>
    ),
    steps: [
      { title: 'Start it', text: 'For a friend, a family member or someone nearby. Write the page from their story, and add co-organizers.' },
      { title: 'Set the days and the needs', text: 'Pick the days and meals, the drop-off window, the allergies and the favorites.' },
      { title: 'Share it', text: 'With people near you, with your connections, or only with the people who have the link.' },
      { title: 'People show up', text: 'Each day gets one helper. Reminders go out for you, and the family gets updates and thank-yous.' },
    ],
  },
  privacy: {
    title: (
      <>
        Who sees <em>the family’s address?</em>
      </>
    ),
    quote: 'The address goes only to the people helping.',
    items: [
      { title: 'Everyone else sees the city.', text: 'Not the street, not the door.' },
      { title: 'Choose who can find it:', text: 'people near you, your connections, or only those with the link.' },
      { title: 'Helpers are told', text: 'if the address changes.' },
      { title: 'A note just for the organizer', text: 'stays between the helper and the organizer.' },
      { title: 'No account needed to help:', text: 'a name and an email, nothing more.' },
    ],
  },
  deeper: {
    title: (
      <>
        Bringing a meal <em>this week?</em>
      </>
    ),
    links: [
      {
        href: '/guides/how-to-organize-meals-for-a-family',
        label: 'How to organize meals for a family',
        text: 'After a surgery, a new baby or a loss: what to ask, how to set the days, and what helps most.',
        listed: true,
      },
      { href: '/plans', label: 'Plans', text: 'A dinner, a walk, a game night: make plans with the people in your life.', listed: true },
      { href: '/mail', label: 'Mail', text: 'Where a Support Train’s invitations and thank-you letters arrive.', listed: true },
    ],
  },
  questions: {
    title: (
      <>
        What people ask about <em>organizing meals</em>
      </>
    ),
    items: [
      {
        q: 'How do I organize meals for a family?',
        a: 'Start a Support Train: set the days, note the allergies and favorites, and share the page. Each day takes one helper, and everyone gets reminders.',
      },
      {
        q: 'How do I set up a meal calendar after surgery?',
        a: 'Pick a ready schedule, such as every dinner or Monday, Wednesday and Friday dinners, for up to 90 days, and add the drop-off window and any allergies.',
      },
      {
        q: 'Can people sign up for meals without an account?',
        a: 'Yes. A helper signs up for a day with a name and an email, with no account and no app, and gets links to confirm or cancel.',
      },
      {
        q: 'How can I help new parents with meals?',
        a: 'Start a Support Train for them, or sign up for a day on theirs: a home-cooked meal, takeout or groceries.',
      },
      { q: 'Who sees the family’s address?', a: 'Only the people bringing food, once the organizer shares it with them. Everyone else sees the city.' },
      {
        q: 'Can I start one for someone else?',
        a: 'Yes. Start it for them, add co-organizers, and write the page from their story. If they are your connection or live with you, their account is linked to it.',
      },
      { q: 'Does it cost anything?', a: 'No. Starting a Support Train and signing up to help are free.' },
    ],
  },
  related: ['plans', 'mail', 'chat'],
  close: {
    title: (
      <>
        So nobody has to <em>ask twice.</em>
      </>
    ),
    text: 'A new baby, a surgery, a loss. Organize meals one day at a time, in the Pantopus app.',
  },
};
