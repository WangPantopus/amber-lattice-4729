'use client';

// A Pulse post made in the Studio, in the new Pulse (coord/CONTRACT.md §6d, §7b, §7c): its one picture drawn whole, at
// its own shape up to 4:5 tall, with the stamps, playable items and dots its author placed on it, where they were placed.
// Given to today's PostCard through its optional `overMedia` (LEAD-3's yes, QUESTIONS 04:21); a post with nothing placed
// on it, or with several pictures, keeps today's picture. A tap anywhere but on an item opens the post, as today.

import { useState } from 'react';
import type { Post } from '@pantopus/api';
import type { Moment } from '@pantopus/api/endpoints/moments';
import StampLayer from '../stamps/StampLayer';
import type { ShownStamp, StampKind } from '../stamps/stampTypes';
import PlayLayer from '../play/PlayLayer';
import BeforeAfter, { beforeAfterOf } from '../play/BeforeAfter';
import type { PlayItem } from '../play/playTypes';
import DotLayer from '../dots/DotLayer';
import './pulse.css';

type StudioPost = Post & { stamps?: ShownStamp[]; play?: unknown[]; dots?: unknown[]; user_id?: string };

const TALLEST = 4 / 5;

function placed(post: StudioPost) {
  return (post.stamps?.length || 0) + (post.play?.length || 0) + (post.dots?.length || 0) > 0;
}

function Picture({ post, url }: { post: StudioPost; url: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const stamps = post.stamps || [];
  const values = new Map<StampKind, unknown>(stamps.map((s) => [s.kind, s.value]));
  // The layers' own shape: Play and dots read the post as they read a Moment (its id, its author, its items).
  const shim = { id: post.id, author: { id: post.user_id ?? (post as { creator?: { id?: string } }).creator?.id }, play: post.play, dots: post.dots } as unknown as Moment;
  // A before and after: the picture is the two photos side by side; the frame is one of them, with the curtain.
  const pair = beforeAfterOf(post.play as PlayItem[] | undefined);
  const shape = (ratio ?? 1) / (pair ? 2 : 1);
  // Taller than 4:5: the frame stops at 4:5 and the whole picture sits in its middle; the layers follow the picture.
  const width = shape >= TALLEST ? 100 : (shape / TALLEST) * 100;
  return (
    <div className="rp-studio-pic" style={{ aspectRatio: String(Math.max(shape, TALLEST)) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the post's own signed picture */}
      <img
        src={url}
        alt=""
        style={pair ? { visibility: 'hidden' } : undefined}
        onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1)}
      />
      {ratio && (
        <div className="rp-studio-layers" style={{ width: `${width}%`, left: `${(100 - width) / 2}%` }}>
          {pair && <BeforeAfter src={url} item={pair} />}
          {stamps.length > 0 && <StampLayer stamps={stamps} valueOf={(k) => values.get(k) ?? null} ink="dry" />}
          <PlayLayer moment={shim} post />
          <DotLayer moment={shim} post />
        </div>
      )}
    </div>
  );
}

/** For PostCard's `overMedia`: the Studio picture for a post that has something placed on it, else today's (null). */
export function studioPostPicture(post: Post, mediaIndex: number) {
  const p = post as StudioPost;
  const url = post.media_urls?.[mediaIndex];
  if (!url || !placed(p) || String(post.media_types?.[mediaIndex] || 'image').startsWith('video')) return null;
  return <Picture post={p} url={url} />;
}
