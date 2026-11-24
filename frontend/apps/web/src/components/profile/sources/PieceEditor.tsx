'use client';

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Check, Copy, FileText, Image as ImageIcon, Link2, Play, Video, X } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfileInk, ProfileLinkCard, ProfilePieceFields, ProfilePieceOffer } from '@pantopus/api';
import { extractApiError } from '@/lib/auth-utils';
import Screen from './Screen';
import Picture from './Picture';
import { LinkCardView, type Piece } from './PieceView';
import { InkGlyph } from './ink';
import CreditsField, { type QueuedCredit } from './CreditsField';
import { toast } from '@/components/ui/toast-store';
import { overline } from './blocks';

/** What the editor opens on: a new piece, one started from a job or plan Pantopus saw, or a piece to change. */
export type PieceEditorStart = { kind: 'new' } | { kind: 'offer'; offer: ProfilePieceOffer } | { kind: 'edit'; piece: Piece };

const LIMIT = 12;
const TITLE_MAX = 60;
const WORDS_MAX = 280;
const ROLE_MAX = 40;
const SKILLS_MAX = 5;
const MB = 1024 * 1024;

type FileKind = 'photo' | 'video' | 'document';
// What today's upload path takes (backend/routes/files.js); checked here only to say so before uploading.
const FILE_KINDS: Record<FileKind, { accept: string; types: RegExp; max: number; word: string }> = {
  photo: { accept: 'image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif', types: /\.(jpe?g|png|gif|webp|heic|heif)$/i, max: 10 * MB, word: 'photo' },
  video: { accept: 'video/mp4,video/quicktime,video/webm,.mov', types: /\.(mp4|mov|webm)$/i, max: 100 * MB, word: 'video' },
  document: { accept: '.pdf,.doc,.docx,.txt,application/pdf', types: /\.(pdf|docx?|txt)$/i, max: 25 * MB, word: 'document' },
};

interface Item {
  key: string;
  kind: FileKind;
  fileId: string | null;
  preview: string | null;
  name: string;
  state: 'uploading' | 'ready' | 'failed';
  error?: string;
}

interface LinkItem {
  key: string;
  url: string;
  /** The server's card, for a link the piece already has. */
  card: ProfileLinkCard | null;
  /** Words read for a new link before saving (no picture). */
  words: { title: string | null; site: string | null; description: string | null } | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const AUDIENCES: Array<{ key: 'anyone' | 'members' | 'connections'; label: string; detail: string }> = [
  { key: 'anyone', label: 'Anyone with your link', detail: 'As your Work part allows' },
  { key: 'members', label: 'People on Pantopus', detail: 'Signed in' },
  { key: 'connections', label: 'Your connections', detail: 'Only people you are connected to' },
];

let counter = 0;
const nextKey = () => `k${(counter += 1)}`;

/** "April 12, 2026" or "2026-04" → "2026-04". */
function monthOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const words = new RegExp(`^(${MONTHS.join('|')})\\b.*?(\\d{4})`).exec(value);
  if (words) return `${words[2]}-${String(MONTHS.indexOf(words[1]) + 1).padStart(2, '0')}`;
  return null;
}

/** "Camas, WA" → city and state; anything with a number in it is not taken (city only, never an address). */
function placeOf(text: string): { city: string | null; state: string | null; error: string | null } {
  const value = text.trim();
  if (!value) return { city: null, state: null, error: null };
  if (/\d/.test(value)) return { city: null, state: null, error: 'Just the city and state, never a street address.' };
  const comma = value.lastIndexOf(',');
  const city = (comma >= 0 ? value.slice(0, comma) : value).trim();
  const state = comma >= 0 ? value.slice(comma + 1).trim() : '';
  if (!city) return { city: null, state: null, error: 'Write the city first, then the state: "Camas, WA".' };
  return { city, state: state ? state.toUpperCase() : null, error: null };
}

/** A pasted link: http(s) only; a bare "site.com/page" gets https. */
function linkOf(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** "Seen: …", "Signed by …", "Said: …" lead with their ink; any other line has none. */
function lineInk(line: string): ProfileInk | null {
  const word = /^(Seen|Signed|Said)\b/.exec(line)?.[1];
  return word ? (word.toLowerCase() as ProfileInk) : null;
}

const field = 'w-full min-h-[3rem] rounded-xl border border-app-strong bg-surface px-3.5 py-2.5 text-[1.0625rem] text-app placeholder:text-app-muted focus:outline focus:outline-2 focus:outline-[color:var(--color-link)]';
const label = 'text-[0.9375rem] font-semibold text-app';

function Labelled({ id, title, count, note, children }: { id: string; title: string; count?: string | null; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={label}>{title}</label>
        {count ? <span className="text-xs text-app-muted" aria-live="polite">{count}</span> : null}
      </div>
      {children}
      {note ? <p className="text-xs leading-4 text-app-muted">{note}</p> : null}
    </div>
  );
}

/** "Prove it's yours" (board 11): a line to put on the page, then "Check now". Only for a link the piece has saved. */
/** One line to copy (the proof line, or the meta tag for a person's own site), under what it is for. */
function CopyLine({ text, label, title }: { text: string; label: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs leading-4 font-semibold text-app-secondary">{title}</p>
      <div className="flex items-center gap-2 rounded-xl border border-app bg-surface px-3 py-2">
        <code className="min-w-0 flex-1 text-[0.8125rem] text-app [overflow-wrap:anywhere]">{text}</code>
        <button
          type="button"
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          onClick={() => { navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => {}); }}
          className="shrink-0 min-h-[2.5rem] px-2.5 inline-flex items-center gap-1.5 rounded-lg text-[0.8125rem] font-semibold text-app-link hover-bg-app"
        >
          {copied ? <Check aria-hidden="true" className="w-4 h-4" /> : <Copy aria-hidden="true" className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/**
 * "Prove it's yours" (board 11): a line to put in the page's title or description (or, on the person's own site, a
 * meta tag), then "Check now". Only for a link the piece has saved. Every sentence about the rule and the outcome is
 * the server's (CONTRACT p2.4): the line counts only in the page's head.
 */
function ProveLink({ pieceId, card, onProven }: { pieceId: string; card: ProfileLinkCard; onProven: (card: ProfileLinkCard) => void }) {
  const [proof, setProof] = useState<{ line: string; how: string; meta?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // A page anyone can edit (a wiki) can't be proven: no button (p2.5 `provable`).
  if (!card.id || card.ink === 'seen' || card.provable === false) return null;
  const ask = async () => {
    setBusy(true); setNote(null);
    try { setProof(await api.profilePage.proveLink(pieceId, card.id!)); } catch (err) { setNote(extractApiError(err, 'Couldn’t start that. Try again.')); }
    setBusy(false);
  };
  const check = async () => {
    setBusy(true); setNote(null);
    try {
      onProven(await api.profilePage.checkLink(pieceId, card.id!));
      setProof(null);
    } catch (err) {
      // The server's own sentence, whether the line isn't in the page's head yet or the page can't be read.
      setNote(extractApiError(err, 'Couldn’t check the page. Try again.'));
    }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2">
      {proof ? (
        <>
          {/* The server's sentence first, then each box under what it is for. */}
          {proof.how ? <p className="text-[0.8125rem] leading-[1.125rem] text-app-secondary">{proof.how}</p> : null}
          <CopyLine text={proof.line} label="the line" title="For the page's title or description" />
          {proof.meta ? <CopyLine text={proof.meta} label="the meta tag" title="For your own site" /> : null}
          <button type="button" disabled={busy} onClick={check} className="self-start min-h-[2.75rem] px-4 rounded-xl bg-app-surface-sunken text-[0.9375rem] font-semibold text-app hover-bg-app disabled:opacity-60">
            {busy ? 'Checking…' : 'Check now'}
          </button>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={ask} className="self-start min-h-[2.75rem] px-4 rounded-xl bg-surface border border-app text-[0.9375rem] font-semibold text-app hover-bg-app disabled:opacity-60">
          Prove it&apos;s yours
        </button>
      )}
      {note ? <p role="alert" className="text-[0.8125rem] leading-[1.125rem] text-app-secondary">{note}</p> : null}
    </div>
  );
}

/**
 * Adding or changing a piece (board 10): the job or plan it started from, the title, kind, when and the city, up to
 * twelve photos, videos, documents and links through today's upload path, the person's own words, and "How this
 * piece will show" as the server works it out. Save a draft, add it to Work, pin it, choose who sees it, hide it or
 * remove it.
 */
export default function PieceEditor({ start, onClose, onSaved, onRemoved, skillsSuggested, pinnedCount, tiesOn = false }: {
  start: PieceEditorStart | null;
  onClose: () => void;
  onSaved: (piece: { id: string }) => void;
  onRemoved: (id: string) => void;
  skillsSuggested: string[];
  pinnedCount: number;
  /** Credits are on (the server's PROFILE_TIES): "Who was on it?" is drawn. */
  tiesOn?: boolean;
}) {
  if (!start) return null;
  const key = start.kind === 'edit' ? `edit-${start.piece.id}` : start.kind === 'offer' ? `offer-${start.offer.id}` : 'new';
  return <Editor key={key} start={start} onClose={onClose} onSaved={onSaved} onRemoved={onRemoved} skillsSuggested={skillsSuggested} pinnedCount={pinnedCount} tiesOn={tiesOn} />;
}

function Editor({ start, onClose, onSaved, onRemoved, skillsSuggested, pinnedCount, tiesOn }: {
  start: PieceEditorStart;
  onClose: () => void;
  onSaved: (piece: { id: string }) => void;
  onRemoved: (id: string) => void;
  skillsSuggested: string[];
  pinnedCount: number;
  tiesOn: boolean;
}) {
  const ids = { title: useId(), role: useId(), month: useId(), year: useId(), place: useId(), link: useId(), words: useId(), skill: useId() };
  const editing = start.kind === 'edit' ? start.piece : null;
  const offer = start.kind === 'offer' ? start.offer : null;
  const initialMonth = monthOf(editing ? editing.to ?? editing.from : offer?.when) ?? '';
  const initial = useMemo(() => ({
    // A job's title is the words of whoever posted it (it can carry a street, a name or a price), so the piece starts
    // untitled and the banner shows it to read. A plan the person hosted is their own words and may start the title.
    title: editing?.title ?? (offer?.kind === 'plan' ? offer.title : '') ?? '',
    kind: (editing?.kind as 'did' | 'built' | 'owns' | null | undefined) ?? null,
    month: initialMonth,
    place: editing?.place ?? '',
    words: editing?.description?.text ?? '',
    role: editing?.owner_role ?? '',
    skills: (editing?.shows_can ?? editing?.skills ?? []).filter(Boolean),
    audience: (editing?.audience as 'anyone' | 'members' | 'connections' | null | undefined) ?? 'anyone',
    pinned: Boolean(editing?.pinned),
    hidden: Boolean(editing?.hidden),
  }), [editing, offer, initialMonth]);
  const [title, setTitle] = useState(initial.title);
  const [kind, setKind] = useState(initial.kind);
  const [month, setMonth] = useState(initial.month);
  const [place, setPlace] = useState(initial.place);
  const [words, setWords] = useState(initial.words);
  const [role, setRole] = useState(initial.role);
  const [skills, setSkills] = useState<string[]>(initial.skills);
  const [skillDraft, setSkillDraft] = useState('');
  const [audience, setAudience] = useState(initial.audience);
  const [pinned, setPinned] = useState(initial.pinned);
  const [hidden, setHidden] = useState(initial.hidden);
  const [fromOffer, setFromOffer] = useState(Boolean(offer));
  const initialItems = useMemo<Item[]>(() => (editing?.attachments || [])
    .filter((a) => a && a.id && (a.kind === 'photo' || a.kind === 'video' || a.kind === 'document'))
    .map((a) => ({
      key: nextKey(), kind: a.kind as FileKind, fileId: a.id!, name: a.title || '',
      preview: a.thumbnail_url || (a.kind === 'photo' ? a.url : null), state: 'ready' as const,
    })), [editing]);
  const [items, setItems] = useState<Item[]>(initialItems);
  const initialLinks = useMemo<LinkItem[]>(() => (editing?.links || [])
    .filter((l) => l && typeof l.url === 'string')
    .map((l) => ({ key: nextKey(), url: l.url, card: l, words: null })), [editing]);
  const [links, setLinks] = useState<LinkItem[]>(initialLinks);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [showsLines, setShowsLines] = useState<string[] | null>(editing?.how_it_will_show ?? null);
  const [saving, setSaving] = useState<'draft' | 'work' | 'remove' | null>(null);
  // "Who was on it?": a saved piece's credits change at once (`creditsTouched` reads the piece again on close); a new
  // piece's names wait in `queued` and are asked once it is on the Work.
  const [queued, setQueued] = useState<QueuedCredit[]>([]);
  const creditsTouched = useRef(false);
  const showCredits = tiesOn && (editing ? Array.isArray(editing.credits) : true);
  const [error, setError] = useState<string | null>(null);
  const pickers = { photo: useRef<HTMLInputElement>(null), video: useRef<HTMLInputElement>(null), document: useRef<HTMLInputElement>(null) };
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const placeRead = placeOf(place);
  const used = items.length + links.length;
  const full = used >= LIMIT;
  const uploading = items.some((i) => i.state === 'uploading');
  const isDraft = editing ? Boolean(editing.draft) : true;

  // ── Uploads, one call a file through today's path; a retry lands once (client_request_id). ──
  const upload = (file: File, kindOf: FileKind, key: string) => {
    const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${key}`;
    Promise.resolve().then(() => api.files.uploadPortfolio(file, { client_request_id: requestId })).then(
      (res) => {
        if (!live.current) return;
        const thumb = res.file?.thumbnails?.medium || res.file?.thumbnails?.small || (kindOf === 'photo' ? res.file?.url : null) || null;
        setItems((list) => list.map((i) => (i.key === key ? { ...i, fileId: res.file.id, preview: thumb ?? i.preview, state: 'ready' } : i)));
      },
      (err) => {
        if (!live.current) return;
        setItems((list) => list.map((i) => (i.key === key ? { ...i, state: 'failed', error: extractApiError(err, `Couldn’t add ${file.name}.`) } : i)));
      },
    );
  };
  const pick = (kindOf: FileKind) => (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    const room = LIMIT - used;
    const notes: string[] = [];
    const added: Item[] = [];
    files.forEach((file, i) => {
      const rule = FILE_KINDS[kindOf];
      if (i >= room) { notes.push(`Twelve in all: ${file.name} wasn’t added.`); return; }
      if (!rule.types.test(file.name)) { notes.push(`${file.name} isn’t a ${rule.word} Pantopus takes.`); return; }
      if (file.size > rule.max) { notes.push(`${file.name} is over ${Math.round(rule.max / MB)} MB.`); return; }
      const key = nextKey();
      added.push({ key, kind: kindOf, fileId: null, name: file.name, state: 'uploading', preview: kindOf === 'photo' ? URL.createObjectURL(file) : null });
      upload(file, kindOf, key);
    });
    if (added.length) setItems((list) => [...list, ...added]);
    setError(notes.length ? notes.join(' ') : null);
  };
  // A file this editor uploaded that never ends up on a saved piece is deleted again, so nothing is left behind in
  // the person's files (today's portfolio grid draws them).
  const savedFiles = useMemo(() => new Set(initialItems.map((i) => i.fileId)), [initialItems]);
  const dropUploads = (fileIds: Array<string | null>) => {
    fileIds.filter((id): id is string => Boolean(id) && !savedFiles.has(id)).forEach((id) => {
      Promise.resolve().then(() => api.files.deleteFile(id)).catch(() => {});
    });
  };
  const removeItem = (key: string) => {
    const item = items.find((i) => i.key === key);
    if (item) dropUploads([item.fileId]);
    setItems((list) => list.filter((i) => i.key !== key));
  };

  // ── Links: words only, read before saving; the server makes the card and cleans the address. ──
  const addLink = () => {
    const url = linkOf(linkDraft);
    if (!url) { setLinkNote('That isn’t a web address. Paste one that starts with https://'); return; }
    if (full) { setLinkNote('Twelve in all. Remove one to add a link.'); return; }
    if (links.some((l) => l.url === url)) { setLinkNote('That link is already on the piece.'); return; }
    const key = nextKey();
    setLinks((list) => [...list, { key, url, card: null, words: null }]);
    setLinkDraft('');
    setLinkNote(null);
    Promise.resolve().then(() => api.linkPreview.getLinkPreview(url)).then(
      (w) => { if (live.current) setLinks((list) => list.map((l) => (l.key === key ? { ...l, words: { title: w.title, site: w.siteName, description: w.description } } : l))); },
      () => {},
    );
  };

  // ── The fields as the server takes them. A change sends what changed; files and links only when they changed. ──
  const fields = (draft: boolean): ProfilePieceFields => {
    const out: ProfilePieceFields = {
      title: title.trim(), kind, description: words.trim() || null, role: role.trim() || null, skills,
      audience, pinned, hidden, draft,
    };
    const monthChanged = !editing || month !== initial.month;
    if (monthChanged) { out.from = month || null; out.to = month || null; }
    if (!editing || place !== initial.place) { out.city = placeRead.city; out.state = placeRead.state; }
    const fileIds = items.filter((i) => i.state === 'ready' && i.fileId).map((i) => ({ file_id: i.fileId! }));
    if (!editing || JSON.stringify(fileIds) !== JSON.stringify(initialItems.map((i) => ({ file_id: i.fileId })))) out.attachments = fileIds;
    // Links only when there are some (new) or they changed (a change), so a piece without links never sends the key.
    const urls = links.map((l) => ({ url: l.url }));
    if (editing ? JSON.stringify(urls) !== JSON.stringify(initialLinks.map((l) => ({ url: l.url }))) : urls.length > 0) out.links = urls;
    if (!editing && offer && fromOffer) out.started_from = { kind: offer.kind, id: offer.id };
    return out;
  };

  // ── "How this piece will show", worked out by the server as the piece is written (a new piece). ──
  const previewKey = JSON.stringify(editing ? null : { t: title.trim(), kind, words: words.trim(), from: fromOffer, links: links.length, files: items.length, audience });
  useEffect(() => {
    if (editing) return;
    const timer = window.setTimeout(() => {
      // As it will show once added to Work (a draft shows to nobody else).
      Promise.resolve().then(() => api.profilePage.previewPiece(fields(false))).then(
        (res) => { if (live.current) setShowsLines(Array.isArray(res?.how_it_will_show) ? res.how_it_will_show : null); },
        () => {},
      );
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again only when what decides the lines changes
  }, [previewKey]);

  const dirty = JSON.stringify({ title, kind, month, place, words, role, skills, audience, pinned, hidden, items: items.map((i) => i.fileId ?? i.key), links: links.map((l) => l.url) })
    !== JSON.stringify({ ...initial, items: initialItems.map((i) => i.fileId), links: initialLinks.map((l) => l.url) });
  const close = () => {
    if (saving) return;
    if ((dirty || queued.length > 0) && !window.confirm('Leave without saving? What you added here won’t be kept.')) return;
    dropUploads(items.map((i) => i.fileId));
    // Credits already changed on a saved piece: read it again on the way out.
    if (editing && creditsTouched.current) { onSaved({ id: editing.id }); return; }
    onClose();
  };

  const save = async (draft: boolean) => {
    if (!title.trim()) { setError('Give the piece a title.'); return; }
    if (placeRead.error) { setError(placeRead.error); return; }
    if (uploading) { setError('Wait for the files to finish adding.'); return; }
    if (!editing && draft && queued.length > 0
      && !window.confirm('Save it as a draft? The people you named are asked only once the piece is on your Work, so they aren’t kept with a draft.')) return;
    setSaving(draft ? 'draft' : 'work');
    setError(null);
    try {
      const saved = editing
        ? await api.profilePage.updatePiece(editing.id, fields(draft))
        : await api.profilePage.createPiece(fields(draft));
      // A new piece on the Work: now ask the people named on it, one by one; a refusal says why in the server's words.
      if (!editing && !draft) {
        for (const q of queued) {
          try {
            await api.profilePage.addCredit(saved.id, { ...(q.user_id ? { user_id: q.user_id } : { name: q.name }), role: q.role, relation: q.relation });
          } catch (err) {
            toast.error(`${q.shown}: ${extractApiError(err, 'couldn’t be added.')}`);
          }
        }
      }
      if (live.current) onSaved({ id: saved.id });
    } catch (err) {
      if (live.current) setError(extractApiError(err, 'Couldn’t save the piece. Try again.'));
    }
    if (live.current) setSaving(null);
  };

  const remove = async () => {
    if (!editing) return;
    if (!window.confirm(`Remove “${editing.title}” from your Work? It goes from your page, and anyone named on it comes off.`)) return;
    setSaving('remove');
    setError(null);
    try {
      await api.profilePage.deletePiece(editing.id);
      if (live.current) onRemoved(editing.id);
    } catch (err) {
      if (live.current) { setError(extractApiError(err, 'Couldn’t remove the piece. Try again.')); setSaving(null); }
    }
  };

  const addSkill = (value: string) => {
    const name = value.trim().slice(0, 40);
    if (!name || skills.length >= SKILLS_MAX || skills.some((s) => s.toLowerCase() === name.toLowerCase())) return;
    setSkills((list) => [...list, name]);
    setSkillDraft('');
  };

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: now - 1959 }, (_, i) => String(now - i));
  }, []);
  const [y, m] = month ? month.split('-') : ['', ''];
  const setPart = (year: string, mon: string) => setMonth(year && mon ? `${year}-${mon}` : year ? `${year}-${mon || '01'}` : '');

  const kindButton = (k: 'did' | 'built' | 'owns', text: string) => (
    <button
      key={k}
      type="button"
      aria-pressed={kind === k}
      onClick={() => setKind(kind === k ? null : k)}
      className={`min-h-[2.75rem] px-2 rounded-[0.625rem] text-[1rem] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)] ${kind === k ? 'bg-surface text-app shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-app-secondary hover:text-app'}`}
    >
      {text}
    </button>
  );
  const addButton = (k: FileKind | 'link', text: string, Icon: typeof ImageIcon) => (
    <button
      key={k}
      type="button"
      disabled={full}
      onClick={() => (k === 'link' ? document.getElementById(ids.link)?.focus() : pickers[k].current?.click())}
      className="min-h-[4.25rem] rounded-xl border border-app-strong bg-surface flex flex-col items-center justify-center gap-1 text-[0.8125rem] font-semibold text-app hover-bg-app disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]"
    >
      <Icon aria-hidden="true" className="w-5 h-5" />{text}
    </button>
  );

  const primaryText = editing && !isDraft ? 'Save changes' : 'Add to Work';
  const footer = (
    <div className="flex flex-col gap-2">
      {error ? <p role="alert" className="text-[0.875rem] leading-5 text-app-error">{error}</p> : null}
      <button
        type="button"
        onClick={() => save(false)}
        disabled={Boolean(saving)}
        className="w-full min-h-[3rem] rounded-xl bg-primary-600 px-4 text-[1.0625rem] font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {saving === 'work' ? 'Saving…' : primaryText}
      </button>
    </div>
  );

  return (
    <Screen
      open
      onClose={close}
      close="close"
      z="z-[60]"
      title={editing ? 'Change piece' : 'New piece'}
      right={isDraft ? (
        <button type="button" onClick={() => save(true)} disabled={Boolean(saving)} className="min-h-[2.75rem] px-3 rounded-lg text-[0.9375rem] font-semibold text-app-link hover:underline disabled:opacity-60">
          {saving === 'draft' ? 'Saving…' : 'Save draft'}
        </button>
      ) : null}
      footer={footer}
    >
      <div className="px-4 sm:px-6 py-4 flex flex-col gap-5">
        {offer ? (
          <div className="rounded-2xl border border-[color:var(--color-info-light,rgba(59,130,246,0.35))] bg-app-info-bg px-4 py-3 flex flex-col gap-2.5">
            <p className="flex items-start gap-2.5 text-[0.9375rem] leading-[1.3125rem] text-app">
              <InkGlyph ink="seen" />
              <span>
                <strong>Pantopus has seen this {offer.kind === 'plan' ? 'plan' : 'job'}.</strong>
                {offer.title ? <span className="block mt-1 font-semibold [overflow-wrap:anywhere]">“{offer.title}”</span> : null}
                <span className="block mt-0.5">{offer.text} A piece started from it shows as Seen.</span>
              </span>
            </p>
            <button
              type="button"
              aria-pressed={fromOffer}
              onClick={() => setFromOffer((v) => !v)}
              className={`self-start ml-[1.625rem] min-h-[2.5rem] px-3.5 rounded-full inline-flex items-center gap-1.5 text-[0.875rem] font-semibold ${fromOffer ? 'bg-primary-600 text-white' : 'bg-surface border border-app-strong text-app'}`}
            >
              {fromOffer ? <Check aria-hidden="true" className="w-4 h-4" /> : null}
              {fromOffer ? `Started from this ${offer.kind === 'plan' ? 'plan' : 'job'}` : `Start it from this ${offer.kind === 'plan' ? 'plan' : 'job'}`}
            </button>
          </div>
        ) : null}

        <Labelled id={ids.title} title="What did you do or build?" count={`${title.length} of ${TITLE_MAX}`}>
          <input id={ids.title} className={field} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Rebuilt a 1912 porch" autoComplete="off" />
        </Labelled>

        <div className="flex flex-col gap-1.5">
          <span id={`${ids.title}-kind`} className={label}>Kind</span>
          <div role="group" aria-labelledby={`${ids.title}-kind`} className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-app-surface-sunken">
            {kindButton('did', 'Did')}{kindButton('built', 'Built')}{kindButton('owns', 'Owns')}
          </div>
        </div>

        <Labelled id={ids.role} title="Your part" count={role ? `${role.length} of ${ROLE_MAX}` : null} note="A few words, like “Lead carpenter”. Optional.">
          <input id={ids.role} className={field} value={role} maxLength={ROLE_MAX} onChange={(e) => setRole(e.target.value)} autoComplete="off" />
        </Labelled>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <fieldset className="flex flex-col gap-1.5 min-w-0">
            <legend className={`${label} mb-1.5`}>When</legend>
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
              <label htmlFor={ids.month} className="sr-only">Month</label>
              <select id={ids.month} className={field} value={m} onChange={(e) => setPart(y || String(new Date().getFullYear()), e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
              </select>
              <label htmlFor={ids.year} className="sr-only">Year</label>
              <select id={ids.year} className={field} value={y} onChange={(e) => setPart(e.target.value, m)}>
                <option value="">Year</option>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
          </fieldset>
          <Labelled id={ids.place} title="Where" note={placeRead.error ? <span className="text-app-error">{placeRead.error}</span> : 'City only, never the address'}>
            <input id={ids.place} className={field} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Camas, WA" autoComplete="off" aria-invalid={Boolean(placeRead.error) || undefined} />
          </Labelled>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className={label}>Show it</span>
            <span className="text-xs text-app-muted" aria-live="polite">{used} of {LIMIT} added</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {addButton('photo', 'Photos', ImageIcon)}{addButton('video', 'Video', Video)}{addButton('document', 'Document', FileText)}{addButton('link', 'Link', Link2)}
          </div>
          {(['photo', 'video', 'document'] as const).map((k) => (
            <input key={k} ref={pickers[k]} type="file" accept={FILE_KINDS[k].accept} multiple={k !== 'video'} className="hidden" onChange={pick(k)} aria-hidden="true" tabIndex={-1} />
          ))}
          {items.length > 0 ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2" aria-label="Added to this piece">
              {items.map((item, i) => (
                <li key={item.key} className="relative aspect-square rounded-xl overflow-hidden bg-app-surface-sunken">
                  {item.preview?.startsWith('blob:') ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the picked file itself, before it is uploaded
                    <img src={item.preview} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
                  ) : item.preview ? <Picture src={item.preview} className="absolute inset-0 w-full h-full object-cover" /> : null}
                  {!item.preview ? (
                    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-app-secondary">
                      {item.kind === 'video' ? <Play className="w-6 h-6" /> : item.kind === 'document' ? <FileText className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
                    </span>
                  ) : item.kind === 'video' ? (
                    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center"><span className="w-7 h-7 rounded-full bg-gray-900/80 flex items-center justify-center"><Play className="w-3.5 h-3.5 text-white fill-white" /></span></span>
                  ) : null}
                  {item.state === 'uploading' ? (
                    <span className="absolute inset-0 bg-black/40 flex items-center justify-center" role="status">
                      <span className="w-6 h-6 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" /><span className="sr-only">Adding {item.name}</span>
                    </span>
                  ) : null}
                  {item.state === 'failed' ? <span className="absolute inset-x-0 bottom-0 bg-app-error text-white text-[0.6875rem] leading-4 px-1.5 py-0.5 text-center" title={item.error}>Not added</span> : null}
                  {i === 0 && item.state !== 'failed' ? <span className="absolute left-1 top-1 rounded-full bg-gray-900/80 text-white text-[0.625rem] leading-4 font-semibold px-1.5">Cover</span> : null}
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    aria-label={`Remove ${item.kind}${item.name ? ` ${item.name}` : ''}`}
                    className="absolute right-0.5 top-0.5 w-8 h-8 rounded-full flex items-center justify-center"
                  >
                    <span className="w-6 h-6 rounded-full bg-gray-900/80 text-white flex items-center justify-center"><X aria-hidden="true" className="w-3.5 h-3.5" /></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {items.some((i) => i.state === 'failed') ? (
            <p role="alert" className="text-[0.8125rem] leading-[1.125rem] text-app-error">{items.find((i) => i.state === 'failed')?.error} Remove it and try again.</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Labelled id={ids.link} title="A link" note={linkNote ? <span className="text-app-error">{linkNote}</span> : 'Pantopus reads the page’s words only, never its pictures.'}>
            <div className="flex gap-2">
              <input
                id={ids.link}
                className={field}
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                placeholder="yoursite.com/porch"
                inputMode="url"
                autoComplete="off"
                disabled={full}
              />
              <button type="button" onClick={addLink} disabled={full || !linkDraft.trim()} className="shrink-0 min-h-[3rem] px-4 rounded-xl bg-app-surface-sunken text-[0.9375rem] font-semibold text-app hover-bg-app disabled:opacity-50">Add</button>
            </div>
          </Labelled>
          {links.map((link) => {
            const card: ProfileLinkCard = link.card ?? {
              url: link.url,
              site: link.words?.site || (() => { try { return new URL(link.url).hostname; } catch { return null; } })(),
              kind: 'site',
              title: link.words?.title ?? null,
              description: link.words?.description ?? null,
              ink: 'said',
              how: 'Not proven yours yet',
            };
            return (
              <div key={link.key} className="relative">
                <LinkCardView
                  link={card}
                  footer={editing && link.card?.id ? (
                    <ProveLink pieceId={editing.id} card={link.card} onProven={(proven) => setLinks((list) => list.map((l) => (l.key === link.key ? { ...l, card: proven } : l)))} />
                  ) : !link.card ? <p className="text-xs leading-4 text-app-muted">You can prove the page is yours once the piece is saved.</p> : null}
                />
                <button type="button" onClick={() => setLinks((list) => list.filter((l) => l.key !== link.key))} aria-label={`Remove the link ${card.title || card.site || link.url}`} className="absolute right-1 top-1 w-9 h-9 rounded-full flex items-center justify-center text-app-secondary hover-bg-app">
                  <X aria-hidden="true" className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {showCredits ? (
          <CreditsField
            pieceId={editing ? editing.id : null}
            initial={(editing?.credits || []).filter((c) => c && c.id)}
            queued={queued}
            onQueued={setQueued}
            onChanged={() => { creditsTouched.current = true; }}
            waiting={editing && (editing.draft || editing.hidden) ? 'Put the piece on your Work (not hidden) to ask anyone to sign it.' : null}
          />
        ) : null}

        <Labelled id={ids.words} title="In your words" count={`${words.length} of ${WORDS_MAX}`}>
          <textarea id={ids.words} className={`${field} min-h-[7rem] font-serif italic`} value={words} maxLength={WORDS_MAX} onChange={(e) => setWords(e.target.value)} placeholder="What you did, and anything worth knowing about it." />
        </Labelled>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={ids.skill} className={label}>It shows you can</label>
            <span className="text-xs text-app-muted">{skills.length} of {SKILLS_MAX}</span>
          </div>
          {skills.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <li key={skill} className="inline-flex items-center gap-1 min-h-9 pl-3 pr-1 rounded-full bg-app-business-bg text-app-business text-[0.875rem] font-semibold">
                  {skill}
                  <button type="button" onClick={() => setSkills((list) => list.filter((s) => s !== skill))} aria-label={`Remove ${skill}`} className="w-8 h-8 rounded-full flex items-center justify-center"><X aria-hidden="true" className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          ) : null}
          {skills.length < SKILLS_MAX ? (
            <>
              <input
                id={ids.skill}
                className={field}
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillDraft); } }}
                placeholder="Finish carpentry"
                autoComplete="off"
              />
              {skillsSuggested.filter((s) => !skills.includes(s)).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {skillsSuggested.filter((s) => !skills.includes(s)).slice(0, 8).map((s) => (
                    <button key={s} type="button" onClick={() => addSkill(s)} className="min-h-9 px-3 rounded-full border border-app-strong text-[0.8125rem] font-semibold text-app-secondary hover-bg-app">+ {s}</button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          <p className="text-xs leading-4 text-app-muted">Can do on your Work is counted from these.</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${label} mb-2`}>Who sees it</legend>
          {AUDIENCES.map((a) => (
            <label key={a.key} className="flex items-center gap-3 min-h-[3rem] px-3.5 rounded-xl border border-app bg-surface cursor-pointer has-[:checked]:border-[color:var(--color-link)]">
              <input type="radio" name="piece-audience" value={a.key} checked={audience === a.key} onChange={() => setAudience(a.key)} className="w-5 h-5 accent-[color:var(--color-link)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-app">{a.label}</span>
                <span className="block text-xs text-app-muted">{a.detail}</span>
              </span>
            </label>
          ))}
          <p className="text-xs leading-4 text-app-muted">Never wider than your Work part in Share your profile.</p>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3 min-h-[3rem] px-3.5 rounded-xl border border-app bg-surface cursor-pointer">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-5 h-5 accent-[color:var(--color-link)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold text-app">Pin it to the top of your Work</span>
              <span className="block text-xs text-app-muted">Up to 3. {pinnedCount - (initial.pinned ? 1 : 0)} pinned now.</span>
            </span>
          </label>
          {editing ? (
            <label className="flex items-center gap-3 min-h-[3rem] px-3.5 rounded-xl border border-app bg-surface cursor-pointer">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="w-5 h-5 accent-[color:var(--color-link)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-app">Hide it</span>
                <span className="block text-xs text-app-muted">Gone for everyone but you, until you show it again.</span>
              </span>
            </label>
          ) : null}
        </div>

        {showsLines && showsLines.length > 0 ? (
          <section aria-label="How this piece will show" className="rounded-2xl bg-app-surface-sunken px-4 py-3.5 flex flex-col gap-2.5">
            <h3 className={overline}>How this piece will show</h3>
            <ul className="flex flex-col gap-2">
              {showsLines.map((line, i) => {
                const ink = lineInk(line);
                return (
                  <li key={i} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 items-start text-[0.9375rem] leading-[1.3125rem] text-app">
                    {ink ? <InkGlyph ink={ink} /> : <span aria-hidden="true" />}
                    <span>{line}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {editing ? (
          <button type="button" onClick={remove} disabled={Boolean(saving)} className="self-start min-h-[2.75rem] px-1 text-[0.9375rem] font-semibold text-app-error hover:underline disabled:opacity-60">
            {saving === 'remove' ? 'Removing…' : 'Remove this piece'}
          </button>
        ) : null}
      </div>
    </Screen>
  );
}
