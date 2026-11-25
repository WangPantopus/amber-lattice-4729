// ============================================================
// AI AGENT ENDPOINTS
// Chat agent, draft generation, mail summarization, place brief
// ============================================================

import { get, post, del, getApiBaseUrl, fetchAuthHeaders, refreshAuthSession } from '../client';
import type {
  AIDraftGigRequest,
  AIDraftGigResponse,
  AIDraftListingRequest,
  AIDraftListingResponse,
  ListingDraft,
  AIDraftPostRequest,
  AIDraftPostResponse,
  AIPostSuggestionRequest,
  AIPostSuggestionResponse,
  AISummarizeMailRequest,
  MailSummary,
  PlaceBrief,
  NeighborhoodPulse,
  AIConversation,
  AIConversationMessages,
  AIActionCardState,
  AIChatRequest,
} from '@pantopus/types';

// ─── Streaming Chat ──────────────────────────────────────────

/**
 * Stream a chat message to the AI agent via SSE.
 * Returns an object with methods to subscribe to events and abort.
 */
export function streamChat(
  data: AIChatRequest,
  handlers: {
    onConversation?: (data: { conversationId: string; isNew: boolean }) => void;
    /** What the assistant is doing while a tool runs ("Drafting your post…"). */
    onStatus?: (data: { tool: string; message: string }) => void;
    onTextDelta?: (delta: string) => void;
    onDraft?: (data: { type: string; draft: unknown; valid: boolean }) => void;
    /** A button under the reply that opens a screen in the app (sent only to apps that list "link" in `cards`). */
    onLink?: (data: { label: string; url: string }) => void;
    onError?: (data: { error: string; message: string }) => void;
    onDone?: (data: { conversationId: string; usage: { inputTokens: number; outputTokens: number }; toolCalls: number }) => void;
  }
) {
  const controller = new AbortController();

  const dispatchSseEvent = (eventName: string, payload: string) => {
    try {
      const parsed = JSON.parse(payload);
      switch (eventName) {
        case 'conversation':
          handlers.onConversation?.(parsed);
          break;
        case 'status':
          handlers.onStatus?.(parsed);
          break;
        case 'text_delta':
          handlers.onTextDelta?.(parsed.delta);
          break;
        case 'draft':
          handlers.onDraft?.(parsed);
          break;
        case 'link':
          handlers.onLink?.(parsed);
          break;
        case 'error':
          handlers.onError?.(parsed);
          break;
        case 'done':
          handlers.onDone?.(parsed);
          break;
        case 'close':
          break;
      }
    } catch {
      // Skip malformed JSON payloads.
    }
  };

  const parseSseChunk = (chunk: string) => {
    const blocks = chunk.split('\n\n');
    for (const block of blocks) {
      if (!block.trim()) continue;
      let eventName = '';
      let payload = '';
      const lines = block.split('\n');
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventName = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          payload = line.slice(6);
        }
      }
      if (eventName && payload) dispatchSseEvent(eventName, payload);
    }
  };

  const send = () => fetch(`${getApiBaseUrl()}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...fetchAuthHeaders('POST'),
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal: controller.signal,
  });

  const run = async () => {
    let response = await send();
    // This raw fetch misses the axios client's refresh-and-retry. Once the hour-long access token
    // lapses, refresh the session the same way and send once more.
    if (response.status === 401) {
      const refreshed = await refreshAuthSession({ trigger: 'ai_chat' }).catch(() => null);
      if (refreshed?.status === 'success') response = await send();
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'NETWORK_ERROR' }));
      handlers.onError?.({
        error: errorBody.error || 'NETWORK_ERROR',
        message: errorBody.message || 'Failed to connect to AI.',
      });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      // React Native/Expo fetch may not expose ReadableStream.
      // Fallback: consume the full SSE payload and replay events after completion.
      const fullText = await response.text().catch(() => '');
      if (!fullText) {
        handlers.onError?.({ error: 'NO_STREAM', message: 'Streaming not supported.' });
        return;
      }
      parseSseChunk(fullText);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    // An event can straddle two network chunks (its blank line arriving in the
    // next one), so its name and data outlive a single chunk.
    let currentEvent = '';
    let currentData = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete last line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '' && currentEvent && currentData) {
            // End of event — dispatch
            dispatchSseEvent(currentEvent, currentData);
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        handlers.onError?.({ error: 'STREAM_ERROR', message: 'Connection lost.' });
      }
    }
  };

  run().catch((err) => {
    if (err.name !== 'AbortError') {
      handlers.onError?.({ error: 'NETWORK_ERROR', message: 'Failed to connect to AI.' });
    }
  });

  return {
    abort: () => controller.abort(),
  };
}

// ─── Single-turn Drafts ──────────────────────────────────────

/**
 * Generate a gig/task draft from free text.
 */
export async function draftGig(data: AIDraftGigRequest): Promise<AIDraftGigResponse> {
  return post<AIDraftGigResponse>('/api/ai/draft/gig', data);
}

/**
 * Generate a listing draft from free text.
 */
export async function draftListing(data: AIDraftListingRequest): Promise<AIDraftListingResponse> {
  return post<AIDraftListingResponse>('/api/ai/draft/listing', data);
}

/**
 * Generate a listing draft from images (Snap & Sell).
 */
export async function draftListingFromImages(data: {
  images: string[];
  text?: string;
  latitude?: number;
  longitude?: number;
}): Promise<{
  draft: ListingDraft;
  confidence: number;
  priceSuggestion?: { low: number; median: number; high: number; basis: string; comparable_count: number } | null;
}> {
  return post('/api/ai/draft/listing-vision', data);
}

/**
 * Generate a post draft from free text.
 */
export async function draftPost(data: AIDraftPostRequest): Promise<AIDraftPostResponse> {
  return post<AIDraftPostResponse>('/api/ai/draft/post', data);
}

/**
 * The composer's AI assist: the whole post suggested from the person's photos (JPEGs, up to 4), the place they picked
 * and what they've written so far. The server reads the photos in memory and keeps nothing; nothing is posted.
 */
export async function suggestPost(
  fields: AIPostSuggestionRequest,
  photos: Blob[] = [],
): Promise<AIPostSuggestionResponse> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && value.trim()) form.append(key, value);
  }
  photos.slice(0, 4).forEach((photo, index) => form.append('photos', photo, `photo-${index}.jpg`));
  return post<AIPostSuggestionResponse>('/api/ai/draft/post-suggestion', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // The server answers within 25 s; the photos take a moment to go up first.
    timeout: 45000,
    // A failed suggestion shows on the composer's assist card.
    suppressDevErrorOverlay: true,
  });
}

// ─── Mail Summarization ──────────────────────────────────────

/**
 * Summarize a mail item with action extraction.
 */
export async function summarizeMail(data: AISummarizeMailRequest): Promise<MailSummary> {
  return post<MailSummary>('/api/ai/summarize/mail', data);
}

// ─── Place Brief ─────────────────────────────────────────────

/**
 * Get a place brief with external data synthesis.
 */
export async function getPlaceBrief(placeId: string): Promise<PlaceBrief> {
  return get<PlaceBrief>('/api/ai/place-brief', { placeId });
}

// ─── Neighborhood Pulse ─────────────────────────────────────

/**
 * Get a neighborhood pulse for a home (cold-start intelligence).
 */
export async function getNeighborhoodPulse(homeId: string): Promise<NeighborhoodPulse> {
  return get<NeighborhoodPulse>('/api/ai/pulse', { homeId });
}

// ─── Conversation Management ─────────────────────────────────

/**
 * List the user's AI conversations.
 */
export async function getConversations(options?: { order: 'oldest' | 'newest' }): Promise<{ conversations: AIConversation[] }> {
  return get<{ conversations: AIConversation[] }>('/api/ai/conversations', options);
}

/**
 * A conversation's history, so the assistant page shows it again after the person leaves and comes back. `cards` is
 * the chat request's list: the server returns only the cards this app can show (phase 1 contract, section 3).
 */
export async function getConversationMessages(id: string, cards: string[]): Promise<AIConversationMessages> {
  return get<AIConversationMessages>(`/api/ai/conversations/${encodeURIComponent(id)}/messages`, { cards: cards.join(',') });
}

/**
 * What was done on an action card, so the person's other devices show it (phase 3 contract, section 4.2): `done` with
 * the button (and its row) after its request went through, `dismissed` after "Not now". 404 CARD_UNKNOWN means the
 * server kept no record of the card; callers ignore it.
 */
export async function reportCardState(
  cardId: string,
  report: { status: 'done'; action_id: string; item_id?: string | null; link?: string | null } | { status: 'dismissed' },
): Promise<{ state: AIActionCardState }> {
  return post<{ state: AIActionCardState }>(`/api/ai/cards/${encodeURIComponent(cardId)}/state`, report, { suppressDevErrorOverlay: true });
}

/**
 * Delete an AI conversation.
 */
export async function deleteConversation(id: string): Promise<{ message: string }> {
  return del<{ message: string }>(`/api/ai/conversations/${id}`);
}

/** One thing that waits on the person (GET /api/ai/needs-you): the apps' Today "Needs you" rows. */
export interface NeedsYouItem {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  due_at?: string | null;
  /** The apps' link (pantopus://…): each client opens its own screen for it. */
  link?: string | null;
  subject?: { type: string; id: string | null; home_id?: string | null } | null;
}

/** What waits on the person, most urgent first (at most 20). */
export async function getNeedsYou(): Promise<{ items: NeedsYouItem[]; partial?: boolean }> {
  return get('/api/ai/needs-you');
}
