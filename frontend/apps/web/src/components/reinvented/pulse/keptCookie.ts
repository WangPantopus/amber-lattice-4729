import { firstContentTag } from '@/lib/firstContent';

/**
 * The cookie that carries a person's last `pulse_reinvented` answer (useReinventedOn), so /app/feed's server render
 * already draws the new Pulse for a person whose switch was on last time, instead of today's Pulse flashing until the
 * page wakes up. Set only from a clear `true`, removed on a clear `false`; anyone without it gets today's page exactly
 * as before. A plain module, so both the server page and the browser read the same name.
 *
 * Its value is the sign-in's tag (`firstContentTag` of the CSRF cookie, the same tag first content uses to know which
 * account a page is for). Every sign-in gets a new CSRF cookie, so on a shared browser the next account to sign in
 * never matches the last one's answer: it gets today's page until its own answer says otherwise.
 */
export const KEPT_COOKIE = 'pantopus_pulse_reinvented';
export const CSRF_COOKIE = 'pantopus_csrf';

/** The value that says "on" for the sign-in holding this CSRF cookie; null without one. */
export function keptValue(csrf: string | null | undefined): string | null {
  return csrf ? firstContentTag(csrf) : null;
}
