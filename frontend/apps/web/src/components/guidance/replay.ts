// "Tips for each screen" shows a tab card again on request. A replay never changes the card's
// record (its times), and it isn't held back by the rules: the person asked for it.
import type { CentreCardContent } from './cards';

type Listener = () => void;

let requested: CentreCardContent | null = null;
const listeners = new Set<Listener>();

export function replayCard(card: CentreCardContent): void {
  requested = card;
  listeners.forEach((fn) => fn());
}

export function takeReplay(): CentreCardContent | null {
  const card = requested;
  requested = null;
  return card;
}

export function subscribeReplay(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
