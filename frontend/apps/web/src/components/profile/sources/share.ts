import type { ProfileLine, ProfilePage, ProfileSaysBlock } from '@pantopus/api';

/** The Says line as the page shows it, or null when the part is off for this reader (the block isn't there). */
export function pageSaysLine(page: ProfilePage): ProfileLine | null {
  for (const tab of page.tabs ?? []) {
    for (const block of tab.blocks ?? []) {
      if (block?.kind === 'says') {
        const line = (block as ProfileSaysBlock).line;
        if (typeof line?.text === 'string' && line.text.trim()) return { ...line, text: line.text.trim() };
      }
    }
  }
  return null;
}

/** The Says words, or null. */
export function pageSays(page: ProfilePage): string | null {
  return pageSaysLine(page)?.text ?? null;
}

/**
 * A short fingerprint of what the link picture draws (name, headline, portrait, Says, rings), so its address changes
 * whenever the picture does and link previews don't keep a part that was switched off.
 */
export function pictureVersion(page: ProfilePage): string {
  const h = page.header;
  const text = JSON.stringify([h.name, h.headline, h.portrait_url, pageSays(page), h.rings]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Keys of the old profile read that say who the person is, and nothing a part can switch off. */
const WHO_KEYS = [
  'id', 'username', 'usernameIsGenerated', 'accountType', 'account_type', 'name', 'firstName', 'lastName',
  'profile_picture_url', 'avatar_url', 'profilePicture', 'created_at', 'createdAt',
] as const;

/** The signed-out read cut down to who the person is: the page itself carries everything else. */
export function signedOutCopy<T extends Record<string, unknown>>(profile: T): T {
  const out: Record<string, unknown> = {};
  for (const key of WHO_KEYS) if (key in profile) out[key] = profile[key];
  return out as T;
}
