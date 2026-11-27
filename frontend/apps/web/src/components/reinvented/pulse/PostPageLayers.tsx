'use client';

// The post page's Studio layers (Pulse, reinvented; coord/CONTRACT.md §7b, "stamps on the play read"; LEAD-3 04:21's
// conditions). A Pulse post made in the Studio with one picture shows on its own page as the new Pulse's list shows it:
// the whole picture at its own shape, up to 4:5, with the stamps, Play and dots its author placed on it. This applies
// only while the server says the switch is on for the reader (never a kept answer), and only for a post with one
// picture and something placed on it. Otherwise the hook answers null and the page keeps today's picture. The layers
// come from GET /api/reinvented/play/:id. A tap anywhere but on an item opens the picture full size, as today.

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Post } from '@pantopus/api';
import { get } from '@pantopus/api/client';
import { usePulseReinvented } from '../usePulseReinvented';
import { studioPostPicture } from './StudioPostPicture';

interface Layers {
  play?: unknown[];
  dots?: unknown[];
  stamps?: unknown[];
}

/** The post page's picture with its layers, or null for today's. `onOpen` opens a picture full size (today's lightbox). */
export function usePostPagePicture(post: Post | null | undefined, shown: readonly number[], onOpen: (index: number) => void): ReactNode {
  const on = usePulseReinvented(!!post).data?.enabled === true;
  const index = shown.length === 1 ? shown[0] : -1;
  const picture = !!post && index >= 0 && !String(post.media_types?.[index] || 'image').startsWith('video');
  const layers = useQuery({
    queryKey: ['reinvented', 'post-layers', post?.id ?? null],
    enabled: on && picture,
    retry: false,
    staleTime: 60_000,
    queryFn: ({ signal }) => get<Layers>(`/api/reinvented/play/${encodeURIComponent(post!.id)}`, {}, { signal }),
  });
  if (!on || !picture || !post || !layers.data) return null;
  const { play = [], dots = [], stamps = [] } = layers.data;
  const drawn = studioPostPicture({ ...post, play, dots, stamps } as Post, index);
  if (!drawn) return null;
  return (
    <div
      className="px-5 pb-4 cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label="View attachment 1 full size"
      onClick={() => onOpen(index)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(index);
        }
      }}
    >
      {drawn}
    </div>
  );
}
