'use client';

import { useState } from 'react';
import Link from 'next/link';
import PenNameSetup from './PenNameSetup';
import { PenNameAvatar } from './MadeUpName';
import { usePenNameMe } from './penName';

/** Settings: the person's made-up name, and changing it (the server says when it's too soon). */
export default function PenNameSettings() {
  const me = usePenNameMe();
  const [open, setOpen] = useState(false);
  const data = me.data;
  if (!data) return null;
  const pen = data.pen_name;

  return (
    <div className="bg-surface rounded-xl border border-app p-6" data-testid="penNameSettings">
      <h2 className="text-lg font-semibold text-app mb-2">Made-up name</h2>
      <p className="text-sm text-app-secondary mb-4">
        Post or reply in Pulse under a made-up name. Others can&apos;t see it&apos;s you; Pantopus knows.
      </p>
      {pen ? (
        <div className="flex flex-wrap items-center gap-3">
          <PenNameAvatar url={pen.avatar_url} name={pen.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-app" data-testid="penNameSettingsName">{pen.name}</p>
            <Link href="/app/my-pulse?tab=made-up" className="text-sm text-primary-600 hover:text-primary-700">
              My posts under it
            </Link>
          </div>
          {data.allowed && (
            <button
              type="button"
              data-testid="penNameSettingsChange"
              onClick={() => setOpen(true)}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Change
            </button>
          )}
        </div>
      ) : data.allowed ? (
        <button
          type="button"
          data-testid="penNameSettingsChoose"
          onClick={() => setOpen(true)}
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Choose a made-up name
        </button>
      ) : null}
      {!data.allowed && data.refusal?.message && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{data.refusal.message}</p>
      )}
      <PenNameSetup open={open} onClose={() => setOpen(false)} me={data} replace={Boolean(pen)} />
    </div>
  );
}
