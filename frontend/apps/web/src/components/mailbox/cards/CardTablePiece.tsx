'use client';

// ============================================================
// A card in your Mailbox on the table (launch key card_table): the table, and
// the things you can do with the card from its ⋯ menu: who sent it and its
// trail, the Vault, Shred, Open it again, Report and Block. Each comes back to
// the table; Shred goes back to the Mailbox, as the card has gone. Share opens
// its sheet over the table.
// ============================================================

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import * as api from '@pantopus/api';
import type { MailItemV2, VaultFolder } from '@/types/mailbox';
import type { MailActionName } from '@/lib/mailbox-api';
import { useCardArrivals, useCardExchange, useHolidayCards, useMailAction, useVaultFolders } from '@/lib/mailbox-queries';
import { confirmStore } from '@/components/ui/confirm-store';
import ReportModal from '@/components/ui/ReportModal';
import { toast } from '@/components/ui/toast-store';
import SenderSheet from '../SenderSheet';
import { mailLoadMessage } from '../mailLoadMessage';
import CardShareSheet from './CardShareSheet';
import CardTable, { type TableCard, type TableMenuItem, type TableReply } from './CardTable';
import CardReplyWriter from './CardReply';
import { firstNameOf, shortDay } from './cardArt';
import { sendOneBackPath } from './sendOneBack';
import { moveToNextCard, nextCards } from './cardRun';
import { launchFeatures } from '@/lib/featureFlags';

const DONE_WORDS: Partial<Record<MailActionName, string>> = {
  file: 'Filed in the Vault',
  unfile: 'Back in Incoming',
  shred: 'Shredded. You can bring it back from Recently shredded for 30 days',
};

/** Which folder it goes in; the same choices as under a letter. */
function VaultSheet({ piece, onFile, onClose }: { piece: MailItemV2; onFile: (folderId?: string) => void; onClose: () => void }) {
  const folders = useVaultFolders({ enabled: true });
  const fitting = (folders.data ?? []).filter((folder: VaultFolder) => folder.drawer === piece.drawer
    && (folder.drawer !== 'home' || folder.home_id === piece.recipient_home_id));
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <section role="dialog" aria-modal="true" aria-label="File in the Vault" className="relative max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-app-surface px-4 pb-6 pt-3 shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-app-text">File in the Vault</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-app-text-secondary hover:bg-app-hover">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {folders.isPending ? <p className="px-1 py-2 text-sm text-app-text-secondary">Opening your Vault…</p> : null}
        {folders.isError ? (
          <div className="px-1 py-2">
            <p className="text-sm text-app-text-secondary">Couldn&apos;t open your Vault. {mailLoadMessage(folders.error)}</p>
            <button type="button" onClick={() => { void folders.refetch(); }} className="mt-1 min-h-[44px] text-sm font-semibold text-primary-600">Try again</button>
          </div>
        ) : null}
        {fitting.map((folder) => (
          <button key={folder.id} type="button" onClick={() => onFile(folder.id)} className="flex min-h-[44px] w-full items-center rounded-lg px-2 text-left text-sm text-app-text hover:bg-app-hover">
            <span className="truncate">{folder.label}</span>
          </button>
        ))}
        {folders.isPending || folders.isError ? null : (
          <button type="button" onClick={() => onFile()} className="flex min-h-[44px] w-full items-center rounded-lg px-2 text-left text-sm text-app-text hover:bg-app-hover">File without a folder</button>
        )}
      </section>
    </div>,
    document.body,
  );
}

export default function CardTablePiece({
  piece,
  recipientName,
  recipientLine,
  firstOpen,
  onClose,
}: {
  piece: MailItemV2;
  recipientName: string;
  recipientLine?: string | null;
  /** It hadn't been opened before this visit: it plays from the envelope. */
  firstOpen: boolean;
  /** Back to the Mailbox. */
  onClose: () => void;
}) {
  // A reply to a card (Write back, mail-cards-experience Part 3) opens as the joined pair: the card its reader sent, picture
  // side up, with the reply lying on it. The card itself (or, once gone, the reply's own picture) comes from the joined read.
  const replyPiece = piece.card_reply ?? null;
  const joined = useCardExchange(piece.card?.sealed ? null : piece.id);
  const exchange = joined.data ?? null;
  const original = replyPiece ? exchange?.original ?? null : null;
  const card: TableCard = piece.card ?? original?.card ?? {
    design: replyPiece?.design ?? '', number: replyPiece?.number ?? null, caption: replyPiece?.caption ?? null,
    paper: replyPiece?.paper ?? '#f7f0e2', table: replyPiece?.table ?? null, year: replyPiece?.year ?? new Date().getFullYear(), sealed: false,
  };
  const from = piece.sender_display || 'Someone';
  const action = useMailAction(piece.id);
  const [replay, setReplay] = useState(0);
  const [sheet, setSheet] = useState<'sender' | 'vault' | 'report' | 'share' | null>(null);
  const [asking, setAsking] = useState(false);
  const filed = piece.lifecycle === 'filed';
  const archived = Boolean(piece.archived) && !filed;
  const router = useRouter();
  const [blockedNow, setBlockedNow] = useState(false);

  // Send one back (design plan Part 3): only while cards can be sent, never from a sealed card, and only when the
  // server would take a card to them (its person check answers no when either has blocked the other or their account
  // is gone). A new card to them, counted like any other.
  const season = useHolidayCards();
  const senderId = !card.sealed && !blockedNow && season.data?.open ? piece.sender_user_id ?? null : null;
  const theirs = useCardArrivals(senderId);
  const sendBack: TableMenuItem | null = senderId && theirs.isSuccess
    ? { label: `Send ${firstNameOf(from)} a card`, onSelect: () => router.push(sendOneBackPath({ userId: senderId, name: from })) }
    : null;

  // Write back (Part 3): the server says whether this reader can write back now (can_reply), and their own reply once it's
  // written (reply, or pending_reply while it waits). Writing opens the sheet; written, it opens the joined pair here.
  const [writing, setWriting] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const ownReply = !replyPiece && exchange?.reply ? exchange.reply : null;
  const writeBack: TableMenuItem | null = replyPiece || blockedNow ? null
    : exchange?.can_reply ? { label: `Write back to ${firstNameOf(from)}`, onSelect: () => setWriting(true) }
      : ownReply ? { label: `You wrote back · ${shortDay(ownReply.sent_on)}`, onSelect: () => setShowReply(true) } : null;
  const reply: TableReply | null = replyPiece
    ? { note: piece.content || exchange?.reply?.note || '', fromName: from, signature: replyPiece.signature ?? null,
      writtenOn: exchange?.reply?.sent_on ?? piece.created_at }
    : showReply && ownReply
      ? { note: ownReply.note || '', fromName: ownReply.from_name || 'You', signature: ownReply.card_reply?.signature ?? null, writtenOn: ownReply.sent_on }
      : null;
  const { data: cards } = useHolidayCards();

  // Open the next card (mail-cards-experience Part 4): only when the Mailbox list opened this card and handed it the
  // others waiting. It replaces this card's page, so ✕ and Back still go to the Mailbox.
  const [waiting] = useState(() => nextCards(piece.id));
  const nextCard = waiting.length ? {
    count: waiting.length,
    onOpen: () => {
      const next = moveToNextCard(piece.id);
      if (next) router.replace(`/app/mailbox/${piece.drawer || 'personal'}/${next}`);
    },
  } : null;

  const run = (name: MailActionName, folderId?: string, then?: () => void) => {
    action.mutate({ action: name, folderId }, {
      onSuccess: () => {
        setSheet(null);
        const words = DONE_WORDS[name];
        if (words) toast.success(words);
        then?.();
      },
      onError: (err) => toast.error(`That didn't work: ${mailLoadMessage(err)} Your mail is as it was.`),
    });
  };

  const shred = async () => {
    setAsking(true);
    const yes = await confirmStore.open({
      title: 'Shred this mail?',
      description: `${piece.recipient_home_id ? 'It goes for everyone in your household. ' : ''}You can bring it back from Recently shredded for 30 days.`,
      confirmLabel: 'Shred',
      cancelLabel: 'Keep it',
      variant: 'destructive',
    });
    setAsking(false);
    if (yes) run('shred', undefined, onClose);
  };

  const block = async () => {
    if (!piece.sender_user_id) return;
    setAsking(true);
    const yes = await confirmStore.open({
      title: `Block ${from}?`,
      description: `You won't be able to message each other or see each other's posts, and they can't send you another card.${launchFeatures.holidayCardMemories ? ' Cards and replies on their way between you are withdrawn.' : ''} You can unblock them in Settings.`,
      confirmLabel: 'Block',
      variant: 'destructive',
    });
    setAsking(false);
    if (!yes) return;
    try {
      await api.blocks.blockUser(piece.sender_user_id);
      setBlockedNow(true);
      toast.success(`${from} is blocked`);
    } catch (err) {
      toast.error(err instanceof Error ? `Couldn't block them: ${err.message}` : 'Couldn\'t block them. Check your connection and try again.');
    }
  };

  const menu = useMemo<TableMenuItem[]>(() => {
    const items: TableMenuItem[] = [{ label: 'Who sent it and its trail', onSelect: () => setSheet('sender') }];
    if (filed) items.push({ label: 'Take out of the Vault', onSelect: () => run('unfile') });
    else if (archived) items.push({ label: 'Back to Incoming', onSelect: () => run('unfile') });
    else items.push({ label: 'File in the Vault', onSelect: () => setSheet('vault') });
    items.push({ label: 'Shred', onSelect: () => { void shred(); } });
    if (!card.sealed && !replyPiece) items.push({ label: 'Open it again', onSelect: () => setReplay((n) => n + 1) });
    // With Write back in the quiet row, "Share this card" keeps its corner button and this line (Part 3).
    if (writeBack && !replyPiece) items.push({ label: 'Share this card', onSelect: () => setSheet('share') });
    if (sendBack) items.push(sendBack);
    if (piece.sender_user_id) {
      // As drawn for card memories (wave 4 drawing 6): the card itself is reported, and the person is named.
      items.push({ label: launchFeatures.holidayCardMemories ? 'Report this card' : 'Report', onSelect: () => setSheet('report') });
      items.push({ label: launchFeatures.holidayCardMemories ? `Block ${firstNameOf(from)}` : 'Block', onSelect: () => { void block(); } });
    }
    return items;
    // The menu follows the piece; its handlers read the latest piece through this same render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filed, archived, card.sealed, piece.sender_user_id, piece.recipient_home_id, from, sendBack?.label, Boolean(writeBack), Boolean(replyPiece)]);

  // A reply waits for the joined read, so its table is made once, with the room the reply needs.
  if (replyPiece && joined.isPending) return null;

  return (
    <CardTable
      // The joined pair is laid out with room for the reply under the card: a new table when it comes.
      key={reply ? 'joined' : 'card'}
      card={card}
      // Its photo and greeting open through the reader's own route (memories contract section 4); on a reply, the card is
      // the reader's own, from their Sent.
      mediaFrom={replyPiece ? (original ? (fileId) => ({ sent: original.id, fileId }) : null) : (fileId) => ({ piece: piece.id, fileId })}
      note={replyPiece ? original?.note ?? '' : piece.content || ''}
      fromName={replyPiece ? original?.from_name ?? recipientName : from}
      toName={replyPiece ? original?.to_name ?? from : recipientName}
      mailedOn={replyPiece ? original?.sent_on ?? null : piece.postmark?.date || piece.created_at}
      startOnTable={Boolean(replyPiece) || showReply || !firstOpen}
      replay={replay}
      paused={sheet !== null || asking || writing}
      menu={menu}
      sendBack={sendBack}
      writeBack={writeBack}
      reply={reply}
      nextCard={nextCard}
      onShare={replyPiece ? undefined : () => setSheet('share')}
      onClose={onClose}
      overlay={(
        <>
          {writing && !replyPiece ? (
            <CardReplyWriter
              cardId={piece.id}
              card={{ number: card.number, paper: card.paper, year: card.year, table: card.table }}
              toName={from}
              fromName={recipientName}
              signature={cards?.signature?.saved ?? null}
              onClose={() => { setWriting(false); void joined.refetch(); }}
            />
          ) : null}
          {sheet === 'share' ? (
            <CardShareSheet
              details={{ card, note: piece.content || '', fromName: from, mailedOn: piece.postmark?.date || piece.created_at, signature: card.signature ?? null }}
              slug={piece.card?.slug}
              onClose={() => setSheet(null)}
            />
          ) : null}
          {sheet === 'sender' ? <SenderSheet piece={piece} recipientName={recipientName} recipientLine={recipientLine} onClose={() => setSheet(null)} /> : null}
          {sheet === 'vault' ? <VaultSheet piece={piece} onFile={(folderId) => run('file', folderId)} onClose={() => setSheet(null)} /> : null}
          {sheet === 'report' && piece.sender_user_id ? (
            <ReportModal
              open
              entityType={launchFeatures.holidayCardMemories ? 'card' : 'user'}
              layerClassName="z-[1000]"
              // "Report this card" shares that one card with admins (the founder's choice, November 2): said plainly.
              disclosure={launchFeatures.holidayCardMemories
                ? `Pantopus will be able to see this card to review it. Only this card: nothing else in your mail or ${firstNameOf(from)}’s is shared.`
                : undefined}
              onClose={() => setSheet(null)}
              onSubmit={async (reason, details) => {
                await api.users.reportUser(piece.sender_user_id as string, reason, details,
                  launchFeatures.holidayCardMemories ? piece.id : undefined);
                toast.success('Report submitted');
                setSheet(null);
              }}
            />
          ) : null}
        </>
      )}
    />
  );
}
