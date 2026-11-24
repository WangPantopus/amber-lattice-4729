'use client';

// "This home's public record" for an address the person looked up, signed in (SPEC section 8, the `buyer` state): the
// same page as /start/record, inside the app, so signing up or in from the record comes back here (sign-in returns only
// to /app pages). The address stays on the device under the lookup's opaque preview id, never in this URL.

import LookupRecord from '@/app/(site)/start/record/LookupRecord';

export default function PlaceRecordPage() {
  return <LookupRecord />;
}
