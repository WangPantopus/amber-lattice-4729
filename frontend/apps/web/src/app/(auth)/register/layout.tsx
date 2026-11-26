import { publicPageMetadata } from '@/lib/site/pageMetadata';

// /register's own title, description and canonical link (see login/layout.tsx). One canonical address, whatever
// invite code or `?redirectTo=` a link carried.
export const metadata = publicPageMetadata({
  path: '/register',
  title: 'Sign up for free',
  description: 'Create your free Pantopus account. It asks for no card. Every account starts at a real home, so the people, the mail and the news around you are real.',
});

export default function RegisterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
