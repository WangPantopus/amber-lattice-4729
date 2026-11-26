// /help: where to find an answer. A hub of links, not a second copy of the answers: each part of the app has its own
// page with the questions people ask, and this page sends people there, to the account pages and to support. Every
// answer below was read from the page that owns it: the password reset ((auth)/forgot-password), deleting an account
// ((site)/delete-account), the support address ((site)/contact) and how a home is verified (src/app/llms.txt/route.ts).

import { isLaunchCutPath } from '@/lib/featureFlags';
import { Breadcrumb, Close, Deeper, Kicker, MorePillars, Questions, Section } from '../_components/parts';
import styles from '../_components/public.module.css';
import { pageMetadata } from '../_lib/seo';
import { linkCards } from '../_reading/links';
import { Blocks } from '../_reading/Prose';
import r from '../_reading/reading.module.css';

const SUPPORT_EMAIL = 'support@pantopus.com';

const TITLE = 'Help and support | Pantopus';
const DESCRIPTION =
  'Help with Pantopus: sign in, reset a password, get the app, verify your home, send mail and cards, make plans, delete an account, or write to support.';

export const metadata = pageMetadata({ path: '/help', title: TITLE, description: DESCRIPTION });

const ACCOUNT = [
  { href: '/register', label: 'Sign up', text: 'Create a free account. It asks for no card.' },
  { href: '/login', label: 'Sign in', text: 'Sign in to Pantopus on the web.' },
  { href: '/forgot-password', label: 'Forgot your password?', text: 'Enter your email and we’ll send a reset link.' },
  { href: '/download', label: 'Get the app', text: 'Free on iPhone and Android.' },
  { href: '/pricing', label: 'Pricing', text: 'What is free and what costs money.' },
  { href: '/delete-account', label: 'Delete your account', text: 'How to delete it in the app or on the web, and what is deleted or kept.' },
];

const HOME = linkCards(
  [
    { href: '/start', label: 'Look up an address' },
    { href: '/property-records', label: 'Property records' },
    { href: '/tax-check', label: 'Property tax check' },
    { href: '/guides/how-to-prove-where-you-live', label: 'Prove where you live' },
    { href: '/guides/how-to-read-a-property-record', label: 'Read a property record' },
    { href: '/cards', label: 'Christmas cards' },
    { href: '/guides/how-to-send-a-christmas-card-online', label: 'Send a Christmas card online' },
    { href: '/guides', label: 'All guides' },
  ].filter((link) => !isLaunchCutPath(link.href)),
);

const TRUST = [
  { href: '/privacy', label: 'Privacy policy', text: 'What Pantopus collects, why, and your rights and choices.' },
  { href: '/terms', label: 'Terms of service', text: 'The terms for using Pantopus.' },
  { href: '/child-safety', label: 'Child safety standards', text: 'How Pantopus prevents and reports child sexual abuse and exploitation.' },
  { href: '/about/data-sources', label: 'Data sources', text: 'The publishers of the public files behind address and property records.' },
];

const QUESTIONS = [
  { q: 'How do I reset my Pantopus password?', a: 'On the sign-in page, choose “Forgot password?”, enter your email, and we’ll send a reset link.' },
  {
    q: 'How do I delete my Pantopus account?',
    a: 'In the app, open the menu, tap Profile & Privacy, then Delete account at the bottom, and confirm with your password. On the web, sign in, open your profile settings and choose Delete Account, then confirm.',
  },
  { q: 'How do I contact Pantopus support?', a: `Write to ${SUPPORT_EMAIL}.` },
  { q: 'Where do I get the Pantopus app?', a: 'Pantopus is free on the App Store for iPhone and on Google Play for Android.' },
  { q: 'How does Pantopus verify a home?', a: 'By a code on a postcard, a bill or lease, a landlord’s yes, or a phone number and being at home.' },
  { q: 'Who can see my address?', a: 'Others see a first name and a street, at most. Addresses are never sold and never used for ads.' },
];

export default function HelpPage() {
  return (
    <>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <div className={r.head}>
            <Breadcrumb
              items={[
                { name: 'Pantopus', path: '/' },
                { name: 'Help', path: '/help' },
              ]}
            />
            <Kicker icon="heart">Help</Kicker>
            <h1 className={styles.h1}>
              Help with Pantopus. <em>Start with what you need.</em>
            </h1>
            <p className={styles.lede}>
              Your account, your home, each part of the app, and how to reach us. Each part has its own page with the
              questions people ask.
            </p>
          </div>
        </div>
      </header>

      <Section id="account" kicker="Your account" title="Your account and the app">
        <Deeper items={ACCOUNT} />
      </Section>

      <Section id="parts" kicker="The app" title="Help with each part of the app" intro="What each part does, how it works and the questions people ask about it.">
        <MorePillars />
      </Section>

      <Section id="home" kicker="Your home" icon="home" title="Your home, its record and the guides">
        <Deeper items={HOME} />
      </Section>

      <Section id="trust" kicker="Privacy and safety" icon="shield" title="Privacy, terms and safety">
        <Deeper items={TRUST} />
      </Section>

      <Section id="questions" kicker="Questions people ask" title="Questions people ask">
        <Questions items={QUESTIONS} />
      </Section>

      <Section id="contact" kicker="Contact" icon="chat" title="Still stuck? Write to us.">
        <div className={r.column}>
          <Blocks
            blocks={[
              { p: `Write to [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}) about your account or anything that isn’t working. The [contact page](/contact) has the addresses for business and privacy questions.` },
            ]}
          />
        </div>
      </Section>

      <Close title={<>Pantopus starts with your home.</>} text="Start with your address, or get the app." route="page:help" />
    </>
  );
}
