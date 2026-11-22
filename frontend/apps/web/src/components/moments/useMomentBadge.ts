'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { location, moments } from '@pantopus/api';
import { useMe } from '@/lib/me';
import { around, world } from './momentState';

export function useMomentBadge(enabled: boolean) {
  const client = useQueryClient(),
    path = usePathname(),
    account = useMe({ enabled }).data?.id;
  const active = path === '/app/moments' || path?.startsWith('/app/moments/');
  const area = useQuery({
    queryKey: ['moments', 'initial-area', account],
    queryFn: () => location.getLocation(),
    enabled: !!account && enabled,
    staleTime: 60000,
    retry: false,
  });
  const anchor = area.data?.viewingLocation || area.data?.homes[0];
  const box = anchor ? around(anchor) : world;
  if (box.east > 180) box.east = 180;
  if (box.west < -180) box.west = -180;
  const visitKey = 'pantopus:moments:last-visit:' + account;
  useEffect(() => {
    if (!enabled || !account || !active) return;
    try {
      sessionStorage.setItem(visitKey, new Date().toISOString());
    } catch {}
    void client.invalidateQueries({ queryKey: ['moments', 'unseen', account] });
  }, [account, active, client, enabled, visitKey]);
  const badge = useQuery({
    queryKey: ['moments', 'unseen', account, box],
    queryFn: () => {
      let since: string | undefined;
      try {
        since = sessionStorage.getItem(visitKey) || undefined;
      } catch {}
      return moments.unseen(box, since);
    },
    enabled: !!account && enabled && !active && area.isFetched,
    staleTime: 30000,
    refetchInterval: 60000,
    retry: false,
  });
  return !active && enabled && !badge.isError && (badge.data?.count || 0) > 0;
}
