import PillarPage from '../_components/PillarPage';
import { pageMetadata } from '../_lib/seo';
import { MOMENTS } from './content';

export const metadata = pageMetadata({
  path: '/moments',
  title: 'Moments: stories on a map, gone in a day | Pantopus',
  description:
    'Share photos, videos and a few words pinned on a map where they happened. See the moments around you right now. Each lasts 1 to 48 hours, then it is gone.',
});

export default function MomentsPage() {
  return <PillarPage c={MOMENTS} />;
}
