// /guides/<slug>: one guide, drawn from src/lib/site/guides. The ten slugs are built at build time; any other slug is a
// 404 (dynamicParams off), so nothing here reads a request or the backend.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GUIDES, guideBySlug } from '@/lib/site/guides';
import { pageMetadata } from '../../_lib/seo';
import GuideArticle, { guidePath } from '../../_reading/GuideArticle';

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  const meta = pageMetadata({ path: guidePath(g), title: g.title, description: g.description });
  return {
    ...meta,
    openGraph: { ...meta.openGraph, type: 'article', publishedTime: g.written, modifiedTime: g.checked },
  };
}

export default async function GuidePage({ params }: Params) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  return <GuideArticle g={g} />;
}
