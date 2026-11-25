// ============================================================
// MADE-UP NAMES (/api/pen-names)
// A person's one made-up name for Pulse posts and replies, the small card a made-up name opens, and muting or blocking
// one. Posting under it is `postAs: 'pen_name'` on posts.createPost and posts.addComment.
// Contract: docs/product/made-up-names/README.md. Every refusal is { error, code }: show `error` as it is.
// ============================================================

import { get, post, del } from '../client';
import type { Post } from '@pantopus/types/post';

/** The person's own made-up name. */
export interface OwnPenName {
  id: string;
  name: string;
  avatar_url: string | null;
  taken_at: string | null;
  /** When a name something was written under may be changed again. */
  change_after: string | null;
}

export interface PenNameRefusal {
  code: string;
  message: string;
}

export interface PenNameMe {
  pen_name: OwnPenName | null;
  /** False when this account can't use a made-up name; `refusal.message` says why. */
  allowed: boolean;
  refusal: PenNameRefusal | null;
  limits?: Record<string, number>;
  name_rules: { min: number; max: number };
  /** The kinds of post a made-up name may carry. */
  post_types: string[];
  /** The three sentences of the promise, shown where the name is chosen. */
  promise: string[];
  /** Names Pantopus could give (when the person has none and may have one). */
  suggestions: string[];
}

/** The small card a made-up name opens. */
export interface PenNameCard {
  id: string;
  name: string;
  avatar_url: string | null;
  badges: string[];
  note: string;
  is_yours: boolean;
  muted: boolean;
  blocked: boolean;
}

export interface PenNameCheck {
  allowed: boolean;
  refusal: PenNameRefusal | null;
  /** Shown above the Post button when few verified homes are near. */
  warning: string | null;
}

export async function getMine(): Promise<PenNameMe> {
  return get('/api/pen-names/me');
}

/** Takes the typed name; an empty name lets Pantopus give one. `replace` gives up the name in use. */
export async function takeName(data: { name?: string; replace?: boolean }): Promise<{ pen_name: OwnPenName }> {
  return post('/api/pen-names', data);
}

export async function getSuggestions(): Promise<{ suggestions: string[] }> {
  return get('/api/pen-names/suggestions');
}

/** Whether a post made here may carry a made-up name, and the warning to show above the Post button. */
export async function check(latitude: number, longitude: number): Promise<PenNameCheck> {
  return get('/api/pen-names/check', { latitude, longitude });
}

/** The person's own made-up-name posts, newest first. Only they can read it. */
export async function getMyPosts(params?: { before?: string; limit?: number }): Promise<{ posts: Post[]; next_before: string | null }> {
  return get('/api/pen-names/me/posts', params);
}

export async function getCard(id: string): Promise<{ pen_name: PenNameCard }> {
  return get(`/api/pen-names/${encodeURIComponent(id)}`);
}

export async function mute(id: string): Promise<{ success: boolean }> {
  return post(`/api/pen-names/${encodeURIComponent(id)}/mute`);
}

export async function unmute(id: string): Promise<{ success: boolean }> {
  return del(`/api/pen-names/${encodeURIComponent(id)}/mute`);
}

export async function block(id: string): Promise<{ success: boolean }> {
  return post(`/api/pen-names/${encodeURIComponent(id)}/block`);
}

export async function unblock(id: string): Promise<{ success: boolean }> {
  return del(`/api/pen-names/${encodeURIComponent(id)}/block`);
}
