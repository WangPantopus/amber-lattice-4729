'use client';

// ============================================================
// Write back (mail-cards-experience Part 3; memories plan step 6): the card's one reply, written on a cream sheet the
// size of the card's back, on the card's own cloth. The same drawing as the back (ruled lines, the pen at the card's
// sizes, FROM and the signature), "Dear {first name}," faint on its first line. It goes with their next 7 a.m. mail,
// free, and can be taken back until then. Note only in this build.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CardSignature, CardReplySummary } from '@pantopus/api';
import { useSendCardReply, useTakeBackCardReply } from '@/lib/mailbox-queries';
import { mailLoadMessage } from '../mailLoadMessage';
import { firstNameOf, shortDay, TABLE_ART, tableTint } from './cardArt';
import { writingStyle } from './CardBack';
import { PaperBack, useNoteFit } from './CardPaper';
import { playCardSound } from './cardSounds';
import styles from './CardReply.module.css';

const LIMIT = 300;
const letters = (text: string) => [...text].length;

export default function CardReplyWriter({
  cardId,
  card,
  toName,
  fromName,
  signature,
  onClose,
}: {
  cardId: string;
  /** The card it answers: its paper, number (for the pen's small shifts), year and cloth. */
  card: { number?: number | null; paper: string; year: number; table?: string | null };
  /** Who the card came from, as it shows them ("Juniper H."). */
  toName: string;
  /** The replier's own name, beside FROM. */
  fromName: string;
  /** Their saved signature, beside FROM (null: their typed first name). */
  signature: CardSignature | null;
  onClose: () => void;
}) {
  const first = firstNameOf(toName);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<CardReplySummary | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string>(crypto.randomUUID());
  const send = useSendCardReply(cardId);
  const takeBack = useTakeBackCardReply(cardId);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const noteStyle = writingStyle(useNoteFit(message));
  const count = letters(message);

  useEffect(() => { boxRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !send.isPending) { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, send.isPending]);

  const doSend = () => {
    if (!message.trim()) { setError('Write a few words first.'); return; }
    setError(null);
    send.mutate({ message, request_id: requestId.current, signature }, {
      onSuccess: ({ reply }) => {
        // No envelope: the sheet slides up off the table with the paper sound, then what happens now.
        setLeaving(true);
        playCardSound('card-slide');
        window.setTimeout(() => setSent(reply), window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 150 : 650);
      },
      onError: (err) => {
        // A retry of a reply that already went answers with it.
        const earlier = err.serverCode === 'CARD_REQUEST_SENT' ? (err.data?.reply as CardReplySummary | undefined) : undefined;
        if (earlier) { setLeaving(true); setSent(earlier); return; }
        setError(mailLoadMessage(err));
      },
    });
  };

  const doTakeBack = () => {
    setError(null);
    takeBack.mutate(undefined, {
      onSuccess: () => { requestId.current = crypto.randomUUID(); onClose(); },
      onError: (err) => setError(mailLoadMessage(err)),
    });
  };

  return createPortal(
    <div
      className={styles.cloth}
      role="dialog"
      aria-modal="true"
      aria-label={sent ? `On its way to ${first}` : `Write back to ${first}`}
      style={{ backgroundColor: tableTint(card.table), backgroundImage: `url(${TABLE_ART}table-cloth.webp)` }}
      data-testid="cardReplyWriter"
    >
      <div className={styles.light} style={{ backgroundImage: `url(${TABLE_ART}light.webp)` }} aria-hidden="true" />
      <button type="button" className={styles.round} aria-label="Close" onClick={onClose} disabled={send.isPending}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      {sent ? (
        <div className={styles.sent} data-testid="cardReplySent">
          <p className={styles.sentWords}>On its way to {first}.</p>
          <p className={styles.sentLine}>{toName} gets it with their 7 a.m. mail on {shortDay(sent.arrives_on || sent.arrives_at)}.</p>
          <div className={styles.row}>
            <button type="button" className={styles.strong} data-testid="cardReplyDone" onClick={onClose}>Done</button>
            {sent.can_take_back ? (
              <button type="button" className={styles.glass} data-testid="cardReplyTakeBack" disabled={takeBack.isPending} onClick={doTakeBack}>Take it back</button>
            ) : null}
          </div>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </div>
      ) : null}
      <div className={`${styles.column} ${sent ? styles.columnGone : ''}`} aria-hidden={Boolean(sent)}>
        <div className={`${styles.sheet} ${leaving ? styles.leaving : ''}`}>
          <PaperBack
            number={card.number}
            paper={card.paper}
            fromName={fromName}
            year={card.year}
            signature={signature}
            writing={(
              <>
                <label htmlFor="card-reply-note" className={styles.srOnly}>Your reply to {first}</label>
                <textarea
                  id="card-reply-note"
                  ref={boxRef}
                  value={message}
                  onChange={(event) => setMessage([...event.target.value].slice(0, LIMIT).join(''))}
                  placeholder={`Dear ${first},`}
                  className={styles.box}
                  style={noteStyle}
                  disabled={send.isPending || leaving}
                  data-testid="cardReplyNote"
                />
              </>
            )}
          />
        </div>
        <div className={styles.under}>
          <p className={styles.private}>Only you and {first} can see this.</p>
          <p aria-live="polite" className={`${styles.count} ${count >= LIMIT ? styles.countFull : ''}`}>{count} of {LIMIT} letters</p>
        </div>
        {error && !sent ? <p role="alert" className={styles.error}>{error}</p> : null}
        <button type="button" className={styles.send} data-testid="cardReplySend" disabled={send.isPending || leaving} onClick={doSend}>
          Send with the morning mail
        </button>
      </div>
    </div>,
    document.body,
  );
}
