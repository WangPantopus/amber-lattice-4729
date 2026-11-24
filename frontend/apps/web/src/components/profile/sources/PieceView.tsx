'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { AppWindow, BookOpen, ChevronRight, Code2, FileText, Globe, Newspaper, Play, PlayCircle, User } from 'lucide-react';
import type { ProfileAttachment, ProfileCredit, ProfileInk, ProfileLinkCard, ProfilePieceRead } from '@pantopus/api';
import { HowLine, InkGlyph, InkLine, howText, inkOf, type Target, Opens } from './ink';
import { card, overline } from './blocks';
import Picture from './Picture';
import Screen from './Screen';

type PieceState = 'loading' | 'gone' | 'failed' | ProfilePieceRead;
export type Piece = ProfilePieceRead['piece'];

const KIND_WORD: Record<string, string> = { did: 'Did', built: 'Built', owns: 'Owns' };
/** Who sees a piece, in the owner's words, when it is narrower than anyone with the link. */
export const AUDIENCE_WORD: Record<string, string> = { members: 'People on Pantopus', connections: 'Your connections' };

/** The pictures and films a piece shows at its top: P2.2's attachments, else v1's `media` list, else its cover. */
function galleryOf(piece: Piece): ProfileAttachment[] {
  const listed = Array.isArray(piece.attachments) && piece.attachments.length > 0
    ? piece.attachments
    : Array.isArray(piece.media) ? piece.media : [];
  const shown = listed.filter((a) => a && (a.kind === 'photo' || a.kind === 'video') && typeof a.url === 'string' && a.url);
  if (shown.length > 0) return shown;
  return piece.cover_url ? [{ kind: 'photo', url: piece.cover_url, thumbnail_url: null }] : [];
}

/** The documents a piece carries (P2.2's attachments, else v1's `media` list). */
function documentsOf(piece: Piece): ProfileAttachment[] {
  const listed = Array.isArray(piece.attachments) ? piece.attachments : Array.isArray(piece.media) ? piece.media : [];
  return listed.filter((a) => a && a.kind === 'document' && typeof a.url === 'string' && /^https?:\/\//i.test(a.url));
}

/** "5 photos · 1 video": from the piece's counts when sent, else from what is listed. */
function countsText(piece: Piece, gallery: ProfileAttachment[]): string | null {
  const counts = piece.media && !Array.isArray(piece.media) ? piece.media : null;
  const photos = counts?.photos ?? gallery.filter((a) => a.kind === 'photo').length;
  const videos = counts?.videos ?? gallery.filter((a) => a.kind === 'video').length;
  const parts = [
    photos > 0 ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : null,
    videos > 0 ? `${videos} ${videos === 1 ? 'video' : 'videos'}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Initials for a face with no picture. */
function initials(name: string | null | undefined): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '·';
}

function Face({ name, url, small = false }: { name: string | null; url: string | null | undefined; small?: boolean }) {
  const size = small ? 'w-6 h-6 text-[0.5625rem]' : 'w-11 h-11 text-[0.8125rem]';
  if (url) return <Picture src={url} className={`${size} shrink-0 rounded-full object-cover bg-app-surface-sunken`} />;
  return (
    <span aria-hidden="true" className={`${size} shrink-0 rounded-full bg-app-surface-sunken text-app-secondary flex items-center justify-center font-bold`}>
      {/* Nobody named: a plain mark, never letters that would read as someone's initials. */}
      {name?.trim() ? initials(name) : <User className={small ? 'w-3 h-3' : 'w-5 h-5'} />}
    </span>
  );
}

/** A card with an overline title; `flush` lets its rows run to the card's edges. */
function Card({ title, children, flush = false }: { title: string; children: ReactNode; flush?: boolean }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`${card} pt-4 ${flush ? 'pb-1.5 overflow-hidden' : 'px-5 pb-[1.125rem]'}`}>
      <h3 id={id} className={`${overline} ${flush ? 'px-5 mb-1' : 'mb-3'}`}>{title}</h3>
      {children}
    </section>
  );
}

/** The gallery (board 8): one big picture or film with "1 of 6" and the counts, and a strip to choose from. */
function Gallery({ items, counts, chosen, onChoose, title }: {
  items: ProfileAttachment[]; counts: string | null; chosen: number; onChoose: (i: number) => void; title: string;
}) {
  if (items.length === 0) return null;
  const item = items[Math.min(chosen, items.length - 1)];
  const pill = 'absolute bottom-2.5 inline-flex items-center min-h-6 px-2.5 rounded-full bg-gray-900/85 text-white text-xs leading-4 font-semibold';
  return (
    <div className="flex flex-col">
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-gray-900 overflow-hidden">
        {item.kind === 'video' ? (
          <video
            key={item.url}
            src={item.url}
            poster={item.thumbnail_url || undefined}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-contain bg-black"
            aria-label={item.title || `A film of ${title}`}
          />
        ) : (
          <Picture src={item.url} alt={item.title || ''} className="absolute inset-0 w-full h-full object-cover" />
        )}
        {items.length > 1 ? <span className={`${pill} left-2.5`}>{Math.min(chosen, items.length - 1) + 1} of {items.length}</span> : null}
        {counts && item.kind !== 'video' ? <span className={`${pill} right-2.5`}>{counts}</span> : null}
      </div>
      {items.length > 1 ? (
        <div role="group" aria-label="Photos and videos" className="flex gap-2 overflow-x-auto px-4 py-2.5 bg-surface border-b border-app [scrollbar-width:none]">
          {items.map((a, i) => {
            const on = i === chosen;
            const thumb = a.thumbnail_url || (a.kind === 'photo' ? a.url : null);
            return (
              <button
                key={`${a.url}-${i}`}
                type="button"
                aria-pressed={on}
                aria-label={`${a.kind === 'video' ? 'Video' : 'Photo'} ${i + 1} of ${items.length}`}
                onClick={() => onChoose(i)}
                className={`relative shrink-0 w-[3.75rem] h-[2.875rem] rounded-lg overflow-hidden bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-link)] ${on ? 'ring-2 ring-[rgb(var(--app-text))] ring-offset-2 ring-offset-[rgb(var(--app-surface))]' : ''}`}
              >
                {thumb ? <Picture src={thumb} className="absolute inset-0 w-full h-full object-cover" /> : null}
                {a.kind === 'video' ? (
                  <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                    <span className="w-6 h-6 rounded-full bg-gray-900/80 flex items-center justify-center"><Play className="w-3 h-3 text-white fill-white" /></span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const LINK_ICON: Record<string, typeof Globe> = { site: Globe, video: PlayCircle, code: Code2, app: AppWindow, article: Newspaper, paper: BookOpen };
const LINK_WORD: Record<string, string> = { site: 'Site', video: 'Video', code: 'Code', app: 'App', article: 'Article', paper: 'Paper' };

/** A link as a card (board 11): its kind and site, its words, and its ink. No picture comes from the page. */
export function LinkCardView({ link, footer }: { link: ProfileLinkCard; footer?: ReactNode }) {
  const kind = typeof link.kind === 'string' && LINK_WORD[link.kind] ? link.kind : 'site';
  const Icon = LINK_ICON[kind];
  const ink: ProfileInk = inkOf(link.ink ?? 'said');
  const site = link.site || (() => { try { return new URL(link.url).hostname; } catch { return ''; } })();
  const body = (
    <span className="flex items-start gap-3">
      {link.picture_url ? (
        <Picture src={link.picture_url} className="w-9 h-9 shrink-0 rounded-[9px] object-cover bg-app-surface-sunken" />
      ) : (
        <span aria-hidden="true" className={`w-9 h-9 shrink-0 rounded-[9px] flex items-center justify-center ${kind === 'site' ? 'bg-app-info-bg text-app-info' : 'bg-surface text-app-secondary border border-app'}`}>
          <Icon className="w-[1.125rem] h-[1.125rem]" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block ${overline} !text-app-muted [overflow-wrap:anywhere]`}>{[LINK_WORD[kind], site].filter(Boolean).join(' · ')}</span>
        <span className="mt-0.5 block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{link.title || site || link.url}</span>
        {link.description ? <span className="mt-0.5 block text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{link.description}</span> : null}
        <span className="mt-1.5 flex items-center gap-1.5 text-xs leading-4 text-app-muted"><InkGlyph ink={ink} inline />{howText(ink, link.how)}</span>
      </span>
    </span>
  );
  const safe = /^https?:\/\//i.test(link.url || '');
  return (
    <div className="rounded-2xl bg-app-surface-sunken">
      {safe ? (
        <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="block px-3.5 py-3 rounded-2xl hover-bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]">
          {body}
        </a>
      ) : <div className="px-3.5 py-3">{body}</div>}
      {footer ? <div className="px-3.5 pb-3 -mt-1 pl-[3.875rem]">{footer}</div> : null}
    </div>
  );
}

const STATUS_WORD: Record<string, string> = { asked: 'Asked', did_not_confirm: 'Did not confirm' };

/** "Who was on it" (board 8): the person first, then each credit as the server names it. */
function Credits({ piece, owner, credits, target }: {
  piece: Piece; owner: { name: string; portraitUrl: string | null }; credits: ProfileCredit[];
  target: (who: { user_id: string | null; username: string | null }) => Target | null;
}) {
  return (
    <Card title="Who was on it" flush>
      <ul className="divide-y divide-app-subtle">
        <li className="flex items-center gap-3 px-5 py-2.5">
          <Face name={owner.name} url={owner.portraitUrl} />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{owner.name}</span>
            {piece.owner_role ? <span className="block text-[0.8125rem] leading-[1.125rem] text-app-secondary">{piece.owner_role}</span> : null}
          </span>
          <span className="text-[0.8125rem] text-app-muted">This profile</span>
        </li>
        {credits.map((credit) => {
          const ink = inkOf(credit.ink);
          const shownName = credit.party?.name?.trim() || null;
          const what = shownName ? credit.role : credit.party?.did || credit.role;
          const status = credit.status && STATUS_WORD[credit.status];
          const opens = shownName && (credit.party.username || credit.party.user_id)
            ? target({ user_id: credit.party.user_id, username: credit.party.username })
            : null;
          const who = (
            <span className="flex items-center gap-3 min-w-0 flex-1">
              <Face name={shownName} url={shownName ? credit.party.portrait_url : null} />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{shownName || what}</span>
                {shownName && what ? <span className="block text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{what}</span> : null}
              </span>
            </span>
          );
          return (
            <li key={credit.id} className="flex items-center gap-3 px-5 py-2.5">
              {opens ? <Opens target={opens} className="!w-auto min-w-0 flex-1 rounded-lg">{who}</Opens> : who}
              <span className="shrink-0 inline-flex items-center gap-1.5 text-[0.8125rem] text-app-secondary">
                {status ? status : <><InkGlyph ink={ink} inline />{howText(ink)}</>}
              </span>
            </li>
          );
        })}
      </ul>
      {piece.kept_once ? <p className="px-5 py-3 border-t border-app-subtle text-[0.8125rem] leading-[1.125rem] text-app-secondary">{piece.kept_once}</p> : null}
    </Card>
  );
}

function PieceBody({ piece, firstName, owner, target, view }: {
  piece: Piece; firstName: string; owner: { name: string; portraitUrl: string | null };
  target: (who: { user_id: string | null; username: string | null }) => Target | null; view: string;
}) {
  const gallery = galleryOf(piece);
  const [chosen, setChosen] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);
  const documents = documentsOf(piece);
  const videos = gallery.map((a, i) => ({ a, i })).filter(({ a }) => a.kind === 'video');
  const links = (Array.isArray(piece.links) ? piece.links : []).filter((l) => l && typeof l.url === 'string');
  const knows = (piece.how_we_know || []).filter((line) => line?.text);
  const skills = (piece.shows_can ?? piece.skills ?? []).filter((s) => typeof s === 'string' && s.trim());
  const credits = (piece.credits || []).filter((c) => c && c.id && (c.party?.name || c.party?.did || c.role));
  const written = (piece.written || []).filter((w) => w?.text);
  const chips = [
    piece.kind && KIND_WORD[piece.kind] ? { text: KIND_WORD[piece.kind], tone: 'bg-app-business-bg text-app-business' } : null,
    piece.when ? { text: piece.when, tone: 'bg-app-surface-sunken text-app-secondary' } : null,
    piece.place ? { text: piece.place, tone: 'bg-app-surface-sunken text-app-secondary' } : null,
    ...(view === 'owner' ? [piece.draft ? 'Draft' : null, piece.hidden ? 'Hidden' : null, AUDIENCE_WORD[piece.audience || ''] ?? null].filter(Boolean).map((text) => ({ text: text!, tone: 'bg-app-surface-sunken text-app' })) : []),
  ].filter(Boolean) as Array<{ text: string; tone: string }>;
  const ink = inkOf(piece.ink);
  const showVideo = (i: number) => {
    setChosen(i);
    galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col">
      <div ref={galleryRef} className="scroll-mt-12">
        <Gallery items={gallery} counts={countsText(piece, gallery)} chosen={chosen} onChoose={setChosen} title={piece.title} />
      </div>
      <div className="px-4 sm:px-6 pt-4 pb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          {chips.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {chips.map((chip) => <li key={chip.text} className={`inline-flex items-center min-h-7 px-3 rounded-full text-[0.8125rem] font-semibold ${chip.tone}`}>{chip.text}</li>)}
            </ul>
          ) : null}
          <h2 className="text-[1.5rem] leading-[1.875rem] font-bold tracking-[-0.01em] text-app [overflow-wrap:anywhere]">{piece.title}</h2>
          {piece.description?.text ? (
            <div>
              <p className="font-serif italic text-[1.125rem] leading-[1.625rem] text-app [overflow-wrap:anywhere]">{piece.description.text}</p>
              <HowLine>{howText(inkOf(piece.description.ink), piece.description.how)}</HowLine>
            </div>
          ) : null}
          {knows.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs leading-4 text-app-muted"><InkGlyph ink={ink} inline />{howText(ink, piece.how)}</p>
          ) : null}
        </div>

        {knows.length > 0 ? (
          <Card title="How we know">
            <div className="flex flex-col gap-3">{knows.map((line, i) => <InkLine key={i} line={line} />)}</div>
          </Card>
        ) : null}

        {credits.length > 0 ? <Credits piece={piece} owner={owner} credits={credits} target={target} /> : null}

        {skills.length > 0 ? (
          <section aria-label={`Shows ${firstName} can`} className="flex flex-col gap-2">
            <h3 className={`${overline} px-1`}>Shows {firstName} can</h3>
            <ul className="flex flex-wrap gap-2">
              {skills.map((skill) => <li key={skill} className="inline-flex items-center min-h-8 px-3 rounded-full bg-app-business-bg text-app-business text-[0.8125rem] font-semibold">{skill}</li>)}
            </ul>
          </section>
        ) : null}

        {videos.length > 0 || documents.length > 0 || links.length > 0 ? (
          <Card title="Attached" flush>
            <ul className="flex flex-col">
              {videos.map(({ a, i }) => (
                <li key={`v-${i}`}>
                  <button type="button" onClick={() => showVideo(i)} className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover-bg-app">
                    <span className="relative shrink-0 w-[4.5rem] h-12 rounded-lg overflow-hidden bg-gray-800">
                      {a.thumbnail_url ? <Picture src={a.thumbnail_url} className="absolute inset-0 w-full h-full object-cover" /> : null}
                      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                        <span className="w-7 h-7 rounded-full bg-gray-900/80 flex items-center justify-center"><Play className="w-3.5 h-3.5 text-white fill-white" /></span>
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{a.title || 'Video'}</span>
                      <span className="block text-[0.8125rem] leading-[1.125rem] text-app-secondary">{a.detail || 'Video'}</span>
                    </span>
                  </button>
                </li>
              ))}
              {documents.map((a, i) => (
                <li key={`d-${i}`} className="border-t border-app-subtle first:border-t-0">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-5 py-2.5 hover-bg-app">
                    <span className="relative shrink-0 w-[4.5rem] h-12 rounded-lg overflow-hidden bg-app-surface-sunken flex items-center justify-center">
                      {a.thumbnail_url ? <Picture src={a.thumbnail_url} className="absolute inset-0 w-full h-full object-cover" /> : <FileText aria-hidden="true" className="w-5 h-5 text-app-secondary" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{a.title || 'Document'}</span>
                      <span className="block text-[0.8125rem] leading-[1.125rem] text-app-secondary">{a.detail || 'Document'}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="w-[1.125rem] h-[1.125rem] shrink-0 text-app-muted" />
                  </a>
                </li>
              ))}
              {links.map((link, i) => (
                <li key={link.id || `l-${i}`} className="px-3 pt-2 pb-1.5">
                  <LinkCardView link={link} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {written.map((w, i) => {
          const who = w.who;
          const named = who?.name?.trim() || null;
          const byline = named ? [named, who?.did, w.when].filter(Boolean).join(' · ') : null;
          return (
            <Card key={i} title={named ? `What ${named.split(/\s+/)[0]} wrote` : 'What was written'}>
              <p className="text-[1.0625rem] leading-[1.5rem] text-app [overflow-wrap:anywhere]">{w.text}</p>
              {byline ? (
                <div className="mt-3 flex items-center gap-2">
                  <Face name={named} url={who?.portrait_url} small />
                  <p className="text-xs leading-4 text-app-secondary [overflow-wrap:anywhere]">{byline}</p>
                </div>
              ) : null}
              <p className={`${byline ? 'mt-1' : 'mt-3'} flex items-center gap-1.5 text-xs leading-4 text-app-muted`}>
                <InkGlyph ink={inkOf(w.ink)} inline />{howText(inkOf(w.ink), w.how)}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One piece opened (board 8) as a screen of its own. The owner can change it from here (board 10).
 */
export default function PieceView({ state, onClose, onRetry, firstName, owner, target, onChange }: {
  state: PieceState | null;
  onClose: () => void;
  onRetry: () => void;
  firstName: string;
  owner: { name: string; portraitUrl: string | null };
  target: (who: { user_id: string | null; username: string | null }) => Target | null;
  /** The owner's view: open this piece in the editor. */
  onChange?: ((piece: Piece) => void) | null;
}) {
  let body: ReactNode = null;
  if (state === 'loading') {
    body = <div className="py-16 flex justify-center" role="status"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" aria-hidden="true" /><span className="sr-only">Loading</span></div>;
  } else if (state === 'gone') {
    body = <p className="py-12 px-6 text-center text-[0.9375rem] text-app-secondary">This piece isn’t here.</p>;
  } else if (state === 'failed') {
    body = (
      <div className="py-12 px-6 text-center">
        <p className="text-[0.9375rem] text-app-secondary">Couldn&apos;t load this. Check your connection and try again.</p>
        <button type="button" onClick={onRetry} className="mt-3 min-h-[2.75rem] px-4 rounded-xl border border-app-strong text-[0.9375rem] font-semibold text-app hover-bg-app">Try again</button>
      </div>
    );
  } else if (state && state.piece) {
    body = <PieceBody key={state.piece.id} piece={state.piece} firstName={firstName} owner={owner} target={target} view={state.view} />;
  }
  const editable = onChange && state && typeof state === 'object' && state.view === 'owner' && state.piece ? state.piece : null;
  return (
    <Screen
      open={state !== null}
      onClose={onClose}
      title="Piece"
      right={editable ? (
        <button type="button" onClick={() => onChange!(editable)} className="min-h-[2.75rem] px-3 rounded-lg text-[0.9375rem] font-semibold text-app-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]">
          Change
        </button>
      ) : null}
    >
      {body}
    </Screen>
  );
}
