import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildShareMetadata, normalizePublicProfileIdentifier, summarizeText } from '@/lib/publicShare';
import { launchFeatures } from '@/lib/featureFlags';
import { fetchLinkPage, linkKey } from '@/lib/server/profilePage';
import { isProfilePage } from '@/components/profile/sources/contract';
import { pageSays, pictureVersion } from '@/components/profile/sources/share';
import LinkPageClient from './LinkPageClient';

type Params = Promise<{ username: string; key: string }>;

/** The page a link for one purpose opens, or null: the key is off, the key doesn't open, or no page came back. */
async function linkPage(username: string, key: string) {
  if (!launchFeatures.profileSources || !linkKey(key)) return null;
  try {
    const result = await fetchLinkPage(username, key);
    return isProfilePage(result.data) ? result.data : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username: raw, key } = await params;
  const username = normalizePublicProfileIdentifier(raw);
  const page = await linkPage(username, key);
  // A key that doesn't open is simply not found (a 404, decided here before the page streams), with no reason.
  if (!page) notFound();
  const name = page.header.name.trim() || 'Pantopus member';
  return {
    ...buildShareMetadata({
      title: name,
      description: summarizeText(pageSays(page) ?? '', 160, `${name} on Pantopus.`),
      path: `/${encodeURIComponent(username)}/v/${encodeURIComponent(key)}`,
      images: [`/api/og/profile?u=${encodeURIComponent(username)}&k=${encodeURIComponent(key)}&v=${pictureVersion(page)}`],
      smartBanner: false,
    }),
    robots: { index: false, follow: false },
  };
}

/**
 * A link for one purpose (pantopus.com/<username>/v/<key>): the page composed from that link's parts, the same for
 * anyone who opens it. A key that doesn't open (unknown, switched off, ended) is simply not found, with no reason.
 */
export default async function ProfileLinkPage({ params }: { params: Params }) {
  const { username: raw, key } = await params;
  const username = normalizePublicProfileIdentifier(raw);
  const page = await linkPage(username, key);
  if (!page) notFound();
  return <LinkPageClient page={page} username={username} linkKey={key} />;
}
