'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { buttonClass, fieldClass, secondaryClass } from './PlansWorkspace';

const stateName: Record<string, string> = {
  invited: 'Invited',
  opened: 'Opened',
  in: 'Going',
  asked: 'Requested',
  cant_make_it: 'Can’t make it',
  left: 'Left',
  waitlisted: 'Waitlisted',
  maybe: 'Maybe',
  waiting_ok: 'Waiting for approval',
};
function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-end gap-2">
      <label className="min-w-0 flex-1 text-sm">
        Invitation link
        <input readOnly className={fieldClass} value={url} onFocus={(e) => e.target.select()} />
      </label>
      <button
        type="button"
        className={secondaryClass}
        onClick={async (e) => {
          const input = e.currentTarget.parentElement?.querySelector('input');
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            input?.select();
          }
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
function addressPermission(plan: plans.Detail) {
  return (
    plan.place_kind !== 'home' ||
    window.confirm('People who join through this invitation will see your home address. Share it with them?')
  );
}
export function InviteFriend({ plan }: { plan: plans.Detail }) {
  const client = useQueryClient();
  const link = useMutation({
    mutationFn: () => plans.inviteLink(plan.id, false),
    onSuccess: () => client.invalidateQueries({ queryKey: ['plans'] }),
  });
  if (!plan.viewer.friend_invite?.can_invite && !link.data) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Bring a friend</h3>
      {link.data ? (
        <ShareLink url={link.data.url} />
      ) : (
        <button className={secondaryClass} disabled={link.isPending} onClick={() => link.mutate()}>
          Make a one-person link
        </button>
      )}
      {link.error && <p role="alert">{link.error.message}</p>}
    </section>
  );
}

export default function PlanInvitations({ plan }: { plan: plans.Detail }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-3 border-t border-app pt-4">
      <button className={secondaryClass} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Close invitations' : 'Manage invitations'}
      </button>
      {open && <Invitations plan={plan} />}
    </section>
  );
}
function Invitations({ plan }: { plan: plans.Detail }) {
  const id = plan.id,
    client = useQueryClient();
  const [search, setSearch] = useState(''),
    [ids, setIds] = useState<string[]>([]),
    [email, setEmail] = useState('');
  const [link, setLink] = useState(''),
    [message, setMessage] = useState(''),
    [previous, setPrevious] = useState(''),
    [skip, setSkip] = useState<string[]>([]);
  const pastEnabled = useFeatureFlag('plans_same_people');
  const list = useQuery({
    queryKey: ['plans', 'invites', id],
    queryFn: () => plans.invitations(id),
    gcTime: 0,
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
    retry: false,
  });
  const canSend = !!list.data?.can_invite && !!plan.invites?.can_invite;
  const people = useQuery({
    queryKey: ['plans', 'invite-people', id, search],
    queryFn: () => plans.invitePeople(id, search),
    enabled: canSend,
    gcTime: 0,
  });
  const past = useQuery({
    queryKey: ['plans', 'past-people'],
    queryFn: plans.pastPlans,
    enabled: canSend && pastEnabled,
    gcTime: 0,
  });
  const pastPeople = useQuery({
    queryKey: ['plans', 'past-people', previous],
    queryFn: () => plans.pastPeople(previous),
    enabled: !!previous,
    gcTime: 0,
  });
  const action = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onMutate: () => setMessage(''),
    onSettled: () => client.invalidateQueries({ queryKey: ['plans'] }),
  });
  const send = (f: (atHome: boolean) => Promise<unknown>) => {
    if (addressPermission(plan)) action.mutate(() => f(plan.place_kind === 'home'));
  };
  if (list.isPending) return <p role="status">Loading invitations…</p>;
  if (list.isError)
    return (
      <button className={secondaryClass} onClick={() => void list.refetch()}>
        Retry invitations
      </button>
    );
  const data = list.data,
    openLink = plan.audience === 'invited' && plan.kind !== 'playdate' ? data.open_link : null,
    busy = action.isPending;
  return (
    <div className="space-y-4">
      {canSend && (
        <>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(async (home) => {
                const reply = await plans.invite(
                  id,
                  ids,
                  email
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean),
                  home,
                );
                const results = reply.results || [];
                setMessage(
                  results.map((r) => r.outcome.replace(/_/g, ' ')).join(' · ') || 'Invitations updated.',
                );
                setIds([]);
                setEmail('');
              });
            }}
          >
            <h3 className="font-semibold">Invite people</h3>
            <label className="block text-sm">
              Connections and past guests
              <input
                className={fieldClass}
                type="search"
                value={search}
                placeholder="Search people"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {people.data?.people.map((p) => (
                <label className="flex items-center gap-2 text-sm" key={p.user_id}>
                  <input
                    type="checkbox"
                    disabled={!!p.state}
                    checked={ids.includes(p.user_id)}
                    onChange={(e) =>
                      setIds(e.target.checked ? [...ids, p.user_id] : ids.filter((v) => v !== p.user_id))
                    }
                  />
                  {p.display_name}
                  {p.state ? ' · ' + (stateName[p.state] || p.state) : ''}
                </label>
              ))}
            </div>
            {people.isError && (
              <button type="button" className={secondaryClass} onClick={() => void people.refetch()}>
                Retry people
              </button>
            )}
            {people.data && !people.data.people.length && (
              <p className="text-sm text-app-muted">No matching connections or past guests.</p>
            )}
            {data.emails_left !== 0 && (
              <label className="block text-sm">
                Invite by email
                <input
                  type="email"
                  multiple
                  className={fieldClass}
                  value={email}
                  placeholder="Separate addresses with commas"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            <button className={buttonClass} disabled={busy || (!ids.length && !email.trim())}>
              Send invitations
            </button>
          </form>
          {!!past.data?.plans.length && (
            <div className="space-y-2">
              <label className="block text-sm">
                Invite people from a past plan
                <select
                  className={fieldClass}
                  value={previous}
                  onChange={(e) => {
                    setPrevious(e.target.value);
                    setSkip([]);
                  }}
                >
                  <option value="">Choose a plan</option>
                  {past.data.plans.map((p) => (
                    <option key={p.post_id} value={p.post_id}>
                      {p.title} · {p.date_text}
                    </option>
                  ))}
                </select>
              </label>
              {previous &&
                pastPeople.data?.people.map((p) => (
                  <label key={p.key} className="block text-sm">
                    <input
                      type="checkbox"
                      disabled={!p.can_invite}
                      checked={p.can_invite && !skip.includes(p.key)}
                      onChange={(e) =>
                        setSkip(e.target.checked ? skip.filter((k) => k !== p.key) : [...skip, p.key])
                      }
                    />{' '}
                    {p.name}
                  </label>
                ))}
              {previous && (
                <button
                  className={secondaryClass}
                  disabled={
                    busy || !pastPeople.data?.people.some((p) => p.can_invite && !skip.includes(p.key))
                  }
                  onClick={() =>
                    send(async (home) => {
                      const r = await plans.invitePast(id, previous, skip, home);
                      setMessage(r.text);
                      setPrevious('');
                    })
                  }
                >
                  Invite selected past guests
                </button>
              )}
            </div>
          )}
          <div className="space-y-2">
            <h4 className="font-medium">One-person link</h4>
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => send(async (home) => setLink((await plans.inviteLink(id, home)).url))}
            >
              Make a one-person link
            </button>
            {link && <ShareLink url={link} />}
          </div>
          {openLink && (
            <form
              key={String(openLink.on) + String(openLink.host_says_yes_first)}
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const yes = new FormData(e.currentTarget).has('approve');
                send((home) => plans.openLink(id, yes, home));
              }}
            >
              <h4 className="font-medium">One link for everyone</h4>
              <label className="block text-sm">
                <input
                  type="checkbox"
                  name="approve"
                  defaultChecked={
                    openLink.host_says_yes_first || (!openLink.on && plan.place_kind === 'home')
                  }
                />{' '}
                I approve guests first
              </label>
              {openLink.url && <ShareLink url={openLink.url} />}
              <div className="flex flex-wrap gap-2">
                <button className={secondaryClass} disabled={busy}>
                  {openLink.on ? 'Save link settings' : 'Turn on shared link'}
                </button>
                {openLink.on && (
                  <>
                    <button
                      type="button"
                      className={secondaryClass}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Replace the shared link? The previous link will stop working.'))
                          send((home) => plans.openLink(id, openLink.host_says_yes_first, home, true));
                      }}
                    >
                      Replace link
                    </button>
                    <button
                      type="button"
                      className={secondaryClass}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Turn off this shared link?'))
                          action.mutate(() => plans.closeLink(id));
                      }}
                    >
                      Turn off link
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
        </>
      )}
      <h3 className="font-semibold">Invitation roster</h3>
      {data.invites.length === 0 && (
        <p className="text-sm text-app-muted">No invitations answered or sent to a person yet.</p>
      )}
      <ul className="space-y-2">
        {data.invites.map((row) => {
          const party = row.guest || row.party;
          return (
            <li key={row.id} className="space-y-1 rounded-xl border border-app p-3">
              <p className="font-medium">
                {row.person?.display_name ||
                  row.guest?.name ||
                  row.known_name ||
                  row.email ||
                  'Invited guest'}
              </p>
              <p className="text-sm">
                {stateName[row.state] || row.state}
                {party
                  ? ' · ' +
                    party.adults +
                    ' adult' +
                    (party.adults === 1 ? '' : 's') +
                    (party.kids ? ' · ' + party.kids + ' kids' : '')
                  : ''}
                {row.email_failed ? ' · Email could not be delivered' : ''}
              </p>
              {row.can_ok && (
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => send((home) => plans.approveInvite(id, row.id, home))}
                >
                  Let in
                </button>
              )}
              {row.can_cancel && (
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Take back this invitation?'))
                      action.mutate(() => plans.revokeInvite(id, row.id));
                  }}
                >
                  Take back invitation
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {data.unopened_links > 0 && (
        <p className="text-sm">
          {data.unopened_links} unopened one-person {data.unopened_links === 1 ? 'link' : 'links'}
        </p>
      )}
      {canSend && data.remind && data.remind.count > 0 && (
        <button
          className={secondaryClass}
          disabled={busy || data.remind.reminded_today}
          onClick={() => {
            if (window.confirm('Remind everyone who hasn’t answered?'))
              action.mutate(async () => {
                await plans.remind(id);
                setMessage('Reminder sent.');
              });
          }}
        >
          {data.remind.reminded_today ? 'Reminded today' : 'Remind ' + data.remind.count + ' unanswered'}
        </button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {action.error && (
        <p role="alert" className="text-sm text-red-700">
          {action.error.message}
        </p>
      )}
    </div>
  );
}
