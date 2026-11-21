// The house on Today (JOURNEYS, founder approval 2026-11-21): the profile's top-level `today_house`, from the
// profile the app already loads (api.users.onProfileTodayHouse). Off until a profile says on; a missing key is off.
import { useSyncExternalStore } from 'react';
import * as api from '@pantopus/api';

let on = false;
let listening = false;
const listeners = new Set<() => void>();

function listen(): void {
  if (listening) return;
  listening = true;
  // Absent where the API is a test double: the house stays off.
  api.users?.onProfileTodayHouse?.((value) => {
    if (value === on) return;
    on = value;
    listeners.forEach((fn) => fn());
  });
}

function subscribe(listener: () => void): () => void {
  listen();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether the server has the house on for this account (code outside rendering). */
export function todayHouseOn(): boolean {
  listen();
  return on;
}

export function useTodayHouse(): boolean {
  return useSyncExternalStore(subscribe, todayHouseOn, () => false);
}
