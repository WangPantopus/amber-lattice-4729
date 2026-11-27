// Stamps Pantopus checked (coord/CONTRACT.md §2): the author places them; the server fills every value, so nobody
// can type one. Shapes as the server sends them.

export type StampKind = 'postmark' | 'weather' | 'elevation' | 'place' | 'time' | 'sunset' | 'home_distance';

/** The tray's order. */
export const STAMP_KINDS: readonly StampKind[] = ['postmark', 'weather', 'elevation', 'place', 'time', 'sunset', 'home_distance'];

export interface StampWeather {
  temp_f: number;
  kind: string;
  label: string;
}
export interface StampValues {
  postmark?: { place: string; date_label: string; time_label: string; weather: StampWeather | null } | null;
  weather?: StampWeather | null;
  elevation?: { altitude_ft: number; flying?: boolean; label: string } | null;
  place?: { label: string } | null;
  time?: { at: string; zone: string; label: string; date_label: string } | null;
  sunset?: { at: string; minutes: number; label: string } | null;
  home_distance?: { miles: number; label: string } | null;
}

/** Where a stamp sits: its centre as 0–1 of the picture, its size (1 = natural) and its turn in degrees. */
export interface PlacedStamp {
  kind: StampKind;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/** A stamp as a Moment answer carries it: where it sits and the value the server filled. */
export interface ShownStamp extends PlacedStamp {
  value: unknown;
}

export const clampScale = (s: number) => Math.min(4, Math.max(0.25, s));
export const clampTurn = (r: number) => {
  const t = ((((r + 180) % 360) + 360) % 360) - 180;
  return Math.round(t * 10) / 10;
};

/** The words a chip stamp shows, from its value; null when there is nothing to show. */
export function stampLabel(kind: StampKind, value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (kind === 'weather') return typeof v.temp_f === 'number' ? `${v.temp_f}°F · ${String(v.label || '')}`.replace(/ · $/, '') : null;
  if (kind === 'postmark') return typeof v.place === 'string' ? v.place : null;
  return typeof v.label === 'string' && v.label ? v.label : null;
}

/** The web posts every picture and text card as a 9:16 frame. */
export const PICTURE_ASPECT = 9 / 16;

/**
 * Where a stamp may sit on a picture `aspect` wide (width over height), in picture coordinates: the part every phone's
 * viewer shows, below the lowest line any viewer's top bar reaches. The same box as the iPhone's marks editor
 * (MomentMarks.safeBox: frames from 9:21 to 0.63 wide, a top bar of 23%), so a stamp is never cut off on any app.
 */
export function safeBox(aspect: number = PICTURE_ASPECT) {
  if (!(aspect > 0)) return { x: 0, y: 0, width: 1, height: 1 };
  const width = Math.min(1, 9 / 21 / aspect);
  const height = Math.min(1, aspect / 0.63);
  const top = 0.5 - (0.5 - 0.23) * height;
  return { x: (1 - width) / 2, y: top, width, height: 0.5 + height / 2 - top };
}
export type SafeBox = ReturnType<typeof safeBox>;
