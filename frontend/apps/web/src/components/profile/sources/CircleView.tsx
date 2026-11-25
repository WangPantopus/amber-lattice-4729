'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, ChevronRight, User } from 'lucide-react';
import type { ProfileCircleGroup, ProfileCirclePerson, ProfileCircleRead, ProfileLink, ProfilePiece } from '@pantopus/api';
import Screen from './Screen';
import Picture from './Picture';
import { HowLine, InkGlyph, howText, inkOf, Opens, type Target } from './ink';
import { card, overline } from './blocks';

const W = 360;
// Room under the bottom row for two lines of words under each face.
const H = 480;
const CX = 180;
const CY = 232;
const R_CENTER = 34;
const R = 24;

function initials(name: string | null | undefined): string {
  const words = String(name || '').replace(/&/g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/** A face in the circle: a person round, a business or a place square (board 9); dotted while only said. */
export function CircleFace({ person, size = 48, selected = false }: { person: ProfileCirclePerson; size?: number; selected?: boolean }) {
  const square = person.kind === 'business' || person.kind === 'place';
  const said = inkOf(person.ink) === 'said';
  const shape = square ? 'rounded-[12px]' : 'rounded-full';
  const ring = selected ? 'ring-2 ring-[color:var(--color-link)] ring-offset-2 ring-offset-[rgb(var(--app-bg))]' : '';
  const border = said ? 'border-[1.5px] border-dashed border-app-strong' : 'border-[2px] border-[rgb(var(--app-text))]';
  const style = { width: size, height: size };
  return (
    <span style={style} className={`relative block shrink-0 overflow-hidden ${shape} ${border} ${ring} bg-app-surface-sunken`}>
      {person.portrait_url ? <Picture src={person.portrait_url} className="absolute inset-0 w-full h-full object-cover" /> : (
        <span aria-hidden="true" className={`absolute inset-0 flex items-center justify-center font-bold ${square ? 'bg-app-business-bg text-app-business' : 'text-app-secondary'}`} style={{ fontSize: Math.round(size * 0.3) }}>
          {person.name?.trim() ? initials(person.name) : square ? <Building2 className="w-1/2 h-1/2" /> : <User className="w-1/2 h-1/2" />}
        </span>
      )}
    </span>
  );
}

type Slot = { person: ProfileCirclePerson | null; more: number; x: number; y: number; group: string };

/** Up to `slots` faces for a group; when there are more, the last slot says how many more. */
function fill(group: ProfileCircleGroup | undefined, slots: number): Array<{ person: ProfileCirclePerson | null; more: number }> {
  if (!group) return [];
  const people = (group.people || []).filter(Boolean);
  const count = Math.max(group.count || 0, people.length);
  if (count <= slots) return people.slice(0, slots).map((person) => ({ person, more: 0 }));
  return [...people.slice(0, slots - 1).map((person) => ({ person, more: 0 })), { person: null, more: count - (slots - 1) }];
}

const xsFor = (n: number) => (n === 1 ? [CX] : n === 2 ? [105, 255] : [55, CX, 305]);

/** Where each face sits: has taught or led above, works beside on the line, learned from below (board 9). */
function layout(groups: ProfileCircleGroup[]): Slot[] {
  const by = (key: string) => groups.find((g) => g.key === key);
  const top = fill(by('taught_or_led'), 3);
  const mid = fill(by('works_beside'), 4);
  const bottom = fill(by('learned_from'), 3);
  const out: Slot[] = [];
  xsFor(top.length).forEach((x, i) => out.push({ ...top[i], x, y: 88, group: 'taught_or_led' }));
  // Two each side of the person, far enough apart that their words never meet.
  const midXs = [110, 36, 250, 324];
  mid.forEach((m, i) => out.push({ ...m, x: midXs[i], y: CY, group: 'works_beside' }));
  xsFor(bottom.length).forEach((x, i) => out.push({ ...bottom[i], x, y: 372, group: 'learned_from' }));
  return out;
}

function line(slot: Slot, previous: Slot | null): string {
  if (slot.group === 'works_beside') {
    // Faces on the same side are chained: the centre to the nearer face, then on to the farther one.
    const fromX = previous ? previous.x + (slot.x < CX ? -R : R) : CX + (slot.x < CX ? -R_CENTER : R_CENTER);
    const toX = slot.x + (slot.x < CX ? R : -R);
    return `M ${fromX} ${CY} L ${toX} ${CY}`;
  }
  const up = slot.group === 'taught_or_led';
  const y0 = up ? CY - R_CENTER : CY + R_CENTER;
  const y1 = up ? slot.y + R : slot.y - R;
  const mid = (y0 + y1) / 2;
  return `M ${CX} ${y0} C ${CX} ${mid}, ${slot.x} ${mid}, ${slot.x} ${y1}`;
}

function Diagram({ groups, center, chosen, onChoose, firstName }: {
  groups: ProfileCircleGroup[];
  center: { name: string; portraitUrl: string | null };
  chosen: ProfileCirclePerson | null;
  onChoose: (person: ProfileCirclePerson) => void;
  firstName: string;
}) {
  const slots = layout(groups);
  const titles: Array<{ key: string; y: number }> = [{ key: 'taught_or_led', y: 6 }, { key: 'works_beside', y: 158 }, { key: 'learned_from', y: 314 }];
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  let previousMid: Record<'l' | 'r', Slot | null> = { l: null, r: null };
  const paths = slots.map((slot) => {
    let prev: Slot | null = null;
    if (slot.group === 'works_beside') {
      const side = slot.x < CX ? 'l' : 'r';
      prev = previousMid[side];
      previousMid = { ...previousMid, [side]: slot };
    }
    const said = slot.person ? inkOf(slot.person.ink) === 'said' : false;
    return { d: line(slot, prev), said };
  });
  return (
    <div className="relative w-full max-w-[26rem] mx-auto" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" aria-hidden="true">
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke="rgb(var(--app-text-muted))" strokeWidth={1.5} strokeDasharray={p.said ? '2 4' : undefined} strokeLinecap="round" />
        ))}
      </svg>
      {titles.filter((t) => groups.some((g) => g.key === t.key && (g.count || g.people?.length))).map((t) => (
        // On the page's own background, so a line passing under a group's name never runs through it.
        <p key={t.key} className={`absolute left-0 z-[1] pr-2 bg-app ${overline}`} style={{ top: pct(t.y, H) }}>{groups.find((g) => g.key === t.key)?.title}</p>
      ))}
      <span className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pct(CX, W), top: pct(CY, H) }}>
        <CircleFace person={{ name: center.name, user_id: null, portrait_url: center.portraitUrl, did: null, ink: 'seen' }} size={R_CENTER * 2} />
        <span className="sr-only">{firstName}</span>
      </span>
      {slots.map((slot, i) => {
        const above = slot.group === 'taught_or_led';
        const label = slot.person ? (
          <>
            <span className="block text-xs leading-4 font-semibold text-app [overflow-wrap:anywhere] line-clamp-2">{slot.person.name || slot.person.did}</span>
            {/* What they did (when named) and the ink's word, always written. */}
            <span className="block text-[0.6875rem] leading-[0.875rem] text-app-muted [overflow-wrap:anywhere] line-clamp-2" title={slot.person.did ?? undefined}>
              {[slot.person.name ? slot.person.did : null, howText(inkOf(slot.person.ink))].filter(Boolean).join(' · ')}
            </span>
          </>
        ) : <span className="block text-xs leading-4 font-semibold text-app">{slot.more} more</span>;
        const face = slot.person
          ? <CircleFace person={slot.person} size={R * 2} selected={chosen === slot.person} />
          : <span className="flex w-12 h-12 rounded-full border border-app-strong bg-surface items-center justify-center text-[0.875rem] font-bold text-app">+{slot.more}</span>;
        return (
          <div key={i} className="absolute flex flex-col items-center" style={{ left: pct(slot.x, W), top: pct(slot.y, H), transform: `translate(-50%, ${above ? 'calc(-100% + 24px)' : '-24px'})`, width: slot.group === 'works_beside' ? '20%' : '25%' }}>
            {above ? <span className="mb-1 text-center">{label}</span> : null}
            {slot.person ? (
              <button type="button" onClick={() => onChoose(slot.person!)} aria-pressed={chosen === slot.person} aria-label={`${slot.person.name || slot.person.did}: ${howText(inkOf(slot.person.ink))}`} className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]">
                {face}
              </button>
            ) : face}
            {!above ? <span className="mt-1 text-center">{label}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Everyone in the circle as a list, by group (the drawing shows a few of each; this reaches all of them, by keyboard
 * too): face, name or what they did, the ink's word, and how many pieces the two share. Choosing one shows them above.
 */
function Everyone({ groups, chosen, onChoose, firstName }: {
  groups: ProfileCircleGroup[];
  chosen: ProfileCirclePerson | null;
  onChoose: (person: ProfileCirclePerson) => void;
  firstName: string;
}) {
  const shown = groups.filter((g) => (g.people || []).length > 0);
  if (shown.length === 0) return null;
  return (
    <section aria-label={`Everyone in ${firstName}'s work circle`} className={`${card} overflow-hidden`}>
      <h3 className={`${overline} px-5 pt-4 pb-1`}>Everyone in the circle</h3>
      {shown.map((group) => (
        <div key={group.key} className="pb-1">
          <p className="px-5 pt-2 pb-1 text-xs leading-4 font-semibold text-app-secondary">
            {group.title}{group.count > (group.people || []).length ? ` · ${group.count}, ${(group.people || []).length} shown` : ''}
          </p>
          <ul>
            {group.people.map((person, i) => {
              const ink = inkOf(person.ink);
              const n = person.shared_pieces ?? 0;
              return (
                <li key={`${person.user_id ?? person.name ?? person.did}-${i}`}>
                  <button
                    type="button"
                    aria-pressed={chosen === person}
                    onClick={() => onChoose(person)}
                    className={`w-full flex items-center gap-3 px-5 py-2 min-h-[3rem] text-left hover-bg-app focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--color-link)] ${chosen === person ? 'bg-app-surface-sunken' : ''}`}
                  >
                    <CircleFace person={person} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{person.name || person.did}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs leading-4 text-app-muted">
                        <InkGlyph ink={ink} inline />
                        {howText(ink, [person.name ? person.did : null, n > 0 ? `${n} ${n === 1 ? 'piece' : 'pieces'} together` : null].filter(Boolean).join(' · '))}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** The two of them: what they share, read when a person is chosen. */
function Shared({ person, read, target }: { person: ProfileCirclePerson; read: (userId: string) => Promise<{ pieces: ProfilePiece[] }>; target: (link: ProfileLink | null | undefined) => Target | null }) {
  const [pieces, setPieces] = useState<ProfilePiece[] | null>(null);
  useEffect(() => {
    if (!person.user_id) { setPieces([]); return; }
    let live = true;
    setPieces(null);
    Promise.resolve().then(() => read(person.user_id!)).then(
      (res) => { if (live) setPieces((res?.pieces || []).filter((p) => p?.id && p.title)); },
      () => { if (live) setPieces([]); },
    );
    return () => { live = false; };
  }, [person, read]);
  const ink = inkOf(person.ink);
  const n = person.shared_pieces ?? pieces?.length ?? 0;
  return (
    <section aria-label={`With ${person.name || person.did}`} className={`${card} overflow-hidden`}>
      <div className="flex items-center gap-3 px-5 py-3.5">
        <CircleFace person={person} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[1rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">With {person.name || person.did}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs leading-4 text-app-muted">
            <InkGlyph ink={ink} inline />
            {howText(ink, [person.name && person.did ? person.did : null, n > 0 ? `${n} ${n === 1 ? 'piece' : 'pieces'} together` : null].filter(Boolean).join(' · '))}
          </p>
        </div>
      </div>
      {pieces && pieces.length > 0 ? (
        <ul className="divide-y divide-app-subtle border-t border-app-subtle">
          {pieces.map((piece) => {
            const t = target(piece.link);
            const pInk = inkOf(piece.ink);
            return (
              <li key={piece.id}>
                <Opens target={t} className="flex items-center gap-3 px-5 py-3 min-h-[3rem] w-full text-left hover-bg-app">
                  <span className="flex w-full items-center gap-3">
                    {piece.cover_url ? <span className="relative block w-12 h-12 shrink-0 overflow-hidden rounded-[10px] bg-app-surface-sunken"><Picture src={piece.cover_url} className="absolute inset-0 w-full h-full object-cover" /></span> : null}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{piece.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs leading-4 text-app-muted"><InkGlyph ink={pInk} inline />{[piece.when, howText(pInk, piece.how)].filter(Boolean).join(' · ')}</span>
                    </span>
                    {t ? <ChevronRight aria-hidden="true" className="w-[1.125rem] h-[1.125rem] shrink-0 text-app-muted" /> : null}
                  </span>
                </Opens>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * The work circle opened (board 9): who the person works with, drawn from the people named on their pieces and their
 * roles. A solid line is a tie both sides confirmed; a dotted one is in the person's words. Choose someone to see the
 * pieces the two share. Under it, how many households and businesses hired the person (households never named).
 */
export default function CircleView({ open, state, onClose, onRetry, firstName, center, readPieces, target }: {
  open: boolean;
  state: 'loading' | 'failed' | ProfileCircleRead | null;
  onClose: () => void;
  onRetry: () => void;
  firstName: string;
  center: { name: string; portraitUrl: string | null };
  readPieces: (userId: string) => Promise<{ pieces: ProfilePiece[] }>;
  target: (link: ProfileLink | null | undefined) => Target | null;
}) {
  const read = state && typeof state === 'object' ? state : null;
  const people = (read?.groups || []).flatMap((g) => g.people || []);
  const [chosen, setChosen] = useState<ProfileCirclePerson | null>(null);
  const sharedRef = useRef<HTMLDivElement>(null);
  // Board 9 opens on the first confirmed person.
  const shown = chosen && people.includes(chosen) ? chosen : people.find((p) => p.user_id && inkOf(p.ink) === 'signed') ?? null;
  let body: ReactNode;
  if (state === 'loading' || !state) {
    body = <div className="py-16 flex justify-center" role="status"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" aria-hidden="true" /><span className="sr-only">Loading</span></div>;
  } else if (state === 'failed') {
    body = (
      <div className="py-12 px-6 text-center">
        <p className="text-[0.9375rem] text-app-secondary">Couldn&apos;t load this. Check your connection and try again.</p>
        <button type="button" onClick={onRetry} className="mt-3 min-h-[2.75rem] px-4 rounded-xl border border-app-strong text-[0.9375rem] font-semibold text-app hover-bg-app">Try again</button>
      </div>
    );
  } else {
    body = (
      <div className="px-4 sm:px-6 pt-4 pb-6 flex flex-col gap-4">
        <div>
          <h3 className="text-[1.25rem] leading-7 font-bold text-app">Who {firstName} works with</h3>
          <p className="mt-1 text-[0.875rem] leading-5 text-app-secondary">
            Drawn from the people named on {firstName}&apos;s pieces and roles. A solid line is a tie both sides confirmed; a dotted line is one in {firstName}&apos;s words, not confirmed.
          </p>
        </div>
        {people.length > 0 ? <Diagram groups={read!.groups} center={center} chosen={shown} onChoose={setChosen} firstName={firstName} /> : null}
        {shown ? <div ref={sharedRef} className="scroll-mt-14"><Shared key={`${shown.user_id}-${shown.name}`} person={shown} read={readPieces} target={target} /></div> : null}
        {people.length > 0 ? <Everyone groups={read!.groups} chosen={shown} firstName={firstName} onChoose={(person) => { setChosen(person); requestAnimationFrame(() => sharedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} /> : null}
        {read!.hired_by?.text ? (
          <section className={`${card} px-5 py-3.5`}>
            <p className="flex items-start gap-2.5 text-[0.9375rem] leading-[1.3125rem] text-app"><InkGlyph ink={inkOf(read!.hired_by.ink)} />{read!.hired_by.text}</p>
            <HowLine className="pl-[1.625rem]">{howText(inkOf(read!.hired_by.ink), read!.hired_by.how)}</HowLine>
          </section>
        ) : null}
        <p className="rounded-2xl bg-app-info-bg px-4 py-3 text-[0.875rem] leading-5 text-app">
          A person is named here only once they confirm; a name in {firstName}&apos;s words is dotted. Anyone can take their name off a piece, and it leaves this circle.
        </p>
      </div>
    );
  }
  return <Screen open={open} onClose={onClose} title="Work circle">{body}</Screen>;
}
