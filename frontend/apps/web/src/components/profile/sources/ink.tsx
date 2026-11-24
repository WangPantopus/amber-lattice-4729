import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ProfileInk, ProfileLine } from '@pantopus/api';
import { howText, inkOf } from './inks';

// The three inks (SPEC section 2): every line says how we know it. A solid dot is Seen (Pantopus's own records), a
// ring with a centre is Signed (a named other party confirmed it), a dotted ring and serif italic words are Said (the
// person's own words). The word is always written beside the mark: ink is never told by colour or line style alone.

export { INK_WORD, inkOf, howText } from './inks';

/** Where a tap goes: a page (`href`, an outside page when `external`) or something on this page (`onClick`). */
export type Target = { href: string; external?: boolean } | { onClick: () => void };

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-link)]';

/** Wraps something that opens a target; without one it is drawn as it is. */
export function Opens({ target, className = '', children, label }: { target?: Target | null; className?: string; children: ReactNode; label?: string }) {
  if (!target) return <div className={className}>{children}</div>;
  if ('onClick' in target) {
    return <button type="button" onClick={target.onClick} aria-label={label} className={`text-left w-full ${focusRing} ${className}`}>{children}</button>;
  }
  if (target.external) {
    return <a href={target.href} target="_blank" rel="noopener noreferrer nofollow" aria-label={label} className={`block ${focusRing} ${className}`}>{children}</a>;
  }
  return <Link href={target.href} aria-label={label} className={`block ${focusRing} ${className}`}>{children}</Link>;
}

/** The ink's mark. Decorative: the word is always beside it. `inline` sits in a line of text. */
export function InkGlyph({ ink, inline = false }: { ink: ProfileInk; inline?: boolean }) {
  const place = inline ? '' : 'mt-[0.34rem] ml-[3px]';
  if (ink === 'seen') {
    return <span aria-hidden="true" className={`inline-block shrink-0 w-2.5 h-2.5 rounded-full bg-[rgb(var(--app-text))] ${place}`} />;
  }
  if (ink === 'signed') {
    return (
      <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center w-2.5 h-2.5 rounded-full border-[1.5px] border-[rgb(var(--app-text))] ${place}`}>
        <span className="block w-[3px] h-[3px] rounded-full bg-[rgb(var(--app-text))]" />
      </span>
    );
  }
  return <span aria-hidden="true" className={`inline-block shrink-0 w-2.5 h-2.5 rounded-full border-[1.5px] border-dotted border-[rgb(var(--app-text-muted))] ${place}`} />;
}

/** The words of a line: Said is the person's own voice, set in a serif italic. */
export function LineText({ ink, children, className = '' }: { ink: ProfileInk; children: ReactNode; className?: string }) {
  return ink === 'said'
    ? <p className={`font-serif italic text-base leading-[1.375rem] text-app-strong [overflow-wrap:anywhere] ${className}`}>{children}</p>
    : <p className={`text-[0.9375rem] leading-[1.3125rem] text-app [overflow-wrap:anywhere] ${className}`}>{children}</p>;
}

/** The small line under a line: how we know it, starting with the ink's word. */
export function HowLine({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`mt-0.5 text-xs leading-4 text-app-muted [overflow-wrap:anywhere] ${className}`}>{children}</p>;
}

/** One line with its ink: the mark, the words, and how we know it. */
export function InkLine({ line, target, lead, after }: { line: ProfileLine; target?: Target | null; lead?: ReactNode; after?: ReactNode }) {
  const ink = inkOf(line.ink);
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 items-start">
      <InkGlyph ink={ink} />
      <div className="min-w-0">
        <Opens target={target} className="min-w-0 rounded hover:[&_p:first-child]:underline">
          <div className="flex items-start gap-2.5">
            {lead}
            <div className="min-w-0">
              <LineText ink={ink}>{line.text}</LineText>
              <HowLine>{howText(ink, line.how)}</HowLine>
            </div>
          </div>
        </Opens>
        {after}
      </div>
    </div>
  );
}
