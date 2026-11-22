'use client';
import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';

export const claimKey = (id: string) => 'pantopus:plan-invitation:' + id;
export default function OpenPlanOnWeb({
  id,
  token,
  open,
}: {
  id: string;
  token?: string | null;
  open?: string | null;
}) {
  const path = '/app/plans/' + encodeURIComponent(id);
  const router = useRouter(),
    [error, setError] = useState('');
  function enter(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    try {
      sessionStorage.setItem(claimKey(id), JSON.stringify(open ? { open } : { token }));
      router.push(path + '/invitation');
    } catch {
      setError('Open this invitation in a browser that allows tab storage.');
    }
  }
  const style = 'my-2 inline-flex min-h-10 items-center font-semibold text-primary-700';
  return token || open ? (
    <>
      <button type="button" className={style} onClick={enter}>
        Open with my Pantopus account
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  ) : (
    <Link href={path} className={style}>
      Open plan on web
    </Link>
  );
}
