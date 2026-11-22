import { plans } from '@pantopus/api';
import { buttonClass, fieldClass, secondaryClass } from './PlansWorkspace';
export interface ParticipationProps {
  plan: plans.Detail;
  busy: boolean;
  run: (perform: () => Promise<unknown>) => void;
}
export default function PlanDatePoll({ plan, busy, run }: ParticipationProps) {
  const poll = plan.dates;
  if (!poll) return null;
  const host = plan.viewer.role === 'host';
  return (
    <section className="space-y-3 rounded-2xl bg-surface-muted p-4">
      <h3 className="font-semibold">Find a date</h3>
      <p className="text-sm">{poll.answered_text}</p>
      {host ? (
        <ul className="space-y-3">
          {poll.options.map((o) => (
            <li key={o.id} className="space-y-1 border-t border-app pt-2">
              <p className="font-medium">
                {o.text}
                {o.most ? ' · Most votes' : ''}
              </p>
              <p className="text-sm">
                {o.can_text}
                {o.who?.length ? ' · ' + o.who.join(', ') : ''}
              </p>
              <button
                className={secondaryClass}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(o.pick_note || 'Set this as the plan’s date?'))
                    run(() => plans.pickDate(plan.id, o.id));
                }}
              >
                {o.pick_text || 'Pick this date'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <form
          key={poll.options.map((o) => o.id + String(o.mine)).join(',') + String(poll.mine?.answered)}
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget),
              selected = data.getAll('choice').map(String);
            if (!selected.length && !window.confirm('Save that none of these times work for you?')) return;
            run(() =>
              plans.vote(plan.id, selected, Number(data.get('adults') || 1), Number(data.get('kids') || 0)),
            );
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Which times work for you?</legend>
            {poll.options.map((o) => (
              <label key={o.id} className="block">
                <input type="checkbox" name="choice" value={o.id} defaultChecked={o.mine} /> {o.text}{' '}
                <span className="text-sm text-app-muted">· {o.can_text}</span>
              </label>
            ))}
          </fieldset>
          <label className="block text-sm">
            Adults, including you
            <input
              name="adults"
              className={fieldClass}
              type="number"
              min="1"
              max="10"
              required
              defaultValue={poll.mine?.party_size ?? 1}
            />
          </label>
          {plan.kids_welcome && (
            <label className="block text-sm">
              Kids
              <input
                name="kids"
                className={fieldClass}
                type="number"
                min="0"
                max="10"
                required
                defaultValue={poll.mine?.kids_count ?? 0}
              />
            </label>
          )}
          <p className="text-sm text-app-muted">
            Leave every time unchecked if none work for you. {poll.mine_text}
          </p>
          <button className={buttonClass} disabled={busy}>
            Save my times
          </button>
          {poll.mine?.answered && (
            <p role="status" className="text-sm">
              Your times are saved.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
