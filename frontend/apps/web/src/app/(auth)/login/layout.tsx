import { publicPageMetadata } from '@/lib/site/pageMetadata';

// /login's own title, description and canonical link: the page is a client component, which cannot export tags, so
// until now it carried the site's default title and no canonical. One canonical address, whatever `?redirectTo=` a
// link carried, so a search for "Pantopus login" finds one page.
export const metadata = publicPageMetadata({
  path: '/login',
  title: 'Sign in',
  description: 'Sign in (log in) to your Pantopus account on the web: your home, your mail, your plans and your messages. New to Pantopus? Create a free account.',
});

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
