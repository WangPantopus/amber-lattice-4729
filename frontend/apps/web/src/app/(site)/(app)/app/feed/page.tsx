// /app/feed: Pulse, with its first content read on the server for a document
// request (lib/firstContent.ts). While `pulse_reinvented` is on for the person, PulsePick shows the one Pulse tab
// instead (Pulse, reinvented, phase 1); otherwise today's Pulse, untouched.
import { cookies } from 'next/headers';
import FirstContent, { type FirstContentSearchParams } from '@/components/first-content/FirstContent';
import PulseScreen from './PulseScreen';
import PulsePick from '@/components/reinvented/pulse/PulsePick';
import { CSRF_COOKIE, KEPT_COOKIE, keptValue } from '@/components/reinvented/pulse/keptCookie';
import { FIRST_CONTENT_ENABLED } from '@/lib/firstContent';

export default async function PulsePage({ searchParams }: { searchParams: FirstContentSearchParams }) {
  // The person's kept switch answer, read only where this page is already drawn per request (its first content reads
  // the session's cookies), so a page that isn't stays as it is. It counts only for the sign-in that set it.
  let kept = false;
  if (FIRST_CONTENT_ENABLED) {
    const jar = await cookies();
    const mine = keptValue(jar.get(CSRF_COOKIE)?.value);
    kept = !!mine && jar.get(KEPT_COOKIE)?.value === mine;
  }
  return <FirstContent route="/app/feed" searchParams={searchParams}><PulsePick kept={kept}><PulseScreen /></PulsePick></FirstContent>;
}
