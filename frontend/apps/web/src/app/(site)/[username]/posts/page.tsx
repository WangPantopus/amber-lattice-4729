import type { Metadata } from 'next';
import { normalizePublicProfileIdentifier } from '@/lib/publicShare';
import PersonPostsClient from './PersonPostsClient';

// A person's posts are for signed-in people: nothing here for search engines or a link picture.
export const metadata: Metadata = { title: 'Posts | Pantopus', robots: { index: false, follow: false } };

export default async function PersonPostsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <PersonPostsClient username={normalizePublicProfileIdentifier(username)} />;
}
