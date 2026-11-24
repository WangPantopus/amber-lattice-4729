import PillarPage from '../_components/PillarPage';
import { pageMetadata } from '../_lib/seo';
import { PLANS } from './content';

export const metadata = pageMetadata({
  path: '/plans',
  title: 'Plans: make plans with friends and family | Pantopus',
  description:
    'Game nights, dinners, pickup games and Thanksgiving: find a date, a bring list, invites by text or link, and a group chat at the first yes. Guests need no app.',
});

export default function PlansPage() {
  return <PillarPage c={PLANS} />;
}
