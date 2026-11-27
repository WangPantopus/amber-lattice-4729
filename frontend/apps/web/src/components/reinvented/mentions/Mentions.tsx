'use client';

// Mentions in a caption (Pulse, reinvented, phase 2; coord/CONTRACT.md §7h): typing "@" in the Studio's words offers
// the author's connections; the words keep "@First Last" as plain text, so today's screens and the apps in the stores
// show it as written, and the app sends the people's ids beside it (up to five). The server keeps only connections who
// may see the post, and none under a made-up name. A reader whose switch is on sees each name linked to its profile.

import Link from 'next/link';
import { Fragment, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getConnections, type RelationshipUser } from '@pantopus/api/endpoints/relationships';
import { buildUserProfilePath } from '@pantopus/utils';
import './mentions.css';

export const MAX_MENTIONS = 5;

export interface Mentioned {
  id: string;
  name: string;
}

/** A person as the server answers `mentions` (a Moment author's shape). */
export interface MentionPerson {
  id: string;
  name?: string | null;
  username?: string | null;
}

const nameOf = (u: RelationshipUser) =>
  (u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '').trim().replace(/\s+/g, ' ');

/** The "@query" being typed just before the caret, if any (letters, spaces, dots, apostrophes and dashes, up to 30). */
export function typingMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}\p{M}' .-]{0,30})$/u.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

/** The people still named in the words ("@Name" present), in the order picked, up to five. */
export function mentionIds(text: string, picked: readonly Mentioned[]): string[] {
  const out: string[] = [];
  for (const p of picked) if (text.includes(`@${p.name}`) && !out.includes(p.id) && out.length < MAX_MENTIONS) out.push(p.id);
  return out;
}

/** The author's connections, read once while composing. */
export function useConnectionsForMentions(enabled: boolean) {
  return useQuery({
    queryKey: ['reinvented', 'mention-connections'],
    queryFn: async () => {
      const { relationships } = await getConnections({ limit: 200 });
      const seen = new Set<string>();
      return relationships
        .map((r) => r.other_user)
        .filter((u): u is RelationshipUser => !!u && !seen.has(u.id) && !!seen.add(u.id))
        .map((u) => ({ id: u.id, name: nameOf(u), avatar: u.profile_picture_url || null }))
        .filter((u) => u.name);
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * Under the words while an "@name" is being typed: the matching connections; picking one writes "@First Last " in
 * place of what was typed.
 */
export function MentionPicker({
  text,
  caret,
  picked,
  enabled,
  onPick,
}: {
  text: string;
  caret: number;
  picked: readonly Mentioned[];
  enabled: boolean;
  onPick(next: { text: string; caret: number; person: Mentioned }): void;
}) {
  const typing = enabled ? typingMention(text, caret) : null;
  const people = useConnectionsForMentions(enabled);
  const q = typing?.query.trim().toLowerCase() ?? '';
  const matches = useMemo(
    () =>
      (people.data || [])
        .filter((p) => !q || p.name.toLowerCase().split(' ').some((w) => w.startsWith(q)) || p.name.toLowerCase().startsWith(q))
        .slice(0, 6),
    [people.data, q],
  );
  if (!typing) return null;
  const full = mentionIds(text, picked).length >= MAX_MENTIONS;
  return (
    <div className="mn-picker" role="listbox" aria-label="Mention someone you’re connected with">
      {full ? (
        <p className="mn-note">Up to {MAX_MENTIONS} people in one post.</p>
      ) : people.isPending ? (
        <p className="mn-note">Reading your connections…</p>
      ) : matches.length ? (
        matches.map((p) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={false}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const insert = `@${p.name} `;
              const next = text.slice(0, typing.start) + insert + text.slice(caret);
              onPick({ text: next, caret: typing.start + insert.length, person: { id: p.id, name: p.name } });
            }}
          >
            <span className="mn-face" aria-hidden="true">
              {p.avatar ? <img src={p.avatar} alt="" /> : p.name.slice(0, 1)}
            </span>
            {p.name}
          </button>
        ))
      ) : (
        <p className="mn-note">{q ? 'None of your connections by that name.' : 'Type a name.'}</p>
      )}
    </div>
  );
}

/** The words with each mentioned person's "@Name" linked to their profile. */
export function withMentions(text: string, mentions: readonly MentionPerson[] | null | undefined): ReactNode {
  const named = (mentions || []).filter((p) => p?.name && text.includes(`@${p.name}`));
  if (!named.length) return text;
  // Longest names first, so "@Ana Quinn" wins over "@Ana".
  const sorted = [...named].sort((a, b) => b.name!.length - a.name!.length);
  const out: ReactNode[] = [];
  let rest = text,
    key = 0;
  while (rest) {
    let best: { at: number; p: MentionPerson } | null = null;
    for (const p of sorted) {
      const at = rest.indexOf(`@${p.name}`);
      if (at >= 0 && (!best || at < best.at)) best = { at, p };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.at) out.push(rest.slice(0, best.at));
    const label = `@${best.p.name}`;
    out.push(
      <Link key={key++} className="mn-link" href={buildUserProfilePath(best.p.username || best.p.id)} onClick={(e) => e.stopPropagation()}>
        {label}
      </Link>,
    );
    rest = rest.slice(best.at + label.length);
  }
  return <Fragment>{out}</Fragment>;
}
