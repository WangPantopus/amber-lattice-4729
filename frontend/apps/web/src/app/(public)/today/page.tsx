import PillarPage from '../_components/PillarPage';
import { pageMetadata } from '../_lib/seo';
import { TODAY } from './content';

export const metadata = pageMetadata({
  path: '/today',
  title: 'Today: your home’s day in one place | Pantopus',
  description:
    'A home management app for the whole household: shared tasks, trash pickup reminders, weather alerts, air quality at your address and local news without crime.',
});

export default function TodayPage() {
  return <PillarPage c={TODAY} />;
}
