'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, X } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfileShelfObject } from '@pantopus/api';
import { extractApiError } from '@/lib/auth-utils';
import Screen from './Screen';

const MAX = 5;
const CAPTION_MAX = 40;

type Item = {
  key: string;
  /** The picture's file id, once uploaded (a shelf object's id is its picture's file id). */
  fileId: string | null;
  preview: string | null;
  caption: string;
  uploading: boolean;
  /** Uploaded in this sitting and not saved yet: deleted again if the shelf is left unsaved. */
  fresh: boolean;
};

const field = 'w-full min-h-[3rem] rounded-xl border border-app-strong bg-surface px-3.5 py-2.5 text-[1.0625rem] text-app placeholder:text-app-muted focus:outline focus:outline-2 focus:outline-[color:var(--color-link)]';
const iconButton = 'w-11 h-11 rounded-full flex items-center justify-center text-app-secondary hover-bg-app disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]';

/**
 * The owner's shelf (board 1, P3.1): up to five pictures, each with a few words, in the order they stand. Pictures go
 * through today's upload; the whole shelf is saved at once, so reordering is the order sent and removing is leaving
 * one out. Moving and removing are buttons, so the keyboard does everything a finger does.
 */
const fromObjects = (objects: ProfileShelfObject[]): Item[] => objects.slice(0, MAX).map((o) => ({
  key: o.id, fileId: o.id, preview: o.picture_url, caption: o.caption || '', uploading: false, fresh: false,
}));

export default function ShelfEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const baseId = useId();
  // The owner's shelf as the server keeps it (GET /me/shelf), read each time the screen opens.
  const [read, setRead] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [readRound, setReadRound] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const live = useRef(true);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const initial = useRef('[]');
  const changed = JSON.stringify(items.map((i) => [i.fileId, i.caption.trim()])) !== initial.current;
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  useEffect(() => {
    let current = true;
    setRead('loading');
    Promise.resolve().then(() => api.profilePage.getMyShelf()).then(
      (res) => {
        if (!current) return;
        const list = fromObjects(Array.isArray(res?.objects) ? res.objects.filter((o) => o?.id && o.picture_url) : []);
        initial.current = JSON.stringify(list.map((i) => [i.fileId, i.caption.trim()]));
        setItems(list);
        setRead('ready');
      },
      () => { if (current) setRead('failed'); },
    );
    return () => { current = false; };
  }, [readRound]);

  /** Pictures uploaded here and never saved are deleted again (failures stay quiet: the file is unlisted anyway). */
  const dropFresh = (list: Item[]) => {
    list.filter((i) => i.fresh && i.fileId).forEach((i) => { Promise.resolve().then(() => api.files.deleteFile(i.fileId!)).catch(() => {}); });
  };

  const close = () => {
    if (saving) return;
    if (changed && !window.confirm('Leave without saving your shelf?')) return;
    dropFresh(itemsRef.current);
    onClose();
  };

  const focusLater = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

  const add = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((f) => f.type.startsWith('image/'));
    event.target.value = '';
    const chosen = files.slice(0, Math.max(0, MAX - itemsRef.current.length));
    if (chosen.length === 0) return;
    setError(null);
    chosen.forEach((file, n) => {
      const key = `new-${Date.now()}-${n}`;
      const local = URL.createObjectURL(file);
      setItems((list) => [...list, { key, fileId: null, preview: local, caption: '', uploading: true, fresh: true }]);
      Promise.resolve().then(() => api.profilePage.uploadShelfPicture(file)).then(
        (res) => {
          if (!live.current) { if (res?.file?.id) api.files.deleteFile(res.file.id).catch(() => {}); return; }
          setItems((list) => list.map((i) => (i.key === key ? { ...i, fileId: res.file.id, preview: res.file.url || local, uploading: false } : i)));
          URL.revokeObjectURL(local);
        },
        (err) => {
          if (!live.current) return;
          setItems((list) => list.filter((i) => i.key !== key));
          URL.revokeObjectURL(local);
          setError(extractApiError(err, `Couldn’t add ${file.name}. Try another picture.`));
        },
      );
      if (n === 0) focusLater(`${baseId}-${key}-caption`);
    });
  };

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    [next[index], next[to]] = [next[to], next[index]];
    setItems(next);
    // Keep the keyboard on the thing that moved; at an end, on the button that still works.
    const atEnd = to === 0 || to === items.length - 1;
    focusLater(`${baseId}-${next[to].key}-${atEnd ? (by === -1 ? 'down' : 'up') : (by === -1 ? 'up' : 'down')}`);
  };

  const remove = (index: number) => {
    const item = items[index];
    if (item.fresh) dropFresh([item]);
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    const after = next[Math.min(index, next.length - 1)];
    focusLater(after ? `${baseId}-${after.key}-caption` : `${baseId}-add`);
  };

  const save = async () => {
    if (items.some((i) => i.uploading)) { setError('Wait for the pictures to finish adding.'); return; }
    const empty = items.find((i) => !i.caption.trim());
    if (empty) {
      setError('Write a few words under each picture.');
      focusLater(`${baseId}-${empty.key}-caption`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.profilePage.saveShelf(items.map((i) => ({ file_id: i.fileId!, caption: i.caption.trim() })));
      onSaved();
    } catch (err) {
      setError(extractApiError(err, 'Couldn’t save your shelf. Try again.'));
      setSaving(false);
    }
  };

  return (
    <Screen
      open
      onClose={close}
      close="close"
      z="z-[60]"
      title="Your shelf"
      footer={(
        <div className="flex flex-col gap-2">
          {error ? <p role="alert" className="text-[0.875rem] leading-5 text-app-error">{error}</p> : null}
          <button type="button" onClick={save} disabled={saving || read !== 'ready'} className="w-full min-h-[3rem] rounded-xl bg-primary-600 px-4 text-[1.0625rem] font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save shelf'}
          </button>
        </div>
      )}
    >
      <div className="px-4 sm:px-6 py-4 flex flex-col gap-4">
        {read !== 'ready' ? (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <p role="status" className="text-[0.9375rem] text-app-secondary">{read === 'loading' ? 'Opening your shelf…' : 'Couldn’t open your shelf.'}</p>
            {read === 'failed' ? (
              <button type="button" onClick={() => setReadRound((n) => n + 1)} className="min-h-[2.75rem] px-4 rounded-xl border border-app-strong text-[0.9375rem] font-semibold text-app hover-bg-app">Try again</button>
            ) : null}
          </div>
        ) : null}
        {read === 'ready' ? <>
        <p className="text-[0.9375rem] leading-[1.375rem] text-app-secondary">
          Up to five things, each a picture and a few words, in the order they stand. Who sees your shelf is set in Share
          your profile.
        </p>
        {items.length > 0 ? (
          <ol className="flex flex-col gap-3" aria-label="On your shelf">
            {items.map((item, index) => {
              const captionId = `${baseId}-${item.key}-caption`;
              const name = item.caption.trim() || `Picture ${index + 1}`;
              return (
                <li key={item.key} className="flex gap-3 items-start p-3 rounded-2xl bg-surface border border-app">
                  <div className="relative w-20 h-20 shrink-0 rounded-xl bg-app-surface-sunken overflow-hidden flex items-end justify-center">
                    {item.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- the person's own picture, before and after upload
                      <img src={item.preview} alt="" className={`w-full h-full object-contain object-bottom ${item.uploading ? 'opacity-60' : ''}`} />
                    ) : null}
                    {item.uploading ? <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[0.6875rem] leading-5 text-center">Adding…</span> : null}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor={captionId} className="text-[0.9375rem] font-semibold text-app">Words under it</label>
                      <span className="text-xs text-app-muted">{item.caption.length} of {CAPTION_MAX}</span>
                    </div>
                    <input
                      id={captionId}
                      className={field}
                      value={item.caption}
                      maxLength={CAPTION_MAX}
                      placeholder="A ladder to borrow"
                      autoComplete="off"
                      onChange={(e) => { const v = e.target.value; setItems((list) => list.map((i) => (i.key === item.key ? { ...i, caption: v } : i))); }}
                    />
                    <div className="flex items-center gap-1 -ml-2">
                      <button type="button" id={`${baseId}-${item.key}-up`} onClick={() => move(index, -1)} disabled={index === 0 || saving} aria-label={`Move ${name} earlier`} className={iconButton}>
                        <ArrowUp aria-hidden="true" className="w-5 h-5" />
                      </button>
                      <button type="button" id={`${baseId}-${item.key}-down`} onClick={() => move(index, 1)} disabled={index === items.length - 1 || saving} aria-label={`Move ${name} later`} className={iconButton}>
                        <ArrowDown aria-hidden="true" className="w-5 h-5" />
                      </button>
                      <button type="button" onClick={() => remove(index)} disabled={saving} aria-label={`Take ${name} off your shelf`} className={`${iconButton} ml-auto`}>
                        <X aria-hidden="true" className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
        {items.length < MAX ? (
          <>
            <button
              type="button"
              id={`${baseId}-add`}
              onClick={() => picker.current?.click()}
              disabled={saving}
              className="min-h-[3.25rem] w-full rounded-2xl border-2 border-dashed border-app-strong flex items-center justify-center gap-2 text-[0.9375rem] font-semibold text-app hover-bg-app disabled:opacity-60"
            >
              <ImagePlus aria-hidden="true" className="w-5 h-5" />
              Add a picture
              <span className="font-normal text-app-muted">{items.length} of {MAX}</span>
            </button>
            <input ref={picker} type="file" accept="image/*" multiple className="hidden" onChange={add} aria-hidden="true" tabIndex={-1} />
          </>
        ) : (
          <p className="text-[0.8125rem] leading-[1.125rem] text-app-muted">Your shelf holds five things. Take one off to add another.</p>
        )}
        </> : null}
      </div>
    </Screen>
  );
}
