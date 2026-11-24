'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '@pantopus/api';
import type { ProfilePage } from '@pantopus/api';
import SourcesProfile from '@/components/profile/sources/SourcesProfile';
import ReportModal from '@/components/ui/ReportModal';
import { toast } from '@/components/ui/toast-store';
import { authPageHref } from '@/lib/auth-utils';

/**
 * A link for one purpose, drawn like the main link's page: the footer sentence, What Seen, Signed and Said mean,
 * Report this page, and Make your own profile for someone not signed in. Nothing on it names the link.
 */
export default function LinkPageClient({ page, username, linkKey }: { page: ProfilePage; username: string; linkKey: string }) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [reporting, setReporting] = useState(false);
  useEffect(() => setSignedIn(Boolean(api.getAuthToken())), []);
  const viaLink = useMemo(() => ({ username, key: linkKey }), [username, linkKey]);
  // Sign-in and sign-up come back to the person's main page, never to this address: the key must not ride along in
  // another page's address (where a Referer or a sign-in provider could see it).
  const here = `/${encodeURIComponent(username)}`;

  return (
    <div className="bg-app min-h-screen">
      <div className="mx-auto w-full max-w-2xl lg:max-w-6xl px-5 lg:px-8 pt-4 pb-8">
        <SourcesProfile
          page={page}
          viewerId=""
          postsReadable={false}
          viaLink={viaLink}
          signedOut={!signedIn}
          onJoin={() => router.push(authPageHref('/register', here))}
          onReport={() => {
            if (!api.getAuthToken()) { router.push(authPageHref('/login', here)); return; }
            setReporting(true);
          }}
          onDoor={() => { if (!api.getAuthToken()) router.push(authPageHref('/login', here)); }}
        />
      </div>
      <ReportModal
        open={reporting}
        onClose={() => setReporting(false)}
        entityType="user"
        onSubmit={async (reason, details) => {
          try {
            await api.users.reportUser(page.header.user_id, reason, details);
            toast.success('Report submitted');
          } catch (error) {
            toast.error('Couldn’t submit your report. Please retry.');
            throw error;
          }
        }}
      />
    </div>
  );
}
