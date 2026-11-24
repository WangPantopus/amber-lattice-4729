// ─────────────────────────────────────────────────────────────────────────────
// /chat: message real people, home to home. The homepage has no chat section, so these words are written from the
// code (marked in the SEO notes for the founder's read): backend/routes/chats.js (direct, group, household, plan and
// Support Train chats; text, photo, video, file, voice and location messages; replies, reactions, edits, deletes,
// mute), backend/services/plans/planChat.js (a plan's chat opens at the first yes, closes a day after),
// backend/routes/neighborMessages.js and services/neighborMessageTemplates.js (a verified home's pre-written note to
// any address on its block, anonymous both ways, capped), the Pantopus AI thread in Messages (reads chats only when
// asked), the Moments viewer (replies arrive in Messages). The one homepage line used is "Message the homes on your
// block" (Verified, "What it opens").
// ─────────────────────────────────────────────────────────────────────────────

import type { PillarContent } from '../_components/PillarPage';
import styles from '../_components/public.module.css';

// A drawn chat, with made-up people (as the homepage's drawn cards are), and one of the app's own pre-written notes.
function ChatCard() {
  return (
    <div className={styles.chatCard} role="img" aria-label="A plan's group chat with three messages, and a note to a home on your block">
      <div className={styles.chatHead}>
        <b>Game night · Friday</b>
        <span>4 going · the chat opened at the first yes</span>
      </div>
      <div className={styles.bubbles}>
        <p data-from="Maya">I’ll bring the cards.</p>
        <p data-from="Lee">Snacks are on me.</p>
        <p data-you="">See you at 7.</p>
      </div>
      <div className={styles.note}>
        <span>A note to a home on your block</span>
        <p>A gate or door nearby looks like it was left open. Thought you would want to know.</p>
        <small>Sent without your name · they never learn who sent it</small>
      </div>
    </div>
  );
}

export const CHAT: PillarContent = {
  key: 'chat',
  path: '/chat',
  name: 'Chat',
  icon: 'chat',
  title: (
    <>
      Message real people, <em>home to home.</em>
    </>
  ),
  lede: 'Your connections, the people you live with, the people in your plans and the people helping a family: every conversation is in Messages, with the people your life actually runs through.',
  more: 'And when something at a home on your block needs a word, a verified home can send it a short, kind note, without either side learning who the other is.',
  action: 'app',
  route: 'pillar:chat',
  glance: [
    { value: 'One place', label: 'for direct, group, household, plan and Support Train chats' },
    { value: 'Home to home', label: 'a verified home can send a note to any address on its block' },
    { value: 'Anonymous', label: 'a note between homes never says who sent it or who lives there' },
    { value: 'Everywhere', label: 'Messages on the web, iPhone and Android' },
  ],
  visual: <ChatCard />,
  can: {
    title: (
      <>
        Who can you message, <em>and how?</em>
      </>
    ),
    intro: 'Who you talk to, what you can send, and the one message that goes to a home instead of a person.',
    groups: [
      {
        title: 'Who you talk to',
        items: [
          { text: 'One to one, and groups', small: 'A conversation with one person, or a group of the people you choose.' },
          { text: 'Your household’s chat', small: 'A chat for the people who live in your home.' },
          { text: 'The chat a plan opens', small: 'At the host’s first yes, everyone in gets a group chat. It closes a day after the plan ends.' },
          { text: 'A Support Train’s chat', small: 'The organizer and the helpers talk in the train’s own chat.' },
          { text: 'Pantopus AI, in its own thread', small: 'Ask about your home, your area and your plans. It reads your chats only when you ask it to.' },
        ],
      },
      {
        title: 'What you can send',
        items: [
          { text: 'Text, photos, videos and files', small: 'Whatever the conversation needs, in the chat itself.' },
          { text: 'Voice messages and your location', small: 'Say it, or show where you are.' },
          { text: 'Reply, react, edit or delete', small: 'Answer one message, react to it, fix a typo, or take it back.' },
          { text: 'Replies to your Moments', small: 'When someone answers a Moment you posted, it comes to Messages.' },
        ],
      },
      {
        title: 'A note to a home on your block',
        items: [
          { text: 'Message the homes on your block', small: 'A verified resident can send a heads-up to any address on the same block: a package at the wrong door, a gate left open.' },
          { text: 'Pre-written notes only', small: 'You pick one of a few kind notes. There is no free text, so it stays calm.' },
          { text: 'Anonymous both ways', small: 'The home never learns who sent it, and the sender never learns who lives there.' },
          { text: 'Answers are notes too', small: 'Thanks for the heads-up, got it, or nothing on my end.' },
        ],
      },
    ],
  },
  how: {
    title: (
      <>
        How do you start <em>a conversation?</em>
      </>
    ),
    steps: [
      { title: 'Open Messages', text: 'On the web, iPhone or Android. Every conversation you have is there.' },
      { title: 'Pick who', text: 'A connection, a group, or the people you live with.' },
      { title: 'Or let a plan start it', text: 'A plan opens its chat at the first yes, and a Support Train has its own.' },
      { title: 'Prove your home for the block', text: 'Once you are a verified resident, you can send a note to any address on your block.' },
    ],
  },
  privacy: {
    title: (
      <>
        Who knows <em>it was you?</em>
      </>
    ),
    quote: 'A note to a home never says who sent it, and never tells you who lives there.',
    items: [
      { title: 'Block or report anyone', text: 'from the conversation itself.' },
      { title: 'Mute a chat', text: 'without leaving it.' },
      { title: 'Notes between homes are capped,', text: 'so nobody can flood a street.' },
      { title: 'A plan’s chat closes', text: 'a day after the plan ends.' },
      { title: 'Pantopus AI reads your chats', text: 'only when you ask it to.' },
    ],
  },
  questions: {
    title: (
      <>
        What people ask about <em>messaging</em>
      </>
    ),
    items: [
      {
        q: 'Is there a private messaging app for the real people in my life?',
        a: 'Messages in Pantopus is where you talk with your connections, the people you live with, the people in your plans and the people helping with a Support Train. Anyone can be blocked or reported from the chat.',
      },
      {
        q: 'Can I message a home near me without knowing who lives there?',
        a: 'Yes, once you have proved your own home: send one of the pre-written notes to any address on your block. It reaches a verified resident there, and neither side learns who the other is.',
      },
      { q: 'Is there a group chat for my household?', a: 'Yes. Your home has a chat for the people who live there.' },
      {
        q: 'Can I send photos, videos and voice messages?',
        a: 'Yes: text, photos, videos, files, voice messages and your location, with replies, reactions, edits and deletes.',
      },
      { q: 'Does a plan have its own group chat?', a: 'Yes. It opens at the host’s first yes for everyone in, and closes a day after the plan ends.' },
      {
        q: 'Can Pantopus AI read my messages?',
        a: 'Only when you ask it to. It has its own thread in Messages and answers about your home, your area and your plans.',
      },
      { q: 'Is chat on the web?', a: 'Yes. Messages is on the web, iPhone and Android.' },
    ],
  },
  related: ['plans', 'support-train', 'pulse'],
  close: {
    title: (
      <>
        Pantopus starts with <em>your home.</em>
      </>
    ),
    text: 'Then the people around it: the ones you live with, the ones you make plans with, and the homes on your block.',
  },
};
