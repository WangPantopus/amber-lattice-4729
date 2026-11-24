'use client';

// What a buyer's actions do on the web (SPEC section 8): save the address to the person's saved places, share the
// lookup page for it, and the buying claim, which the page continues the way its claim buttons do.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@pantopus/api';

export interface BuyerPlace {
  label: string;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
}

type Labels = Record<string, { text: string; done?: boolean }>;

/** The map point a record's picture names (where the place itself has none, as a typed address doesn't). */
function pointOf(record: api.homeRecord.HomeRecord | undefined): { latitude: number; longitude: number } | null {
  const picture = record?.blocks.find((block) => block.kind === 'picture') as api.homeRecord.PictureBlock | undefined;
  return picture?.street ? { latitude: picture.street.lat, longitude: picture.street.lng } : null;
}

export function useBuyerActions({ record, place, onClaim }: {
  record: api.homeRecord.HomeRecord | undefined;
  place: BuyerPlace | null;
  onClaim: (url: string) => void;
}) {
  const queryClient = useQueryClient();
  const [labels, setLabels] = useState<Labels>({});
  const [problem, setProblem] = useState('');
  const mark = (id: string, text: string, done = false) => setLabels((now) => ({ ...now, [id]: { text, done } }));

  const onAction = async (action: api.homeRecord.HomeRecordAction) => {
    setProblem('');
    if (action.id === 'claim') { onClaim(action.url); return; }
    if (action.id === 'share') {
      const url = action.url.startsWith('/') ? `${window.location.origin}${action.url}` : action.url;
      try {
        if (typeof navigator.share === 'function') await navigator.share({ title: record?.header.title, url });
        else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); mark('share', 'Link copied'); }
        else setProblem(`Copy this link to share it: ${url}`);
      } catch (err) {
        // Closing the share sheet isn't a failure. Where neither sharing nor copying is allowed, the link is shown to copy.
        if ((err as { name?: string } | null)?.name !== 'AbortError') setProblem(`Copy this link to share it: ${url}`);
      }
      return;
    }
    if (action.id === 'save') {
      const point = place?.latitude != null && place.longitude != null ? { latitude: place.latitude, longitude: place.longitude } : pointOf(record);
      if (!place || !point) { setProblem('This address can’t be saved from here. Look it up again and save it from Place.'); return; }
      mark('save', 'Saving…', true);
      try {
        await api.savedPlaces.create({ label: place.label, latitude: point.latitude, longitude: point.longitude, city: place.city, state: place.state });
        await queryClient.invalidateQueries({ queryKey: ['place-entry'] });
        mark('save', 'Saved', true);
      } catch {
        setLabels((now) => { const next = { ...now }; delete next.save; return next; });
        setProblem('The address could not be saved. Try again.');
      }
    }
  };

  return { onAction: (action: api.homeRecord.HomeRecordAction) => { void onAction(action); }, labels, problem };
}
