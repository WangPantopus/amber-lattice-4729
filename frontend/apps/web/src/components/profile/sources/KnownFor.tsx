'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfileKnownForLine, ProfileKnownForSheet, ProfileKnownForWrite } from '@pantopus/api';
import { extractApiError } from '@/lib/auth-utils';
import Screen from './Screen';
import { CircleFace } from './CircleView';
import { InkGlyph, Opens, inkOf, type Target } from './ink';
import { INK_WORD } from './inks';
import { card, overline } from './blocks';

/** The open screen's lines: shown lines for everyone; for the person, every line they have and which are on top. */
export type KnownState =
  | 'loading'
  | 'failed'
  | { lines: ProfileKnownForLine[]; mine: { lines: ProfileKnownForLine[]; on_top: string[] } | null };

/** "Signed · Dan R. · hired Maria · August 2026": the ink's word first, then who as the server names them. */
export function WhoRow({ line, size = 28 }: { line: ProfileKnownForLine; size?: number }) {
  const ink = inkOf(line.ink);
  const who = line.who;
  const words = [INK_WORD[ink], who?.name?.trim() || null, who?.did?.trim() || null, line.when?.trim() || null].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-2">
      {who?.name ? (
        <CircleFace person={{ name: who.name, user_id: who.user_id ?? null, portrait_url: who.portrait_url ?? null, did: null, ink }} size={size} />
      ) : <InkGlyph ink={ink} inline />}
      <span className="min-w-0 text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{words}</span>
    </div>
  );
}

/** One line (board 14): the sentence, who wrote it, what it is tied to, and the actions this viewer has. */
export function KnownForLineCard({ line, tiedTarget, children }: {
  line: ProfileKnownForLine;
  tiedTarget: Target | null;
  children?: ReactNode;
}) {
  return (
    <li className={`${card} px-5 py-4 flex flex-col gap-3`}>
      <p className="text-[1.0625rem] leading-6 text-app [overflow-wrap:anywhere]">{line.text}</p>
      <WhoRow line={line} />
      {line.tied_to?.text ? (
        tiedTarget ? (
          <Opens target={tiedTarget} className="flex items-center gap-2 rounded-xl bg-app-surface-sunken px-3 py-2.5 min-h-[2.75rem] text-left hover-bg-app">
            <span className="min-w-0 flex-1 text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{line.tied_to.text}</span>
            <ChevronRight aria-hidden="true" className="w-4 h-4 shrink-0 text-app-muted" />
          </Opens>
        ) : (
          <p className="rounded-xl bg-app-surface-sunken px-3 py-2.5 text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{line.tied_to.text}</p>
        )
      ) : null}
      {children}
    </li>
  );
}

const pill = 'min-h-[2.75rem] px-3.5 rounded-xl border border-app-strong bg-surface text-[0.875rem] font-semibold text-app hover-bg-app disabled:opacity-60';
const quiet = 'min-h-[2.75rem] px-1 text-[0.875rem] font-semibold text-app-link hover:underline disabled:opacity-60';

/** The writer's own line: "Take it back" (P3.2), after asking. It leaves everywhere at once. */
export function TakeBack({ line, firstName, onDone }: { line: ProfileKnownForLine; firstName: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!line.id || !line.mine?.take_back) return null;
  const go = async () => {
    if (!window.confirm(`Take back your line about ${firstName}? It leaves ${firstName}’s page at once, and it still counts in your lines for this year.`)) return;
    setBusy(true); setNote(null);
    try {
      await api.profilePage.takeBackLine(line.id!);
      onDone();
    } catch (err) {
      setNote(extractApiError(err, 'Couldn’t take it back. Try again.'));
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[0.8125rem] text-app-muted">Your line</span>
      <button type="button" onClick={go} disabled={busy} className={quiet}>{busy ? 'Taking it back…' : 'Take it back'}</button>
      {note ? <p role="alert" className="w-full text-xs text-app-error">{note}</p> : null}
    </div>
  );
}

/** The person's own choices on a line (P3.2): show it or keep it hidden, hide or show it later, up to two on top. */
export function LineChoices({ line, onTop, canTop, onDone }: {
  line: ProfileKnownForLine;
  onTop: boolean;
  canTop: boolean;
  onDone: (change?: { top: boolean }) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!line.id) return null;
  const run = async (fn: () => Promise<unknown>, change?: { top: boolean }) => {
    setBusy(true); setNote(null);
    try {
      await fn();
      await onDone(change);
    } catch (err) {
      setNote(extractApiError(err, 'Couldn’t change that. Try again.'));
    }
    setBusy(false);
  };
  const status = line.status || 'shown';
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[0.8125rem] text-app-muted">
        {status === 'waiting' ? 'Waiting for you. Only you and the writer see it.' : status === 'hidden' ? 'Hidden. Only you see it.' : onTop ? 'Shown, on top.' : 'Shown.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {status === 'waiting' ? (
          <>
            <button type="button" disabled={busy} onClick={() => run(() => api.profilePage.showLine(line.id!))} className="min-h-[2.75rem] px-4 rounded-xl bg-primary-600 text-[0.875rem] font-semibold text-white hover:bg-primary-700 disabled:opacity-60">Show it</button>
            <button type="button" disabled={busy} onClick={() => run(() => api.profilePage.hideLine(line.id!))} className={pill}>Keep it hidden</button>
          </>
        ) : status === 'hidden' ? (
          <button type="button" disabled={busy} onClick={() => run(() => api.profilePage.showLine(line.id!))} className={pill}>Show it</button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => run(() => api.profilePage.hideLine(line.id!))} className={pill}>Hide it</button>
            {onTop || canTop ? (
              <button type="button" disabled={busy} onClick={() => run(async () => {}, { top: !onTop })} className={pill}>{onTop ? 'Take it off the top' : 'Put it on top'}</button>
            ) : null}
          </>
        )}
      </div>
      {note ? <p role="alert" className="text-xs text-app-error">{note}</p> : null}
    </div>
  );
}

/** "Write a line about Maria" (board 14's foot): why they may, one sentence, their name on links or not, then sign. */
function WriteLine({ identifier, firstName, write, onWritten, autoFocus }: {
  identifier: string;
  firstName: string;
  write: ProfileKnownForWrite;
  onWritten: () => void;
  autoFocus: boolean;
}) {
  const ids = { text: useId(), reasons: useId() };
  const [sheet, setSheet] = useState<'loading' | ProfileKnownForSheet | { refused: string }>('loading');
  const [reason, setReason] = useState<string>('');
  const [text, setText] = useState('');
  const [onLinks, setOnLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => api.profilePage.getKnownForWrite(identifier)).then(
      (res) => {
        if (!live) return;
        setSheet(res);
        if (res.reasons?.length) setReason(`${res.reasons[0].kind}:${res.reasons[0].id}`);
      },
      // The server's own sentence when it says no ("You can't write a line here.").
      (err) => { if (live) setSheet({ refused: extractApiError(err, 'You can’t write a line here.') }); },
    );
    return () => { live = false; };
  }, [identifier]);
  useEffect(() => {
    if (autoFocus && sheet !== 'loading' && !('refused' in sheet)) document.getElementById(ids.text)?.focus();
  }, [autoFocus, sheet, ids.text]);

  if (done) {
    return (
      <section className={`${card} px-5 py-4`}>
        <p role="status" className="text-[0.9375rem] leading-[1.375rem] text-app">Signed and added. {firstName} sees it first and chooses whether it shows.</p>
      </section>
    );
  }
  const max = sheet !== 'loading' && !('refused' in sheet) ? sheet.max_chars || 120 : 120;
  const submit = async () => {
    if (sheet === 'loading' || 'refused' in sheet) return;
    const words = text.trim();
    if (!words) { setError(`Write one sentence about what ${firstName} did.`); document.getElementById(ids.text)?.focus(); return; }
    const chosen = sheet.reasons.find((r) => `${r.kind}:${r.id}` === reason) ?? sheet.reasons[0];
    if (!chosen) return;
    setBusy(true); setError(null);
    try {
      await api.profilePage.writeKnownFor(identifier, { text: words, reason: { kind: chosen.kind, id: chosen.id }, show_name_on_links: onLinks });
      setDone(true);
      onWritten();
    } catch (err) {
      setError(extractApiError(err, 'Couldn’t add your line. Try again.'));
    }
    setBusy(false);
  };
  return (
    <section aria-labelledby={`${ids.text}-h`} className={`${card} px-5 pt-4 pb-5 flex flex-col gap-3`}>
      <h3 id={`${ids.text}-h`} className={overline}>{write.text}</h3>
      {sheet === 'loading' ? <p role="status" className="text-[0.9375rem] text-app-secondary">Opening…</p> : 'refused' in sheet ? (
        <p role="alert" className="text-[0.9375rem] leading-[1.375rem] text-app">{sheet.refused}</p>
      ) : (
        <>
          {sheet.reasons.length > 1 ? (
            <fieldset className="flex flex-col gap-1" aria-describedby={ids.reasons}>
              <legend id={ids.reasons} className="mb-1 text-[0.875rem] text-app-secondary">Which thing you did together is your line tied to?</legend>
              {sheet.reasons.map((r) => (
                <label key={`${r.kind}:${r.id}`} className="flex items-start gap-3 min-h-[2.75rem] py-1.5 cursor-pointer">
                  <input type="radio" name={ids.reasons} checked={reason === `${r.kind}:${r.id}`} onChange={() => setReason(`${r.kind}:${r.id}`)} className="mt-0.5 w-5 h-5 shrink-0 accent-[color:var(--color-link)]" />
                  <span className="text-[0.9375rem] leading-5 text-app [overflow-wrap:anywhere]">{r.text}</span>
                </label>
              ))}
            </fieldset>
          ) : sheet.reasons[0] ? <p className="text-[0.9375rem] leading-[1.375rem] text-app">{sheet.reasons[0].text}</p> : null}
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={ids.text} className="text-[0.8125rem] text-app-secondary">One sentence about what {firstName} did</label>
            <span className="text-xs text-app-muted">{text.length} of {max}</span>
          </div>
          <textarea
            id={ids.text}
            value={text}
            maxLength={max}
            rows={3}
            onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
            placeholder={`What did you see ${firstName} do?`}
            className="w-full rounded-xl border border-app-strong bg-surface px-3.5 py-2.5 text-[1.0625rem] leading-6 text-app placeholder:text-app-muted focus:outline focus:outline-2 focus:outline-[color:var(--color-link)] resize-none"
          />
          <label className="flex items-start gap-3 min-h-[2.75rem] py-1 cursor-pointer">
            <input type="checkbox" checked={onLinks} onChange={(e) => setOnLinks(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-[color:var(--color-link)]" />
            <span className="text-[0.9375rem] leading-5 text-app">
              Show my name on pages opened by a link
              <span className="block text-xs leading-4 text-app-muted">Off: those pages say what you did, not who you are.</span>
            </span>
          </label>
          {error ? <p role="alert" className="text-[0.875rem] leading-5 text-app-error">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[0.8125rem] text-app-secondary">{sheet.left_this_year} of your {sheet.of} lines left this year</span>
            <button type="button" onClick={submit} disabled={busy} className="min-h-[2.75rem] px-5 rounded-xl bg-primary-600 text-[0.9375rem] font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
              {busy ? 'Adding…' : 'Sign and add'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Known for (board 14), its own screen at `?known=1`: every shown line, each with who, what they did, when and what
 * it is tied to. The person sees every line they have (waiting, shown, hidden) with their choices; a writer sees
 * their own line with "Take it back"; "Write a line about <first name>" only when the server says this viewer may.
 */
export default function KnownForScreen({ open, state, onClose, onRetry, firstName, identifier, owner, write, writeFirst, extraMine, tiedTarget, onChanged }: {
  open: boolean;
  state: KnownState | null;
  onClose: () => void;
  onRetry: () => void;
  firstName: string;
  identifier: string;
  owner: boolean;
  write: ProfileKnownForWrite | null;
  /** Opened from "Write a line": the sentence box has the keyboard. */
  writeFirst: boolean;
  /** The writer's own line from the page, when the shown list doesn't carry it (it waits, or is hidden). */
  extraMine: ProfileKnownForLine[];
  tiedTarget: (line: ProfileKnownForLine) => Target | null;
  /** Something changed (a line written, taken back, shown, hidden, on top): read the page and this list again. */
  onChanged: () => void;
}) {
  // "Signed and added" outlives the sentence box: once the writer has a line the server sends no `write`.
  const [wrote, setWrote] = useState(false);
  useEffect(() => { if (!open) setWrote(false); }, [open]);
  let body: ReactNode;
  if (state === 'loading' || state === null) {
    body = <p role="status" className="py-10 text-center text-[0.9375rem] text-app-secondary">Opening…</p>;
  } else if (state === 'failed') {
    body = (
      <div className="py-10 flex flex-col items-center gap-3 text-center">
        <p className="text-[0.9375rem] text-app-secondary">Couldn’t open the lines.</p>
        <button type="button" onClick={onRetry} className={pill}>Try again</button>
      </div>
    );
  } else {
    const mineList = state.mine;
    const onTop = new Set(mineList?.on_top ?? state.lines.filter((l) => l.on_top && l.id).map((l) => l.id!));
    const order = (l: ProfileKnownForLine) => (l.status === 'waiting' ? 0 : l.status === 'hidden' ? 3 : onTop.has(l.id || '') ? 1 : 2);
    const lines = owner && mineList
      ? [...mineList.lines].sort((a, b) => order(a) - order(b))
      : [...state.lines, ...extraMine.filter((m) => m.id && !state.lines.some((l) => l.id === m.id))];
    const shownTop = [...onTop];
    const setTop = async (id: string, top: boolean) => {
      const next = top ? [...shownTop.filter((x) => x !== id), id].slice(-2) : shownTop.filter((x) => x !== id);
      await api.profilePage.setLinesOnTop(next);
    };
    body = (
      <div className="px-4 sm:px-6 py-4 flex flex-col gap-3">
        <div className="px-1">
          <h3 className="text-[1.25rem] leading-7 font-bold text-app">What people who were there say</h3>
          <p className="mt-1 text-[0.9375rem] leading-[1.375rem] text-app-secondary">
            One sentence each, written by someone who did something with {firstName}, tied to what they did. {firstName} can
            hide a line, but can’t change one or write one.
          </p>
        </div>
        {lines.length > 0 ? (
          <ul className="flex flex-col gap-3" aria-label="Lines">
            {lines.map((line) => (
              <KnownForLineCard key={line.id || line.text} line={line} tiedTarget={tiedTarget(line)}>
                {owner && mineList ? (
                  <LineChoices
                    line={line}
                    onTop={onTop.has(line.id || '')}
                    canTop={shownTop.length < 2}
                    onDone={async (change) => { if (change && line.id) await setTop(line.id, change.top); onChanged(); }}
                  />
                ) : <TakeBack line={line} firstName={firstName} onDone={onChanged} />}
              </KnownForLineCard>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-[0.9375rem] text-app-secondary">{owner ? 'No lines yet. When someone you did something with writes one, it waits here for you.' : 'No lines to show yet.'}</p>
        )}
        {wrote ? (
          <p role="status" className={`${card} px-5 py-4 text-[0.9375rem] leading-[1.375rem] text-app`}>
            Signed and added. {firstName} sees it first and chooses whether it shows.
          </p>
        ) : write ? <WriteLine identifier={identifier} firstName={firstName} write={write} onWritten={() => { setWrote(true); onChanged(); }} autoFocus={writeFirst} /> : null}
        {write && !wrote ? (
          <p className="rounded-2xl border border-app bg-app-surface-sunken px-4 py-3 text-[0.875rem] leading-5 text-app-secondary">
            Each person has {write.of} lines to give in a year, so a line carries weight. You can only write about someone you did
            something with on Pantopus.
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <Screen open={open} onClose={onClose} title="Known for">
      {body}
    </Screen>
  );
}
