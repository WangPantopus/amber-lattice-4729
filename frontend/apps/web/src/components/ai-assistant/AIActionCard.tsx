'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bookmark,
  CalendarCheck,
  CalendarClock,
  CheckCheck,
  CheckCircle,
  Home,
  ListChecks,
  MessageSquare,
  Repeat,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import type { AIActionCardAction, AIActionCardDraft, AIActionCardLine, AIActionCardState } from '@pantopus/types';
import { ASSISTANT_PATH, webPathForAppLink } from '@/lib/appLinks';
import {
  CARD_SCOPE,
  FEWER_SCOPE,
  NOT_ALLOWED_TEXT,
  SESSION_CHANGED_TEXT,
  isFewerLikeThis,
  markDismissed,
  markDone,
  resendUnreported,
  runAction,
  savedRuns,
} from '@/lib/aiActionCards';

type Run =
  | { kind: 'running'; actionId: string }
  | { kind: 'done'; actionId: string; link: string | null; note?: string | null }
  | { kind: 'failed'; actionId: string; message: string };

// One label per card, as the phones name them.
const CARD_LABELS: Record<string, string> = {
  plan_create: 'New plan',
  plan_edit: 'Plan change',
  plan_cancel: 'Cancel plan',
  plan_requests: 'Requests',
  plan_ask: 'Ask to join',
  plan_message: 'Message',
  post_reply: 'Reply',
  post_solve: 'Mark solved',
  home_task: 'Reminder',
  home_task_update: 'Task update',
  home_system: 'Home system',
  notification_settings: 'Notifications',
  memory_save: 'Remember',
  follow_up: 'Check back',
  follow_up_cancel: 'Cancel check-back',
  rule_save: 'Standing rule',
  rule_change: 'Rule change',
  suggestion: 'Suggestion',
};

function cardLabel(card: string): string {
  return CARD_LABELS[card] ?? (card.startsWith('home_') ? 'Home' : 'Pantopus');
}

function CardIcon({ card }: { card: string }) {
  const cls = 'w-3.5 h-3.5 text-violet-600 dark:text-violet-300';
  if (card === 'plan_message' || card === 'post_reply') return <MessageSquare className={cls} />;
  if (card === 'plan_requests') return <Users className={cls} />;
  if (card.startsWith('plan_')) return <CalendarCheck className={cls} />;
  if (card === 'post_solve') return <CheckCircle className={cls} />;
  if (card === 'home_task') return <ListChecks className={cls} />;
  if (card === 'home_task_update') return <CheckCheck className={cls} />;
  if (card === 'home_system') return <Wrench className={cls} />;
  if (card.startsWith('home_')) return <Home className={cls} />;
  if (card === 'notification_settings') return <Bell className={cls} />;
  if (card === 'memory_save') return <Bookmark className={cls} />;
  if (card.startsWith('follow_up')) return <CalendarClock className={cls} />;
  if (card.startsWith('rule_')) return <Repeat className={cls} />;
  return <Sparkles className={cls} />;
}

/**
 * An action card in an assistant reply (phase 1 contract, section 4.3): the title, the label and value lines, warnings
 * in the caution style, one row per person with its own buttons, then the card's buttons and "Not now". A button that
 * went through shows its done line (with Open where the web has that page) or the server's message; every button
 * waits while one runs. What was done is remembered on this browser and reported to the server, so the card shows
 * done after a reload and on the person's phones. "Fewer like this" (a suggestion's last card) stays usable after the
 * card's other buttons went through or it expired, until it is used.
 */
export function AIActionCard({ card, state }: { card: AIActionCardDraft; state?: AIActionCardState | null }) {
  const queryClient = useQueryClient();
  const [initial] = useState(() => savedRuns(card, state));
  const [runs, setRuns] = useState<Record<string, Run>>(() =>
    Object.fromEntries(Object.entries(initial.runs).map(([scope, run]) => [scope, { kind: 'done', ...run }])),
  );
  const [dismissed, setDismissed] = useState(initial.dismissed);

  useEffect(() => {
    resendUnreported(card.id);
  }, [card.id]);

  if (dismissed) return null;

  const actions = card.actions ?? [];
  const items = card.items ?? [];
  const fewer = actions.find(isFewerLikeThis) ?? null;
  const otherActions = actions.filter((action) => action !== fewer);
  const hasOnlyFewer = !!fewer && otherActions.length === 0 && items.length === 0;
  const isDone = (scope: string) => runs[scope]?.kind === 'done';
  const finished = isDone(CARD_SCOPE) || (items.length > 0 && items.every((item) => isDone(item.id)));
  const expiresAt = card.expires_at ? Date.parse(card.expires_at) : NaN;
  const expired = !finished && (initial.expiredOnServer || (Number.isFinite(expiresAt) && expiresAt <= Date.now()));
  const running = Object.values(runs).some((run) => run.kind === 'running');
  const anyDone = Object.values(runs).some((run) => run.kind === 'done');
  const scopeOf = (scope: string, action: AIActionCardAction) => (isFewerLikeThis(action) ? FEWER_SCOPE : scope);

  const onAction = async (scope: string, action: AIActionCardAction) => {
    const runScope = scopeOf(scope, action);
    if (running || isDone(runScope) || (expired && !isFewerLikeThis(action))) return;
    setRuns((prev) => ({ ...prev, [runScope]: { kind: 'running', actionId: action.id } }));
    const outcome = await runAction(action);
    let run: Run;
    if (outcome.kind === 'done') {
      markDone(card.id, runScope, { actionId: action.id, link: outcome.link, note: outcome.note });
      run = { kind: 'done', actionId: action.id, link: outcome.link, note: outcome.note };
      // Pages opened next (Plans, the home's tasks, Settings) read what this changed.
      void queryClient.invalidateQueries();
    } else if (outcome.kind === 'failed') {
      run = { kind: 'failed', actionId: action.id, message: outcome.message };
    } else {
      run = { kind: 'failed', actionId: action.id, message: outcome.kind === 'not_allowed' ? NOT_ALLOWED_TEXT : SESSION_CHANGED_TEXT };
    }
    setRuns((prev) => ({ ...prev, [runScope]: run }));
  };

  const onNotNow = () => {
    if (running) return;
    markDismissed(card.id);
    setDismissed(true);
  };

  // "Fewer like this" sits with the card's buttons until it's used, they went through or the card expired.
  const fewerApart = expired || isDone(CARD_SCOPE) || isDone(FEWER_SCOPE);
  const ownActions = fewerApart ? otherActions : actions;

  return (
    <div
      className="w-full rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-app-surface dark:border-violet-800 dark:from-violet-950/40 overflow-hidden"
      data-testid={`aiActionCard-${card.card}`}
    >
      <div className="flex items-center gap-2 px-3.5 py-2 bg-violet-100/50 border-b border-violet-100 dark:bg-violet-900/30 dark:border-violet-900">
        <CardIcon card={card.card} />
        <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">{cardLabel(card.card)}</span>
        <span className="ml-auto text-xs font-semibold">
          {finished ? (
            <span className="text-emerald-700 dark:text-emerald-400">Done</span>
          ) : expired && !hasOnlyFewer ? (
            <span className="text-app-text-muted">Expired</span>
          ) : null}
        </span>
      </div>

      <div className="px-3.5 py-3 space-y-2.5">
        {card.title && <h4 className="font-semibold text-app-text text-sm leading-snug">{card.title}</h4>}
        {card.lines && card.lines.length > 0 && <Lines lines={card.lines} />}
        {(card.warnings ?? []).map((warning, idx) => (
          <div key={idx} className="flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-app-text dark:bg-amber-950/40" data-testid="aiActionWarning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" aria-hidden="true" />
            <span>{warning}</span>
          </div>
        ))}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg bg-app-surface-sunken px-3 py-2.5 space-y-2" data-testid={`aiActionItem-${item.id}`}>
            {item.title && <p className="text-sm font-semibold text-app-text">{item.title}</p>}
            {item.lines && item.lines.length > 0 && <Lines lines={item.lines} />}
            <Buttons scope={item.id} actions={item.actions ?? []} runs={runs} expired={expired} running={running} scopeOf={scopeOf} onAction={onAction} />
          </div>
        ))}
        <Buttons scope={CARD_SCOPE} actions={ownActions} runs={runs} expired={expired} running={running} scopeOf={scopeOf} onAction={onAction} />
        {fewerApart && !expired && fewer && (
          <Buttons scope={FEWER_SCOPE} actions={[fewer]} runs={runs} expired={false} running={running} scopeOf={scopeOf} onAction={onAction} />
        )}
        {!finished && expired && !hasOnlyFewer && (
          <p className="text-xs text-app-text-muted" data-testid="aiActionExpired">This card has expired. Ask again.</p>
        )}
        {expired && fewer && (
          <Buttons scope={FEWER_SCOPE} actions={[fewer]} runs={runs} expired={false} running={running} scopeOf={scopeOf} onAction={onAction} />
        )}
        {!finished && !expired && !anyDone && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onNotNow}
              disabled={running}
              className="min-h-[32px] px-3 text-xs font-semibold text-app-text-secondary hover:text-app-text disabled:opacity-50"
              data-testid="aiActionNotNow"
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Lines({ lines }: { lines: AIActionCardLine[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-1 text-xs leading-relaxed">
      {lines.map((line, idx) => (
        <div key={idx} className="contents">
          <dt className="text-app-text-secondary">{line.label}</dt>
          <dd className="text-app-text whitespace-pre-wrap break-words">{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const BUTTON_STYLES: Record<string, string> = {
  primary: 'bg-violet-600 text-white hover:bg-violet-700 border border-violet-600',
  secondary: 'bg-app-surface text-violet-700 border border-violet-200 hover:bg-violet-50 dark:text-violet-300 dark:border-violet-800 dark:hover:bg-violet-950/40',
  destructive: 'bg-red-600 text-white hover:bg-red-700 border border-red-600',
};

/** One set of buttons (the card's, a row's or "Fewer like this"): the buttons, or how the one that ran went. */
function Buttons({
  scope,
  actions,
  runs,
  expired,
  running,
  scopeOf,
  onAction,
}: {
  scope: string;
  actions: AIActionCardAction[];
  runs: Record<string, Run>;
  expired: boolean;
  running: boolean;
  scopeOf: (scope: string, action: AIActionCardAction) => string;
  onAction: (scope: string, action: AIActionCardAction) => void;
}) {
  if (actions.length === 0) return null;
  const done = runs[scope];
  if (done?.kind === 'done') {
    const action = actions.find((candidate) => candidate.id === done.actionId);
    const href = done.link ? webPathForAppLink(done.link) : null;
    return (
      <div className="space-y-1" data-testid="aiActionDone">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span className="flex-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{action?.done?.label || 'Done'}</span>
          {href && href !== ASSISTANT_PATH && (
            <Link href={href} className="inline-flex min-h-[32px] items-center gap-1 px-1 text-xs font-bold text-violet-700 hover:underline dark:text-violet-300" data-testid="aiActionOpen">
              Open
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </div>
        {done.note && <p className="text-xs text-app-text-secondary">{done.note}</p>}
      </div>
    );
  }
  if (expired) return null;
  const failures = Array.from(new Set(actions.map((action) => scopeOf(scope, action))))
    .map((key) => runs[key])
    .filter((run): run is Extract<Run, { kind: 'failed' }> => run?.kind === 'failed');
  const stack = actions.length > 2 || (actions.length === 2 && actions.some((action) => action.label.length > 14));
  return (
    <div className="space-y-1.5">
      {failures.map((failure, idx) => (
        <p key={idx} className="text-xs text-red-600" role="alert" data-testid="aiActionError">
          {failure.message}
        </p>
      ))}
      <div className={stack ? 'flex flex-col gap-1.5' : 'flex gap-2'}>
        {actions.map((action): ReactNode => {
          const runScope = scopeOf(scope, action);
          const busy = runs[runScope]?.kind === 'running' && runs[runScope]?.actionId === action.id;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(scope, action)}
              disabled={running}
              className={`flex-1 min-h-[36px] rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${BUTTON_STYLES[action.style || 'primary'] ?? BUTTON_STYLES.primary}`}
              data-testid={`aiActionButton-${action.id}`}
            >
              {busy ? 'Working…' : action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
