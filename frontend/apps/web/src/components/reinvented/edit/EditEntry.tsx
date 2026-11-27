'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { PencilLine } from 'lucide-react';
import { useMe } from '@/lib/me';
import type { EditableMoment } from './MomentEdit';
import { useJustSaved } from './saved';
import './edit.css';

// Loaded when "Edit" is chosen, so the Moments page never carries the Studio for people who don't edit.
const MomentEdit = dynamic(() => import('./MomentEdit'), { ssr: false });

/**
 * "Edit" in the viewer's Moment options, on the person's own Moment while the server says it may still change
 * (`editable_until`, 15 minutes after it went out). The edit opens over the viewer; the options sheet stays open under
 * it, so the viewer holds still, and closes with it.
 */
export function EditEntry({ moment, close }: { moment: EditableMoment; close(): void }) {
  const account = useMe().data?.id;
  const [editing, setEditing] = useState(false),
    [now, setNow] = useState(Date.now);
  // On a phone the viewer is a modal <dialog>, and everything outside it can't be reached: the edit opens inside it.
  const anchor = useRef<HTMLSpanElement>(null);
  const until = Date.parse(moment.editable_until || '');
  useEffect(() => {
    if (!(until > Date.now())) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(until - Date.now() + 50, 30_000));
    return () => clearTimeout(t);
  }, [until, now]);
  return (
    <>
      <span ref={anchor} hidden />
      {until > now && account && (
        <button type="button" className="mo-action" onClick={() => setEditing(true)}>
          <PencilLine />
          Edit
        </button>
      )}
      {editing && account && (
        <MomentEdit
          moment={moment}
          account={account}
          container={anchor.current?.closest('dialog') || document.body}
          onClose={() => {
            setEditing(false);
            close();
          }}
        />
      )}
    </>
  );
}

/** "Moment updated", over the picture for a few seconds after an edit is saved. */
export function SavedNote({ id }: { id: string }) {
  const fresh = useJustSaved(id);
  return fresh ? (
    <p className="me-saved" role="status">
      Moment updated
    </p>
  ) : null;
}
