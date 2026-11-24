import type { Metadata } from 'next';
import {
  buildShareMetadata,
  displayNameForUser,
  fetchPublicProfilePage,
  fetchPublicUser,
  normalizePublicProfileIdentifier,
  summarizeText,
} from '@/lib/publicShare';
import { launchFeatures } from '@/lib/featureFlags';
import { isProfilePage } from '@/components/profile/sources/contract';
import { pageSays, signedOutCopy } from '@/components/profile/sources/share';
import { buildUserProfilePath, buildUserProfileShareUrl } from '@pantopus/utils';
import PublicProfileClient from './PublicProfileClient';

/** The profile with sources as a signed-out visitor gets it, or null (the key is off, or no page came back). */
async function signedOutPage(username: string) {
  if (!launchFeatures.profileSources) return null;
  try {
    const result = await fetchPublicProfilePage(username);
    return isProfilePage(result.data) ? result.data : null;
  } catch {
    // Any failure (no backend while building, an older server) draws today's page.
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const normalizedUsername = normalizePublicProfileIdentifier(username);
  const [result, page] = await Promise.all([fetchPublicUser(normalizedUsername), signedOutPage(normalizedUsername)]);
  const profile = result.data;

  if (!profile) {
    // Only a 404 means there is no such profile. Any other failure is
    // temporary, so the tab title must not claim the profile doesn't exist.
    if (result.status !== 404) return { title: 'Pantopus' };
    return {
      title: 'Profile Not Found | Pantopus',
      description: 'This Pantopus profile could not be found.',
    };
  }

  const path = buildUserProfilePath(normalizedUsername);
  const appArgument = buildUserProfileShareUrl(normalizedUsername);

  if (page && (profile.accountType ?? profile.account_type) !== 'business') {
    // The link shows what the page shows: the name and portrait always, Says only while that part is on, and the
    // page is listed by search engines only when the person said so.
    const name = page.header.name.trim() || displayNameForUser(profile);
    const says = pageSays(page);
    return {
      ...buildShareMetadata({
        title: name,
        description: summarizeText(says ?? '', 160, `${name} on Pantopus.`),
        path,
        appArgument,
        images: page.header.portrait_url ? [page.header.portrait_url] : null,
      }),
      robots: page.listed === true ? undefined : { index: false, follow: false },
    };
  }

  const fullName = displayNameForUser(profile);
  const bioSource = typeof profile.bio === 'string' ? profile.bio : '';

  return buildShareMetadata({
    title: fullName,
    description: summarizeText(
      bioSource,
      160,
      `${fullName} on Pantopus. Connect, message, and see their work.`,
    ),
    path,
    appArgument,
    images: profile.profile_picture_url ? [profile.profile_picture_url] : null,
  });
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const normalizedUsername = normalizePublicProfileIdentifier(username);
  const [result, page] = await Promise.all([fetchPublicUser(normalizedUsername), signedOutPage(normalizedUsername)]);
  // With the page, the signed-out copy carries only what the page always shows (who it is), so nothing a part keeps
  // off rides along in the page's source.
  const initialProfile = page && result.data ? signedOutCopy(result.data) : result.data;

  return (
    <PublicProfileClient username={normalizedUsername} initialProfile={initialProfile} initialPage={page} />
  );
}
