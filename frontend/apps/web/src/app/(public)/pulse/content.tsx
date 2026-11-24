// ─────────────────────────────────────────────────────────────────────────────
// /pulse: a local social network of real people. The homepage's Pulse section (heading, lines and groups as approved
// on 2026-11-18), with what each line is underneath, read from the code: backend/routes/posts.js (who may post where,
// the refused heads-ups, businesses kept out, lengths and photos), backend/utils/trustState.js, backend/utils/
// postReaction.js, backend/services/feedService.js (Nearby and Connections, the map's grid), the post kinds and their
// lifetimes (supabase/migrations/20260908234527_reference_baseline.sql), ios/Feed/*, web app/feed/PulseScreen.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import type { PillarContent } from '../_components/PillarPage';

export const PULSE: PillarContent = {
  key: 'pulse',
  path: '/pulse',
  name: 'Pulse',
  icon: 'pulse',
  title: (
    <>
      Know what’s going on. <em>No crime alerts.</em>
    </>
  ),
  lede: 'Questions, recommendations, events, deals and good news from around you, and updates from the people you know. See it as a list, or on a map that shows where things are happening.',
  more: 'Pulse is social media for the place you live, written by the people who live there. Only someone who lives in an area, or is there right now, can post to it, and the news you came for comes without the fear.',
  action: 'app',
  route: 'pillar:pulse',
  glance: [
    { value: 'Real people', label: 'only those who live in an area, or are there now, can post to it' },
    { value: 'No crime alerts', label: 'crime and suspicious-person posts are refused, by rule' },
    { value: 'List or map', label: 'the same posts as a feed, or as pins on a 3D map' },
    { value: 'Nine kinds', label: 'of post, from asks and events to lost and found' },
  ],
  clip: { name: 'pulse', label: 'The Pulse tab: posts appear as pins on a map', caption: 'Pulse · list or map' },
  can: {
    title: (
      <>
        What’s happening <em>near you?</em>
      </>
    ),
    intro: 'What people post, how you see it, and the rules that keep it real. A post holds up to 5,000 characters and up to 10 photos or videos.',
    groups: [
      {
        title: 'What people post',
        items: [
          { text: 'Asks and recommendations', small: 'Ask the people around you, or tell them where to go. An ask stays up a week, a recommendation two months.' },
          { text: 'Events, with a Going button', small: 'What is on, when and where. People tap Going instead of a reaction.' },
          { text: 'Deals and offers nearby', small: 'A person sharing a local discount or offer they found, with the business’s name and when it ends.' },
          { text: 'Lost and found', small: 'A lost pet or a found set of keys, up for two weeks.' },
          { text: 'Heads-ups: outages, road hazards, a missing pet', small: 'Road hazards, power outages, weather damage and missing pets. A heads-up ends after two days.' },
          { text: 'Local updates, wins and a visitor’s guide', small: 'What changed nearby, good news worth sharing, and tips for someone visiting.' },
        ],
      },
      {
        title: 'How you see it',
        items: [
          { text: 'Nearby, or only your connections', small: 'Nearby shows the area you pick. Connections shows what the people you know wrote and reposted.' },
          { text: 'A 3D map where new posts ripple', small: 'Each post is a pin in its kind’s color, posts from the last day ripple, and the map opens tilted over real terrain.' },
          { text: 'Your homes, saved places, or where you are now', small: 'Pick the area, then how far: 1, 3, 10, 25 or 100 miles.' },
          { text: 'Repost, or repost with your own words', small: 'Pass a post on as it is, or with a line of your own above it.' },
          { text: 'Choose what you see: deals, alerts, politics', small: 'Hide deals or safety alerts, and turn political posts on or off.' },
        ],
      },
      {
        title: 'Why it stays real',
        items: [
          {
            text: 'Only people who live there or are there can post to an area',
            small: 'A verified resident, someone who was there in the last few minutes, or someone posting a photo taken there. Anyone can read.',
          },
          { text: 'No crime or suspicious-person posts, by rule', small: 'Such a heads-up is refused, with a note to call 911 in an emergency.' },
          { text: 'Posts end on their own when they stop being useful', small: 'Each kind has its own life, from two days for a heads-up to two months for a recommendation.' },
          { text: 'Other people see a post’s area, not your door', small: 'On the map a post sits on a grid about a third of a mile wide, unless your own photo placed it exactly.' },
        ],
      },
    ],
  },
  how: {
    title: (
      <>
        How do you find out <em>what’s going on?</em>
      </>
    ),
    steps: [
      { title: 'Pick an area', text: 'One of your homes, a place you saved, or where you are now, and how far around it to look.' },
      { title: 'Read the list, or open the map', text: 'The same posts either way. On the map, the newest ripple and busy spots gather into clusters.' },
      { title: 'Post what is useful', text: 'Pick a kind, add a few words and photos, and choose who reads it: people nearby or your connections.' },
      { title: 'React, reply and pass it on', text: 'Seven reactions, threaded replies, and a repost with or without your own words.' },
    ],
  },
  privacy: {
    title: (
      <>
        What do others see <em>when you post?</em>
      </>
    ),
    quote: 'Other people see a post’s area, not your door.',
    items: [
      { title: 'Your door stays yours.', text: 'A post sits on a grid about a third of a mile wide on the map, unless your own photo placed it exactly.' },
      { title: 'You choose who reads it:', text: 'the people nearby, or only your connections.' },
      { title: 'Businesses can’t post to Pulse,', text: 'so a deal is a person telling you about it.' },
      { title: 'Hide, mute or report', text: 'a post or a person, and mark what is not helpful.' },
      { title: 'Posts end on their own,', text: 'so old news doesn’t linger on the map.' },
    ],
  },
  questions: {
    title: (
      <>
        What people ask about <em>local social media</em>
      </>
    ),
    items: [
      {
        q: 'Is there a local social network with only real people?',
        a: 'Pulse is built for that. Only someone who lives in an area, or is there right then, can post to it: a verified resident, someone who was just there, or someone posting a photo taken there. Anyone can read.',
      },
      {
        q: 'How do I find out what’s happening near me?',
        a: 'Open Pulse and pick an area: your home, a saved place or where you are. Read it as a list, or open the map to see where things are happening.',
      },
      {
        q: 'Does Pulse have crime alerts?',
        a: 'No. Heads-ups about crime or suspicious people are refused, by rule. Heads-ups cover road hazards, outages, weather damage and missing pets. In an emergency, call 911.',
      },
      {
        q: 'Can businesses advertise in Pulse?',
        a: 'No. Businesses can’t post to Pulse. A deal there is a person sharing a local discount they found.',
      },
      {
        q: 'Can people tell where I live from my post?',
        a: 'No. On the map a post sits on a grid about a third of a mile wide, unless your own photo placed it exactly.',
      },
      {
        q: 'How long does a post stay up?',
        a: 'It depends on the kind: two days for a heads-up, three for a deal, a week for an ask, two weeks for lost and found and two months for a recommendation.',
      },
      {
        q: 'Can I see only posts from people I know?',
        a: 'Yes. Switch from Nearby to Connections to see what the people you know posted and reposted.',
      },
      {
        q: 'Is Pulse on the web?',
        a: 'Yes, on the web, iPhone and Android, as a list and as a map.',
      },
    ],
  },
  related: ['moments', 'plans', 'chat'],
  close: {
    title: (
      <>
        Every lit window is <em>a real household.</em>
      </>
    ),
    text: 'Know what is going on around you, from the people who actually live there.',
  },
};
