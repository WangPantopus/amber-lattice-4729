'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfileMyPieces, ProfilePieceOffer } from '@pantopus/api';
import { card, overline } from './blocks';

/**
 * The owner's own start of their Work tab (board 10's way in): the jobs and plans Pantopus saw that aren't a piece
 * yet, one tap to start one, and "Add a piece". Read from `GET /me/pieces` whenever the page is read again.
 */
export default function OwnerWork({ round, onAdd, onOffer, onCounts }: {
  round: number;
  onAdd: () => void;
  onOffer: (offer: ProfilePieceOffer) => void;
  onCounts?: (mine: ProfileMyPieces) => void;
}) {
  const [offered, setOffered] = useState<ProfilePieceOffer[]>([]);
  useEffect(() => {
    let live = true;
    // Started inside a promise: any failure leaves just "Add a piece".
    Promise.resolve().then(() => api.profilePage.getMyPieces()).then(
      (mine) => {
        if (!live) return;
        setOffered(Array.isArray(mine?.offered) ? mine.offered.filter((o) => o && o.id && o.title) : []);
        onCounts?.(mine);
      },
      () => { if (live) setOffered([]); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again when the page is read again
  }, [round]);

  return (
    <section aria-label="Add to your Work" className={`${card} overflow-hidden print:hidden`}>
      {offered.length > 0 ? (
        <>
          <h2 className={`${overline} px-5 pt-4 pb-1`}>Pantopus saw these</h2>
          <ul className="divide-y divide-app-subtle">
            {offered.map((offer) => (
              <li key={`${offer.kind}-${offer.id}`} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{offer.title}</span>
                  <span className="block text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{offer.text}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onOffer(offer)}
                  className="shrink-0 min-h-[2.75rem] px-3.5 rounded-xl bg-app-surface-sunken text-[0.875rem] font-semibold text-app hover-bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]"
                >
                  Make it a piece
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className={`px-4 ${offered.length > 0 ? 'pb-4 pt-1' : 'py-4'}`}>
        <button
          type="button"
          onClick={onAdd}
          className="w-full min-h-[3rem] rounded-xl border border-app-strong bg-surface inline-flex items-center justify-center gap-2 text-[1rem] font-semibold text-app hover-bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]"
        >
          <Plus aria-hidden="true" className="w-5 h-5" />Add a piece
        </button>
      </div>
    </section>
  );
}
