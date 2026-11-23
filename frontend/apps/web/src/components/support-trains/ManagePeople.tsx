'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import { UserPlus, X } from 'lucide-react';
import ModalShell from '@/components/ui/ModalShell';
import { confirmStore } from '@/components/ui/confirm-store';
import { toast } from '@/components/ui/toast-store';
import { apiMessage } from './ManageDates';

// Co-organizers and invitations by account, for a Support Train's organizers (A2, A3). Both pick from the
// organizer's connections; the server also takes people who share their home.

type Person = { id: string; name: string; username: string | null };

function personName(user: { name?: string | null; first_name?: string | null; username?: string | null } | null | undefined): string {
  return user?.name || user?.first_name || user?.username || 'Someone';
}

function PersonPicker({
  open,
  title,
  subtitle,
  submitLabel,
  exclude,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  submitLabel: string;
  exclude: Set<string>;
  onClose: () => void;
  onPick: (person: Person) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Person | null>(null);
  const [saving, setSaving] = useState(false);
  const connections = useQuery({
    queryKey: ['support-train-people', 'connections'],
    queryFn: async () => (await api.relationships.getConnections({ limit: 200 })).relationships || [],
    enabled: open,
    staleTime: 30_000,
  });
  const people = useMemo<Person[]>(() => {
    const q = query.trim().toLowerCase();
    return (connections.data || [])
      .map((r: any) => r.other_user)
      .filter((u: any) => u?.id && !exclude.has(u.id))
      .map((u: any) => ({ id: String(u.id), name: personName(u), username: u.username || null }))
      .filter((p: Person) => !q || p.name.toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q));
  }, [connections.data, exclude, query]);

  const submit = async () => {
    if (!picked || saving) return;
    setSaving(true);
    try {
      await onPick(picked);
      setPicked(null);
      setQuery('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      onCancel={onClose}
      cancelLabel="Cancel"
      title={title}
      subtitle={subtitle}
      submitLabel={submitLabel}
      submitDisabled={!picked}
      submitting={saving}
      onSubmit={submit}
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your connections"
        aria-label="Search your connections"
        className="w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-text-muted"
      />
      <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
        {connections.isLoading ? (
          <p className="text-sm text-app-text-muted">Loading your connections…</p>
        ) : connections.isError ? (
          <p className="text-sm text-app-text-muted">Your connections couldn’t be loaded. Try again.</p>
        ) : people.length === 0 ? (
          <p className="text-sm text-app-text-muted">
            {query ? 'No one by that name.' : 'No connections to add yet. Connect with someone first, or share the link.'}
          </p>
        ) : (
          people.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={picked?.id === p.id}
              onClick={() => setPicked(p)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${picked?.id === p.id ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200' : 'text-app-text hover:bg-app-surface-sunken'}`}
            >
              {p.name}
              {p.username ? <span className="text-app-text-muted"> · @{p.username}</span> : null}
            </button>
          ))
        )}
      </div>
    </ModalShell>
  );
}

export default function ManagePeople({
  trainId,
  isPrimary,
  editable,
  organizers,
  invites,
  primaryUserId,
  recipientUserId,
  onChanged,
}: {
  trainId: string;
  isPrimary: boolean;
  editable: boolean;
  organizers: Array<{ user_id: string; role: string; user?: any }>;
  invites: any[];
  primaryUserId: string | null;
  recipientUserId: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const [picker, setPicker] = useState<'organizer' | 'invite' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const coOrganizers = organizers.filter((o) => o.role !== 'primary' && o.user_id !== primaryUserId);
  const accountInvites = invites.filter((i) => i.invitee_user_id);

  const taken = useMemo(() => new Set([
    ...(primaryUserId ? [primaryUserId] : []),
    ...(recipientUserId ? [recipientUserId] : []),
    ...organizers.map((o) => o.user_id),
    ...(picker === 'invite' ? accountInvites.map((i) => i.invitee_user_id) : []),
  ]), [primaryUserId, recipientUserId, organizers, accountInvites, picker]);

  const addOrganizer = async (person: Person) => {
    try {
      await api.supportTrains.addOrganizer(trainId, { user_id: person.id, role: 'co_organizer' });
      toast.success(`${person.name} can now help organize`);
      await onChanged();
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t add them. Please try again.'));
      throw err;
    }
  };
  const invite = async (person: Person) => {
    try {
      await api.supportTrains.createInvite(trainId, { invitee_user_id: person.id });
      toast.success(`${person.name} is invited`);
      await onChanged();
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t invite them. Please try again.'));
      throw err;
    }
  };
  const removeOrganizer = async (o: { user_id: string; user?: any }) => {
    const name = personName(o.user);
    const ok = await confirmStore.open({
      title: `Remove ${name} as co-organizer?`,
      description: 'They stop seeing signups and private notes, and leave the train’s chat unless they are signed up to help.',
      confirmLabel: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(o.user_id);
    try {
      await api.supportTrains.removeOrganizer(trainId, o.user_id);
      toast.success(`${name} removed`);
      await onChanged();
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t remove them. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-app-surface border border-app-border rounded-xl p-6 space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-app-text flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-app-text-muted" />
            Co-organizers
          </h2>
          {isPrimary && editable && (
            <button onClick={() => setPicker('organizer')} className="px-3 py-1.5 border border-app-border text-sm rounded-lg text-app-text hover:bg-app-surface-sunken">
              Add co-organizer
            </button>
          )}
        </div>
        {coOrganizers.length === 0 ? (
          <p className="mt-2 text-sm text-app-text-muted">Only you. A co-organizer can manage dates, signups and updates with you.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {coOrganizers.map((o) => (
              <li key={o.user_id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-app-surface-sunken text-sm">
                <span className="text-app-text truncate">{personName(o.user)}</span>
                {isPrimary && (
                  <button
                    onClick={() => removeOrganizer(o)}
                    disabled={busy === o.user_id}
                    aria-label={`Remove ${personName(o.user)}`}
                    className="p-1 rounded text-app-text-muted hover:text-red-600 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-app-text">Invited</h3>
          {editable && (
            <button onClick={() => setPicker('invite')} className="px-3 py-1.5 border border-app-border text-sm rounded-lg text-app-text hover:bg-app-surface-sunken">
              Invite someone
            </button>
          )}
        </div>
        {accountInvites.length === 0 ? (
          <p className="mt-2 text-sm text-app-text-muted">Invite people you know. Invited people can open the train even when it is for your connections only.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {accountInvites.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-app-surface-sunken text-sm">
                <span className="text-app-text truncate">{personName(i.User)}</span>
                <span className="text-xs text-app-text-muted">{i.status === 'accepted' ? 'Joined' : 'Invited'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PersonPicker
        open={picker === 'organizer'}
        title="Add a co-organizer"
        subtitle="They can manage dates, signups and updates with you."
        submitLabel="Add"
        exclude={taken}
        onClose={() => setPicker(null)}
        onPick={addOrganizer}
      />
      <PersonPicker
        open={picker === 'invite'}
        title="Invite someone"
        subtitle="They can open the train and sign up, even when it is for your connections only."
        submitLabel="Invite"
        exclude={taken}
        onClose={() => setPicker(null)}
        onPick={invite}
      />
    </section>
  );
}
