import type { TopicPage } from './types';

export const socialNetwork: TopicPage = {
  path: '/social-network',
  route: 'topic:social-network',
  title: 'A social network of real people at real homes',
  description:
    'Pantopus is a social network where every account starts at a real home: Pulse, stories on a map, plans, mail and chat with the people around you, no crime feed.',
  label: 'Social network',
  h1: 'A home is hard *to fake.*',
  lede: 'Anyone can make an account. A bot can write a post. Nobody can make up the address they live at. Pantopus ties each person to a real home, so there is a real person behind every post, plan and letter.',
  lookup: false,
  sections: [
    {
      eyebrow: 'Verified',
      h2: 'Proven by where you *actually live.*',
      blocks: [
        { p: 'Pantopus starts with your home.' },
        { p: 'Verify once and the people around you know you are real.' },
        { p: 'There are four ways to prove it: a code on a postcard, mailed to your door; a bill or your lease; your landlord’s yes; or a fast check with your phone number, being at home right now, or a bill read on the spot.' },
        {
          ul: [
            'The Verified mark on your name.',
            'Messages to the homes on your block.',
            'Real rent, from verified renters near you.',
            'Residency letters, and a pass that proves one fact without your address.',
            'Mail for your home.',
          ],
        },
      ],
    },
    {
      h2: 'What do people share on Pantopus?',
      blocks: [
        { p: 'There is no main feed. What you see starts at a real place: your home, your street, your town, or the far side of the planet.' },
      ],
    },
    {
      eyebrow: 'Pulse',
      h2: 'Know what’s going on. *No crime alerts.*',
      blocks: [
        { p: 'Questions, recommendations, events, deals and good news from around you, and updates from the people you know. See it as a list, or on a map that shows where things are happening. Only people who live there or are there can post to an area, and crime and suspicious-person posts are refused by rule. Posts end on their own when they stop being useful.' },
      ],
      more: { href: '/pulse', label: 'More about Pulse' },
    },
    {
      eyebrow: 'Moments',
      h2: 'See the moments *around you.*',
      blocks: [
        { p: 'Stories with a real place attached. Photos, videos and a few words, on the map where they happened, gone in 1, 6, 24 or 48 hours. Pin a moment where it was taken, or show the area instead of the spot. Every photo and video is checked before it goes live.' },
      ],
      more: { href: '/moments', label: 'More about Moments' },
    },
    {
      eyebrow: 'Plans',
      h2: 'Make plans with the people *in your life.*',
      blocks: [
        { p: 'Friends, family, the team, the people nearby. Pick a kind and a time: a game night, a pickup game, a walk and coffee, a dinner. Find a date, share a bring list, invite by text, email or link. The exact spot shows once the host says yes.' },
      ],
      more: { href: '/plans', label: 'More about Plans' },
    },
    {
      eyebrow: 'Mail',
      h2: 'Letters and cards, delivered *at 7 a.m.*',
      blocks: [
        { p: 'A mailbox for your home, on your phone. Once your home is verified, write a letter with stationery, ink and a wax seal to your household, your connections and the people around you, and it arrives with the next morning’s mail. At Christmas, send a card that stays sealed until Christmas morning.' },
      ],
      more: { href: '/mail', label: 'More about Mail' },
    },
    {
      eyebrow: 'Messages',
      h2: 'Private messages with real people.',
      blocks: [
        { p: 'Direct and group chats, the chat that opens when a plan gets its first yes, a Support Train’s group chat, and messages to the homes on your block once you are verified. Send photos, videos, voice messages and your location, and react, reply or mute.' },
      ],
      more: { href: '/chat', label: 'More about chat' },
    },
    {
      eyebrow: 'Support Train',
      h2: 'When someone needs help, *show up.*',
      blocks: [
        { p: 'A new baby, a surgery, a loss. Organize meals, takeout and groceries one day at a time, with a calendar people sign up for, so nobody has to ask twice.' },
      ],
      more: { href: '/support-train', label: 'More about Support Train' },
    },
    {
      h2: 'What do others see about you?',
      blocks: [
        { p: 'Only you see the address you type, others see your first name, never your address' },
        {
          ul: [
            'Your address is never sold and never used for ads.',
            'Verified homes are counted in ranges, never shown as dots on a map.',
            'Other people see a post’s area, not your door.',
            'You can see your home the way an outsider sees it.',
          ],
        },
      ],
    },
  ],
  questions: [
    { q: 'Is Pantopus a social network?', a: 'Yes. Pantopus is a social network where every account starts at a real home, with Pulse, Moments, Plans, Mail and chat for the people around you and the people you know.' },
    { q: 'How is Pantopus different from other social media?', a: 'There is no main feed. What you see starts at a real place, people can verify the home they live in, and crime and suspicious-person posts aren’t allowed.' },
    { q: 'Do I have to verify my home to join?', a: 'No. You can make an account without an address. Verifying your home adds the Verified mark, messages to the homes on your block and mail for your home.' },
    { q: 'Who can see my address?', a: 'Only you see the address you type, others see your first name, never your address' },
    { q: 'Can businesses post in Pulse?', a: 'No. Pulse is for people. A deal in Pulse is a person sharing a local offer.' },
    { q: 'Is Pantopus free?', a: 'Yes, Pantopus is free on iPhone and Android, and on the web. Christmas cards beyond your first three take stamps, sold in books.' },
    { q: 'Do Moments disappear?', a: 'Yes. A moment lasts 1, 6, 24 or 48 hours, whichever you choose when you post it.' },
  ],
  related: [
    { href: '/pulse', label: 'Pulse' },
    { href: '/moments', label: 'Moments' },
    { href: '/plans', label: 'Plans' },
    { href: '/chat', label: 'Chat' },
    { href: '/guides/how-to-plan-a-get-together', label: 'How to plan a get-together' },
    { href: '/guides/how-to-prove-where-you-live', label: 'How to prove where you live' },
  ],
  close: {
    title: 'Social media gave everyone a feed. Pantopus gives everyone *a place.*',
    line: 'Start with your address, or get the app.',
  },
};
