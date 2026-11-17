// The guidance cards' state for each signed-in account: the top-level `guidance` of the profile the app
// already loads (GET /api/users/profile, heard through api.users.onProfileGuidance), and the answer of each
// POST /api/users/guidance/shown. getMyProfile's answer, the profile entry (lib/me.ts), stays the user alone.
import { useSyncExternalStore } from 'react';
import type { GuidanceState } from '@pantopus/types';

const byAccount = new Map<string, GuidanceState>();
const listeners = new Set<() => void>();

export function setProfileGuidance(userId: string, guidance: GuidanceState): void {
  byAccount.set(userId, guidance);
  listeners.forEach((fn) => fn());
}

export function profileGuidance(userId: string | null | undefined): GuidanceState | undefined {
  return userId ? byAccount.get(userId) : undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The account's guidance state, or undefined until its profile has loaded. */
export function useProfileGuidance(userId: string | null | undefined): GuidanceState | undefined {
  return useSyncExternalStore(subscribe, () => profileGuidance(userId), () => undefined);
}
