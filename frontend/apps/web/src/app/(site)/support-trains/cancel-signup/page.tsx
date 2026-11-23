import type { Metadata } from 'next';
import GuestCancelSignup from '@/components/support-trains/GuestCancelSignup';

// The page the "Cancel your sign-up" link in a guest's Support Train emails opens. The link carries the signup and a
// signature from the server; nothing is cancelled until the guest presses the button.
export const metadata: Metadata = {
  title: 'Cancel your sign-up | Pantopus',
  robots: { index: false, follow: false },
};

export default async function CancelSupportTrainSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; s?: string }>;
}) {
  const { r, s } = await searchParams;
  return <GuestCancelSignup reservationId={typeof r === 'string' ? r : ''} signature={typeof s === 'string' ? s : ''} />;
}
