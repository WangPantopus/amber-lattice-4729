'use client';

// Made-up names (docs/product/made-up-names/README.md): a person may write a Pulse post or a reply under one made-up
// name. In code it is a pen name; on screen it is always "made-up name".

import { useQuery } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import type { Post, PostComment } from '@pantopus/types';

/** The kinds of post a made-up name may carry (the server's list, less its own plain "share"). */
export const PEN_NAME_POST_TYPES: readonly string[] = ['ask_local', 'recommendation', 'local_update', 'neighborhood_win'];

export const PEN_NAME_ME_KEY = ['pen-names', 'me'] as const;

type Row = Pick<Post, 'made_up_name' | 'viewer_is_author' | 'user_id'> & {
  author?: { type?: string; id?: string; madeUp?: boolean; isYou?: boolean; displayName?: string; avatarUrl?: string | null; badges?: string[] } | null;
};

/** A post or reply written under a made-up name. */
export function isMadeUp(row: Row | null | undefined): boolean {
  if (!row) return false;
  return row.made_up_name === true || row.author?.type === 'pen_name' || row.author?.madeUp === true;
}

/** The viewer wrote this under their made-up name ("(you)"). Only the writer is ever told. */
export function isMadeUpByMe(row: Row | null | undefined): boolean {
  return isMadeUp(row) && (row?.viewer_is_author === true || row?.author?.isYou === true);
}

/** The made-up name's id, for its small card, Mute and Block. */
export function penNameIdOf(row: Row | null | undefined): string | null {
  if (!isMadeUp(row)) return null;
  return row?.author?.id || null;
}

/** Which name the viewer already has in this conversation: one voice per conversation, as the server keeps it. */
export type ConversationVoice = 'pen_name' | 'named' | null;

export function voiceInConversation(
  post: Post | null | undefined,
  comments: readonly PostComment[],
  viewerId: string | null | undefined,
): ConversationVoice {
  if (!post || !viewerId) return null;
  const rows: Row[] = [post, ...comments];
  if (rows.some((row) => isMadeUpByMe(row))) return 'pen_name';
  if (rows.some((row) => !isMadeUp(row) && row.user_id === viewerId)) return 'named';
  return null;
}

/**
 * Whether a reply to this post may be written under a made-up name: a made-up-name conversation, or a post of a kind a
 * made-up name may carry, to people nearby (never Connections, a home, a business or a plan).
 */
export function takesPenNameReply(post: Post | null | undefined): boolean {
  if (!post) return false;
  if (isMadeUp(post)) return true;
  if (!PEN_NAME_POST_TYPES.includes(post.post_type)) return false;
  if (post.visibility === 'connections' || post.visibility === 'private' || post.visibility === 'followers') return false;
  if (post.home_id || post.business_id || post.post_metadata?.plan === true) return false;
  return post.author?.type == null || post.author.type === 'local';
}

/** The person's own made-up name, whether they may use one, the promise and names Pantopus could give. */
export function usePenNameMe(enabled = true) {
  return useQuery({
    queryKey: PEN_NAME_ME_KEY,
    queryFn: () => api.penNames.getMine(),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}

/** The words a refusal from the server carries ({ error, code }), shown as they are. */
export function refusalWords(err: unknown, fallback = "That didn't work. Please try again."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** The refusal's code (PEN_NAME_TOO_SOON, PEN_NAME_NEEDED, …). */
export function refusalCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}
