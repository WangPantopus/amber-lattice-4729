'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Lock, Mail, Phone } from 'lucide-react';
import * as api from '@pantopus/api';
import type {
  ProfileDoor, ProfileLink, ProfileLinesBlock, ProfileMonthRead, ProfilePage, ProfilePageSummary, ProfilePageTab,
  ProfilePieceRead, ProfilePreviewView, ProfileCanDoBlock, ProfilePiecesBlock, ProfileRoleLine, ProfileCircleRead,
} from '@pantopus/api';
import { buildGigPath, buildPlanPath, buildSupportTrainPath, buildUserProfilePath } from '@pantopus/utils';
import BottomSheet from '@/components/ui/BottomSheet';
import { MomentAvatar } from '@/components/moments/MomentLinks';
import { Blocks, HeaderLines, card, drawable, pieceInks, type BlockContext } from './blocks';
import { InkGlyph, InkLine, howText, type Target } from './ink';
import { RingMark, yearsText } from './RingArt';
import PieceView from './PieceView';
import PieceEditor, { type PieceEditorStart } from './PieceEditor';
import OwnerWork from './OwnerWork';
import RoleEditor from './RoleEditor';
import CircleView from './CircleView';

const SKIES: Record<string, string> = {
  day: '/profile-sources/sky-day.svg',
  dawn: '/profile-sources/sky-dawn.svg',
  evening: '/profile-sources/sky-evening-rain.svg',
  night: '/profile-sources/sky-night.svg',
};

/** The city's clock: the composed time first (the server-rendered page), then the time there, kept running. */
function useCityClock(tz: string | null | undefined, composed: string | null | undefined): string | null {
  const [time, setTime] = useState<string | null>(composed ?? null);
  useEffect(() => {
    if (!tz) return;
    let format: Intl.DateTimeFormat;
    try {
      format = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    } catch {
      return;
    }
    const tick = () => setTime(format.format(new Date()));
    tick();
    const timer = window.setInterval(tick, 20_000);
    return () => window.clearInterval(timer);
  }, [tz]);
  return time;
}

/** "8 months", "2 years": under 24 months in months, as board 1 writes them (contract 2.2). */
export function monthsText(months: number): string {
  const m = Math.max(0, Math.round(months));
  if (m < 24) return `${m} ${m === 1 ? 'month' : 'months'}`;
  return `${Math.round(m / 12)} years`;
}

/** "November 23, 2026" from YYYY-MM-DD, read as a calendar day (no time zone shift). */
export function dayText(value: string | null | undefined): string | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** The tabs this page can draw: known blocks only, empty tabs left out (contract 0). */
export function drawnTabs(page: ProfilePage): ProfilePageTab[] {
  return (Array.isArray(page.tabs) ? page.tabs : [])
    .filter((tab) => tab && typeof tab.key === 'string')
    .map((tab) => ({ ...tab, blocks: (Array.isArray(tab.blocks) ? tab.blocks : []).filter(drawable) }))
    .filter((tab) => tab.blocks.length > 0);
}

/** The first tab's opening group of untitled lines (`key_lines`) sits in the header card (board 1). */
function splitHeaderLines(tab: ProfilePageTab | undefined) {
  const blocks = tab?.blocks ?? [];
  const first = blocks[0] as ProfileLinesBlock | undefined;
  if (first?.kind === 'lines' && (first.id === 'key_lines' || !first.title)) return { header: first, rest: blocks.slice(1) };
  return { header: null, rest: blocks };
}

function SummaryWell({ summary, onOpenRecord }: { summary: ProfilePageSummary; onOpenRecord: (() => void) | null }) {
  const parts = ([
    ['seen', summary.seen_months],
    ['signed', summary.signed_months],
    ['said', summary.said_months],
  ] as const).filter(([, months]) => typeof months === 'number' && months > 0);
  return (
    <div className="mx-4 rounded-2xl bg-app-surface-sunken px-3.5 py-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[0.9375rem] leading-[1.3125rem] font-semibold text-app">{yearsText(summary.years)}</p>
        {onOpenRecord ? (
          <button type="button" onClick={onOpenRecord} className="min-h-[2.75rem] -my-3 text-[0.8125rem] font-semibold text-app-link hover:underline print:hidden">
            Open the record
          </button>
        ) : null}
      </div>
      {parts.length > 0 ? (
        <>
          <div aria-hidden="true" className="flex items-center gap-[3px] h-2">
            {parts.map(([ink, months]) => (
              <i
                key={ink}
                className={`block rounded-sm min-w-[6px] ${ink === 'seen' ? 'h-[5px] bg-[rgb(var(--app-text))]' : ink === 'signed' ? 'h-[1.5px] bg-[rgb(var(--app-text))]' : 'h-[2px] bg-[repeating-linear-gradient(90deg,rgb(var(--app-text-muted))_0_2px,transparent_2px_5px)]'}`}
                style={{ flexGrow: months, flexBasis: 0 }}
              />
            ))}
          </div>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2">
            {parts.map(([ink, months]) => (
              <div key={ink}>
                <dt className="flex items-center gap-1.5 text-xs leading-4 font-semibold text-app-strong"><InkGlyph ink={ink} inline />{howText(ink)}</dt>
                <dd className="text-xs leading-4 text-app-muted">{monthsText(months)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </div>
  );
}

/** What Seen, Signed and Said mean (board 12's "How to read a line"). */
function InksExplainer({ open, onClose, firstName }: { open: boolean; onClose: () => void; firstName: string }) {
  const row = 'grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 items-start text-[0.9375rem] leading-[1.3125rem] text-app';
  return (
    <BottomSheet open={open} onClose={onClose} title="How to read a line">
      <div className="pb-2 flex flex-col gap-3">
        <div className={row}><InkGlyph ink="seen" /><p><strong>Seen.</strong> Pantopus&apos;s own records show it happened.</p></div>
        <div className={row}><InkGlyph ink="signed" /><p><strong>Signed.</strong> The named person, business or issuer confirmed it.</p></div>
        <div className={row}><InkGlyph ink="said" /><p><strong>Said.</strong> {firstName}&apos;s own words.</p></div>
      </div>
    </BottomSheet>
  );
}

/** A month of the rings, or a piece, opened in a sheet (contract 5). */
type Opened =
  | { kind: 'month'; month: string; state: 'loading' | 'gone' | 'failed' | ProfileMonthRead }
  | { kind: 'piece'; id: string; state: 'loading' | 'gone' | 'failed' | ProfilePieceRead };

function OpenedSheet({ opened, onClose, onRetry }: { opened: Opened | null; onClose: () => void; onRetry: () => void }) {
  const state = opened?.state;
  let title = opened?.kind === 'month' ? 'This month' : 'This piece';
  let body: ReactNode = null;
  if (state === 'loading') {
    body = <div className="py-10 flex justify-center" role="status"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" aria-hidden="true" /><span className="sr-only">Loading</span></div>;
  } else if (state === 'gone') {
    body = <p className="py-6 text-center text-[0.9375rem] text-app-secondary">{opened?.kind === 'month' ? 'Nothing to show for this month.' : 'This piece isn’t here.'}</p>;
  } else if (state === 'failed') {
    body = (
      <div className="py-6 text-center">
        <p className="text-[0.9375rem] text-app-secondary">Couldn&apos;t load this. Check your connection and try again.</p>
        <button type="button" onClick={onRetry} className="mt-3 min-h-[2.75rem] px-4 rounded-xl border border-app-strong text-[0.9375rem] font-semibold text-app hover-bg-app">Try again</button>
      </div>
    );
  } else if (state && typeof state === 'object' && 'lines' in state) {
    title = state.title || title;
    body = (
      <div className="flex flex-col gap-3">
        {state.subtitle ? <p className="-mt-1 text-xs leading-4 text-app-muted">{state.subtitle}</p> : null}
        {(state.lines || []).filter((line) => line?.text).map((line, i) => <InkLine key={i} line={line} />)}
      </div>
    );
  }
  return (
    <BottomSheet open={Boolean(opened)} onClose={onClose} title={title}>
      <div className="pb-2">{body}</div>
    </BottomSheet>
  );
}

// "Save as PDF" (SPEC phase 1): the page alone, every tab in order, in the light theme, with nothing of the app around
// it (bars, menus, buttons, sheets). Ancestors of the page stay as plain blocks; everything else is not printed.
const PRINT_CSS = `
@media print {
  @page { margin: 14mm 12mm; }
  html, body { background: #fff !important; }
  body *:not(:has(.profile-sources)):not(.profile-sources):not(.profile-sources *) { display: none !important; }
  body *:has(.profile-sources) {
    display: block !important; position: static !important; margin: 0 !important; padding: 0 !important;
    width: auto !important; max-width: none !important; min-height: 0 !important; height: auto !important;
    overflow: visible !important; border: 0 !important; box-shadow: none !important; background: #fff !important;
    transform: none !important;
  }
  .profile-sources {
    color-scheme: light;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    --app-bg: 255 255 255; --app-surface: 255 255 255; --app-surface-sunken: 243 244 246;
    --app-border: 229 231 235; --app-border-subtle: 243 244 246; --app-border-strong: 209 213 219;
    --app-text: 17 24 39; --app-text-strong: 31 41 55; --app-text-secondary: 78 85 99; --app-text-muted: 95 103 117;
    --color-link: #0369A1;
    --color-identity-home: #15803D; --color-identity-business: #7C3AED; --color-identity-personal: #0369A1;
  }
  .profile-sources section { break-inside: avoid; box-shadow: none !important; }
  .profile-sources .lg\\:sticky { position: static !important; }
}
`;

export interface SourcesProfileProps {
  page: ProfilePage;
  /** The signed-in viewer's account id ('' signed out). */
  viewerId: string;
  /** Connect and Message, Edit profile and Preview as, or Join: today's buttons. */
  actions?: ReactNode;
  /** Under the header card: what only the owner sees (tips). */
  afterHeader?: ReactNode;
  /** After the page: the owner's month, account list and Log out. */
  afterPage?: ReactNode;
  /** Signed in and not blocked: pinned posts read themselves. */
  postsReadable: boolean;
  /** The owner's Preview as: the page is to look at, not to act on, and opened months and pieces read as that view. */
  previewAs?: ProfilePreviewView | null;
  /** A link for one purpose: its months and pieces open through the same link. */
  viaLink?: { username: string; key: string } | null;
  signedOut?: boolean;
  /** A door was used (phase 3), or Leave your card. */
  onDoor?: (door: ProfileDoor | { key: 'leave_card' }) => void;
  /** More closer's Ask to connect. */
  onConnect?: () => void;
  onReport?: (() => void) | null;
  onJoin?: (() => void) | null;
  /** The owner (not previewing): their Work can be changed here; call after a change to read the page again. */
  onChanged?: (() => void) | null;
  /** False while this is a stand-in page (a signed-in visit draws the visitor's page first): it opens no piece. */
  ready?: boolean;
}

/**
 * A profile with sources (contract v1): the header card with the rings, then the server's tabs and blocks. A kind
 * this page doesn't know is skipped, a tab with nothing to draw is not drawn, and one tab left means no tab bar.
 * Every tab prints, in order, so "Save as PDF" gives the whole page.
 */
export default function SourcesProfile({
  page, viewerId, actions, afterHeader, afterPage, postsReadable, previewAs = null, viaLink = null, signedOut = false,
  onDoor, onConnect, onReport, onJoin, onChanged = null, ready = true,
}: SourcesProfileProps) {
  const router = useRouter();
  const tabsId = useId();
  const header = page.header;
  const personId = String(header.user_id || '');
  const name = header.name?.trim() || 'Pantopus member';
  const firstName = header.first_name?.trim() || name.split(/\s+/)[0];
  const inert = Boolean(previewAs);
  // The owner changes their Work here (phase 2): an empty Work still has its tab for them, with "Add a piece".
  const owner = page.view === 'owner' && !previewAs && Boolean(onChanged);
  // The first tab's key lines sit in the header card; a first tab left with nothing else is not drawn as a tab.
  const { headerLines, tabs } = useMemo(() => {
    const all = drawnTabs(page);
    const split = splitHeaderLines(all[0]);
    const rest = all.map((tab, i) => (i === 0 ? { ...tab, blocks: split.rest } : tab)).filter((tab) => tab.blocks.length > 0);
    if (owner && !rest.some((tab) => tab.key === 'work')) rest.splice(Math.min(1, rest.length), 0, { key: 'work', title: 'Work', blocks: [] });
    return { headerLines: split.header, tabs: rest };
  }, [page, owner]);
  const [editing, setEditing] = useState<PieceEditorStart | null>(null);
  // Credits are on when the owner's asks can be read (the server's PROFILE_TIES).
  const [tiesOn, setTiesOn] = useState(false);
  // The work circle opened (board 9), and whether this page put `?circle=1` in the history.
  const [circle, setCircle] = useState<'loading' | 'failed' | ProfileCircleRead | null>(null);
  const pushedCircle = useRef(false);
  const circleRound = useRef(0);
  // A role or school being added (`role: null`) or changed.
  const [roleEdit, setRoleEdit] = useState<{ role: ProfileRoleLine | null } | null>(null);
  // Each new read of the page (after a change) reads the owner's offers again.
  const [pageRound, setPageRound] = useState(0);
  useEffect(() => { setPageRound((n) => n + 1); }, [page]);
  const workBlocks = useMemo(() => tabs.find((tab) => tab.key === 'work')?.blocks ?? [], [tabs]);
  const skillsSuggested = useMemo(() => workBlocks.flatMap((block) => (block.kind === 'can_do'
    ? ((block as ProfileCanDoBlock).skills || []).map((skill) => skill.name || skill.text).filter(Boolean) : [])), [workBlocks]);
  const pinnedCount = (workBlocks.find((block) => block.kind === 'pieces' && block.id === 'pinned') as ProfilePiecesBlock | undefined)?.pieces?.length ?? 0;
  const pieces = useMemo(() => pieceInks(tabs.flatMap((tab) => tab.blocks)), [tabs]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const openRound = useRef(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const shownKey = tabs.some((tab) => tab.key === activeKey) ? activeKey! : tabs[0]?.key ?? null;
  const place = header.place && header.place.label ? header.place : null;
  const sky = place ? SKIES[String(place.sky || '').split('_')[0]] ?? null : null;
  const clock = useCityClock(place?.time ? place.tz : null, place?.time);
  const placeText = place ? [place.label, clock].filter(Boolean).join(' · ') : null;
  const seenAs = header.seen_as?.trim() || null;
  const accountName = header.account_name?.trim() && header.account_name.trim() !== name ? header.account_name.trim() : null;
  const asOf = dayText(page.footer?.as_of);
  const contact = (page.actions || []).filter((action) => (action.kind === 'call' && action.phone) || (action.kind === 'email' && action.email));

  const openTab = useCallback((key: string) => {
    setActiveKey(key);
    requestAnimationFrame(() => {
      tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById(`${tabsId}-${key}-tab`)?.focus({ preventScroll: true });
    });
  }, [tabsId]);

  const load = useCallback((what: { kind: 'month'; month: string } | { kind: 'piece'; id: string }, quiet = false) => {
    const round = ++openRound.current;
    pieceLoading.current = what.kind === 'piece' ? what.id : null;
    const options = previewAs ? { as: previewAs } : undefined;
    setOpened({ ...what, state: 'loading' } as Opened);
    const read: Promise<ProfileMonthRead | ProfilePieceRead> = viaLink
      ? (what.kind === 'month'
        ? api.profilePage.getLinkMonth(viaLink.username, viaLink.key, what.month)
        : api.profilePage.getLinkPiece(viaLink.username, viaLink.key, what.id))
      : what.kind === 'month'
        ? api.profilePage.getMonth(personId, what.month, options)
        : api.profilePage.getPiece(personId, what.id, options);
    read.then(
      (value) => { if (round === openRound.current && mountedRef.current) setOpened({ ...what, state: value } as Opened); },
      (err: { statusCode?: number } | null) => {
        // A page that is already gone (a signed-in visit draws the visitor's page for a moment first) does nothing,
        // so it never takes the piece out of the address before the viewer's own page reads it.
        if (round !== openRound.current || !mountedRef.current) return;
        // A piece opened from its address that this viewer may not see: the plain profile, nothing said about it.
        // Opened from its address: whatever stops it (404, a failed read), nothing opens and the address loses ?piece.
        if (quiet) { dropPieceAddress.current(); return; }
        setOpened({ ...what, state: err?.statusCode === 404 ? 'gone' : 'failed' } as Opened);
      },
    );
  }, [personId, previewAs, viaLink]);

  // An opened piece has its own address, `?piece=<id>` on this page (board 8 is a screen of its own on a phone): the
  // browser's Back closes it, a reload opens it again, and the address can be sent. Kept in the browser's own history
  // (opening one asks the server for the piece and nothing else); Back and Forward are followed through `popstate`.
  const pushedPiece = useRef(false);
  const pieceLoading = useRef<string | null>(null);
  const pieceInAddress = () => {
    const id = new URLSearchParams(window.location.search).get('piece');
    return id && /^[0-9a-f-]{8,64}$/i.test(id) ? id : null;
  };
  const addressFor = (id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set('piece', id); else params.delete('piece');
    const query = params.toString();
    return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  };
  const dropPieceAddress = useRef(() => {});
  dropPieceAddress.current = () => {
    openRound.current += 1;
    setOpened(null);
    pushedPiece.current = false;
    pieceLoading.current = null;
    if (pieceInAddress()) window.history.replaceState(window.history.state, '', addressFor(null));
  };
  const openPiece = useCallback((id: string) => {
    if (pieceInAddress() !== id) {
      window.history.pushState(window.history.state, '', addressFor(id));
      pushedPiece.current = true;
    }
    load({ kind: 'piece', id });
  }, [load]);
  const closePiece = useCallback(() => {
    if (pushedPiece.current) { pushedPiece.current = false; window.history.back(); return; }
    dropPieceAddress.current();
  }, []);
  const loadCircle = useCallback((quiet = false) => {
    const round = ++circleRound.current;
    // Open from now on, so the address isn't followed into a second read.
    circleOpen.current = true;
    setCircle('loading');
    const read = viaLink ? api.profilePage.getLinkCircle(viaLink.username, viaLink.key) : api.profilePage.getCircle(personId, previewAs ? { as: previewAs } : undefined);
    Promise.resolve(read).then(
      (value) => { if (round === circleRound.current && mountedRef.current) setCircle(value); },
      () => {
        if (round !== circleRound.current || !mountedRef.current) return;
        // Opened from its address and it doesn't open (404, a failed read): the plain page, the address cleaned.
        if (quiet) { dropCircleAddress(); return; }
        setCircle('failed');
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dropCircleAddress reads only refs and the address
  }, [personId, previewAs, viaLink]);
  const circleInAddress = () => new URLSearchParams(window.location.search).get('circle') === '1';
  const circleAddress = (on: boolean) => {
    const params = new URLSearchParams(window.location.search);
    if (on) params.set('circle', '1'); else params.delete('circle');
    const query = params.toString();
    return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  };
  const dropCircleAddress = () => {
    circleRound.current += 1;
    circleOpen.current = false;
    setCircle(null);
    pushedCircle.current = false;
    if (circleInAddress()) window.history.replaceState(window.history.state, '', circleAddress(false));
  };
  const openCircle = useCallback(() => {
    if (!circleInAddress()) {
      window.history.pushState(window.history.state, '', circleAddress(true));
      pushedCircle.current = true;
    }
    loadCircle();
  }, [loadCircle]);
  const closeCircle = () => {
    if (pushedCircle.current) { pushedCircle.current = false; window.history.back(); return; }
    dropCircleAddress();
  };
  const circleOpen = useRef(false);
  if (circle !== null) circleOpen.current = true;
  const readCirclePieces = useCallback((userId: string) => (viaLink
    ? api.profilePage.getLinkCirclePieces(viaLink.username, viaLink.key, userId)
    : api.profilePage.getCirclePieces(personId, userId, previewAs ? { as: previewAs } : undefined)), [personId, previewAs, viaLink]);

  const followAddress = useRef(() => {});
  const mountedRef = useRef(false);
  followAddress.current = () => {
    // The circle's address (`?circle=1`), then a piece's.
    if (circleInAddress()) { if (!circleOpen.current) loadCircle(true); } else if (circleOpen.current) { pushedCircle.current = false; circleRound.current += 1; circleOpen.current = false; setCircle(null); }
    const id = pieceInAddress();
    if (id) {
      // Opened from its address (a reload, a sent link, Forward): a piece this viewer may not see opens nothing.
      // One read: not again while the same piece is being read or is open.
      if (pieceLoading.current !== id) load({ kind: 'piece', id }, true);
    } else if (pieceLoading.current) {
      pushedPiece.current = false;
      pieceLoading.current = null;
      openRound.current += 1;
      setOpened(null);
    }
  };
  useEffect(() => {
    mountedRef.current = true;
    const onPop = () => followAddress.current();
    window.addEventListener('popstate', onPop);
    return () => { mountedRef.current = false; window.removeEventListener('popstate', onPop); };
  }, []);
  // `?tab=work` (the notification "asked you to sign" links there): open that tab on arrival, once.
  const tabFromAddress = useRef(false);
  useEffect(() => {
    if (!ready || tabFromAddress.current) return;
    const key = new URLSearchParams(window.location.search).get('tab');
    if (!key) return;
    // Opened and scrolled to, as a tap on the tab would (the arrival is for that tab).
    if (tabs.some((tab) => tab.key === key)) { tabFromAddress.current = true; openTab(key); }
  }, [ready, tabs, openTab]);
  // The address is followed once the page is this viewer's own (`ready`): a signed-in visit draws the visitor's page
  // for a moment first, and that page reads nothing.
  useEffect(() => {
    if (ready) followAddress.current();
  }, [ready]);

  const target = useCallback((link: ProfileLink | null | undefined): Target | null => {
    if (!link || typeof link !== 'object' || typeof link.kind !== 'string') return null;
    const value = (key: string) => {
      const v = (link as Record<string, unknown>)[key];
      return typeof v === 'string' && v ? v : null;
    };
    switch (link.kind) {
      case 'tab': { const tab = value('tab'); return tab && tabs.some((t) => t.key === tab) ? { onClick: () => openTab(tab) } : null; }
      case 'record': return tabs.some((t) => t.key === 'record') ? { onClick: () => openTab('record') } : null;
      case 'month': { const month = value('month'); return month && /^\d{4}-\d{2}$/.test(month) ? { onClick: () => load({ kind: 'month', month }) } : null; }
      case 'piece': {
        const id = value('id');
        if (!id) return null;
        // A piece signed on someone else's work ("With Maria Kovács") opens on its owner's page.
        const who = value('username') ?? value('user_id');
        const owner = value('user_id');
        if (who && (owner ? owner !== personId : value('username') !== header.username)) {
          const path = value('username') ? `/${encodeURIComponent(value('username')!)}` : `/u/${encodeURIComponent(owner!)}`;
          return { href: `${path}?piece=${encodeURIComponent(id)}` };
        }
        return { onClick: () => openPiece(id) };
      }
      case 'business': { const username = value('username'); return username ? { href: `/b/${encodeURIComponent(username)}` } : null; }
      case 'profile': { const who = value('username') ?? value('user_id'); return who ? { href: buildUserProfilePath(who) } : null; }
      case 'plan': { const id = value('id'); return id ? { href: buildPlanPath(id) } : null; }
      case 'gig': { const id = value('id'); return id ? { href: buildGigPath(id) } : null; }
      case 'support_train': { const id = value('id'); return id ? { href: buildSupportTrainPath(id) } : null; }
      case 'posts': {
        const who = header.username || value('user_id');
        // Beside the profile itself, so the app's bar and menu stay around it.
        return who ? { href: `/${encodeURIComponent(who)}/posts` } : null;
      }
      case 'moments': {
        const id = value('user_id');
        // From a link for one purpose, back to the person's main page: its key never rides in another address.
        const back = viaLink ? `/${encodeURIComponent(viaLink.username)}` : window.location.pathname;
        return id ? { onClick: () => router.push(`/app/moments?person=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(back)}`) } : null;
      }
      case 'url': { const url = value('url'); return url && /^https?:\/\//i.test(url) ? { href: url, external: true } : null; }
      case 'circle': return { onClick: () => openCircle() };
      default: return null;
    }
  }, [tabs, openTab, load, openPiece, openCircle, header.username, personId, router, viaLink]);

  const closeOpened = useCallback(() => { openRound.current += 1; setOpened(null); }, []);
  const personTarget = useCallback(
    (who: { user_id: string | null; username: string | null }) => target({ kind: 'profile', user_id: who.user_id, username: who.username } as ProfileLink),
    [target],
  );

  const ctx: BlockContext = {
    firstName, personId, viewerId, postsReadable, inert, target, pieces,
    onEditRole: owner ? (role: ProfileRoleLine) => setRoleEdit({ role }) : null,
    onDoor: onDoor ?? (() => {}),
    onConnect: onConnect ?? (() => {}),
  };

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.key === shownKey);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setActiveKey(tabs[next].key);
    document.getElementById(`${tabsId}-${tabs[next].key}-tab`)?.focus();
  };

  const chip = 'inline-flex items-center gap-1.5 min-h-7 py-1 px-2.5 rounded-full text-xs leading-4 font-semibold';
  const headerCard = (
    <section aria-label={name} className={`${card} relative overflow-hidden flex flex-col`}>
      {sky || placeText || seenAs ? (
        <div className={`relative ${sky ? 'min-h-[132px]' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {sky ? <img src={sky} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" /> : null}
          {/* The two chips share a row and wrap at large text sizes rather than covering each other. */}
          <div className={`relative p-2.5 flex flex-wrap items-start justify-between gap-2 ${sky ? 'pb-[92px]' : ''}`}>
            {placeText ? <span className={`${chip} bg-gray-900 text-white`}>{placeText}</span> : <span />}
            {seenAs ? (
              <span className={`${chip} ${sky ? 'bg-white text-gray-900' : 'bg-app-surface-sunken text-app'}`}>
                <Eye aria-hidden="true" className="w-[13px] h-[13px] shrink-0" strokeWidth={2.2} />{seenAs}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={`self-center ${sky ? '-mt-[88px]' : placeText || seenAs ? 'mt-1' : 'mt-6'}`}>
        <RingMark
          rings={header.rings}
          name={name}
          hasName={Boolean(header.name?.trim())}
          photoUrl={header.portrait_url}
          seed={personId}
          // Moments open with this page's address to come back to; a link for one purpose keeps its key to itself.
          wrapPortrait={viaLink ? undefined : (portrait) => <MomentAvatar id={personId} name={name} mark={false}>{portrait}</MomentAvatar>}
        />
      </div>
      <div className="px-5 pt-1.5 pb-4 flex flex-col items-center gap-0.5 text-center">
        <h1 className="text-[1.875rem] leading-9 font-bold tracking-[-0.02em] text-app [overflow-wrap:anywhere]">{name}</h1>
        {header.headline ? <p className="text-[0.9375rem] leading-[1.3125rem] text-app-secondary [overflow-wrap:anywhere]">{header.headline}</p> : null}
        {accountName ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-left text-[0.8125rem] leading-[1.125rem] text-app-muted print:hidden">
            <Lock aria-hidden="true" className="mt-0.5 w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            <span>Your account name, {accountName}, stays private.</span>
          </p>
        ) : null}
      </div>
      {actions || contact.length > 0 ? (
        <div className="px-4 pb-4 flex flex-col gap-2.5 print:hidden">
          {actions}
          {contact.length > 0 ? (
            <div className="flex flex-wrap gap-2.5 [&>*]:flex-1 [&>*]:basis-[8rem]">
              {contact.map((action) => (
                <a
                  key={action.kind}
                  href={action.kind === 'call' ? `tel:${String(action.phone).replace(/[^\d+]/g, '')}` : `mailto:${action.email}`}
                  aria-disabled={inert || undefined}
                  tabIndex={inert ? -1 : undefined}
                  onClick={inert ? (e) => e.preventDefault() : undefined}
                  className="min-h-[3rem] px-4 py-2 rounded-xl inline-flex items-center justify-center gap-2 border border-app-strong bg-surface text-[1.0625rem] font-semibold text-app hover-bg-app"
                >
                  {action.kind === 'call' ? <Phone aria-hidden="true" className="w-[1.125rem] h-[1.125rem]" /> : <Mail aria-hidden="true" className="w-[1.125rem] h-[1.125rem]" />}
                  {action.kind === 'call' ? 'Call' : 'Email'}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {page.summary ? <SummaryWell summary={page.summary} onOpenRecord={tabs.length > 1 && tabs.some((t) => t.key === 'record') ? () => openTab('record') : null} /> : null}
      {headerLines ? <div className="px-5 pt-4 pb-5" inert={inert || undefined}><HeaderLines block={headerLines} ctx={ctx} /></div> : <div className="h-4" />}
    </section>
  );

  return (
    <div className="profile-sources">
      <style>{PRINT_CSS}</style>
      <div className="lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-x-10 xl:gap-x-14 lg:items-start">
        <div className="min-w-0 flex flex-col gap-3 lg:sticky lg:top-4">
          {headerCard}
          {afterHeader}
        </div>
        <div className="min-w-0 mt-3 lg:mt-0">
          {tabs.length > 1 ? (
            <div ref={tabsRef} role="tablist" aria-label={`${firstName}'s profile`} className="scroll-mt-2 flex bg-surface border-y border-app -mx-5 lg:mx-0 lg:rounded-xl lg:border print:hidden">
              {tabs.map((tab) => {
                const active = tab.key === shownKey;
                return (
                  <button
                    key={tab.key}
                    id={`${tabsId}-${tab.key}-tab`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`${tabsId}-${tab.key}-panel`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setActiveKey(tab.key)}
                    onKeyDown={moveTab}
                    className={`flex-1 min-h-[2.75rem] px-2 border-b-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--color-link)] ${active ? 'border-[var(--color-link)] text-app-link' : 'border-transparent text-app-secondary hover:text-app'}`}
                  >
                    {tab.title}
                  </button>
                );
              })}
            </div>
          ) : null}
          {tabs.map((tab) => {
            const active = tab.key === shownKey;
            const blocks = tab.blocks;
            return (
              <div
                key={tab.key}
                role={tabs.length > 1 ? 'tabpanel' : undefined}
                id={`${tabsId}-${tab.key}-panel`}
                aria-labelledby={tabs.length > 1 ? `${tabsId}-${tab.key}-tab` : undefined}
                className={`${active ? 'flex' : 'hidden print:flex'} flex-col gap-3 pt-3`}
                inert={inert || undefined}
              >
                {tabs.length > 1 ? <h2 className="hidden print:block break-after-avoid text-lg font-bold text-app pt-2">{tab.title}</h2> : null}
                {owner && tab.key === 'work' ? (
                  <OwnerWork
                    round={pageRound}
                    onAdd={() => setEditing({ kind: 'new' })}
                    onOffer={(offer) => setEditing({ kind: 'offer', offer })}
                    onTies={setTiesOn}
                    onAnswered={() => onChanged?.()}
                    onAddRole={() => setRoleEdit({ role: null })}
                  />
                ) : null}
                <Blocks blocks={blocks} ctx={ctx} keyPrefix={tab.key} />
              </div>
            );
          })}
          {page.footer?.text ? (
            <footer className="mt-6 px-4 flex flex-col items-center gap-1.5 text-center">
              <p className="text-[0.8125rem] leading-[1.125rem] text-app">{page.footer.text}</p>
              {asOf ? <p className="text-xs leading-4 text-app-muted">As of {asOf}</p> : null}
              <p className="text-xs leading-4 text-app-muted print:hidden">
                <button type="button" onClick={() => setExplainerOpen(true)} className="min-h-[2.75rem] font-semibold text-app-link hover:underline">What Seen, Signed and Said mean</button>
                {onReport ? (
                  <>
                    {' · '}
                    <button type="button" onClick={onReport} disabled={inert} className="min-h-[2.75rem] font-semibold text-app-link hover:underline disabled:no-underline">Report this page</button>
                  </>
                ) : null}
              </p>
            </footer>
          ) : null}
          {signedOut && onJoin ? (
            <div className="mt-5 flex flex-col items-stretch gap-2 print:hidden">
              <button type="button" onClick={onJoin} disabled={inert} className="min-h-[3rem] rounded-xl bg-primary-600 px-4 text-[1.0625rem] font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
                Make your own profile
              </button>
              <p className="text-center text-xs leading-4 text-app-muted">Free. It starts with your home address.</p>
            </div>
          ) : null}
          {afterPage}
        </div>
      </div>
      <InksExplainer open={explainerOpen} onClose={() => setExplainerOpen(false)} firstName={firstName} />
      <OpenedSheet
        opened={opened?.kind === 'month' ? opened : null}
        onClose={closeOpened}
        onRetry={() => { if (opened?.kind === 'month') load({ kind: 'month', month: opened.month }); }}
      />
      <PieceView
        state={opened?.kind === 'piece' ? opened.state : null}
        onClose={closePiece}
        onRetry={() => { if (opened?.kind === 'piece') load({ kind: 'piece', id: opened.id }); }}
        firstName={firstName}
        owner={{ name, portraitUrl: header.portrait_url ?? null }}
        target={personTarget}
        onChange={owner ? (piece) => setEditing({ kind: 'edit', piece }) : null}
        viewerId={viewerId}
        onNameOff={() => { if (opened?.kind === 'piece') load({ kind: 'piece', id: opened.id }); onChanged?.(); }}
      />
      <CircleView
        open={circle !== null}
        state={circle}
        onClose={closeCircle}
        onRetry={() => loadCircle()}
        firstName={firstName}
        center={{ name, portraitUrl: header.portrait_url ?? null }}
        readPieces={readCirclePieces}
        target={target}
      />
      {owner ? (
        <PieceEditor
          start={editing}
          onClose={() => setEditing(null)}
          onSaved={({ id }) => {
            setEditing(null);
            onChanged?.();
            if (opened?.kind === 'piece' && opened.id === id) load({ kind: 'piece', id });
          }}
          onRemoved={(id) => {
            setEditing(null);
            if (opened?.kind === 'piece' && opened.id === id) closePiece();
            onChanged?.();
          }}
          skillsSuggested={skillsSuggested}
          pinnedCount={pinnedCount}
          tiesOn={tiesOn}
        />
      ) : null}
      {owner ? (
        <RoleEditor
          open={Boolean(roleEdit)}
          role={roleEdit?.role ?? null}
          onClose={() => setRoleEdit(null)}
          onSaved={() => { setRoleEdit(null); onChanged?.(); }}
        />
      ) : null}
    </div>
  );
}
