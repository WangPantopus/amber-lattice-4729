'use client';

import type { ReactNode } from 'react';
import { MomentAvatar } from '@/components/moments/MomentLinks';
import Link from 'next/link';

interface Props {
  /** The page the name beside the photo links to, e.g. `/${username}`; nothing links without one. */
  href?: string | null;
  children: ReactNode;
  momentUserId?: string | null;
  name?: string;
  className?: string;
  stopPropagation?: boolean;
}

/**
 * A person's photo that opens the same page as their name beside it. The name stays the one link keyboards and
 * screen readers reach, so the photo is a second, pointer-only way in.
 */
export default function UserAvatarLink({ href, children, momentUserId, name, className = '', stopPropagation = true }: Props) {
  const normal = !href ? children : (
    <Link
      href={href}
      tabIndex={-1}
      aria-hidden="true"
      className={`inline-flex flex-shrink-0 rounded-full ${className}`}
      onClick={(e) => { if (stopPropagation) e.stopPropagation(); }}
    >
      {children}
    </Link>
  );
  return momentUserId ? <MomentAvatar id={momentUserId} name={name} fallback={normal}>{children}</MomentAvatar> : <>{normal}</>;
}
