'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Shuffle } from 'lucide-react';
import * as api from '@pantopus/api';
import type { OwnPenName, PenNameMe } from '@pantopus/api';
import PenNameDialog from './PenNameDialog';
import { DrawnPicture } from './MadeUpName';
import { PEN_NAME_ME_KEY, refusalWords } from './penName';

/**
 * The name screen, the first time (or from Settings, to change it): a field for the name the person wants; left empty,
 * Pantopus gives one (a suggestion, with Shuffle); the picture, always drawn; the promise; "Use this name".
 */
export default function PenNameSetup({
  open,
  onClose,
  onTaken,
  me,
  replace = false,
}: {
  open: boolean;
  onClose: () => void;
  onTaken?: (pen: OwnPenName) => void;
  me: PenNameMe | null | undefined;
  /** Change the name in use (Settings). */
  replace?: boolean;
}) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [shown, setShown] = useState(0);
  const [shuffling, setShuffling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTyped('');
    setError(null);
    setShown(0);
    const given = me?.suggestions ?? [];
    setSuggestions(given);
    if (given.length === 0) {
      api.penNames.getSuggestions().then((r) => setSuggestions(r.suggestions ?? [])).catch(() => setSuggestions([]));
    }
  }, [open, me?.suggestions]);

  const suggestion = suggestions[shown] ?? '';
  const rules = me?.name_rules ?? { min: 3, max: 24 };
  const chosen = typed.trim() || suggestion;

  const shuffle = async () => {
    setError(null);
    if (shown + 1 < suggestions.length) {
      setShown(shown + 1);
      return;
    }
    setShuffling(true);
    try {
      const r = await api.penNames.getSuggestions();
      setSuggestions(r.suggestions ?? []);
      setShown(0);
    } catch (err) {
      setError(refusalWords(err));
    } finally {
      setShuffling(false);
    }
  };

  const use = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.penNames.takeName({ name: chosen, ...(replace ? { replace: true } : {}) });
      queryClient.setQueryData(PEN_NAME_ME_KEY, (old: PenNameMe | undefined) => (old ? { ...old, pen_name: r.pen_name, suggestions: [] } : old));
      void queryClient.invalidateQueries({ queryKey: PEN_NAME_ME_KEY });
      onTaken?.(r.pen_name);
      onClose();
    } catch (err) {
      setError(refusalWords(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PenNameDialog open={open} onClose={onClose} title={replace ? 'Change your made-up name' : 'Your made-up name'} busy={saving} maxWidth="max-w-md" testId="penNameSetup">
      <div className="space-y-4 px-5 py-4">
        <div className="flex items-center gap-4">
          <DrawnPicture name={chosen || '?'} size={64} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-app" data-testid="penNameSetupChosen">{chosen || ' '}</p>
            <p className="text-xs text-app-muted">Pantopus draws the picture.</p>
          </div>
        </div>

        <div>
          <label htmlFor="pen-name-field" className="mb-1 block text-xs font-semibold text-app">The name you want</label>
          <input
            id="pen-name-field"
            data-testid="penNameSetupField"
            value={typed}
            onChange={(e) => { setTyped(e.target.value); setError(null); }}
            maxLength={rules.max}
            placeholder={suggestion || 'Type a name'}
            autoComplete="off"
            className="w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm text-app outline-none placeholder:text-app-muted focus:border-primary-500"
          />
          <p className="mt-1 text-[11px] text-app-muted">
            {rules.min} to {rules.max} letters, numbers or spaces. Leave it empty and Pantopus gives you one.
          </p>
        </div>

        {!typed.trim() && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-app bg-surface-muted px-3 py-2">
            <span className="min-w-0 truncate text-sm text-app">
              {suggestion ? <>Pantopus gives you <strong>{suggestion}</strong></> : 'Pantopus gives you a name'}
            </span>
            <button
              type="button"
              data-testid="penNameSetupShuffle"
              onClick={() => void shuffle()}
              disabled={shuffling || saving}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-app bg-surface px-2.5 py-1 text-xs font-semibold text-app transition hover-bg-app disabled:opacity-50"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" /> Shuffle
            </button>
          </div>
        )}

        {(me?.promise?.length ?? 0) > 0 && (
          <ul className="space-y-1.5 rounded-xl bg-surface-muted px-3 py-3 text-xs leading-relaxed text-app-secondary" data-testid="penNamePromise">
            {me!.promise.map((line) => (
              <li key={line} className="flex gap-2"><span aria-hidden="true">•</span><span>{line}</span></li>
            ))}
          </ul>
        )}

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="flex items-center gap-3 border-t border-app px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="flex-1 rounded-xl border border-app px-4 py-2 text-sm font-medium text-app transition hover-bg-app disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="penNameSetupUse"
          onClick={() => void use()}
          disabled={saving || (typed.trim().length > 0 && typed.trim().length < rules.min)}
          className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
        >
          {saving ? 'Saving…' : 'Use this name'}
        </button>
      </div>
    </PenNameDialog>
  );
}
