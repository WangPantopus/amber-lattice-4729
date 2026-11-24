import type { SitePage } from './sitePage';

// The public page of each pillar (/place, /today, /pulse, …). The sitemap lists every entry and the homepage footer
// links each one, so add a page here only once it opens signed out. Owned by the pillar pages' build (SEOPILLAR).
export const PILLAR_PAGES: SitePage[] = [];
