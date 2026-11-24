import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@pantopus/utils';

const SITE_URL = 'https://pantopus.com';

/** Structured data as the text of a `<script type="application/ld+json">`, with `<` escaped so it can't end the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/**
 * What Pantopus is, for search engines: the company, the site and the two apps. No `sameAs`: no social account of the
 * company's is known (add one here only once it exists). No ratings: they'd have to be read from the stores.
 */
export function siteLd(description: string) {
  const app = (operatingSystem: string, url: string) => ({
    '@type': 'MobileApplication',
    name: 'Pantopus',
    operatingSystem,
    applicationCategory: 'SocialNetworkingApplication',
    url,
    installUrl: url,
    description,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': ORGANIZATION_ID },
  });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: 'Pantopus',
        legalName: 'Pantopus, Inc.',
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
        description,
        contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'support@pantopus.com', url: `${SITE_URL}/contact` },
      },
      { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'Pantopus', url: SITE_URL, publisher: { '@id': ORGANIZATION_ID } },
      app('iOS', IOS_APP_STORE_URL),
      app('Android', ANDROID_PLAY_STORE_URL),
    ],
  };
}

/** The breadcrumb of a page below the homepage: Pantopus › … › the page. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Pantopus', path: '/' }, ...items].map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path === '/' ? '' : item.path}`,
    })),
  };
}
