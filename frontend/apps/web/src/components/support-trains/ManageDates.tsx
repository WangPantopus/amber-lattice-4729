'use client';

import { useState } from 'react';
import * as api from '@pantopus/api';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import ModalShell from '@/components/ui/ModalShell';
import { confirmStore } from '@/components/ui/confirm-store';
import { toast } from '@/components/ui/toast-store';
import { formatSlotWindow } from './scheduleUtils';
import { isSlotPast } from './trainTime';

// The dates of a Support Train, for its organizers: add one, change one, remove one (A3).

type SlotLabel = 'Breakfast' | 'Lunch' | 'Dinner' | 'Groceries' | 'Custom';
type SupportMode = 'meal' | 'takeout' | 'groceries';

const LABELS: SlotLabel[] = ['Breakfast', 'Lunch', 'Dinner', 'Groceries', 'Custom'];
const KINDS: Array<{ key: SupportMode; label: string }> = [
  { key: 'meal', label: 'A meal' },
  { key: 'groceries', label: 'Groceries' },
];

interface DateForm {
  slot_date: string;
  slot_label: SlotLabel;
  support_mode: SupportMode;
  start_time: string;
  end_time: string;
}

function dayLabel(slotDate: string): string {
  return new Date(`${slotDate}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

export function apiMessage(err: unknown, fallback: string): string {
  const e = err as { message?: string; data?: { message?: string; details?: Array<{ message?: string }> } } | null;
  return e?.data?.details?.[0]?.message || e?.data?.message || e?.message || fallback;
}

export default function ManageDates({
  trainId,
  slots,
  today,
  signedSlotIds,
  editable,
  onChanged,
}: {
  trainId: string;
  slots: any[];
  today: string;
  /** Dates with an active signup: their day and kind stay as they are, and they can't be removed. */
  signedSlotIds: Set<string>;
  editable: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState<{ slotId: string | null; form: DateForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const upcoming = slots.filter((s) => s.status !== 'canceled' && !isSlotPast(s, today));
  const past = slots.filter((s) => s.status !== 'canceled' && isSlotPast(s, today));

  const openAdd = () => {
    setError(null);
    setEditing({ slotId: null, form: { slot_date: today, slot_label: 'Dinner', support_mode: 'meal', start_time: '17:00', end_time: '19:00' } });
  };
  const openEdit = (slot: any) => {
    setError(null);
    setEditing({
      slotId: slot.id,
      form: {
        slot_date: String(slot.slot_date),
        slot_label: (LABELS.includes(slot.slot_label) ? slot.slot_label : 'Custom') as SlotLabel,
        support_mode: (slot.support_mode === 'groceries' ? 'groceries' : 'meal') as SupportMode,
        start_time: String(slot.start_time || '').slice(0, 5),
        end_time: String(slot.end_time || '').slice(0, 5),
      },
    });
  };

  const save = async () => {
    if (!editing || saving) return;
    const f = editing.form;
    if (!f.slot_date) { setError('Pick a date.'); return; }
    if (f.slot_date < today) { setError('Pick a date that has not passed.'); return; }
    if (f.start_time && f.end_time && f.end_time <= f.start_time) { setError('Pick an end time after the start time.'); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        slot_date: f.slot_date,
        slot_label: f.slot_label,
        support_mode: f.support_mode,
        start_time: f.start_time || null,
        end_time: f.end_time || null,
      };
      if (editing.slotId) {
        const signed = signedSlotIds.has(editing.slotId);
        // A signed date keeps its day and kind; only its label and times change.
        await api.supportTrains.updateSlot(trainId, editing.slotId, signed
          ? { slot_label: body.slot_label, start_time: body.start_time, end_time: body.end_time }
          : body);
        toast.success('Date saved');
      } else {
        await api.supportTrains.addCustomSlot(trainId, body);
        toast.success('Date added');
      }
      setEditing(null);
      await onChanged();
    } catch (err) {
      setError(apiMessage(err, 'Couldn’t save this date. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (slot: any) => {
    if (busySlot) return;
    const ok = await confirmStore.open({
      title: 'Remove this date?',
      description: `${slot.slot_label || 'This date'} on ${dayLabel(String(slot.slot_date))} disappears from the train for everyone.`,
      confirmLabel: 'Remove date',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusySlot(slot.id);
    try {
      await api.supportTrains.updateSlot(trainId, slot.id, { status: 'canceled' });
      toast.success('Date removed');
      await onChanged();
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t remove this date.'));
    } finally {
      setBusySlot(null);
    }
  };

  const signedEditing = editing?.slotId ? signedSlotIds.has(editing.slotId) : false;

  return (
    <section className="bg-app-surface border border-app-border rounded-xl p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-app-text flex items-center gap-2">
          <CalendarPlus className="w-5 h-5 text-app-text-muted" />
          Dates
        </h2>
        {editable && (
          <button
            onClick={openAdd}
            className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
          >
            Add a date
          </button>
        )}
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-app-text-muted">No dates ahead.{editable ? ' Add one so people can sign up.' : ''}</p>
      ) : (
        <ul className="divide-y divide-app-border">
          {upcoming.map((slot) => {
            const signed = signedSlotIds.has(slot.id);
            return (
              <li key={slot.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-app-text">
                    {slot.slot_label || 'Help'} · {dayLabel(String(slot.slot_date))}
                  </p>
                  <p className="text-xs text-app-text-muted">
                    {[formatSlotWindow(slot.start_time, slot.end_time), slot.support_mode === 'groceries' ? 'Groceries' : 'A meal', signed ? 'Someone is signed up' : 'Open']
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                {editable && (
                  <>
                    <button
                      onClick={() => openEdit(slot)}
                      aria-label={`Change ${slot.slot_label || 'date'} on ${dayLabel(String(slot.slot_date))}`}
                      className="p-2 rounded-lg text-app-text-secondary hover:bg-app-surface-sunken"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(slot)}
                      disabled={signed || busySlot === slot.id}
                      title={signed ? 'Someone is signed up. Remove their signup first.' : undefined}
                      aria-label={`Remove ${slot.slot_label || 'date'} on ${dayLabel(String(slot.slot_date))}`}
                      className="p-2 rounded-lg text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {past.length > 0 && (
        <p className="mt-3 text-xs text-app-text-muted">
          {past.length} {past.length === 1 ? 'date has' : 'dates have'} passed.
        </p>
      )}

      <ModalShell
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onCancel={() => setEditing(null)}
        cancelLabel="Cancel"
        title={editing?.slotId ? 'Change this date' : 'Add a date'}
        subtitle={signedEditing ? 'Someone is signed up, so the day and kind of help stay as they are.' : undefined}
        submitLabel={editing?.slotId ? 'Save' : 'Add date'}
        onSubmit={save}
        submitting={saving}
      >
        {editing && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-app-text">
              Day
              <input
                type="date"
                min={today}
                value={editing.form.slot_date}
                disabled={signedEditing}
                onChange={(e) => setEditing({ ...editing, form: { ...editing.form, slot_date: e.target.value } })}
                className="mt-1 w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text disabled:opacity-60"
              />
            </label>
            <label className="block text-sm font-medium text-app-text">
              Name
              <select
                value={editing.form.slot_label}
                onChange={(e) => {
                  const slot_label = e.target.value as SlotLabel;
                  setEditing({ ...editing, form: { ...editing.form, slot_label, ...(slot_label === 'Groceries' && !signedEditing ? { support_mode: 'groceries' as SupportMode } : {}) } });
                }}
                className="mt-1 w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text"
              >
                {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <fieldset disabled={signedEditing}>
              <legend className="text-sm font-medium text-app-text">What helps on this day</legend>
              <div className="mt-1 flex gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    aria-pressed={editing.form.support_mode === k.key}
                    onClick={() => setEditing({ ...editing, form: { ...editing.form, support_mode: k.key } })}
                    className={`px-3 py-1.5 rounded-full border text-sm disabled:opacity-60 ${editing.form.support_mode === k.key ? 'bg-primary-600 border-primary-600 text-white' : 'border-app-border text-app-text-secondary'}`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-app-text">
                From
                <input
                  type="time"
                  value={editing.form.start_time}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, start_time: e.target.value } })}
                  className="mt-1 w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text"
                />
              </label>
              <label className="block text-sm font-medium text-app-text">
                Until
                <input
                  type="time"
                  value={editing.form.end_time}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, end_time: e.target.value } })}
                  className="mt-1 w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text"
                />
              </label>
            </div>
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
          </div>
        )}
      </ModalShell>
    </section>
  );
}
