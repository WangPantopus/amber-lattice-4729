'use client';

// The circles page's two views, kept in the address so a reload or a link comes back to the same one:
// `?circle=<id>` opens a circle, `&magazine=1` its magazine.

import { useRouter, useSearchParams } from 'next/navigation';
import CirclesPage from './CirclesPage';
import Magazine from './Magazine';
// The faces (MomentFace) are drawn by the Moments styles.
import '@/components/moments/moments.css';

export default function CirclesScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const circle = params.get('circle');
  const go = (id: string | null, magazine = false) =>
    router.push(id ? `/app/circles?circle=${encodeURIComponent(id)}${magazine ? '&magazine=1' : ''}` : '/app/circles');
  if (circle && params.get('magazine') === '1') return <Magazine circleId={circle} onBack={() => go(circle)} />;
  return <CirclesPage circleId={circle} onCircle={(id) => go(id)} />;
}
