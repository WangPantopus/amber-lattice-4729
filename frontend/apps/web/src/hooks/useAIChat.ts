'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import * as api from '@pantopus/api';
import type { AIChatMessage, AIChatDraft, AIChatContext, AIHistoryItem } from '@pantopus/types';
import { launchFeatures } from '@/lib/featureFlags';

// What this app shows beyond the original draft cards (AIDraftCard, AIMessageBubble); the server offers the matching
// tools only to apps that list them.
// "action": one-tap cards (host or change a plan, add a home task, change notification settings; AIActionCard), and
// "state": what was done on each of them, on any of the person's devices, when the history is read again.
// "link": buttons under a reply that open a screen (lib/appLinks.ts).
// "moment", "letter", "christmas_card": drafts this app's own composers open filled in: the Moments composer, Mail's
// letter compose and the Christmas card screen. The last two only while this build has those screens.
// "identity": the phones show Mail and the Wallet only after Face ID or the
// passcode, and tell the assistant when that check has passed. On the web those
// pages open with the sign-in alone, so the sign-in is the check.
const AI_CARDS = [
  'pickup_schedule',
  'action',
  'state',
  'link',
  'moment',
  ...(launchFeatures.mailbox && launchFeatures.mailExtras ? ['letter'] : []),
  ...(launchFeatures.mailbox && launchFeatures.holidayCards ? ['christmas_card'] : []),
  'identity',
];

/** A message of the person's from history: their words, or a line for photos or documents sent alone. */
function sentText(item: AIHistoryItem): string {
  if (item.text) return item.text;
  const sent = [
    item.photos === 1 ? 'a photo' : item.photos && item.photos > 1 ? `${item.photos} photos` : null,
    item.documents === 1 ? 'a document' : item.documents && item.documents > 1 ? `${item.documents} documents` : null,
  ].filter(Boolean);
  return sent.length ? `Sent ${sent.join(' and ')}` : '';
}

/**
 * The thread as it streamed, from the conversation's history: the items between two of the person's messages are one
 * reply (its words, then its drafts and cards, then its buttons), as they were when they arrived. A brief or nudge
 * Pantopus sent starts a reply of its own.
 */
function messagesFromHistory(items: AIHistoryItem[]): AIChatMessage[] {
  const out: AIChatMessage[] = [];
  let reply: AIChatMessage | null = null;
  items.forEach((item, index) => {
    const id = `history-${index}`;
    const timestamp = item.at || new Date().toISOString();
    if (item.role === 'user') {
      reply = null;
      out.push({ id, role: 'user', content: sentText(item), timestamp });
      return;
    }
    if (item.nudge) reply = null;
    if (!reply) {
      reply = { id, role: 'assistant', content: '', drafts: [], links: [], timestamp };
      out.push(reply);
    }
    const current: AIChatMessage = reply;
    if (item.text) current.content = current.content ? `${current.content}\n\n${item.text}` : item.text;
    if (item.draft) current.drafts = [...(current.drafts || []), { type: item.draft.type, draft: item.draft.draft, valid: true, state: item.state ?? null }];
    if (item.links?.length) current.links = [...(current.links || []), ...item.links];
  });
  return out.filter((message) => message.role === 'user' || message.content || message.drafts?.length || message.links?.length);
}

/**
 * Hook for the AI Chat Agent with SSE streaming.
 *
 * Manages:
 *   - messages[]     — Full conversation history (client-side)
 *   - conversationId — Persisted across sessions via AIConversation table
 *   - isStreaming     — Whether tokens are currently arriving
 *   - sendMessage()  — Sends a message and processes the stream
 *   - startNew()     — Starts a fresh conversation
 */
export function useAIChat({ context = null }: { context?: AIChatContext | null } = {}) {
  // The screen the assistant was opened from ("Ask Pantopus about your home"): sent with each message of this
  // visit, so "this" and "here" mean that place. The server reads it with that screen's own access checks.
  const contextRef = useRef<AIChatContext | null>(context);
  contextRef.current = context;
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the assistant is doing while a tool runs ("Drafting your post…").
  const [statusText, setStatusText] = useState<string | null>(null);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const streamTextRef = useRef('');
  // While the person's latest conversation is read back; once they send or start over, it is left alone.
  const [isRestoring, setIsRestoring] = useState(true);
  const touchedRef = useRef(false);

  // The thread comes back when the person returns to the page (after opening a draft or a button, or a reload): the
  // newest conversation, continued by the next message, as the phones do (GET /api/ai/conversations, then its
  // history with this page's `cards`). A server or a database without it leaves the thread empty, as before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { conversations } = await api.ai.getConversations();
        const latest = conversations?.[0];
        if (!latest || cancelled || touchedRef.current) return;
        const history = await api.ai.getConversationMessages(latest.id, AI_CARDS);
        if (cancelled || touchedRef.current) return;
        setConversationId(latest.id);
        setMessages(messagesFromHistory(history.messages || []));
      } catch {
        // Nothing to restore: the page starts empty.
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Send a message to the AI agent and stream the response.
   */
  const sendMessage = useCallback(
    (text: string, coarseLocation?: { city?: string; state?: string }) => {
      touchedRef.current = true;
      setIsRestoring(false);
      // Abort any in-flight stream
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      setError(null);
      setStatusText(null);
      setIsStreaming(true);
      streamTextRef.current = '';

      // Add user message immediately
      const userMsg: AIChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };

      // Add placeholder assistant message for streaming
      const assistantId = `assistant-${Date.now()}`;
      const assistantMsg: AIChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        drafts: [],
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      const handle = api.ai.streamChat(
        {
          message: text,
          conversationId: conversationId || undefined,
          coarseLocation,
          cards: AI_CARDS,
          ...(contextRef.current ? { context: contextRef.current } : {}),
        },
        {
          onConversation: (data) => {
            setConversationId(data.conversationId);
          },

          onStatus: (data) => {
            setStatusText(data.message || null);
          },

          onTextDelta: (delta) => {
            setStatusText(null);
            streamTextRef.current += delta;
            const currentText = streamTextRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: currentText } : m
              )
            );
          },

          onDraft: (data) => {
            setStatusText(null);
            const draft: AIChatDraft = {
              type: data.type as AIChatDraft['type'],
              draft: data.draft as AIChatDraft['draft'],
              valid: data.valid,
            };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, drafts: [...(m.drafts || []), draft] }
                  : m
              )
            );
          },

          // A button under this reply. It arrives after the words it belongs to.
          onLink: (data) => {
            if (!data || typeof data.label !== 'string' || typeof data.url !== 'string') return;
            const link = { label: data.label, url: data.url };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, links: [...(m.links || []), link] } : m
              )
            );
          },

          onError: (data) => {
            setError(data.message || data.error);
            setStatusText(null);
            setIsStreaming(false);
          },

          onDone: () => {
            setStatusText(null);
            setIsStreaming(false);
            abortRef.current = null;
          },
        }
      );

      abortRef.current = handle;
    },
    [conversationId]
  );

  /**
   * Start a new conversation — clears messages and resets state.
   */
  const startNewConversation = useCallback(() => {
    touchedRef.current = true;
    setIsRestoring(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([]);
    setConversationId(null);
    setIsStreaming(false);
    setStatusText(null);
    setError(null);
    streamTextRef.current = '';
  }, []);

  /**
   * "Delete conversation": every conversation the assistant keeps for this
   * person goes (DELETE /api/ai/conversations/:id), this one and any earlier
   * one (other visits, the apps), which the apps would otherwise show again.
   * Then the thread starts over. If something is left, the thread stays and
   * `error` says so.
   */
  const deleteConversations = useCallback(async (): Promise<boolean> => {
    touchedRef.current = true;
    setIsRestoring(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    setStatusText(null);
    setError(null);
    const deleted = new Set<string>();
    const activeId = conversationId;
    try {
      // Read oldest first across every page, keeping the displayed thread until it is the only one left.
      for (let round = 0; round < 20; round += 1) {
        const { conversations } = await api.ai.getConversations({ order: 'oldest' });
        const onlyActive = conversations.length === 1 && conversations[0].id === activeId;
        const ids = conversations.map((c) => c.id).filter((id) => !deleted.has(id) && (id !== activeId || onlyActive));
        if (conversations.length === 0) {
          startNewConversation();
          return true;
        }
        // Listed again after its delete went through: the server kept it.
        if (ids.length === 0) break;
        for (const id of ids) {
          await api.ai.deleteConversation(id);
          deleted.add(id);
          // A later verification read can fail too; never keep showing a thread we know is gone.
          if (id === activeId) startNewConversation();
        }
      }
      setError("Couldn't delete the conversation. Try again.");
    } catch (err) {
      // The displayed thread goes only once it is the last one listed, so after its delete only the check failed.
      if (activeId && deleted.has(activeId)) return true;
      const status = (err as { statusCode?: number } | null)?.statusCode;
      setError(status === 429
        ? "Couldn't delete it all yet. Try again in a minute."
        : "Couldn't delete the conversation. Try again.");
    }
    return false;
  }, [conversationId, startNewConversation]);

  /**
   * Open one of the person's conversations: it is continued by the next message, and its history shows.
   */
  const loadConversation = useCallback((id: string) => {
    touchedRef.current = true;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([]);
    setConversationId(id);
    setIsStreaming(false);
    setError(null);
    streamTextRef.current = '';
    api.ai.getConversationMessages(id, AI_CARDS)
      .then((history) => setMessages((current) => (current.length ? current : messagesFromHistory(history.messages || []))))
      .catch(() => {});
  }, []);

  /**
   * Abort any in-flight stream.
   */
  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    setStatusText(null);
  }, []);

  return {
    messages,
    conversationId,
    isRestoring,
    isStreaming,
    statusText,
    error,
    sendMessage,
    startNewConversation,
    deleteConversations,
    loadConversation,
    abort,
  };
}
