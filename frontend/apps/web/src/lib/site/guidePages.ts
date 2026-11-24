import type { SitePage } from './sitePage';

// The topic pages (/social-network, /home-buying, …), /guides and each /guides/<slug>. The sitemap lists every entry
// and the homepage footer links each one, so add a page here only once it opens signed out. Owned by the guides'
// build (SEOGUIDE).
export const GUIDE_PAGES: SitePage[] = [
  { path: '/social-network', label: 'Social network', group: 'Topics' },
  { path: '/home-buying', label: 'Buying a home', group: 'Topics' },
  { path: '/home-management', label: 'Home management', group: 'Topics' },
  { path: '/home-safety', label: 'Home safety', group: 'Topics' },
  { path: '/guides', label: 'All guides', group: 'Guides' },
  { path: '/guides/how-to-organize-meals-for-a-family', label: 'Organize meals for a family', group: 'Guides' },
  { path: '/guides/what-to-check-before-buying-a-house', label: 'Before buying a house', group: 'Guides' },
  { path: '/guides/how-to-find-your-flood-zone', label: 'Find your flood zone', group: 'Guides' },
  { path: '/guides/what-a-radon-zone-means', label: 'What a radon zone means', group: 'Guides' },
  { path: '/guides/how-to-appeal-a-property-tax-value', label: 'Appeal a property tax value', group: 'Guides' },
  { path: '/guides/how-to-read-a-property-record', label: 'Read a property record', group: 'Guides' },
  { path: '/guides/how-to-share-household-tasks', label: 'Share household tasks', group: 'Guides' },
  { path: '/guides/how-to-plan-a-get-together', label: 'Plan a get-together', group: 'Guides' },
  { path: '/guides/how-to-send-a-christmas-card-online', label: 'Send a Christmas card online', group: 'Guides' },
  { path: '/guides/how-to-prove-where-you-live', label: 'Prove where you live', group: 'Guides' },
];
