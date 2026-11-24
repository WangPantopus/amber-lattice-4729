// ─────────────────────────────────────────────────────────────────────────────
// /mail: a mailbox for your home, on your phone. The homepage's Mail section and its Christmas band (headings, lines
// and groups as approved on 2026-11-18), with what each line is underneath, read from the code:
// backend/services/mailDelivery.js (7:00 delivery, special delivery), backend/services/mailVault.js, mailSummaries.js,
// mailVacation.js, invoiceBills.js, backend/routes/mailCompose.js and mailbox.js (who you can write to, take-back,
// never saying whether a piece was opened), backend/services/holidayCards.js and mailStamps.js (the cards).
// Two business lines carry no sentence of their own: the homepage's words are the whole claim.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import PillarClip from '../_components/PillarClip';
import type { PillarContent } from '../_components/PillarPage';
import styles from '../_components/public.module.css';

function ChristmasCards() {
  return (
    <div className={styles.xmas}>
      <PillarClip
        name="cards"
        src="cards.mp4"
        poster="cards-poster.jpg"
        label="A red envelope with a gold wax seal is opened by hand on a table"
        caption="Christmas cards · opened by hand"
        wide
      />
      <div className={styles.xmasSay}>
        <h3>
          A Christmas card they open <em>by hand.</em>
        </h3>
        <p>
          Write a few words, sign it yourself, seal it by hand. It stays sealed until 7:00 a.m. on Christmas morning, wherever
          they live.
        </p>
        <ul className={styles.tags}>
          <li>Add a photo and your voice</li>
          <li>One card to 20 people</li>
          <li>By email or link to anyone</li>
          <li>Help me write it</li>
          <li>Share as a picture or a video</li>
          <li>They can write back</li>
        </ul>
        <div>
          <Link className={styles.btnRed} href="/cards">
            Send a card · your first 7 are free
          </Link>
        </div>
      </div>
    </div>
  );
}

export const MAIL: PillarContent = {
  key: 'mail',
  path: '/mail',
  name: 'Mail',
  icon: 'mail',
  title: (
    <>
      Letters and cards, delivered <em>at 7 a.m.</em>
    </>
  ),
  lede: 'A mailbox for your home, on your phone. Mail comes once each morning, stamped and sealed. No paper, no truck, no pile on the counter, and nothing lost in a feed.',
  more: 'A digital mailbox for the mail people and businesses send you through Pantopus: letters, notices, bills you can pay, and Christmas cards. It is read for you, filed for you, and kept with the home it belongs to.',
  action: 'app',
  route: 'pillar:mail',
  glance: [
    { value: '7:00 a.m.', label: 'mail arrives once a morning, in your own time zone' },
    { value: 'Three drawers', label: 'for you, your home and your business' },
    { value: 'Read for you', label: 'a short summary and the key facts of each letter' },
    { value: 'First 7 free', label: 'Christmas cards, sealed until Christmas morning' },
  ],
  clip: { name: 'mail', label: 'The Mail tab: a Christmas card is written and sealed, then the morning mail arrives', caption: 'Mail · stamped, sealed, on time' },
  can: {
    title: (
      <>
        What does a mailbox <em>on your phone do?</em>
      </>
    ),
    intro: 'Your mailbox, writing back, and mail from businesses and campaigns.',
    groups: [
      {
        title: 'Your mailbox',
        items: [
          {
            text: 'Delivered at 7:00 in your own time zone, urgent pieces at once',
            small: 'Mail comes once a morning at 7:00 where the mailbox is. A certified piece, or one due today or overdue, arrives at once as special delivery.',
          },
          {
            text: 'Drawers for you, your home and your business',
            small: 'Your own mail, your household’s and your business’s, kept apart. Home mail goes only to people who proved the address.',
          },
          {
            text: 'Incoming, a Counter for what needs an answer, and a Vault',
            small: 'New mail lands in Incoming. What you must pay or answer waits on the Counter by its due date. The Vault keeps the rest in folders such as Taxes, Medical and Receipts.',
          },
          {
            text: 'Pantopus reads each letter for you: a summary and the key facts',
            small: 'The first time you open a letter, a short note says what it is and pulls out the dates and amounts that matter.',
          },
          { text: 'Bills with a Pay button', small: 'A bill from a business that invoices through Pantopus is paid from the letter itself.' },
          { text: 'Hold my mail while you are away', small: 'Mail waits while you travel and arrives as one bundle when you are back.' },
          { text: 'Packages tracked to the door', small: 'Deliveries on their way to the home, followed to the door.' },
          { text: 'Search everything, translate anything', small: 'Find any piece you kept, and read a letter in another language.' },
        ],
      },
      {
        title: 'Write back',
        items: [
          {
            text: 'Stationery, ink, a wax seal and your own voice',
            small: 'Address it, write it, choose the paper, the ink and the seal, and add a spoken postscript if you like.',
          },
          {
            text: 'To your household, your connections and the homes around you',
            small: 'Letters are free. Sending one takes a verified home, so every letter comes from a real address.',
          },
          { text: 'Certified mail and signing', small: 'For a letter that needs proof: sent certified, and signed for.' },
          { text: 'Take it back until the morning pickup', small: 'A letter you sent can be taken back until the 7:00 pickup.' },
        ],
      },
      {
        title: 'For businesses and campaigns',
        biz: true,
        items: [
          { text: 'Send as your business: a bill, a notice, an offer', small: 'A business owner writes as the business: an invoice with a Pay button, a notice or an offer.' },
          { text: 'Reach real homes by city, ZIP or distance', small: 'A campaign picks its homes by city, ZIP code or distance from a point.' },
          { text: 'See where your mail went and what it led to' },
          { text: 'Earn: people are paid to read the offers they choose' },
        ],
      },
    ],
  },
  how: {
    title: (
      <>
        How does mail reach <em>your phone?</em>
      </>
    ),
    steps: [
      { title: 'Prove your home', text: 'A postcard code, a bill or lease, your landlord, or a fast check. Your home’s mailbox opens.' },
      { title: 'Mail comes at 7:00', text: 'Once a morning, stamped and sealed, with one notice. Anything urgent comes at once.' },
      { title: 'Answer, pay or keep', text: 'The Counter holds what needs you, by due date. The Vault files the rest.' },
      { title: 'Write back', text: 'A letter on real-looking paper, sealed with wax, to the people and homes around you.' },
    ],
  },
  privacy: {
    title: (
      <>
        Who reads <em>your mail?</em>
      </>
    ),
    quote: 'Home mail goes only to the people who proved they live there.',
    items: [
      { title: 'Home mail stays with the home.', text: 'Only members who proved the address can read it.' },
      { title: 'Nobody is told you opened it.', text: 'Sent mail never says whether a piece was read.' },
      { title: 'Every letter comes from a real home:', text: 'sending one takes a verified address.' },
      { title: 'Take a letter back', text: 'until the morning pickup.' },
      { title: 'Shred what you don’t need.', text: 'It can be restored for 30 days.' },
    ],
  },
  extra: [
    {
      id: 'christmas-cards',
      label: 'Christmas cards',
      kicker: 'This Christmas',
      title: (
        <>
          How do you send a Christmas card <em>online?</em>
        </>
      ),
      intro: 'A card from Mail, sealed with wax, that opens on Christmas morning.',
      body: <ChristmasCards />,
    },
  ],
  deeper: {
    title: (
      <>
        Choose a card <em>for this Christmas</em>
      </>
    ),
    links: [
      { href: '/cards', label: 'Christmas cards', text: 'Every card, by collection. Pick one, sign it and seal it; your first seven are free.' },
      { href: '/place', label: 'Your place', text: 'Mail is for a home. See what is true about yours, free.', listed: true },
    ],
  },
  questions: {
    title: (
      <>
        What people ask about <em>a digital mailbox</em>
      </>
    ),
    items: [
      {
        q: 'What is a digital mailbox?',
        a: 'A mailbox on your phone for what is sent to you through Pantopus: letters from people, notices, bills you can pay and Christmas cards. It arrives once a morning at 7:00. Paper mail is not scanned in.',
      },
      {
        q: 'Can I send a letter online?',
        a: 'Yes. Write a letter in Mail to the people you live with, your connections or the homes near you, with stationery, ink and a wax seal. Letters are free; sending one takes a verified home.',
      },
      {
        q: 'When does mail arrive?',
        a: 'Once a day at 7:00 a.m. where the mailbox is. A certified piece, or anything due today, arrives at once.',
      },
      {
        q: 'Does Pantopus scan my paper mail?',
        a: 'No. Mail holds what is sent through Pantopus. Your paper mail stays in the box at your door.',
      },
      { q: 'Can I pause my mail while I travel?', a: 'Yes. Hold my mail keeps it while you are away, and it arrives as one bundle when you are back.' },
      { q: 'Will a sender know I opened their letter?', a: 'No. Sent mail never says whether a piece was opened.' },
      {
        q: 'How do I send a Christmas card?',
        a: 'Pick a card, write a few words, sign it and seal it. It can stay sealed until 7:00 a.m. on Christmas morning, wherever they live. Your first seven are free.',
      },
    ],
  },
  related: ['place', 'today', 'support-train'],
  close: {
    title: (
      <>
        No pile on the counter. <em>Nothing lost in a feed.</em>
      </>
    ),
    text: 'Start with your address. Your home’s mailbox opens when you prove it.',
  },
};
