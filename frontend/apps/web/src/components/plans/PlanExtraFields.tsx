import { useRef, useState } from 'react';
import { plans } from '@pantopus/api';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { fieldClass, secondaryClass } from './PlansWorkspace';
import { localInput } from './PlanScheduleFields';

type Extras = Pick<plans.NewPlan, 'bring' | 'chip_in' | 'gift'>;

export function readExtras(data: FormData, original?: plans.Detail, dirty?: Set<string>): Extras {
  const extras: Extras = {};
  const changed = (key: string) => data.has(key + 'Available') && (!original || dirty?.has(key));
  if (changed('bring')) {
    const ids = data.getAll('bringRow').map(String);
    const items = ids.map((row) => {
      const kept = original?.bring?.items.find((item) => item.id === row);
      const wasMine = kept?.claim?.mine ?? false;
      const mine = data.has('mine-' + row);
      return {
        id: kept?.id,
        label: String(data.get('label-' + row) || '').trim(),
        note: String(data.get('note-' + row) || '').trim(),
        mine: mine !== wasMine ? mine : undefined,
      };
    });
    if (items.length) extras.bring = { items, guests_can_add: data.has('guestsAdd') };
    else if (original?.bring) extras.bring = null;
  }
  if (changed('chip')) {
    if (data.has('chipEnabled'))
      extras.chip_in = {
        amount_cents: Math.round(Number(data.get('chipAmount')) * 100),
        note: String(data.get('chipNote') || '').trim(),
        link: String(data.get('chipLink') || '').trim(),
      };
    else if (original?.chip_in) extras.chip_in = null;
  }
  if (changed('gift')) {
    if (data.has('giftEnabled'))
      extras.gift = {
        budget_cents: Math.round(Number(data.get('giftBudget')) * 100),
        draw_at: data.has('giftDraw') ? new Date(String(data.get('giftDraw'))).toISOString() : undefined,
      };
    else if (original?.gift) extras.gift = null;
  }
  return extras;
}

export default function PlanExtraFields({
  initial,
  starter,
  kind,
  touch,
}: {
  initial?: plans.Detail;
  starter?: plans.BringInput | null;
  kind: plans.Kind;
  touch: (key: string) => void;
}) {
  const bringFlag = useFeatureFlag('plans_bring_list');
  const chipFlag = useFeatureFlag('plans_chip_in');
  const giftFlag = useFeatureFlag('plans_gift_exchange');
  const stored = initial?.bring;
  type Row = {
    key: string;
    label: string;
    note?: string | null;
    claim: { name: string; mine: boolean } | null;
  };
  const [rows, setRows] = useState<Row[]>(
    () =>
      stored?.items.map((it) => ({ ...it, key: it.id })) ??
      starter?.items.map((it, i) => ({ label: it.label, note: it.note, claim: null, key: 'starter-' + i })) ??
      [],
  );
  const next = useRef(0);
  const [chip, setChip] = useState(!!initial?.chip_in);
  const [gift, setGift] = useState(!!initial?.gift);
  return (
    <>
      {bringFlag && kind !== 'pickup_game' && (
        <fieldset className="space-y-3 border-t border-app pt-4" onChange={() => touch('bring')}>
          <legend className="font-semibold">Bring list</legend>
          <input type="hidden" name="bringAvailable" value="1" />
          {rows.map((row, i) => (
            <div key={row.key} className="grid gap-2 rounded-xl border border-app p-3">
              <input type="hidden" name="bringRow" value={row.key} />
              <label>
                Item {i + 1}
                <input
                  className={fieldClass}
                  name={'label-' + row.key}
                  defaultValue={row.label}
                  required
                  maxLength={60}
                />
              </label>
              <label>
                Item note (optional)
                <input
                  className={fieldClass}
                  name={'note-' + row.key}
                  defaultValue={row.note || ''}
                  maxLength={80}
                />
              </label>
              {row.claim && !row.claim.mine ? (
                <p>{row.claim.name} is bringing it.</p>
              ) : (
                <label>
                  <input type="checkbox" name={'mine-' + row.key} defaultChecked={row.claim?.mine} /> I’m
                  bringing this
                </label>
              )}
              <button
                type="button"
                className={secondaryClass}
                onClick={() => {
                  setRows(rows.filter((item) => item.key !== row.key));
                  touch('bring');
                }}
              >
                Remove item {i + 1}
              </button>
            </div>
          ))}
          {rows.length < 30 && (
            <button
              type="button"
              className={secondaryClass}
              onClick={() => {
                setRows([...rows, { key: 'new-' + next.current++, label: '', note: '', claim: null }]);
                touch('bring');
              }}
            >
              Add something to bring
            </button>
          )}
          {!!rows.length && (
            <label className="block">
              <input
                name="guestsAdd"
                type="checkbox"
                defaultChecked={stored?.guests_can_add ?? starter?.guests_can_add ?? true}
              />{' '}
              Guests can add an item
            </label>
          )}
        </fieldset>
      )}
      {chipFlag && (
        <fieldset className="space-y-3" onChange={() => touch('chip')}>
          <input type="hidden" name="chipAvailable" value="1" />
          <label className="font-semibold">
            <input
              name="chipEnabled"
              type="checkbox"
              checked={chip}
              onChange={(e) => setChip(e.target.checked)}
            />{' '}
            Chip in
          </label>
          {chip && (
            <>
              <label className="block">
                Amount per person ($)
                <input
                  name="chipAmount"
                  className={fieldClass}
                  type="number"
                  min="1"
                  max="500"
                  step="0.01"
                  defaultValue={initial?.chip_in && initial.chip_in.amount_cents / 100}
                  required
                />
              </label>
              <label className="block">
                What’s it for?
                <input
                  name="chipNote"
                  className={fieldClass}
                  maxLength={60}
                  defaultValue={initial?.chip_in?.note}
                  required
                />
              </label>
              <label className="block">
                Venmo, PayPal or Cash App link
                <input
                  name="chipLink"
                  className={fieldClass}
                  type="url"
                  maxLength={300}
                  defaultValue={initial?.chip_in?.link}
                  required
                />
              </label>
            </>
          )}
        </fieldset>
      )}
      {giftFlag && (
        <fieldset className="space-y-3" onChange={() => touch('gift')}>
          <input type="hidden" name="giftAvailable" value="1" />
          <label className="font-semibold">
            <input
              name="giftEnabled"
              type="checkbox"
              checked={gift}
              onChange={(e) => setGift(e.target.checked)}
            />{' '}
            Gift exchange
          </label>
          {gift && (
            <>
              <label className="block">
                Spend up to ($)
                <input
                  name="giftBudget"
                  className={fieldClass}
                  type="number"
                  min="1"
                  max="500"
                  step="0.01"
                  defaultValue={initial?.gift ? initial.gift.budget_cents / 100 : 25}
                  required
                />
              </label>
              {initial?.gift?.state === 'drawn' ? (
                <p>{initial.gift.draw_text}</p>
              ) : (
                <label className="block">
                  Draw names on
                  <input
                    name="giftDraw"
                    className={fieldClass}
                    type="datetime-local"
                    defaultValue={localInput(initial?.gift?.draw_at)}
                    required
                  />
                </label>
              )}
            </>
          )}
        </fieldset>
      )}
    </>
  );
}
