// A Support Train's own day and clock. The server sends the train's zone (`timezone`) and today's date there
// (`today`), and marks each date that has passed (`slots[].is_past`): "today", "passed" and arrival times follow the
// train, not the viewer's computer.

export type ContributionKey = 'cook' | 'takeout' | 'groceries';

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today's date (YYYY-MM-DD) where the train is; the browser's day for an older reply without it. */
export function trainTodayKey(train: { today?: string | null } | null | undefined): string {
  return typeof train?.today === 'string' && train.today ? train.today : localDateKey();
}

/** Whether a date has passed where the train is. */
export function isSlotPast(slot: { is_past?: boolean | null; slot_date?: string | null } | null | undefined, today: string): boolean {
  if (typeof slot?.is_past === 'boolean') return slot.is_past;
  return Boolean(slot?.slot_date && String(slot.slot_date) < today);
}

function validZone(timezone: string | null | undefined): string | undefined {
  if (!timezone) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return undefined;
  }
}

// How far `timezone` is ahead of UTC at `utcMs`, in ms.
function zoneOffsetMs(utcMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - utcMs;
}

/** "5:30 pm" on a date (YYYY-MM-DD), read as the train's local time, as an ISO instant. */
export function trainLocalTimeToIso(slotDate: string, time: string, timezone?: string | null): string | null {
  if (!slotDate || !time) return null;
  const [year, month, day] = slotDate.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const zone = validZone(timezone);
  if (!zone) return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
  const wall = Date.UTC(year, month - 1, day, hours, minutes);
  let utc = wall - zoneOffsetMs(wall, zone);
  utc = wall - zoneOffsetMs(utc, zone);
  return new Date(utc).toISOString();
}

/** An arrival instant as "5:30 pm" in the train's zone. */
export function formatTrainTime(iso: unknown, timezone?: string | null): string | null {
  if (typeof iso !== 'string' || !iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: validZone(timezone) })
    .toLowerCase();
}

/** An arrival instant as "17:30" in the train's zone (for a time field). */
export function trainTimeInputValue(iso: unknown, timezone?: string | null): string {
  if (typeof iso !== 'string' || !iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: validZone(timezone),
  }).format(date);
}

const MODE_SWITCH: Record<ContributionKey, string> = {
  cook: 'home_cooked_meals',
  takeout: 'takeout',
  groceries: 'groceries',
};

/**
 * The ways of helping a date takes, as the server checks them: what the train asks for, and what fits the date's
 * kind (a groceries date takes groceries; a meal date takes a home-cooked meal or takeout).
 */
export function slotContributionKeys(
  supportModes: Record<string, unknown> | null | undefined,
  slotSupportMode: string | null | undefined,
): ContributionKey[] {
  const groceryDate = String(slotSupportMode || '').toLowerCase() === 'groceries';
  const fits: ContributionKey[] = groceryDate ? ['groceries'] : ['cook', 'takeout'];
  return fits.filter((key) => Boolean(supportModes?.[MODE_SWITCH[key]]));
}
