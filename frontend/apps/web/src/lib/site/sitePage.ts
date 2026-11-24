// One public page the homepage footer links and the sitemap lists. `group` names the footer column it sits under
// (pages without one sit under their list's default column). `share` is the page's share picture
// (/api/og/page?path=<path>): its heading in large type and an optional line under it, over the homepage's night sky.
export type SitePage = { path: string; label: string; group?: string; share?: ShareCard };

export type ShareCard = { heading: string; line?: string };
