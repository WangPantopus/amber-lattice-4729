'use client';

import { useState } from 'react';
import { User } from 'lucide-react';
import type { PenNameMe } from '@pantopus/api';
import PenNameSetup from './PenNameSetup';
import { PenNameAvatar } from './MadeUpName';

export type PostAsValue = 'personal' | 'pen_name';

/**
 * "Post as": the person's own name ("your name and profile") or their made-up name ("others can't see it's you"). The
 * first time, the made-up name opens the name screen. When the account can't use one, the row says why and can't be
 * chosen.
 */
export default function PostAsChoice({
  ownName,
  me,
  value,
  onChange,
  compact = false,
  testId = 'postAsChoice',
}: {
  ownName: string;
  me: PenNameMe | null | undefined;
  value: PostAsValue;
  onChange: (value: PostAsValue) => void;
  compact?: boolean;
  testId?: string;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  if (!me) return null;
  const pen = me.pen_name;
  const refused = !me.allowed;
  const pill = (active: boolean) => `flex min-w-0 items-center gap-2 rounded-xl border text-left transition disabled:cursor-not-allowed ${
    compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
  } ${active
    ? 'border-slate-700 bg-slate-800 text-white dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900'
    : 'border-app bg-surface text-app hover-bg-app'}`;

  return (
    <div data-testid={testId}>
      <p className={`mb-1.5 font-semibold uppercase tracking-wide text-app-secondary ${compact ? 'text-[10px]' : 'text-xs'}`}>Post as</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" data-testid={`${testId}Own`} aria-pressed={value === 'personal'} onClick={() => onChange('personal')} className={pill(value === 'personal')}>
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
            <User className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold">{ownName}</span>
            <span className={`block truncate text-[11px] ${value === 'personal' ? 'opacity-80' : 'text-app-muted'}`}>your name and profile</span>
          </span>
        </button>
        <button
          type="button"
          data-testid={`${testId}PenName`}
          aria-pressed={value === 'pen_name'}
          disabled={refused}
          onClick={() => {
            if (pen) onChange('pen_name');
            else setSetupOpen(true);
          }}
          className={pill(value === 'pen_name')}
        >
          <PenNameAvatar url={pen?.avatar_url} name={pen?.name || 'Made-up name'} size={28} />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold">{pen?.name || 'Made-up name'}</span>
            <span className={`block text-[11px] ${refused ? 'whitespace-normal text-amber-700 dark:text-amber-300' : `truncate ${value === 'pen_name' ? 'opacity-80' : 'text-app-muted'}`}`}>
              {refused ? me.refusal?.message : "others can't see it's you"}
            </span>
          </span>
        </button>
      </div>
      <PenNameSetup
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        me={me}
        onTaken={() => onChange('pen_name')}
      />
    </div>
  );
}

/** The top of the composer while the made-up name is chosen: "Posting as Night Gardener". */
export function PostingAsBar({ name, avatarUrl, className = '' }: { name: string; avatarUrl?: string | null; className?: string }) {
  return (
    <div
      data-testid="postingAsMadeUpName"
      className={`flex items-center gap-2 bg-slate-800 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-700 ${className}`}
    >
      <PenNameAvatar url={avatarUrl} name={name} size={24} />
      <span className="truncate">Posting as {name}</span>
    </div>
  );
}
