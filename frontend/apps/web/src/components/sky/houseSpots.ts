// ============================================================
// The house on Today (JOURNEYS, founder approval 2026-11-21): where the larger ground stands in the card and
// where each thing on it is, for the painter (todaySkyPainter.ts) and for the buttons laid over the picture
// (TodaySkyCanvas.tsx). Pure numbers, in CSS pixels.
//
// The ground (home, bins, trees) is drawn HOUSE_SCALE times larger, so a first house is about 130 px across its
// roof; a tall home on a low card is drawn a little smaller so its roof stays inside. The mailbox stands left of
// the bins and the note is on the door: their centres are at least 56 px apart, so 44 px targets never overlap.
// ============================================================

import { homeLeftReach, homeRightReach, homeWallHeight, type TodayScene } from './todaySky';

export const HOUSE_SCALE = 2.6;
/** Between the centres of two things that can be tapped. */
const APART = 56;
const HORIZON = 0.82;

export interface HouseSpots {
  scale: number;
  /** The door's foot. */
  x: number;
  y: number;
  /** The roof's left edge: the reading stays left of it. */
  left: number;
  /** The mailbox: its post's foot, and the middle of its target. */
  mailbox: { foot: [number, number]; centre: [number, number] };
  /** The note's middle, on the door. */
  note: [number, number];
  /** The bins' middle (where they stand when they are out). */
  bins: [number, number];
}

/** How tall the home stands above its door's foot, roof and chimney included, at the scene's own size. */
function homeHeight(scene: TodayScene): number {
  const { home } = scene;
  if (home.kind === 'apartment') return 54;
  if (home.kind === 'townhouse') return 44;
  if (home.kind === 'mobile') return 22;
  return homeWallHeight(home) + (home.roof === 'flat' ? 14 : 22);
}

export function houseSpots(w: number, H: number, scene: TodayScene): HouseSpots {
  const y = H * HORIZON + 7;
  const scale = Math.max(1, Math.min(HOUSE_SCALE, (y - 8) / homeHeight(scene)));
  const reach = homeLeftReach(scene.home);
  // Up to three bins stand past the home's left edge; the mailbox keeps clear of the widest row.
  const binsMiddle = (count: number) => (reach + 2 + Math.max(1, count) * 4.5) * scale;
  const mailboxLeftOfDoor = binsMiddle(3) + APART + 2;
  // Room on the right for the garage and the round tree; on the left for the mailbox's target.
  const rightNeed = (homeRightReach(scene.home) + 22) * scale + 4;
  const leftNeed = mailboxLeftOfDoor + 22 + 4;
  const x = Math.max(leftNeed, Math.min(w * 0.7, w - rightNeed));
  const foot: [number, number] = [x - mailboxLeftOfDoor, y + 4 * scale];
  return {
    scale,
    x,
    y,
    left: x - reach * scale,
    mailbox: { foot, centre: [foot[0], foot[1] - 20] },
    note: [x, y - 7 * scale],
    bins: [x - binsMiddle(scene.bins.length), y + 3 * scale],
  };
}
