/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';

/**
 * A picture the server sent (a piece's cover, a shelf object, a writer's portrait). A plain image, not next/image:
 * the optimizer accepts only Pantopus's own storage and throws for any other host, which would take the whole profile
 * down for one picture. One that fails to load leaves nothing behind.
 */
export default function Picture({ src, alt = '', className = '' }: { src: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !/^https?:\/\//i.test(src)) return null;
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
