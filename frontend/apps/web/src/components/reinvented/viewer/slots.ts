import type { ReactNode } from 'react';
import type { Moment, Viewer } from '@pantopus/api/endpoints/moments';

/**
 * What today's MomentViewer may draw instead while `pulse_reinvented` is on for the person (its optional `studio`
 * prop, studioViewer.tsx). Without it the viewer is exactly today's.
 */
export interface StudioViewerSlots {
  /** Over the picture: the stamps. */
  overPicture(m: Moment): ReactNode;
  /** Inside the react button, in place of today's emoji. */
  reactButton(m: Moment): ReactNode;
  /** The reaction sheet's row: the five signals in place of the seven emoji. */
  reactions(m: Moment, close: () => void): ReactNode;
  /** Beside a viewer in "Seen by". */
  seenMark(v: Viewer): ReactNode;
  /** In Moment options: "Edit" on one's own Moment for 15 minutes after it went out. */
  menu(m: Moment, close: () => void): ReactNode;
  /** True while the viewer should hold still on this Moment (a guess-the-spot Moment the reader hasn't guessed). */
  holds(m: Moment, account: string): boolean;
  /** The caption's words, with the people its author mentioned linked to their profiles (§7h). */
  caption?(m: Moment): ReactNode;
  /** True for a loop (§7j): the video plays only its span, over and over, muted, on a photo's timer. */
  loops?(m: Moment): boolean;
}
