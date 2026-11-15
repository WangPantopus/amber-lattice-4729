'use client';

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

interface RepostChooserProps {
  /** The viewer already reposted the post: the first item undoes it. */
  reposted: boolean;
  /** Repost, or Undo repost. */
  onRepost: () => void;
  /** "Repost with your words": the Pulse composer with the post under the text box. */
  onQuote: () => void;
  /** Closes the chooser; the button that opened it gets the focus back. */
  onClose: () => void;
  /** The button that opened it: a click on it toggles the chooser rather than closing and reopening it. */
  triggerRef?: RefObject<HTMLElement | null>;
  /** Where it opens from its `relative` wrapper (the ⋯ menu's place, or above a Repost button). */
  positionClassName?: string;
}

// The two things Repost can do are the chooser's whole content, so they read as the card's own text does (the ⋯
// menu's smaller, greyer items are secondary actions).
const ITEM = 'w-full text-left px-3.5 py-2.5 text-sm font-medium text-app hover-bg-app';

/**
 * Repost's small chooser (PULSEREPOST contract §2): Repost (or Undo repost) and Repost with your words, drawn as the
 * card's ⋯ menu. Opens on the first item; arrows move between items, Escape or a click elsewhere closes it.
 */
export default function RepostChooser({
  reposted, onRepost, onQuote, onClose, triggerRef, positionClassName = 'right-0 top-full mt-1',
}: RepostChooserProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef?.current?.contains(target)) return;
      closeRef.current();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [triggerRef]);

  const close = () => {
    onClose();
    triggerRef?.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      // Leaving the menu closes it, as a click elsewhere does.
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Repost"
      onKeyDown={onKeyDown}
      // A click inside the chooser never reaches the card under it (which opens the post).
      onClick={(event) => event.stopPropagation()}
      className={`absolute ${positionClassName} w-56 bg-surface rounded-xl shadow-xl border border-app py-1 z-30`}
    >
      {reposted ? (
        <button type="button" role="menuitem" data-testid="pulseRepostChooserUndo" className={ITEM} onClick={() => { close(); onRepost(); }}>
          Undo repost
        </button>
      ) : (
        <button type="button" role="menuitem" data-testid="pulseRepostChooserRepost" className={ITEM} onClick={() => { close(); onRepost(); }}>
          Repost
        </button>
      )}
      <button type="button" role="menuitem" data-testid="pulseRepostChooserQuote" className={ITEM} onClick={() => { onClose(); onQuote(); }}>
        Repost with your words
      </button>
    </div>
  );
}
