import { redirect } from 'next/navigation';

// One person pays for the group (Plans for the holidays, the extras): "I'm in" on a buyer's link sends a signed-out
// person through the web's sign-in with this page as the place to come back to (sign-in returns only to /app/
// addresses), and this sends them on to the link's own page, which takes the spot straight away (`&join=1`).
// Only a plan id and a link's token pass; anything else goes to the default landing.
const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

export default async function ClaimSpotAfterSignIn({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { id } = await params;
  const token = [(await searchParams).token].flat()[0] || '';
  redirect(PLAN_ID.test(id) && TOKEN.test(token)
    ? `/plan-link/${id.toLowerCase()}?spot=${encodeURIComponent(token)}&join=1`
    : '/app/place');
}
