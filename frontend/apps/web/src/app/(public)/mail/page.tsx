import PillarPage from '../_components/PillarPage';
import { pageMetadata } from '../_lib/seo';
import { MAIL } from './content';

export const metadata = pageMetadata({
  path: '/mail',
  title: 'Mail: a mailbox for your home, on your phone | Pantopus',
  description:
    'A digital mailbox for your home: letters and cards delivered at 7 a.m., each read for you, bills with a Pay button, and letters you send sealed with wax.',
});

export default function MailPage() {
  return <PillarPage c={MAIL} />;
}
