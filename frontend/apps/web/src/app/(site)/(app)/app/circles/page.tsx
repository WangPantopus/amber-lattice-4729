import { Suspense } from 'react';
import CirclesScreen from '@/components/reinvented/circles/CirclesScreen';

// Pulse, reinvented: the person's circles and their weekly magazines. Private; never indexed.
export const metadata = { title: 'Your circles', robots: { index: false, follow: false } };

export default function CirclesRoute() {
  return (
    <Suspense>
      <CirclesScreen />
    </Suspense>
  );
}
