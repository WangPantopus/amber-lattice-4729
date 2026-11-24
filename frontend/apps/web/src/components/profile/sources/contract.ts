import type { ProfilePage } from '@pantopus/api';

/** True for a v1 page this web can draw: anything else (an error body, a newer shape) draws today's profile. */
export function isProfilePage(value: unknown): value is ProfilePage {
  const page = value as ProfilePage | null;
  return Boolean(
    page && typeof page === 'object' && page.v === 1 && page.header && typeof page.header.name === 'string'
      && page.header.rings && typeof page.header.rings.from === 'number' && Array.isArray(page.tabs),
  );
}
