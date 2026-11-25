'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import { removeUserFromFeedCaches } from '@/hooks/useFeedData';
import { toast } from '@/components/ui/toast-store';
import PenNameDialog from './PenNameDialog';
import { MadeUpNameMarks, OnlyYouLine, PenNameAvatar } from './MadeUpName';
import { refusalWords } from './penName';

/**
 * The small card a made-up name opens (GET /api/pen-names/:id): the name, the picture, the note, and Mute, Block and
 * Report (the post's own). Never a profile, Message or Connect.
 */
export default function PenNameCard({
  penNameId,
  open,
  onClose,
  onReport,
  fallbackName,
}: {
  penNameId: string;
  open: boolean;
  onClose: () => void;
  onReport?: () => void;
  fallbackName: string;
}) {
  const queryClient = useQueryClient();
  const key = ['pen-names', 'card', penNameId];
  const card = useQuery({
    queryKey: key,
    queryFn: () => api.penNames.getCard(penNameId).then((r) => r.pen_name),
    enabled: open,
    staleTime: 30_000,
    retry: 1,
  });
  const [busy, setBusy] = useState<'mute' | 'block' | null>(null);
  const pen = card.data;
  const name = pen?.name || fallbackName;

  const act = async (kind: 'mute' | 'block', on: boolean) => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === 'mute') await (on ? api.penNames.mute(penNameId) : api.penNames.unmute(penNameId));
      else await (on ? api.penNames.block(penNameId) : api.penNames.unblock(penNameId));
      queryClient.setQueryData(key, (old: typeof pen) => (old ? { ...old, [kind === 'mute' ? 'muted' : 'blocked']: on } : old));
      if (on) {
        // Out of every list on screen and kept: the feeds read again without what this name wrote.
        await removeUserFromFeedCaches(queryClient, penNameId);
        toast.success(kind === 'mute' ? `${name} is muted.` : `${name} is blocked.`);
        onClose();
      } else {
        toast.info(kind === 'mute' ? `${name} is no longer muted.` : `${name} is no longer blocked.`);
      }
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (err) {
      toast.error(refusalWords(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PenNameDialog open={open} onClose={onClose} title="Made-up name" busy={busy != null} testId="penNameCard">
      <div className="flex flex-col items-center gap-2 px-5 pb-2 pt-5 text-center">
        <PenNameAvatar url={pen?.avatar_url} name={name} size={72} />
        <p className="text-base font-semibold text-app" data-testid="penNameCardName">
          {pen?.is_yours ? `${name} (you)` : name}
        </p>
        <MadeUpNameMarks badges={pen?.badges} className="justify-center" />
        {pen?.is_yours && <OnlyYouLine />}
        {card.isError ? (
          <p role="alert" className="text-xs text-app-muted">{refusalWords(card.error, "Couldn't load this name. Please try again.")}</p>
        ) : (
          <p className="text-xs leading-relaxed text-app-secondary">{pen?.note ?? ' '}</p>
        )}
      </div>
      {pen && !pen.is_yours && (
        <div className="grid grid-cols-1 gap-2 px-5 pb-5 pt-3 sm:grid-cols-3">
          <button
            type="button"
            data-testid="penNameCardMute"
            disabled={busy != null}
            onClick={() => void act('mute', !pen.muted)}
            className="rounded-xl border border-app px-3 py-2 text-xs font-semibold text-app transition hover-bg-app disabled:opacity-50"
          >
            {busy === 'mute' ? '…' : pen.muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            data-testid="penNameCardBlock"
            disabled={busy != null}
            onClick={() => void act('block', !pen.blocked)}
            className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
          >
            {busy === 'block' ? '…' : pen.blocked ? 'Unblock' : 'Block'}
          </button>
          {onReport ? (
            <button
              type="button"
              data-testid="penNameCardReport"
              disabled={busy != null}
              onClick={() => { onClose(); onReport(); }}
              className="rounded-xl border border-app px-3 py-2 text-xs font-semibold text-app transition hover-bg-app disabled:opacity-50"
            >
              Report
            </button>
          ) : null}
        </div>
      )}
      {(!pen || pen.is_yours) && <div className="pb-4" />}
    </PenNameDialog>
  );
}
