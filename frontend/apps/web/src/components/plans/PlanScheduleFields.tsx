import { useRef, useState } from 'react';
import { plans } from '@pantopus/api';
import { fieldClass, secondaryClass } from './PlansWorkspace';

function localInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function readTimes(data: FormData): plans.TimeOption[] {
  const durations = data.getAll('duration');
  return data.getAll('start').map((raw, index) => {
    const start = new Date(String(raw));
    return {
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + Number(durations[index]) * 60_000).toISOString(),
    };
  });
}
export function readRepeat(data: FormData): plans.RepeatRule | null | undefined {
  const freq = data.get('repeat');
  if (!freq || freq === 'keep') return undefined;
  if (freq === 'once') return null;
  const pattern =
    freq === 'monthly'
      ? { month_days: [{ day: Number(data.get('monthDay')) }] }
      : { weekdays: data.getAll('weekday').map(Number) };
  return { freq: freq as plans.RepeatRule['freq'], ...pattern, count: Number(data.get('repeatCount')) };
}
export default function PlanScheduleFields({
  initial,
  poll,
  canRepeat,
  onTimesChange,
}: {
  initial?: plans.Detail;
  poll: boolean;
  canRepeat: boolean;
  onTimesChange: () => void;
}) {
  const offered = [...(initial?.dates?.options || [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const [rows, setRows] = useState(() =>
    offered.length
      ? offered.map((o, i) => ({ key: i, start: o.starts_at, end: o.ends_at }))
      : [
          { key: 0, start: initial?.starts_at, end: initial?.ends_at },
          { key: 1, start: null, end: null },
        ],
  );
  const next = useRef(rows.length);
  const [repeat, setRepeat] = useState(initial?.repeat ? 'keep' : 'once');
  return (
    <fieldset className="space-y-3 border-t border-app pt-4">
      <legend className="font-semibold">{poll ? 'Dates to offer' : 'Schedule'}</legend>
      <p className="text-sm text-app-muted">Times in {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      {(poll ? rows : rows.slice(0, 1)).map((row, i) => (
        <div key={row.key} onChange={onTimesChange} className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            {poll ? 'Option ' + (i + 1) + ' starts' : 'Starts'}
            <input
              className={fieldClass}
              type="datetime-local"
              name="start"
              defaultValue={localInput(row.start)}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Duration (minutes)
            <input
              className={fieldClass}
              name="duration"
              type="number"
              min="15"
              max="480"
              defaultValue={
                row.start && row.end ? (Date.parse(row.end) - Date.parse(row.start)) / 60_000 : 60
              }
              required
            />
          </label>
          {poll && rows.length > 2 && (
            <button
              type="button"
              className={secondaryClass}
              onClick={() => {
                onTimesChange();
                setRows(rows.filter((r) => r.key !== row.key));
              }}
            >
              Remove option {i + 1}
            </button>
          )}
        </div>
      ))}
      {poll && rows.length < 5 && (
        <button
          type="button"
          className={secondaryClass}
          onClick={() => {
            onTimesChange();
            setRows([...rows, { key: next.current++, start: null, end: null }]);
          }}
        >
          Add another time
        </button>
      )}
      {!poll && (canRepeat || initial?.repeat) && (
        <>
          <label className="block text-sm font-medium">
            Repeats
            <select
              className={fieldClass}
              name="repeat"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            >
              {initial?.repeat && <option value="keep">Keep current schedule · {initial.repeat.text}</option>}
              <option value="once">{initial?.repeat ? 'Stop after this date' : 'Does not repeat'}</option>
              {canRepeat && (
                <>
                  <option value="weekly">Every week</option>
                  <option value="biweekly">Every other week</option>
                  <option value="monthly">Every month</option>
                </>
              )}
            </select>
          </label>
          {repeat !== 'once' && repeat !== 'keep' && (
            <>
              {repeat === 'monthly' ? (
                <label className="block text-sm">
                  Day of the month
                  <input className={fieldClass} name="monthDay" type="number" min="1" max="31" required />
                </label>
              ) : (
                <fieldset>
                  <legend>Days of the week</legend>
                  <div className="flex flex-wrap gap-3">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                      <label key={day}>
                        <input type="checkbox" name="weekday" value={i + 1} /> {day}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <label className="block text-sm">
                Number of dates, including this one
                <input
                  className={fieldClass}
                  name="repeatCount"
                  type="number"
                  defaultValue={4}
                  min="2"
                  max="100"
                  required
                />
              </label>
            </>
          )}
        </>
      )}
    </fieldset>
  );
}
