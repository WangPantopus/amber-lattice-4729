import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { fetchPublicUser, normalizePublicProfileIdentifier } from '@/lib/publicShare';
import { launchFeatures } from '@/lib/featureFlags';
import { fetchSignedOutProfilePage } from '@/lib/server/profilePage';
import { isProfilePage } from '@/components/profile/sources/contract';
import ProfileFrame from '@/components/profile/sources/ProfileFrame';

/** Whether this request comes from someone signed in (the web's session flag cookie; the session itself is httpOnly). */
async function signedInRequest(): Promise<boolean> {
  try {
    return (await cookies()).get('pantopus_session')?.value === '1';
  } catch {
    return false;
  }
}

export default async function UsernameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}) {
  // No account has this name (a private profile answers 403, not 404): answer a real 404. This
  // runs here, before the Suspense below starts streaming the page with a 200.
  const { username } = await params;
  const identifier = normalizePublicProfileIdentifier(username);
  const result = await fetchPublicUser(identifier);
  if (!result.data && result.status === 404) notFound();

  // Someone signed out gets a shared page's plain frame where the profile with sources draws the new page (the same
  // read the page makes, shared within this request) and on any link for one purpose; everyone else the app's frame.
  const signedOut = !(await signedInRequest());
  let newPage = false;
  if (signedOut && launchFeatures.profileSources) {
    try {
      newPage = isProfilePage((await fetchSignedOutProfilePage(identifier)).data);
    } catch {
      newPage = false;
    }
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-app flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    }>
      <ProfileFrame signedOut={signedOut} newPage={newPage} sourcesOn={launchFeatures.profileSources} username={identifier}>
        {children}
      </ProfileFrame>
    </Suspense>
  );
}
