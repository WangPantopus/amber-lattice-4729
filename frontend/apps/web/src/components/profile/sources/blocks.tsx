'use client';

import { useId, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { ArrowLeftRight, CalendarDays, ChevronRight, Hammer, Mail, MessageCircle, Users } from 'lucide-react';
import type {
  ProfileBadgeLine, ProfileBlock, ProfileCanDoBlock, ProfileCircleBlock, ProfileDoor, ProfileDoorsBlock, ProfileInCommonBlock,
  ProfileInk, ProfileKnownForBlock, ProfileLane, ProfileLink, ProfileLinesBlock, ProfileMore, ProfileMoreCloserBlock,
  ProfileOwnsBlock, ProfilePiece, ProfilePiecesBlock, ProfilePinnedPostsBlock, ProfilePromptsBlock,
  ProfileRecordChartBlock, ProfileRoleLine, ProfileRowsBlock, ProfileSaysBlock, ProfileShelfBlock, ProfileWorkRingsBlock,
} from '@pantopus/api';
import PinnedPostsRow from '@/components/profile/public/PinnedPostsRow';
import { YouAndRows, linesFor } from '@/components/profile/public/YouAndSection';
import { promptText } from '@/lib/profilePrompts';
import { HowLine, InkGlyph, InkLine, LineText, Opens, howText, inkOf, type Target } from './ink';
import { RecordChart, WorkFan } from './RingArt';
import Picture from './Picture';
import type { FanDot } from './rings';

/** What a block needs to know about the page around it. */
export interface BlockContext {
  firstName: string;
  /** The person's account id. */
  personId: string;
  /** The signed-in viewer's account id ('' signed out): "You're going to Maria's plan". */
  viewerId: string;
  /** Signed in and allowed to read this person's posts (pinned posts read themselves). */
  postsReadable: boolean;
  /** A preview: the page is to look at, not to act on. */
  inert: boolean;
  /** Where a server link goes on the web; null draws it without a tap. */
  target: (link: ProfileLink | null | undefined) => Target | null;
  /** A door or Leave your card (phase 3): the page decides (sign in first, a card, a link). */
  onDoor: (door: ProfileDoor | { key: 'leave_card' }) => void;
  /** More closer's Ask to connect. */
  onConnect: () => void;
  /** Each piece's ink and whether it is pinned, for its dot on the work rings. */
  pieces: Map<string, { ink: ProfileInk; pinned: boolean }>;
  /** The owner: change one of their roles ("Worked and learned"). */
  onEditRole?: ((role: ProfileRoleLine) => void) | null;
}

export const card = 'rounded-[1.25rem] border border-app bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.04)]';
export const overline = 'text-[0.6875rem] leading-4 font-semibold tracking-[0.06em] uppercase text-app-secondary';
const rowClass = 'flex items-center gap-3 px-4 py-3 min-h-[3rem] w-full text-left hover-bg-app';
const chevron = <ChevronRight aria-hidden="true" className="w-[1.125rem] h-[1.125rem] shrink-0 text-app-muted" />;

const LANE_TITLE: Record<ProfileLane, string> = {
  home: '!text-[var(--color-identity-home)]',
  work: '!text-[var(--color-identity-business)]',
  others: '!text-[var(--color-identity-personal)]',
};
/** The Record tab's groups wear their lane's colour (board 12). */
const RECORD_LANES: Record<string, ProfileLane> = { record_home: 'home', record_work: 'work', record_others: 'others' };

type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
const DOOR_ICON: Record<string, { Icon: IconType; tone: string }> = {
  hire: { Icon: Hammer, tone: 'bg-app-business-bg text-app-business' },
  see_work: { Icon: Hammer, tone: 'bg-app-business-bg text-app-business' },
  ask: { Icon: MessageCircle, tone: 'bg-app-personal-bg text-app-personal' },
  borrow: { Icon: ArrowLeftRight, tone: 'bg-app-home-bg text-app-home' },
  invite: { Icon: CalendarDays, tone: 'bg-app-personal-bg text-app-personal' },
  send_card: { Icon: Mail, tone: 'bg-app-surface-sunken text-app-secondary' },
};

function Tile({ icon }: { icon?: { Icon: IconType; tone: string } }) {
  if (!icon) return null;
  const { Icon, tone } = icon;
  return (
    <span aria-hidden="true" className={`w-9 h-9 shrink-0 rounded-[9px] flex items-center justify-center ${tone}`}>
      <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
    </span>
  );
}

/** A card with an overline title; the title is the section's heading for screen readers. */
function Section({ title, titleClass = '', children, className = '', padded = true, aside }: {
  title?: string | null; titleClass?: string; children: ReactNode; className?: string; padded?: boolean; aside?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={title ? id : undefined} className={`${card} ${padded ? 'px-5 pt-4 pb-[1.125rem]' : 'overflow-hidden'} ${className}`}>
      {title || aside ? (
        <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${padded ? 'mb-3' : 'px-4 pt-3.5 pb-0.5'}`}>
          {title ? <h2 id={id} className={`${overline} ${titleClass}`}>{title}</h2> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function MoreLink({ more, ctx }: { more?: ProfileMore | null; ctx: BlockContext }) {
  if (!more?.text) return null;
  const target = ctx.target(more.link);
  if (!target) return <span className="text-[0.8125rem] leading-[1.125rem] text-app-muted">{more.text}</span>;
  return (
    <Opens target={target} className="!w-auto min-h-[2.75rem] -my-3 flex items-center text-[0.8125rem] font-semibold text-app-link hover:underline">
      {more.text}
    </Opens>
  );
}

function Badge({ badge }: { badge?: { initials: string | null; picture_url: string | null } | null }) {
  if (!badge) return null;
  if (badge.picture_url) {
    return <Picture src={badge.picture_url} className="w-9 h-9 shrink-0 rounded-[9px] object-cover bg-app-surface-sunken" />;
  }
  if (!badge.initials) return null;
  return (
    <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-[9px] flex items-center justify-center bg-app-business-bg text-app-business text-[0.8125rem] font-bold">
      {badge.initials}
    </span>
  );
}

/** A review's writer, named only where the server names them: their page opens from their name. */
function Writer({ line, ctx }: { line: ProfileBadgeLine; ctx: BlockContext }) {
  const who = line.who;
  if (!who?.name || !(who.username || who.user_id)) return null;
  const target = ctx.target({ kind: 'profile', user_id: who.user_id ?? null, username: who.username ?? null });
  if (!target) return null;
  return (
    <Opens target={target} className="!w-auto mt-0.5 inline-flex min-h-[2rem] items-center text-xs leading-4 font-semibold text-app-link hover:underline">
      {who.did ? `${who.name} · ${who.did}` : who.name}
    </Opens>
  );
}

function LinesBlock({ block, ctx }: { block: ProfileLinesBlock | ProfileOwnsBlock; ctx: BlockContext }) {
  const lines = (block.lines || []).filter((line) => typeof line?.text === 'string' && line.text.trim());
  if (lines.length === 0) return null;
  const lane = RECORD_LANES[block.id];
  // "Worked and learned" on the owner's own page: each role can be changed (or removed) from here.
  if (block.id === 'worked_learned' && ctx.onEditRole) {
    return (
      <Section title={block.title}>
        <ul className="flex flex-col gap-3">
          {lines.map((line, i) => {
            const role = line as unknown as ProfileRoleLine;
            return (
              <li key={role.id || i} className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><InkLine line={line} target={ctx.target(line.link)} /></div>
                {role.id ? (
                  <button type="button" onClick={() => ctx.onEditRole!(role)} aria-label={`Change ${role.title || line.text}`} className="shrink-0 -mt-1 min-h-[2.75rem] px-2 text-[0.8125rem] font-semibold text-app-link hover:underline">
                    Change
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Section>
    );
  }
  return (
    <Section title={block.title} titleClass={lane ? LANE_TITLE[lane] : ''} aside={'more' in block ? <MoreLink more={block.more} ctx={ctx} /> : null}>
      <div className="flex flex-col gap-3">
        {lines.map((line, i) => <InkLine key={i} line={line} target={ctx.target(line.link)} lead={<Badge badge={line.badge} />} after={<Writer line={line} ctx={ctx} />} />)}
      </div>
    </Section>
  );
}

/** The header card's own lines (board 1: the first tab's untitled group): no card of their own. */
export function HeaderLines({ block, ctx }: { block: ProfileLinesBlock; ctx: BlockContext }) {
  const lines = (block.lines || []).filter((line) => typeof line?.text === 'string' && line.text.trim());
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, i) => <InkLine key={i} line={line} target={ctx.target(line.link)} />)}
    </div>
  );
}

function SaysBlock({ block }: { block: ProfileSaysBlock }) {
  const line = block.line;
  if (!line?.text?.trim()) return null;
  const ink = inkOf(line.ink);
  return (
    <Section title={block.title || 'Says'}>
      {ink === 'said'
        ? <p className="-mt-1.5 font-serif italic text-[1.25rem] leading-[1.6875rem] text-app [overflow-wrap:anywhere]">{line.text}</p>
        : <LineText ink={ink}>{line.text}</LineText>}
      <HowLine className="mt-1.5">{howText(ink, line.how)}</HowLine>
    </Section>
  );
}

function KnownForBlock({ block, ctx }: { block: ProfileKnownForBlock; ctx: BlockContext }) {
  const lines = (block.lines || []).filter((line) => line?.text?.trim());
  if (lines.length === 0) return null;
  return (
    <Section title={block.title || 'Known for'} aside={<MoreLink more={block.more} ctx={ctx} />}>
      <div className="flex flex-col gap-3.5">
        {lines.map((line, i) => {
          const ink = inkOf(line.ink);
          return (
            <div key={i} className="flex flex-col gap-1.5">
              <LineText ink={ink}>{line.text}</LineText>
              <div className="flex items-center gap-2">
                {line.who?.portrait_url
                  ? <Picture src={line.who.portrait_url} className="w-[22px] h-[22px] rounded-full object-cover shrink-0 bg-app-surface-sunken" />
                  : <InkGlyph ink={ink} inline />}
                <span className="text-xs leading-4 text-app-muted [overflow-wrap:anywhere]">{howText(ink, line.how)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function InCommonBlock({ block, ctx }: { block: ProfileInCommonBlock; ctx: BlockContext }) {
  if (linesFor(block, ctx.viewerId, ctx.personId, ctx.firstName).length === 0) return null;
  return (
    <Section title={block.title || `You and ${ctx.firstName}`} padded={false}>
      <YouAndRows data={block} viewerId={ctx.viewerId} personId={ctx.personId} firstName={ctx.firstName} className="divide-y divide-app" />
    </Section>
  );
}

function DoorsBlock({ block, ctx }: { block: ProfileDoorsBlock; ctx: BlockContext }) {
  const doors = (block.doors || []).filter((door) => door?.text?.trim());
  if (doors.length === 0 && !block.leave_card) return null;
  return (
    <Section title={block.title || `Doors ${ctx.firstName} keeps open`} padded={false}>
      <ul className="divide-y divide-app">
        {doors.map((door, i) => (
          <li key={door.key || i}>
            <button type="button" onClick={() => ctx.onDoor(door)} disabled={ctx.inert} className={rowClass}>
              <Tile icon={DOOR_ICON[door.key]} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-5 font-semibold text-app [overflow-wrap:anywhere]">{door.text}</span>
                {door.note ? <span className="block text-xs leading-4 text-app-muted">{door.note}</span> : null}
              </span>
              {chevron}
            </button>
          </li>
        ))}
      </ul>
      {block.leave_card || block.sign_in_note ? (
        <div className="px-4 pt-3 pb-4 border-t border-app flex flex-col gap-2">
          {block.leave_card ? (
            <button
              type="button"
              disabled={ctx.inert}
              onClick={() => ctx.onDoor({ key: 'leave_card' })}
              className="min-h-[2.75rem] w-full rounded-xl border border-app-strong bg-surface text-[0.9375rem] font-semibold text-app hover-bg-app disabled:opacity-60"
            >
              {block.leave_card.text}
            </button>
          ) : null}
          {block.leave_card?.note ? <p className="text-center text-xs leading-4 text-app-muted">{block.leave_card.note}</p> : null}
          {block.sign_in_note ? <p className="text-center text-xs leading-4 text-app-muted">{block.sign_in_note}</p> : null}
        </div>
      ) : null}
    </Section>
  );
}

function ShelfBlock({ block }: { block: ProfileShelfBlock }) {
  const objects = (block.objects || []).filter((item) => item?.picture_url).slice(0, 5);
  if (objects.length === 0) return null;
  return (
    <Section title={block.title}>
      <ul className="grid grid-cols-5 gap-1 items-end">
        {objects.map((item) => (
          <li key={item.id} className="flex flex-col items-center">
            <Picture src={item.picture_url} alt={item.caption || ''} className="w-full h-24 object-contain object-bottom" />
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="h-[9px] rounded-[3px] bg-[#b98a5a] border-t-[3px] border-[#caa06b]" />
      <ul className="pt-2.5 grid grid-cols-5 gap-1" aria-hidden="true">
        {objects.map((item) => <li key={item.id} className="font-serif italic text-xs leading-[0.9375rem] text-center text-app-strong [overflow-wrap:anywhere]">{item.caption}</li>)}
      </ul>
    </Section>
  );
}

function PromptsBlock({ block, ctx }: { block: ProfilePromptsBlock; ctx: BlockContext }) {
  // A prompt from a newer catalog is skipped (contract 3.2).
  const prompts = (block.prompts || [])
    .map((item) => ({ ...item, question: item?.key ? promptText(item.key) : null, words: (item?.answer || item?.text || '').trim() }))
    .filter((item) => item.question && item.words);
  if (prompts.length === 0) return null;
  const ink = inkOf(prompts[0].ink);
  return (
    <Section title={block.title || `Get to know ${ctx.firstName}`}>
      <dl className="flex flex-col gap-3.5">
        {prompts.map((item, i) => (
          <div key={item.key || i}>
            <dt className="text-xs leading-4 text-app-muted">{item.question}</dt>
            <dd className="font-serif italic text-base leading-[1.375rem] text-app-strong [overflow-wrap:anywhere]">{item.words}</dd>
          </div>
        ))}
      </dl>
      <HowLine className="mt-3">{howText(ink, prompts[0].how)}</HowLine>
    </Section>
  );
}

function RowsBlock({ block, ctx }: { block: ProfileRowsBlock; ctx: BlockContext }) {
  const rows = (block.rows || []).map((row) => ({ row, target: ctx.target(row.link) })).filter(({ row, target }) => row?.title?.trim() && target);
  if (rows.length === 0) return null;
  return (
    <Section title={block.title} padded={false}>
      <ul className="divide-y divide-app">
        {rows.map(({ row, target }, i) => (
          <li key={row.key || i}>
            <Opens target={target} className={rowClass}>
              <span className="flex w-full items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-5 font-semibold text-app">{row.title}</span>
                  {row.detail ? <span className="block text-xs leading-4 text-app-muted">{row.detail}</span> : null}
                </span>
                {chevron}
              </span>
            </Opens>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** A meter of a skill's pieces by ink (board 7): the words beside it say the same. */
function InkMeter({ inks, width }: { inks: Partial<Record<ProfileInk, number>>; width: number }) {
  const parts = (['seen', 'signed', 'said'] as const).map((ink) => [ink, Math.max(0, inks[ink] ?? 0)] as const).filter(([, n]) => n > 0);
  if (parts.length === 0) return null;
  return (
    <div aria-hidden="true" className="flex items-center gap-[3px] h-2" style={{ width: `${Math.max(12, Math.min(100, width))}%` }}>
      {parts.map(([ink, n]) => (
        <i
          key={ink}
          className={`block rounded-sm min-w-[4px] ${ink === 'seen' ? 'h-[5px] bg-[rgb(var(--app-text))]' : ink === 'signed' ? 'h-[1.5px] bg-[rgb(var(--app-text))]' : 'h-[2px] bg-[repeating-linear-gradient(90deg,rgb(var(--app-text-muted))_0_2px,transparent_2px_5px)]'}`}
          style={{ flexGrow: n, flexBasis: 0 }}
        />
      ))}
    </div>
  );
}

/** "4 Seen · 3 Signed · 2 Said": a meter's inks in words, every ink that counts. */
function inkCounts(inks: Partial<Record<ProfileInk, number>>): string {
  return (['seen', 'signed', 'said'] as const)
    .filter((ink) => (inks[ink] ?? 0) > 0)
    .map((ink) => `${inks[ink]} ${howText(ink)}`)
    .join(' · ');
}

/**
 * Board 7's Can do: the skill and its count on one row, the meter of its pieces by ink under it, and the inks written
 * out under the meter. A skill with no pieces is the person's own word: serif, with its Said line beside it.
 */
function CanDoBlock({ block, ctx }: { block: ProfileCanDoBlock; ctx: BlockContext }) {
  const skills = (block.skills || []).filter((skill) => (skill?.name || skill?.text || '').trim());
  if (skills.length === 0) return null;
  const most = Math.max(1, ...skills.map((skill) => skill.pieces || 0));
  return (
    <Section title={block.title || 'Can do'} aside={block.subtitle ? <span className="text-xs leading-4 text-app-muted">{block.subtitle}</span> : null}>
      <ul className="-my-1 divide-y divide-app-subtle">
        {skills.map((skill, i) => {
          const ink = inkOf(skill.ink);
          const counted = skill.pieces > 0 && skill.inks ? inkCounts(skill.inks) : '';
          return (
            <li key={i} className="py-2.5 flex flex-col gap-1.5">
              <Opens target={ctx.target(skill.link)} className="min-w-0">
                {counted ? (
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-[1rem] leading-[1.375rem] font-semibold text-app [overflow-wrap:anywhere]">{skill.name || skill.text}</span>
                    <span className="text-[0.8125rem] leading-[1.125rem] text-app-secondary">{skill.how || `${skill.pieces} ${skill.pieces === 1 ? 'piece' : 'pieces'}`}</span>
                  </span>
                ) : (
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <LineText ink={ink} className={ink === 'said' ? '' : 'font-semibold'}>{skill.name || skill.text}</LineText>
                    <span className="inline-flex items-center gap-1.5 text-xs leading-4 text-app-muted"><InkGlyph ink={ink} inline />{howText(ink, skill.how)}</span>
                  </span>
                )}
              </Opens>
              {counted ? (
                <>
                  <InkMeter inks={skill.inks!} width={(skill.pieces / most) * 100} />
                  <span className="text-xs leading-4 text-app-muted">{counted}</span>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function mediaText(media: ProfilePiece['media']): string | null {
  if (!media) return null;
  const parts = ([
    ['photo', media.photos], ['video', media.videos], ['document', media.documents], ['link', media.links],
  ] as const).filter(([, n]) => (n ?? 0) > 0).map(([word, n]) => `${n} ${word}${n === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : null;
}

const KIND_WORD: Record<string, string> = { did: 'Did', built: 'Built', owns: 'Owns' };

function PieceCard({ piece, ctx, big }: { piece: ProfilePiece; ctx: BlockContext; big: boolean }) {
  const ink = inkOf(piece.ink);
  // No picture, or one that doesn't load: the card without a picture box, never an empty frame.
  const [coverFailed, setCoverFailed] = useState(false);
  const cover = piece.cover_url && !coverFailed ? piece.cover_url : null;
  // Board 7's cards say the year ("Built · 2026"); the list under the work line says the month.
  const year = [piece.to, piece.from].find((v) => typeof v === 'string' && /^\d{4}/.test(v))?.slice(0, 4) ?? piece.when;
  const tag = [...ownerFlags(piece), piece.kind ? KIND_WORD[piece.kind] : null, year].filter(Boolean).join(' · ');
  const media = mediaText(piece.media);
  return (
    <Opens target={ctx.target(piece.link)} className="rounded-2xl" label={undefined}>
      <span className="flex flex-col gap-2">
        {cover ? (
          <span className={`relative block w-full overflow-hidden rounded-2xl bg-app-surface-sunken ${big ? 'aspect-[3/2] lg:aspect-[16/9]' : 'aspect-[4/3]'}`}>
            <Picture src={cover} onFail={() => setCoverFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
            {tag ? <span className="absolute left-2 bottom-2 inline-flex items-center min-h-6 px-2 rounded-full bg-gray-900 text-white text-[0.6875rem] leading-4 font-semibold">{tag}</span> : null}
            {big && media ? <span className="absolute right-2 bottom-2 inline-flex items-center min-h-6 px-2 rounded-full bg-gray-900 text-white text-[0.6875rem] leading-4 font-semibold">{media}</span> : null}
          </span>
        ) : null}
        <span className={`block px-1 ${cover ? '' : 'pt-0.5'}`}>
          {/* With no picture the card reads kind and year, title, ink line. */}
          {!cover && tag ? <span className="block mb-0.5 text-xs leading-4 font-semibold text-app-secondary">{tag}</span> : null}
          <span className={`block font-semibold text-app [overflow-wrap:anywhere] ${big ? 'text-[1.0625rem] leading-[1.4375rem]' : 'text-sm leading-5'}`}>{piece.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs leading-4 text-app-muted">
            <InkGlyph ink={ink} inline />
            <span className="[overflow-wrap:anywhere]">{[withWords(piece), howText(ink, piece.how)].filter(Boolean).join(' · ')}</span>
          </span>
        </span>
      </span>
    </Opens>
  );
}

const MONTH_WORDS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A piece's month (`YYYY-MM`): when it finished, else started, else its dot on the work line. */
function pieceMonth(piece: ProfilePiece, dots: Map<string, string>): string | null {
  const month = [piece.to, piece.from, dots.get(piece.id)].find((v) => typeof v === 'string' && /^\d{4}-\d{2}/.test(v));
  return month ? month.slice(0, 7) : null;
}

/** "With Maria Kovács" for a piece signed on someone else's work, unless the server's how already says it. */
function withWords(piece: ProfilePiece): string | null {
  const name = piece.with?.name?.trim();
  if (!name) return null;
  return (piece.how || '').includes(name) ? null : `With ${name}`;
}

/** The owner's own flags on a piece only they see (P2.1). */
function ownerFlags(piece: ProfilePiece): string[] {
  return [piece.draft ? 'Draft' : null, piece.hidden ? 'Hidden' : null].filter(Boolean) as string[];
}

/**
 * One piece in a list (board 7): its cover, title, and a line with its kind, its month (or `when`), and its ink with
 * how Pantopus knows. A piece signed on someone else's work says whose it is ("With Maria K.").
 */
function PieceRow({ piece, ctx, month }: { piece: ProfilePiece; ctx: BlockContext; month?: string | null }) {
  const ink = inkOf(piece.ink);
  const [coverFailed, setCoverFailed] = useState(false);
  const cover = piece.cover_url && !coverFailed ? piece.cover_url : null;
  const target = ctx.target(piece.link);
  const flags = ownerFlags(piece);
  const meta = [
    ...flags,
    piece.kind ? KIND_WORD[piece.kind] : null,
    month !== undefined ? month : piece.when,
    withWords(piece),
    howText(ink, piece.how),
  ].filter(Boolean).join(' · ');
  return (
    <Opens target={target} className={`${rowClass} !px-3`}>
      <span className="flex w-full items-center gap-3">
        {cover ? (
          <span className="relative block w-[3.25rem] h-[3.25rem] shrink-0 overflow-hidden rounded-[10px] bg-app-surface-sunken">
            <Picture src={cover} onFail={() => setCoverFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{piece.title}</span>
          <span className="mt-0.5 flex items-start gap-1.5 text-xs leading-4 text-app-muted">
            <InkGlyph ink={ink} inline />
            <span className="[overflow-wrap:anywhere]">{meta}</span>
          </span>
        </span>
        {target ? chevron : null}
      </span>
    </Opens>
  );
}

const KIND_ORDER = ['did', 'built', 'owns'];

/** Board 7's All / Did / Built: the server's `filters` when sent, else the kinds these pieces have (two or more). */
function kindOptions(block: ProfilePiecesBlock | null, pieces: ProfilePiece[]): string[] {
  const present = KIND_ORDER.filter((kind) => pieces.some((piece) => piece.kind === kind));
  const sent = (block?.filters || []).filter((f) => f !== 'all' && present.includes(f));
  const kinds = sent.length > 0 ? sent : present;
  return kinds.length >= 2 ? ['all', ...kinds] : [];
}

function Segmented({ options, value, onChange, label }: { options: Array<{ key: string; label: string }>; value: string; onChange: (key: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid gap-1 p-1 rounded-xl bg-app-surface-sunken" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const on = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.key)}
            className={`min-h-[2.5rem] px-2 rounded-[0.625rem] text-[0.9375rem] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)] ${on ? 'bg-surface text-app shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-app-secondary hover:text-app'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Board 7's work line: the work rings opened flat with a dot per piece, the years as chips (the newest chosen), the
 * All / Did / Built switch and the pieces of the chosen year. Either half may come alone: the fan without a list, or
 * the list (with its switch) without a fan.
 */
export function WorkLineBlock({ rings, list, ctx, pinned = null }: {
  rings: ProfileWorkRingsBlock | null; list: ProfilePiecesBlock | null; ctx: BlockContext;
  /** The tab's pinned pieces: a year's list holds them too (board 7's 2026 has the pinned porch), each once. */
  pinned?: ProfilePiece[] | null;
}) {
  const pieces = useMemo(() => {
    const listed = (list?.pieces || []).filter((piece) => piece?.id && piece.title?.trim());
    const seen = new Set(listed.map((piece) => piece.id));
    const more = rings ? (pinned || []).filter((piece) => piece?.id && piece.title?.trim() && !seen.has(piece.id)) : [];
    return [...listed, ...more];
  }, [list, pinned, rings]);
  const dated = useMemo(() => {
    const dots = new Map((rings?.dots || []).filter((d) => d?.piece_id && d.month).map((d) => [d.piece_id, d.month]));
    return pieces.map((piece) => ({ piece, month: pieceMonth(piece, dots) }));
  }, [pieces, rings]);
  // Board 7: one chip for each year the work rings send, with that year's count as sent (its dots), newest first;
  // the list under it is that year's pieces. Without the rings, the years of the listed pieces. Pieces with no month
  // get a chip of their own, last.
  const years = useMemo(() => {
    const listed = new Map<string, number>();
    dated.forEach(({ month }) => { const y = month ? month.slice(0, 4) : 'none'; listed.set(y, (listed.get(y) ?? 0) + 1); });
    const sent = (rings?.years || []).filter((y) => y && y.pieces > 0).map((y) => ({ year: String(y.year), pieces: y.pieces }));
    const out = sent.length > 0
      ? sent
      : [...listed.keys()].filter((y) => y !== 'none').map((year) => ({ year, pieces: listed.get(year)! }));
    out.sort((a, b) => Number(b.year) - Number(a.year));
    if (listed.has('none')) out.push({ year: 'none', pieces: listed.get('none')! });
    return out;
  }, [dated, rings]);
  const chips = years.length > 1 || (years.length === 1 && years[0].year !== 'none');
  const [year, setYear] = useState<string | null>(null);
  const [kind, setKind] = useState('all');
  const shownYear = chips ? (years.some((y) => y.year === year) ? year! : years[0]?.year ?? null) : null;
  const ofYear = dated.filter(({ month }) => !shownYear || (shownYear === 'none' ? !month : month?.startsWith(shownYear)));
  const kinds = kindOptions(list, ofYear.map(({ piece }) => piece));
  const shownKind = kinds.includes(kind) ? kind : 'all';
  const shown = ofYear.filter(({ piece }) => shownKind === 'all' || piece.kind === shownKind);
  const fanDrawn = Boolean(rings && typeof rings.from === 'number' && Array.isArray(rings.months));
  if (!fanDrawn && pieces.length === 0) return null;

  const total = (rings?.years || []).reduce((sum, y) => sum + (y?.pieces > 0 ? y.pieces : 0), 0) || pieces.length;
  let fan: ReactNode = null;
  if (fanDrawn && rings) {
    const dots: FanDot[] = (rings.dots || []).map((dot) => ({
      month: dot.month,
      ink: dot.ink ? inkOf(dot.ink) : ctx.pieces.get(dot.piece_id)?.ink ?? 'said',
      pinned: ctx.pieces.get(dot.piece_id)?.pinned ?? false,
    }));
    const yearsWords = (rings.years || []).filter((y) => y.pieces > 0).map((y) => `${y.year}: ${y.pieces} ${y.pieces === 1 ? 'piece' : 'pieces'}`).join(', ');
    const label = `${ctx.firstName}'s work rings opened flat: each band is a year from ${rings.from} at the centre to this year outside, months run left to right, and each dot is a piece.${yearsWords ? ` ${yearsWords}.` : ''}`;
    fan = <WorkFan from={rings.from} now={rings.now} months={rings.months} dots={dots} label={label} />;
  }
  const aside = (
    <span className="flex items-baseline gap-3">
      {total > 0 ? <span className="text-xs leading-4 text-app-muted">{total} {total === 1 ? 'piece' : 'pieces'}</span> : null}
      {!fanDrawn ? <MoreLink more={list?.more} ctx={ctx} /> : null}
    </span>
  );
  return (
    <Section title={(fanDrawn ? rings?.title : list?.title) || (fanDrawn ? 'Work' : 'All pieces')} className="!px-3" aside={aside}>
      {fan}
      {pieces.length > 0 ? (
        <div className={`flex flex-col gap-3 ${fan ? 'mt-4' : ''}`}>
          {chips ? (
            <div role="group" aria-label="Years" className="-mx-3 px-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {years.map((y) => {
                const on = y.year === shownYear;
                return (
                  <button
                    key={y.year}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setYear(y.year)}
                    className={`shrink-0 min-h-[2.25rem] px-3.5 rounded-full text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)] ${on ? 'bg-[rgb(var(--app-text))] text-[rgb(var(--app-surface))]' : 'bg-app-surface-sunken text-app hover:text-app-strong'}`}
                  >
                    {y.year === 'none' ? 'No date' : y.year} · {y.pieces}
                  </button>
                );
              })}
            </div>
          ) : null}
          {kinds.length > 0 ? (
            <Segmented
              label="Kind of piece"
              value={shownKind}
              onChange={setKind}
              options={kinds.map((key) => ({ key, label: key === 'all' ? 'All' : KIND_WORD[key] }))}
            />
          ) : null}
          <ul className="-mx-3 divide-y divide-app-subtle" aria-live="polite">
            {shown.map(({ piece, month }) => (
              <li key={piece.id}>
                <PieceRow piece={piece} ctx={ctx} month={shownYear && month ? MONTH_WORDS[Number(month.slice(5, 7)) - 1] ?? null : undefined} />
              </li>
            ))}
          </ul>
          {fanDrawn && list?.more ? <div className="px-1"><MoreLink more={list.more} ctx={ctx} /></div> : null}
        </div>
      ) : null}
    </Section>
  );
}

function PiecesBlock({ block, ctx }: { block: ProfilePiecesBlock; ctx: BlockContext }) {
  const headingId = useId();
  const pieces = (block.pieces || []).filter((piece) => piece?.id && piece.title?.trim());
  if (pieces.length === 0) return null;
  const aside = (
    <span className="flex items-baseline gap-3">
      {block.subtitle ? <span className="text-xs leading-4 text-app-muted">{block.subtitle}</span> : null}
      <MoreLink more={block.more} ctx={ctx} />
    </span>
  );
  if (block.style === 'pinned') {
    const [first, ...rest] = pieces;
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
          <h2 id={headingId} className={overline}>{block.title || 'Pinned'}</h2>
          {aside}
        </div>
        <PieceCard piece={first} ctx={ctx} big />
        {rest.length > 0 ? (
          <div className="mt-1 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
            {rest.map((piece) => <PieceCard key={piece.id} piece={piece} ctx={ctx} big={false} />)}
          </div>
        ) : null}
      </section>
    );
  }
  return <WorkLineBlock rings={null} list={block} ctx={ctx} />;
}

function WorkRingsBlock({ block, ctx }: { block: ProfileWorkRingsBlock; ctx: BlockContext }) {
  return <WorkLineBlock rings={block} list={null} ctx={ctx} />;
}

function CircleBlock({ block }: { block: ProfileCircleBlock }) {
  const groups = (block.groups || []).filter((group) => (group?.people || []).length > 0);
  if (groups.length === 0) return null;
  return (
    <Section title={block.title || 'Work circle'}>
      {block.text ? <p className="-mt-1 mb-3 text-[0.8125rem] leading-[1.125rem] text-app-secondary">{block.text}</p> : null}
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.key}>
            <h3 className="text-xs leading-4 font-semibold text-app-secondary">{group.title}</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {group.people.map((person, j) => {
                const ink = inkOf(person.ink);
                return (
                  <li key={person.user_id || j} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 items-start">
                    <InkGlyph ink={ink} />
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] leading-[1.3125rem] text-app">{person.name || person.did}</p>
                      <HowLine>{howText(ink, person.name ? person.did : null)}</HowLine>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function RecordChartBlock({ block, ctx }: { block: ProfileRecordChartBlock; ctx: BlockContext }) {
  if (typeof block.from !== 'number' || !Array.isArray(block.lanes)) return null;
  const rings = { from: block.from, now: block.now, ...Object.fromEntries(block.lanes.filter((l) => l && Array.isArray(l.months)).map((l) => [l.lane, l.months])) };
  return (
    <Section title={block.title} className="!px-3" aside={block.subtitle ? <span className="text-xs leading-4 text-app-muted">{block.subtitle}</span> : null}>
      <RecordChart rings={rings} firstName={ctx.firstName} caption={block.note} />
    </Section>
  );
}

function MoreCloserBlock({ block, ctx }: { block: ProfileMoreCloserBlock; ctx: BlockContext }) {
  if (!block.title?.trim()) return null;
  return (
    <section className={`${card} p-4 flex gap-3`}>
      <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-[9px] flex items-center justify-center bg-app-surface-sunken text-app-secondary">
        <Users className="w-[1.125rem] h-[1.125rem]" />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <h2 className="text-sm leading-5 font-semibold text-app">{block.title}</h2>
        {block.text ? <p className="text-[0.8125rem] leading-[1.125rem] text-app-secondary">{block.text}</p> : null}
        {block.action?.kind === 'connect' ? (
          <button
            type="button"
            disabled={ctx.inert}
            onClick={ctx.onConnect}
            className="mt-2 self-start min-h-[2.75rem] px-3.5 rounded-xl bg-app-surface-sunken text-[0.8125rem] font-semibold text-app hover-bg-app disabled:opacity-60"
          >
            Ask to connect
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** One block, or nothing for a kind this page doesn't know (contract 0: skip it). */
/**
 * A tab's blocks in order. Board 7 draws the work rings and the list of every piece as one card, so a `work_rings`
 * block followed by a list of pieces is drawn together.
 */
function pinnedOf(blocks: ProfileBlock[]): ProfilePiece[] {
  const block = blocks.find((b) => b.kind === 'pieces' && (b as ProfilePiecesBlock).style === 'pinned') as ProfilePiecesBlock | undefined;
  return block?.pieces || [];
}

export function Blocks({ blocks, ctx, keyPrefix }: { blocks: ProfileBlock[]; ctx: BlockContext; keyPrefix: string }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const next = blocks[i + 1] as ProfilePiecesBlock | undefined;
    if (block.kind === 'work_rings' && next?.kind === 'pieces' && next.style !== 'pinned') {
      out.push(<WorkLineBlock key={`${keyPrefix}-${block.id ?? i}`} rings={block as ProfileWorkRingsBlock} list={next} ctx={ctx} pinned={pinnedOf(blocks)} />);
      i += 1;
    } else {
      out.push(<Block key={`${keyPrefix}-${block.id ?? i}`} block={block} ctx={ctx} />);
    }
  }
  return <>{out}</>;
}

export function Block({ block, ctx }: { block: ProfileBlock; ctx: BlockContext }) {
  switch (block?.kind) {
    case 'lines': return <LinesBlock block={block as ProfileLinesBlock} ctx={ctx} />;
    case 'owns': return <LinesBlock block={block as ProfileOwnsBlock} ctx={ctx} />;
    case 'says': return <SaysBlock block={block as ProfileSaysBlock} />;
    case 'known_for': return <KnownForBlock block={block as ProfileKnownForBlock} ctx={ctx} />;
    case 'in_common': return ctx.viewerId ? <InCommonBlock block={block as ProfileInCommonBlock} ctx={ctx} /> : null;
    case 'doors': return <DoorsBlock block={block as ProfileDoorsBlock} ctx={ctx} />;
    case 'shelf': return <ShelfBlock block={block as ProfileShelfBlock} />;
    case 'prompts': return <PromptsBlock block={block as ProfilePromptsBlock} ctx={ctx} />;
    case 'pinned_posts': {
      const id = (block as ProfilePinnedPostsBlock).user_id || ctx.personId;
      return id && ctx.postsReadable
        ? <div className="contents [&>section]:mb-0"><PinnedPostsRow personId={id} enabled inert={ctx.inert} /></div>
        : null;
    }
    case 'rows': return <RowsBlock block={block as ProfileRowsBlock} ctx={ctx} />;
    case 'can_do': return <CanDoBlock block={block as ProfileCanDoBlock} ctx={ctx} />;
    case 'pieces': return <PiecesBlock block={block as ProfilePiecesBlock} ctx={ctx} />;
    case 'work_rings': return <WorkRingsBlock block={block as ProfileWorkRingsBlock} ctx={ctx} />;
    case 'circle': return <CircleBlock block={block as ProfileCircleBlock} />;
    case 'record_chart': return <RecordChartBlock block={block as ProfileRecordChartBlock} ctx={ctx} />;
    case 'more_closer': return <MoreCloserBlock block={block as ProfileMoreCloserBlock} ctx={ctx} />;
    default: return null;
  }
}

const KNOWN_KINDS = new Set([
  'lines', 'owns', 'says', 'known_for', 'in_common', 'doors', 'shelf', 'prompts', 'pinned_posts', 'rows', 'can_do',
  'pieces', 'work_rings', 'circle', 'record_chart', 'more_closer',
]);

/** True when this page can draw the block (a known kind). A tab of unknown kinds only is not drawn. */
export function drawable(block: ProfileBlock | null | undefined): boolean {
  return Boolean(block && typeof block.kind === 'string' && KNOWN_KINDS.has(block.kind));
}

/** Each piece on the page with its ink, and whether it is pinned: the work rings' dots. */
export function pieceInks(blocks: ProfileBlock[]): Map<string, { ink: ProfileInk; pinned: boolean }> {
  const out = new Map<string, { ink: ProfileInk; pinned: boolean }>();
  for (const block of blocks) {
    if (block?.kind !== 'pieces') continue;
    const pieces = block as ProfilePiecesBlock;
    for (const piece of pieces.pieces || []) {
      if (!piece?.id) continue;
      const prev = out.get(piece.id);
      out.set(piece.id, { ink: inkOf(piece.ink), pinned: Boolean(prev?.pinned) || pieces.style === 'pinned' });
    }
  }
  return out;
}
