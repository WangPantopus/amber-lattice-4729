'use client';

// The person's own "Pantopus AI" choice (Pulse, reinvented, phase 2; coord/CONTRACT.md §7d; PHASE-2 section 3): one row
// in Settings, drawn only while `pulse_reinvented` is on for the person (otherwise nothing, and Settings is today's).
// Off: no new field cards for them, and none of their photos go to the model; the safety checks stay on either way.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { get, patch } from '@pantopus/api/client';
import { useReinventedOn } from '../pulse/useReinventedOn';
import { StrandsImIn } from '../strands/Strands';

const KEY = ['reinvented', 'settings'];

// The person's own choices (CONTRACT 7d, 8c): Pantopus AI, and whether their Want to go and their posts may tell someone
// "you went because of them" (on unless they turned it off).
// The cabinet (CONTRACT 9d): whether people they know may see it (on unless they turned it off).
type Choices = { pantopus_ai: boolean; strands?: boolean; cabinet_shown?: boolean };

export default function PantopusAiSetting() {
  const on = useReinventedOn();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => get<Choices>('/api/reinvented/settings', undefined, { signal }),
    enabled: on,
    staleTime: 60_000,
    retry: false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!on || !settings.data) return null;
  const checked = settings.data.pantopus_ai === true;
  const strands = settings.data.strands !== false;
  const cabinet = settings.data.cabinet_shown !== false;
  async function change(field: keyof Choices, next: boolean) {
    if (busy || !settings.data) return;
    const before = settings.data;
    setBusy(true);
    setError('');
    client.setQueryData(KEY, { ...before, [field]: next });
    try {
      client.setQueryData(KEY, { ...before, ...(await patch<Choices>('/api/reinvented/settings', { [field]: next })) });
    } catch {
      client.setQueryData(KEY, before);
      setError('Couldn’t save that. Try again.');
    } finally {
      setBusy(false);
    }
  }
  const toggle = (label: string, on: boolean, field: keyof Choices) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => void change(field, !on)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
        on ? 'bg-primary-600' : 'bg-surface-muted'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-app-surface shadow ring-0 transition duration-200 ease-in-out ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
  return (
    <>
      <div className="bg-surface rounded-xl border border-app p-6">
        <h2 className="text-lg font-semibold text-app mb-4">Pantopus AI</h2>
        <div className="flex items-center justify-between py-3">
          <div className="flex-1">
            <p className="font-medium text-app">Pantopus AI</p>
            <p className="text-sm text-app-secondary">Names things in photos with a source, and suggests. Safety checks stay on.</p>
          </div>
          {toggle('Pantopus AI', checked, 'pantopus_ai')}
        </div>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="bg-surface rounded-xl border border-app p-6">
        <h2 className="text-lg font-semibold text-app mb-4">Went because of you</h2>
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex-1">
            <p className="font-medium text-app">Tell people when their post led me somewhere</p>
            <p className="text-sm text-app-secondary">
              When you mark Want to go on someone’s post and later post from there, they’re told you went because of them. Only
              them; nobody else sees it.
            </p>
          </div>
          {toggle('Tell people when their post led me somewhere', strands, 'strands')}
        </div>
        <StrandsImIn />
      </div>
      <div className="bg-surface rounded-xl border border-app p-6">
        <h2 className="text-lg font-semibold text-app mb-4">Your cabinet</h2>
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex-1">
            <p className="font-medium text-app">Show my cabinet to people I know</p>
            <p className="text-sm text-app-secondary">
              Places stood, heights, specimens, questions helped, strands and canvases. Never who follows you. Off: only you see
              it.
            </p>
          </div>
          {toggle('Show my cabinet to people I know', cabinet, 'cabinet_shown')}
        </div>
      </div>
    </>
  );
}
