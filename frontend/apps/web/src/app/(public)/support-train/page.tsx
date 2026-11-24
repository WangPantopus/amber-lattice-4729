import PillarPage from '../_components/PillarPage';
import { pageMetadata } from '../_lib/seo';
import { SUPPORT_TRAIN } from './content';

export const metadata = pageMetadata({
  path: '/support-train',
  title: 'Support Train: organize meals for someone | Pantopus',
  description:
    'Organize meals for a family after a surgery, a new baby or a loss: a meal calendar, one helper a day, sign-up by email with no account, and reminders for you.',
});

export default function SupportTrainPage() {
  return <PillarPage c={SUPPORT_TRAIN} />;
}
