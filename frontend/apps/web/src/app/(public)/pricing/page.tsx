// /pricing: what is free and what costs money, each line read from the code or from a page that already says it.
// The app's price (src/lib/site/jsonLd.ts), the account and the address lookup ((public)/place/content.tsx), letters
// ((public)/mail/content.tsx), Support Train ((public)/support-train/content.tsx), and the Christmas cards' free seven
// and the books of stamps (backend/services/mailStamps.js: FREE_CARDS and BOOKS, which name this page). The Christmas
// card lines are drawn only while Christmas cards are on.

import { isLaunchCutPath } from '@/lib/featureFlags';
import { AppButtons, Breadcrumb, Close, Deeper, Kicker, Questions, Section } from '../_components/parts';
import styles from '../_components/public.module.css';
import { pageMetadata } from '../_lib/seo';
import { Blocks } from '../_reading/Prose';
import r from '../_reading/reading.module.css';

const CARDS_ON = !isLaunchCutPath('/cards');

// backend/services/mailStamps.js: FREE_CARDS, and BOOKS in U.S. cents as the web checkout charges them.
const FREE_CARDS = 7;
const STAMP_BOOKS = [
  { stamps: 5, price: '$2.99' },
  { stamps: 20, price: '$7.99' },
  { stamps: 50, price: '$14.99' },
];

const TITLE = 'Pricing: what is free and what costs money | Pantopus';
const DESCRIPTION = CARDS_ON
  ? `Pantopus is free on iPhone, Android and the web, and an account asks for no card. Your first ${FREE_CARDS} Christmas cards are free; after that, a card takes a stamp.`
  : 'Pantopus is free on iPhone, Android and the web. An account is free and asks for no card, and looking up any U.S. address needs no account.';

export const metadata = pageMetadata({ path: '/pricing', title: TITLE, description: DESCRIPTION });

const FREE = [
  { href: '/download', label: 'The app', text: 'Free on iPhone and Android.' },
  { href: '/register', label: 'An account', text: 'Free, and it asks for no card.' },
  { href: '/start', label: 'Looking up an address', text: 'The public record for any U.S. address, with every source named. No account needed.' },
  { href: '/mail', label: 'Letters', text: 'Letters are free. Sending one takes a verified home, so every letter comes from a real address.' },
  { href: '/support-train', label: 'Support Train', text: 'Starting a Support Train and signing up to help are free.' },
  ...(CARDS_ON ? [{ href: '/cards', label: `Your first ${FREE_CARDS} Christmas cards`, text: `Pick a card, write a few words, sign it and seal it. The first ${FREE_CARDS} cost nothing.` }] : []),
];

const QUESTIONS = [
  { q: 'Is Pantopus free?', a: 'Yes. The app is free on iPhone and Android, an account is free and asks for no card, and looking up an address needs no account.' },
  { q: 'Do I need a credit card to sign up?', a: 'No. An account is free and asks for no card.' },
  { q: 'Is it free to look up an address?', a: 'Yes. Looking up an address needs no account. Saving a home takes a free account, with no card.' },
  ...(CARDS_ON
    ? [
        {
          q: 'Do Christmas cards cost money?',
          a: `Your first ${FREE_CARDS} cards are free. After that, each card takes a stamp. On the web a book of ${STAMP_BOOKS.map((b) => `${b.stamps} stamps is ${b.price}`).join(', ')}.`,
        },
      ]
    : []),
  { q: 'Does a Support Train cost anything?', a: 'No. Starting a Support Train and signing up to help are free.' },
  { q: 'Does Pantopus sell my address?', a: 'No. Addresses are never sold and never used for ads.' },
];

export default function PricingPage() {
  return (
    <>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <div className={r.head}>
            <Breadcrumb
              items={[
                { name: 'Pantopus', path: '/' },
                { name: 'Pricing', path: '/pricing' },
              ]}
            />
            <Kicker icon="spark">Pricing</Kicker>
            <h1 className={styles.h1}>
              Pantopus is free. <em>Here is what costs money.</em>
            </h1>
            <p className={styles.lede}>
              The app and an account are free, and looking up an address needs no account.
              {CARDS_ON ? ` Christmas cards are free for your first ${FREE_CARDS}; after that, each card takes a stamp.` : ''}
            </p>
            <AppButtons />
          </div>
        </div>
      </header>

      <Section id="free" kicker="Free" title="What is free">
        <Deeper items={FREE} />
      </Section>

      {CARDS_ON ? (
        <Section id="stamps" kicker="Christmas cards" icon="mail" title="Stamps for Christmas cards">
          <div className={r.column}>
            <Blocks
              blocks={[
                { p: `Every account starts with ${FREE_CARDS} free stamps, so your first ${FREE_CARDS} [Christmas cards](/cards) cost nothing. After that, each card takes one stamp.` },
                { p: 'Stamps are sold in books. On the web, in U.S. dollars:' },
                { ul: STAMP_BOOKS.map((b) => `${b.stamps} stamps: ${b.price}`) },
                { p: 'In the iPhone and Android apps, the App Store or Google Play shows the price before you pay. Stamps send Christmas cards only, and books are sold during the Christmas card season.' },
                { p: 'New to it? Read [how to send a Christmas card online](/guides/how-to-send-a-christmas-card-online).' },
              ]}
            />
          </div>
        </Section>
      ) : null}

      <Section id="questions" kicker="Questions people ask" title="Questions people ask">
        <Questions items={QUESTIONS} />
      </Section>

      <Close title={<>Pantopus starts with your home.</>} text="Start with your address, or get the app." route="page:pricing" />
    </>
  );
}
