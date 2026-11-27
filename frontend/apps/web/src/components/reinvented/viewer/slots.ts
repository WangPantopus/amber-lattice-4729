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
}
