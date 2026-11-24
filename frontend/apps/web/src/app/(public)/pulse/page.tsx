import PillarPage from '../_components/PillarPage';
import { pageMetadata } from '../_lib/seo';
import { PULSE } from './content';

export const metadata = pageMetadata({
  path: '/pulse',
  title: 'Pulse: a local social network of real people | Pantopus',
  description:
    'See what’s happening near you, from people who live there: asks, events, deals, lost and found and heads-ups, as a list or a map. No crime alerts, by rule.',
});

export default function PulsePage() {
  return <PillarPage c={PULSE} />;
}
