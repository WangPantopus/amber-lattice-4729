'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Home, VenetianMask } from 'lucide-react';
import PenNameCard from './PenNameCard';

/** The made-up name's drawn picture (the server draws it; nobody uploads one). */
export function PenNameAvatar({ url, name, size = 36, className = '' }: { url?: string | null; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        quality={75}
        onError={() => setFailed(true)}
        className={`flex-shrink-0 rounded-full bg-slate-100 object-cover ring-2 ring-app ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <DrawnPicture name={name} size={size} className={className} />;
}

/** A picture drawn here from the name, until the server's is in (the name screen, before the name is taken). */
export function DrawnPicture({ name, size = 56, className = '' }: { name: string; size?: number; className?: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-app ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${(hue + 50) % 360} 60% 35%))`,
      }}
    >
      {initials}
    </div>
  );
}

/** "Made-up name" and "Verified home nearby": what others know about a made-up name. */
export function MadeUpNameMarks({ badges, className = '' }: { badges?: string[] | null; className?: string }) {
  const list = badges && badges.length > 0 ? badges : ['made_up_name', 'verified_home'];
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} data-testid="madeUpNameMarks">
      {list.includes('made_up_name') && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700/40 dark:text-slate-200">
          <VenetianMask className="h-3 w-3" aria-hidden="true" /> Made-up name
        </span>
      )}
      {list.includes('verified_home') && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
          <Home className="h-3 w-3" aria-hidden="true" /> Verified home nearby
        </span>
      )}
    </span>
  );
}

/** The line only the writer sees under their own made-up-name post or reply. */
export function OnlyYouLine({ className = '' }: { className?: string }) {
  return <span className={`text-[11px] text-app-muted ${className}`} data-testid="madeUpNameOnlyYou">Only you can see this is you</span>;
}

/**
 * A made-up name where an author's name goes: a tap opens the small card (never a profile). The writer reads
 * "Night Gardener (you)".
 */
export function MadeUpAuthorName({
  penNameId,
  name,
  isYou,
  onReport,
  className = 'text-sm font-semibold text-app',
}: {
  penNameId: string | null;
  name: string;
  isYou: boolean;
  /** The post's own Report, offered on the small card (a reply has none). */
  onReport?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = isYou ? `${name} (you)` : name;
  if (!penNameId) return <span className={`truncate ${className}`}>{label}</span>;
  return (
    <>
      <button
        type="button"
        data-testid="madeUpAuthorName"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`truncate text-left hover:underline ${className}`}
      >
        {label}
      </button>
      <PenNameCard penNameId={penNameId} open={open} onClose={() => setOpen(false)} onReport={onReport} fallbackName={name} />
    </>
  );
}

/** The drawn picture where an author's photo goes; a tap opens the same small card. */
export function MadeUpAuthorPicture({
  penNameId,
  name,
  url,
  size = 36,
  onReport,
  className = '',
}: {
  penNameId: string | null;
  name: string;
  url?: string | null;
  size?: number;
  onReport?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const picture = <PenNameAvatar url={url} name={name} size={size} />;
  if (!penNameId) return <span className={className}>{picture}</span>;
  return (
    <>
      <button
        type="button"
        aria-label={name}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`flex-shrink-0 rounded-full ${className}`}
      >
        {picture}
      </button>
      <PenNameCard penNameId={penNameId} open={open} onClose={() => setOpen(false)} onReport={onReport} fallbackName={name} />
    </>
  );
}
