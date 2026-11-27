/**
 * The cookie that carries a person's last `pulse_reinvented` answer (useReinventedOn), so /app/feed's server render
 * already draws the new Pulse for a person whose switch was on last time, instead of today's Pulse flashing until the
 * page wakes up. Set only from a clear `true`, removed on a clear `false`; anyone without it gets today's page exactly
 * as before. A plain module, so both the server page and the browser read the same name.
 */
export const KEPT_COOKIE = 'pantopus_pulse_reinvented';
