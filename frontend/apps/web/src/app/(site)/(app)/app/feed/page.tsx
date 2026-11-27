// /app/feed: Pulse, with its first content read on the server for a document
// request (lib/firstContent.ts). While `pulse_reinvented` is on for the person, PulsePick shows the one Pulse tab
// instead (Pulse, reinvented, phase 1); otherwise today's Pulse, untouched.
import FirstContent, { type FirstContentSearchParams } from '@/components/first-content/FirstContent';
import PulseScreen from './PulseScreen';
import PulsePick from '@/components/reinvented/pulse/PulsePick';

export default function PulsePage({ searchParams }: { searchParams: FirstContentSearchParams }) {
  return <FirstContent route="/app/feed" searchParams={searchParams}><PulsePick><PulseScreen /></PulsePick></FirstContent>;
}
