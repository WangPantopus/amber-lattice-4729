import type { SitePage } from './sitePage';

// The topic pages (/social-network, /home-buying, …), /guides and each /guides/<slug>. The sitemap lists every entry
// and the homepage footer links each one, so add a page here only once it opens signed out. Owned by the guides'
// build (SEOGUIDE).
export const GUIDE_PAGES: SitePage[] = [];
