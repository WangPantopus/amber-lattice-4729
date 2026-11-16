import { redirect } from 'next/navigation';

// Paying to join a business's plan from its web page (Plans for the holidays B3): "Join for $18" sends a signed-out
// person through the web's sign-in with this page as the place to come back to (sign-in returns only to /app/
// addresses), and this sends them on to the plan's own page, which opens the payment straight away (`?join=1`).
// Only a plan id passes; anything else goes to the default landing.
const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JoinPlanAfterSignIn({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(PLAN_ID.test(id) ? `/plans/${id.toLowerCase()}?join=1` : '/app/place');
}
