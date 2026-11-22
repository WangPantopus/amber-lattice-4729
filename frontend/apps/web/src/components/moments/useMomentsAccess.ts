'use client';

import { useQuery } from '@tanstack/react-query';
import { featureFlags, getAuthToken } from '@pantopus/api';

export function useMomentsAccess() {
  return useQuery({
    queryKey: ['featureFlag', 'moments'],
    queryFn: () => featureFlags.getFeatureFlag('moments'),
    enabled: typeof window !== 'undefined' && !!getAuthToken(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
  });
}
