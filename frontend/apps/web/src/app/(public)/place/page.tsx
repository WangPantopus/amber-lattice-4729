import PillarPage from '../_components/PillarPage';
import { pageMetadata } from '../_lib/seo';
import { PLACE } from './content';

export const metadata = pageMetadata({
  path: '/place',
  title: 'Property details for any U.S. address, free | Pantopus',
  description:
    'Flood zone, wildfire and radon risk, the county record, property-tax help and who represents you, for any U.S. address. Every fact sourced. No account.',
});

export default function PlacePage() {
  return <PillarPage c={PLACE} />;
}
