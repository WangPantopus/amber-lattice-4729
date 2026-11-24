import { GUIDES, guideBySlug } from '@/lib/site/guides';
import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../../_lib/shareImage';

export const alt = 'The Earth at night, under a Pantopus guide’s title';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export default async function TwitterImage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  return shareImage({ eyebrow: 'Guide', lines: [g?.h1 ?? 'Guides'], note: 'A plain guide from Pantopus, with its sources.' });
}
