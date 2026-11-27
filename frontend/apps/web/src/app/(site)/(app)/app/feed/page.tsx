// /app/feed: Pulse, with its first content read on the server for a document
// request (lib/firstContent.ts). While `pulse_reinvented` is on for the person, PulsePick shows the one Pulse tab
// instead (Pulse, reinvented, phase 1); otherwise today's Pulse, untouched.
import { cookies } from 'next/headers';
import FirstContent, { type FirstContentSearchParams } from '@/components/first-content/FirstContent';
import PulseScreen from './PulseScreen';
import PulsePick from '@/components/reinvented/pulse/PulsePick';
import { KEPT_COOKIE } from '@/components/reinvented/pulse/keptCookie';
import { FIRST_CONTENT_ENABLED } from '@/lib/firstContent';

export default async function PulsePage({ searchParams }: { searchParams: FirstContentSearchParams }) {
  // The person's kept switch answer, read only where this page is already drawn per request (its first content reads
  // the session's cookies), so a page that isn't stays as it is.
  const kept = FIRST_CONTENT_ENABLED && (await cookies()).get(KEPT_COOKIE)?.value === '1';
  return <FirstContent route="/app/feed" searchParams={searchParams}><PulsePick kept={kept}><PulseScreen /></PulsePick></FirstContent>;
}
