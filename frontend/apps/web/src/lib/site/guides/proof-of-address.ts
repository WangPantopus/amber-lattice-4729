import type { Guide } from './types';

const READ = '2026-11-23';

export const proofOfAddress: Guide = {
  slug: 'how-to-prove-where-you-live',
  title: 'How to prove where you live: proof of address | Pantopus',
  description:
    'What counts as proof of address, what usually doesn’t, what to do if you just moved or live with someone else, and how to prove one fact without your address.',
  h1: 'How to prove where you live',
  lede: 'A school, a bank, a post office or a parking permit may ask you to prove your address. Here is what usually counts, what doesn’t, and what to do when you have nothing in your own name.',
  written: '2026-11-23',
  checked: '2026-11-23',
  sections: [
    {
      h2: 'Who decides what counts',
      blocks: [
        { p: 'There is no single national list. Each office that asks, whether a school district, a state licensing office, a bank or the post office, sets its own rules, and they change. Before you go, find that office’s own list and follow it. What follows is what you will usually be asked for, and one official example.' },
      ],
    },
    {
      h2: 'One official list: the U.S. Postal Service',
      blocks: [
        { p: 'For services such as a change of address or a PO Box, the Postal Service asks for a photo ID and, to verify the address, an acceptable secondary form of identification. Its list ([USPS, Acceptable Forms of Identification](https://faq.usps.com/s/article/Acceptable-Form-of-Identification), updated May 4, 2026, read November 23, 2026):' },
        {
          ul: [
            'A lease, mortgage or deed of trust.',
            'A voter or vehicle registration card.',
            'A home or vehicle insurance policy.',
          ],
        },
        { p: 'The same page lists what it does not accept: Social Security cards, birth certificates, credit cards and similar items, and digital or electronic forms of identification of any kind. So bring paper.' },
      ],
    },
    {
      h2: 'What else is commonly asked for',
      blocks: [
        { p: 'Many offices also take a recent utility bill (power, gas, water, internet), a bank or credit-card statement, a pay stub, or a letter from a government agency, as long as it shows your name and the address and is recent. Ask how recent: offices set their own limit.' },
      ],
    },
    {
      h2: 'Make sure it will be accepted',
      blocks: [
        {
          ul: [
            'Your name matches your ID exactly, middle initial and all.',
            'The address matches, including the unit or apartment number.',
            'It is current: dated recently, or a lease or policy still in force.',
            'It is the original or a full printout, not a cropped screenshot.',
            'Bring two different documents if you can. If one is turned away, you won’t need a second trip.',
          ],
        },
      ],
    },
    {
      h2: 'If you just moved',
      blocks: [
        { p: 'You may not have a bill yet. A signed lease or a closing document usually works from day one. Update your voter registration and your vehicle registration early: both are on the Postal Service’s list. Set up one utility in your name if you can.' },
      ],
    },
    {
      h2: 'If nothing is in your name',
      blocks: [
        { p: 'Students, adult children at home and people living with a partner often have no bill of their own. Ask the office whether it accepts a letter from the person whose name is on the lease or deed, together with that person’s own proof. Some do, some don’t, so ask first.' },
      ],
    },
    {
      h2: 'Proving one fact without showing your address',
      blocks: [
        { p: 'Sometimes you only need to prove one thing: that you live in a school district, or in a town. Handing over a bill shows far more than that. On Pantopus, a verified resident can share a Residency Pass: a link that proves one fact, such as being a verified resident of a school district, that shows nothing beyond that fact, ends when you choose, and tells you each time it is viewed. Verified residents can also make residency letters.' },
        { p: 'To verify a home on Pantopus you prove it once: with a code on a postcard mailed to your door, a utility bill from the last 90 days or your lease, your landlord’s yes, or a fast check. The Verified mark then tells people you are real, and your address stays yours:' },
        { p: 'Only you see the address you type, others see your first name, never your address' },
      ],
    },
  ],
  questions: [
    { q: 'What counts as proof of address?', a: 'It depends on who is asking. The U.S. Postal Service, for example, accepts a lease, mortgage or deed of trust; a voter or vehicle registration card; or a home or vehicle insurance policy. Many offices also take a recent utility bill.' },
    { q: 'Is a bank statement proof of address?', a: 'Many offices accept one if it is recent and shows your name and address. Check the office’s own list first.' },
    { q: 'Can I use a digital bill or a screenshot?', a: 'Not everywhere. The Postal Service, for one, does not accept digital or electronic forms of identification. Bring a paper copy.' },
    { q: 'What if I just moved and have no bills yet?', a: 'A signed lease or closing document usually works. Update your voter and vehicle registration early; both are common proofs.' },
    { q: 'What if no bills are in my name?', a: 'Ask the office whether it accepts a letter from the person whose name is on the lease or deed, with that person’s own proof.' },
    { q: 'Can I prove I live in a school district without showing my address?', a: 'On Pantopus, a verified resident can share a Residency Pass, a link that proves one fact like the school district and nothing else.' },
  ],
  sources: [
    { publisher: 'U.S. Postal Service', title: 'Acceptable Forms of Identification', url: 'https://faq.usps.com/s/article/Acceptable-Form-of-Identification', read: READ },
  ],
  pantopus: {
    title: 'Verify your home once',
    text: 'A postcard code, a bill or lease, your landlord, or a fast check. Then prove one fact by link, without showing your address.',
    href: '/social-network',
    label: 'Why Pantopus verifies homes',
  },
  related: [
    { href: '/social-network', label: 'A social network of real people' },
    { href: '/place', label: 'Place' },
    { href: '/guides/how-to-read-a-property-record', label: 'How to read a property record' },
    { href: '/home-management', label: 'Run your home together' },
  ],
  notAdvice: 'This guide is general information, not legal advice. The office that asks decides what it accepts.',
};
