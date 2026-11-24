// The guides' and topic pages' running text, from their data (src/lib/site/guides, src/lib/site/topics): paragraphs and
// lists whose text may carry [words](/path) links. Server components: every word is in the HTML. A link to another
// page of the site is a next/link while that page is live (links.ts), else plain words; a link to an outside source is
// a plain link that opens in the same tab.

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { GuideBlock } from '@/lib/site/guides';
import { liveHref } from './links';
import r from './reading.module.css';

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** One line of text with its [words](href) links drawn. */
export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const [whole, words, href] = m;
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const to = liveHref(href);
    out.push(
      !to ? (
        words
      ) : to.startsWith('/') ? (
        <Link key={at} href={to}>
          {words}
        </Link>
      ) : (
        <a key={at} href={to} rel="noopener">
          {words}
        </a>
      ),
    );
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** A section's paragraphs and lists, in order. */
export function Blocks({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <div className={r.prose}>
      {blocks.map((b, i) => {
        if ('p' in b) {
          return (
            <p key={i}>
              <Inline text={b.p} />
            </p>
          );
        }
        const items = 'ul' in b ? b.ul : b.ol;
        const List = 'ul' in b ? 'ul' : 'ol';
        return (
          <List key={i}>
            {items.map((item) => (
              <li key={item}>
                <Inline text={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

/** A heading whose *starred* part is drawn in the homepage's gold italic: "A home is hard *to fake.*". */
export function Em({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/);
  return <>{parts.map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part))}</>;
}

/** The heading's words without its stars. */
export const unstar = (text: string) => text.replace(/\*/g, '');

/** "what-to-check" from "What to check?": a section's anchor. */
export function anchorOf(text: string): string {
  return unstar(text)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
