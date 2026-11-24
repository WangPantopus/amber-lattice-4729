import type { MetadataRoute } from 'next';

// Without this file /robots.txt fell through to the /[username] profile route
// and answered with an HTML page. Only the production app's primary Vercel
// deployment is indexable; staging, previews and local builds stay out.
// Signed-in pages and link-token pages (status, guest passes, invitations,
// verification) are never crawled.
const PRIVATE_PATHS = [
  '/app/', '/api/', '/auth/', '/dev/', '/status/', '/guest/', '/invite/', '/join/',
  '/verify-claim/', '/verify-residency/', '/session/', '/shared/', '/unlisted/', '/book/o/',
  // Support Train link pages are for the people a train is shared with.
  '/support-trains/',
];

export default function robots(): MetadataRoute.Robots {
  const appEnvironment = (
    process.env.NEXT_PUBLIC_APP_ENV || process.env.VERCEL_ENV || ''
  ).toLowerCase();
  if (
    process.env.VERCEL_ENV !== 'production' ||
    !['production', 'prod'].includes(appEnvironment)
  ) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    // The public pages, county pages included (sitemap.ts), at the address their canonical links use.
    sitemap: 'https://pantopus.com/sitemap.xml',
  };
}
