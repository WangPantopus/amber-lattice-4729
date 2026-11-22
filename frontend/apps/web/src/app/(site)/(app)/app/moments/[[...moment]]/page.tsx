import { Suspense } from 'react';
import MomentsExperience from '@/components/moments/MomentsExperience';
import '@/components/moments/moments.css';
import 'mapbox-gl/dist/mapbox-gl.css';

export const metadata = { title: 'Moments · Pantopus' };
export default function MomentsPage() {
  return <Suspense fallback={<div className="mo-gate">Opening Moments…</div>}><MomentsExperience/></Suspense>;
}
