'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles, User } from 'lucide-react';
import type { AIChatLink, AIChatMessage } from '@pantopus/types';
import { ASSISTANT_PATH, webPathForAppLink } from '@/lib/appLinks';
import { AIDraftCard } from './AIDraftCard';

interface AIMessageBubbleProps {
  message: AIChatMessage;
  isStreaming?: boolean;
  /** What the assistant is doing while a tool runs ("Drafting your post…"). */
  statusText?: string | null;
}

/**
 * The buttons under a reply: each of the assistant's links that the web has a page for, once. A link to a screen
 * only the phones have, or to this page itself, shows no button.
 */
function linkButtons(links: AIChatLink[] | undefined): { label: string; href: string }[] {
  const seen = new Set<string>();
  const out: { label: string; href: string }[] = [];
  for (const link of links ?? []) {
    const href = webPathForAppLink(link.url);
    const label = (link.label || '').trim();
    if (!href || !label || href === ASSISTANT_PATH || seen.has(href)) continue;
    seen.add(href);
    out.push({ label, href });
  }
  return out;
}

export function AIMessageBubble({ message, isStreaming, statusText }: AIMessageBubbleProps) {
  const isUser = message.role === 'user';
  const buttons = isUser ? [] : linkButtons(message.links);

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
          isUser
            ? 'bg-app-border'
            : 'bg-gradient-to-br from-violet-500 to-indigo-600'
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-app-text-secondary" />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-white" />
        )}
      </div>

      {/* Content */}
      <div
        className={`flex flex-col gap-2 max-w-[80%] min-w-0 ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Text bubble */}
        {message.content && (
          <div
            className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
              isUser
                ? 'bg-violet-600 text-white rounded-br-md'
                : 'bg-app-surface-sunken text-app-text rounded-bl-md'
            }`}
          >
            {message.content}
            {isStreaming && !message.content && (
              <span className="inline-flex gap-1 ml-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            )}
            {isStreaming && message.content && (
              <span className="inline-block w-0.5 h-4 bg-violet-500 ml-0.5 animate-pulse align-text-bottom" />
            )}
          </div>
        )}

        {/* Streaming placeholder when no content yet */}
        {isStreaming && !message.content && message.role === 'assistant' && (
          <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-app-surface-sunken">
            {statusText && !message.drafts?.length && (
              <span className="text-xs text-app-text-muted mr-2">{statusText}</span>
            )}
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        {/* Draft cards */}
        {/* A card keeps a readable width: on a wide window it would otherwise run the width of the thread. */}
        {message.drafts?.map((draft, idx) => (
          <div key={`${message.id}-draft-${idx}`} className="w-full max-w-xl empty:hidden">
            <AIDraftCard draft={draft} />
          </div>
        ))}

        {/* Buttons that open the screen the reply points to */}
        {buttons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {buttons.map((button) => (
              <Link
                key={button.href}
                href={button.href}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-violet-200 bg-app-surface px-3.5 py-1.5 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40"
              >
                {button.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
