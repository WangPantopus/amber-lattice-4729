import { unlistedPageMetadata } from '@/lib/site/pageMetadata';

// A step of signing in, reached from a link or an email: its own title, and not for search engines.
export const metadata = unlistedPageMetadata('Choose a new password');

export default function ResetPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
