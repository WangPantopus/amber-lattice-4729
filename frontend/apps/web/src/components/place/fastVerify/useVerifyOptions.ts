'use client';

// The server's verify-options answer for one Home (FASTVERIFY). Null while
// `home_fast_verify` is off (404) or the answer can't be read: every caller then
// keeps today's screens, so nothing changes with the flags off.

import { useQuery, type QueryClient } from '@tanstack/react-query';
import * as api from '@pantopus/api';

export const verifyOptionsKey = (homeId: string) => ['homeVerify', 'options', homeId.toLowerCase()] as const;

export function useVerifyOptions(homeId: string | null | undefined, options: { enabled?: boolean } = {}) {
  const enabled = !!homeId && (options.enabled ?? true);
  const query = useQuery({
    queryKey: verifyOptionsKey(homeId ?? ''),
    queryFn: async () => {
      try {
        return await api.homeVerify.getVerifyOptions(homeId as string);
      } catch {
        // An unreadable answer keeps today's screens.
        return null;
      }
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  });
  return {
    /** The answer, or null when the faster verification is off for this Home. */
    data: enabled ? query.data ?? null : null,
    /** Still waiting on the first answer. */
    loading: enabled && query.isLoading,
  };
}

// Postal status remains available when the fast verification switch is off.
export function useMailAvailable(homeId: string) {
  const result = useQuery({
    queryKey: ['homeVerify', 'mail', api.authSessionMarker(), homeId],
    queryFn: () => api.homeOwnership.getCurrentPostcardStatus(homeId),
    enabled: !!homeId && !!api.getAuthToken(),
    retry: false,
  });
  const status = result.data;
  return status?.home_id === homeId && (status.can_request || status.can_resume || status.can_verify);
}

/** After a check or a postcard changes the person's level. */
export function invalidateVerifyOptions(queryClient: QueryClient, homeId: string) {
  return queryClient.invalidateQueries({ queryKey: verifyOptionsKey(homeId) });
}
