'use client';

// The step deck (Pulse, reinvented, phase 2; coord/CONTRACT.md §7g): up to four photo or video Moments of one recipe or
// repair, posted one by one, each with its own words and voice tip. The viewer goes through them as one: the bar over
// the picture says which step this is, jumps to any step, and lets a reader "Save the steps" (only the words: each
// step's caption and voice tip) into their field guide. Today's screens and the apps in the stores see ordinary Moments.

import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { useMe } from '@/lib/me';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import './deck.css';

export interface DeckInfo {
  id: string;
  index: number;
  count: number;
  /** The steps posted so far that the reader may see, in order. */
  steps: string[];
}

/** A Moment's deck as the server answers it (switch on), or null. */
export function deckOf(m: Moment | null | undefined): DeckInfo | null {
  const d = (m as (Moment & { deck?: DeckInfo | null }) | null | undefined)?.deck;
  return d && typeof d.id === 'string' && Array.isArray(d.steps) && d.count > 1 ? d : null;
}

/**
 * Given by the screen that holds the viewer (the new Pulse): shows another step, with the deck's steps as the run when
 * the viewer was opened on one step alone. Without it the bar only tells which step this is.
 */
export const DeckNav = createContext<((id: string, steps: string[]) => void) | null>(null);

const GUIDE_DECKS = ['reinvented', 'guide-decks'];

function SaveSteps({ moment, deck }: { moment: Moment; deck: DeckInfo }) {
  const client = useQueryClient();
  const reread = useRereadSwitch();
  // Whether the reader saved this deck already: the newest of their field guide, read once a minute at most.
  const guide = useQuery({
    queryKey: GUIDE_DECKS,
    queryFn: ({ signal }) => get<{ decks?: { deck_id: string }[] }>('/api/reinvented/field-guide', {}, { signal }),
    staleTime: 60_000,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const isSaved = saved ?? !!guide.data?.decks?.some((d) => d.deck_id === deck.id);
  const path = `/api/reinvented/moments/${encodeURIComponent(moment.id)}/deck/save`;
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (isSaved) await del(path);
      else await post(path, {});
      setSaved(!isSaved);
      void client.invalidateQueries({ queryKey: ['reinvented', 'field-guide'] });
      void client.invalidateQueries({ queryKey: GUIDE_DECKS });
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      const code = (e as { code?: string }).code;
      setError(code === 'PLAY_NOT_FOUND' ? 'These steps aren’t here anymore.' : 'Couldn’t do that. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="dk-save" aria-pressed={isSaved} disabled={busy} onClick={() => void toggle()}>
        {busy ? (isSaved ? 'Letting go…' : 'Saving…') : isSaved ? 'Saved · Let go' : 'Save the steps'}
      </button>
      {error && (
        <span className="dk-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

/** Over a step's picture in the viewer: "Step 2 of 4", a dot for each step, and Save the steps (not for the author). */
export function DeckBar({ moment }: { moment: Moment }) {
  const deck = deckOf(moment);
  const go = useContext(DeckNav);
  const account = useMe().data?.id;
  // Opened alone (a link, a notice): the viewer goes on through the deck's steps.
  const steps = deck?.steps.join(',') ?? '';
  useEffect(() => {
    if (go && steps && steps.split(',').includes(moment.id)) go(moment.id, steps.split(','));
  }, [go, steps, moment.id]);
  if (!deck) return null;
  const mine = !!account && moment.author?.id === account;
  return (
    <div
      className="dk-bar"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="dk-step">
        Step {deck.index} of {deck.count}
      </span>
      {go && deck.steps.length > 1 && (
        <span className="dk-dots" role="group" aria-label="Steps">
          {deck.steps.map((id, i) => (
            <button
              key={id}
              type="button"
              aria-label={`Step ${i + 1}`}
              aria-current={id === moment.id ? 'step' : undefined}
              onClick={() => id !== moment.id && go(id, deck.steps)}
            />
          ))}
        </span>
      )}
      {!mine && <SaveSteps moment={moment} deck={deck} />}
    </div>
  );
}
