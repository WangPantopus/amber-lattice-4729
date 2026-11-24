// One public page the homepage footer links and the sitemap lists. `group` names the footer column it sits under
// (pages without one sit under their list's default column).
export type SitePage = { path: string; label: string; group?: string };
