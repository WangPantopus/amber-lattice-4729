// ============================================================
// /start/record?preview=<id> — "This home's record" for a looked-up address
//
// Opened from the lookup result's "See this home's full record". The address stays on this device under the
// lookup's own opaque preview id (components/place/pendingPlace.ts), never in this page's address, and the record is
// asked for with the same words the lookup used, so it costs no second lookup. Not indexed.
// ============================================================

import type { Metadata, Viewport } from 'next';
import LookupRecord from './LookupRecord';

export const metadata: Metadata = {
  title: 'This home’s record · Pantopus',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f6f7f9',
};

export default function LookupRecordPage() {
  return <LookupRecord />;
}
