'use client';

import { useState } from 'react';
import { BadgeCheck, Building2, Type } from 'lucide-react';
import type { Author, Ring } from '@pantopus/api/endpoints/moments';
import { colors } from './momentState';

export function MomentFace({
  author,
  fresh = false,
  segments = 1,
}: {
  author: Author;
  fresh?: boolean;
  segments?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const step = 360 / Math.max(1, Math.min(segments, 16));
  return (
    <span className={`mo-face${fresh ? ' mo-new' : ''}`}>
      {segments > 1 && (
        <span
          className="mo-segments"
          style={{
            background: `repeating-conic-gradient(transparent 0deg ${step - 4}deg, var(--mo-paper,white) ${step - 4}deg ${step}deg)`,
          }}
        />
      )}
      <span className="mo-face-inner">
        {author.avatar_url && author.avatar_url !== failed ? (
          <img src={author.avatar_url} alt="" onError={() => setFailed(author.avatar_url)} />
        ) : author.kind === 'business' ? (
          <Building2 size={18} />
        ) : (
          author.initials
        )}
      </span>
      {author.verified && <BadgeCheck aria-label="Verified" className="mo-verified" size={15} />}
    </span>
  );
}
export function PinFace({ ring }: { ring: Ring }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!ring.preview || (ring.preview.thumb_url && failed === ring.preview.thumb_url))
    return <MomentFace author={ring.author} fresh={!!ring.unseen_count} segments={ring.moments.length} />;
  return (
    <span className={`mo-pin-preview ${ring.unseen_count ? 'mo-new' : ''}`}>
      <span className="mo-pin-media" style={{ background: colors[ring.preview.background || 'teal'] }}>
        {ring.preview.thumb_url ? (
          <img
            src={ring.preview.thumb_url}
            alt=""
            onError={() => setFailed(ring.preview?.thumb_url || null)}
          />
        ) : (
          <Type size={20} />
        )}
      </span>
      <span className="mo-pin-author">
        <MomentFace author={ring.author} />
      </span>
    </span>
  );
}
