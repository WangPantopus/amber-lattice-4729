import type { Metadata } from 'next';
import PublicPlanView, { publicPlanMetadata, type PageProps } from './PublicPlanView';

// A Nearby Plans share link, /plans/<id>. The page is PublicPlanView, which /plan-link/<id> serves too (contract 6.9).
export const dynamic = 'force-dynamic';

export function generateMetadata(props: PageProps): Promise<Metadata> {
  return publicPlanMetadata(props, 'plans');
}

export default async function PublicPlanPage(props: PageProps) {
  return PublicPlanView({ ...props, at: 'plans' });
}
