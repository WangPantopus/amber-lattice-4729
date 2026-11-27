import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import FieldGuide from '@/components/reinvented/guide/FieldGuide';
import { CSRF_COOKIE, KEPT_COOKIE, keptValue } from '@/components/reinvented/pulse/keptCookie';

// Pulse, reinvented: the reader's own field guide (collected field cards, saved steps). Private; never indexed. The tab's
// title names the page only for a person whose switch was on last time (the kept answer, as /app/feed reads it); anyone
// else gets the app's own title, as on today's 404 for this address (the page answers 404 once the switch is known off).
export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const mine = keptValue(jar.get(CSRF_COOKIE)?.value);
  const on = !!mine && jar.get(KEPT_COOKIE)?.value === mine;
  return { ...(on ? { title: 'Your field guide' } : {}), robots: { index: false, follow: false } };
}

export default function FieldGuidePage() {
  return <FieldGuide />;
}
