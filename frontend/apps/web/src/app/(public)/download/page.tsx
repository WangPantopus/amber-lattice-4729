// /download: where to get the Pantopus app. Both store links are in the HTML for any device (the homepage draws its
// badges in the browser, and /get is a redirect, so until this page no crawlable page said "get the app"). Every
// claim was read from the code or the homepage's words: the app's price (src/lib/site/jsonLd.ts), the account
// ((public)/place/content.tsx) and how a home is verified (src/app/llms.txt/route.ts).

import Link from 'next/link';
import { appsLd } from '@/lib/site/jsonLd';
import { AppButtons, Breadcrumb, Close, JsonLd, Kicker, MorePillars, Questions, Section, Steps } from '../_components/parts';
import styles from '../_components/public.module.css';
import { pageMetadata } from '../_lib/seo';
import r from '../_reading/reading.module.css';

const TITLE = 'Download the app for iPhone and Android | Pantopus';
const DESCRIPTION =
  'Get the Pantopus app free on the App Store and Google Play, or use it in a browser. One app for your home, your mail, your plans and the people around you.';

export const metadata = pageMetadata({ path: '/download', title: TITLE, description: DESCRIPTION });

const QUESTIONS = [
  { q: 'Is the Pantopus app free?', a: 'Yes. Pantopus is free on iPhone and Android, and an account is free and asks for no card.' },
  { q: 'Where do I download Pantopus?', a: 'On the App Store for iPhone and on Google Play for Android. The two buttons on this page open each store.' },
  { q: 'Can I use Pantopus without the app?', a: 'Yes. Sign in at pantopus.com in a browser. Looking up an address needs no account.' },
  {
    q: 'Who sees my address after I add my home?',
    a: 'Others see a first name and a street, at most. Addresses are never sold and never used for ads.',
  },
];

export default function DownloadPage() {
  return (
    <>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <div className={r.head}>
            <Breadcrumb
              items={[
                { name: 'Pantopus', path: '/' },
                { name: 'Get the app', path: '/download' },
              ]}
            />
            <Kicker icon="spark">Get the app</Kicker>
            <h1 className={styles.h1}>
              Get the Pantopus app. <em>Free on iPhone and Android.</em>
            </h1>
            <p className={styles.lede}>
              One app for the place where your life actually happens: your home and its record, what is due today, your
              mail, your plans and the people around you.
            </p>
            <AppButtons caption="Download Pantopus:" />
            <p className={r.note}>
              On a computer? <Link href="/login">Sign in</Link> or <Link href="/register">sign up</Link> in the browser, or{' '}
              <Link href="/start">look up an address</Link> without an account.
            </p>
          </div>
        </div>
      </header>

      <Section id="start" kicker="How to start" title="Three steps, a few minutes">
        <Steps
          items={[
            { title: 'Get the app', text: 'Free on the App Store for iPhone and on Google Play for Android.' },
            { title: 'Create your account', text: 'An account is free and asks for no card.' },
            {
              title: 'Add your home',
              text: 'Type your address. A home is verified by a code on a postcard, a bill or lease, a landlord’s yes, or a phone number and being at home.',
            },
          ]}
        />
      </Section>

      <Section id="inside" kicker="In the app" title={<>Everything that happens <em>where you live.</em></>} intro="Each part has its own page: what it does, how it works and the questions people ask.">
        <MorePillars />
      </Section>

      <Section id="questions" kicker="Questions people ask" title="Questions people ask">
        <Questions items={QUESTIONS} />
      </Section>

      <JsonLd data={appsLd(DESCRIPTION)} />

      <Close title={<>Pantopus starts with your home.</>} text="Start with your address, or get the app." route="page:download" />
    </>
  );
}
