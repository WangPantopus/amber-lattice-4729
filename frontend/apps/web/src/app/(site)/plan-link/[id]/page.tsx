import type { Metadata } from 'next';
import PublicPlanView, { publicPlanMetadata, type PageProps } from '../../plans/[id]/PublicPlanView';

// ============================================================
// /plan-link/<plan id>: the guest's page of a private plan (Plans for the holidays, contract 6.9). The plan's open link
// (?open=) and the link in a guest's email (through /plan-invitation/<id>, which keeps the key in this browser's
// cookie) lead here. It draws what /plans/<id> draws (the invitation and its form, the wait, the guest's part), without
// a redirect to /plans/: every iPhone build opens /plans/* in the app, an Android browser may hand such an address back
// to the app, and no store build knows an open link. This path is never listed in apple-app-site-association.
// ============================================================
export const dynamic = 'force-dynamic';

export function generateMetadata(props: PageProps): Promise<Metadata> {
  return publicPlanMetadata(props, 'plan-link');
}

export default async function PlanLinkPage(props: PageProps) {
  return PublicPlanView({ ...props, at: 'plan-link' });
}
