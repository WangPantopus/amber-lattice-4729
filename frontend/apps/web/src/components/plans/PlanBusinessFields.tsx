import { useState } from 'react';
import Link from 'next/link';
import { plans } from '@pantopus/api';
import { fieldClass } from './PlansWorkspace';
import { localInput } from './PlanScheduleFields';

export const cents = (value: FormDataEntryValue | string | null) => Math.round(Number(value) * 100);
const labelClass = 'block text-sm font-medium';

function readBenefit(data: FormData, prefix: string): plans.DealBenefit {
  const kind = data.get(prefix + 'Kind') as plans.DealBenefit['kind'];
  if (kind === 'free_item') return { kind, item: String(data.get(prefix + 'Item') || '').trim() };
  const value = data.get(prefix + 'Amount');
  return {
    kind,
    value: kind === 'amount' ? cents(value) : Number(value),
    applies_to: String(data.get('dealTarget')),
  };
}

export function readBusinessFields(data: FormData, initial: plans.Detail | undefined, dirty: Set<string>) {
  const fields: plans.BusinessFields = {};
  if (data.get('label') && (!initial || dirty.has('label'))) fields.label = String(data.get('label'));
  if (data.get('businessLocation')) fields.business_location_id = String(data.get('businessLocation'));
  if (dirty.has('price') || dirty.has('priceAmount') || (!initial && data.has('price')))
    fields.price_cents = data.has('price') ? cents(data.get('priceAmount')) : null;
  if (dirty.has('payHere') || (!initial && data.has('payHere'))) fields.pay_here = data.has('payHere');
  if (data.has('payHere') && (!initial || dirty.has('tips') || dirty.has('payHere')))
    fields.tips_on = data.has('tips');
  if ([...dirty].some((name) => name.startsWith('deal')) || (!initial && data.has('dealOn'))) {
    fields.deal = null;
    if (data.has('dealOn')) {
      const scope = data.get('dealScope') as plans.DealInput['scope'];
      fields.deal = { ...readBenefit(data, 'deal'), scope };
      if (scope === 'group')
        Object.assign(fields.deal, {
          group_size: Number(data.get('dealSize')),
          group_by: new Date(String(data.get('dealBy'))).toISOString(),
          if_short: data.has('dealSmaller') ? readBenefit(data, 'dealFallback') : null,
        });
    }
  }
  return fields;
}

function Benefit({
  prefix,
  original,
  money,
  smaller,
}: {
  prefix: string;
  original?: plans.DealBenefit | null;
  money: boolean;
  smaller?: plans.DealBenefit['kind'];
}) {
  const [selected, setKind] = useState<plans.DealBenefit['kind']>(original?.kind ?? smaller ?? 'free_item');
  const kind = !money || smaller === 'free_item' ? 'free_item' : selected;
  return (
    <>
      <label className={labelClass}>
        Benefit
        <select
          name={prefix + 'Kind'}
          className={fieldClass}
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          {(!smaller || smaller === 'free_item') && <option value="free_item">A free item</option>}
          {money && smaller !== 'free_item' && (
            <>
              <option value="percent">Percent off</option>
              <option value="amount">Dollars off</option>
            </>
          )}
        </select>
      </label>
      {kind === 'free_item' ? (
        <label className={labelClass}>
          Free item
          <input
            className={fieldClass}
            name={prefix + 'Item'}
            maxLength={40}
            defaultValue={original?.item}
            required
          />
        </label>
      ) : (
        <label className={labelClass}>
          {kind === 'percent' ? 'Percent off' : 'Dollars off'}
          <input
            key={kind}
            type="number"
            className={fieldClass}
            name={prefix + 'Amount'}
            min={kind === 'percent' ? 5 : 0.01}
            max={kind === 'percent' ? 50 : undefined}
            step={kind === 'percent' ? 1 : 0.01}
            defaultValue={
              original?.kind === kind && original.value != null
                ? original.value / (kind === 'amount' ? 100 : 1)
                : ''
            }
            required
          />
        </label>
      )}
    </>
  );
}

function DealFields({
  initial,
  priced,
  payHere,
}: {
  initial?: plans.Detail;
  priced: boolean;
  payHere: boolean;
}) {
  const form = initial?.deal?.form;
  const [on, setOn] = useState(!!form);
  const [scope, setScope] = useState(form?.scope ?? 'everyone');
  const [kind, setKind] = useState(form?.kind ?? 'free_item');
  const [smaller, setSmaller] = useState(!!form?.if_short);
  if (initial?.deal && (!form || !initial.deal.can_change)) return <p>{initial.deal.text}</p>;
  return (
    <fieldset className="space-y-3">
      <legend className="font-semibold">Deal</legend>
      <label>
        <input type="checkbox" name="dealOn" checked={on} onChange={(e) => setOn(e.target.checked)} /> Offer a
        deal
      </label>
      {on && (
        <>
          <label className={labelClass}>
            Who gets the deal?
            <select
              className={fieldClass}
              name="dealScope"
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="everyone">Everyone who joins</option>
              <option value="group">When enough people join</option>
            </select>
          </label>
          <div
            className="space-y-2"
            onChange={(e) => {
              if (e.target instanceof HTMLSelectElement && e.target.name === 'dealKind')
                setKind(e.target.value as typeof kind);
            }}
          >
            <Benefit prefix="deal" money={priced || payHere} original={form} />
          </div>
          {kind !== 'free_item' && (priced || payHere) && (
            <label className={labelClass}>
              Apply discount to
              <select className={fieldClass} name="dealTarget" defaultValue={form?.applies_to}>
                {priced && <option value="spot">The spot</option>}
                {payHere && (
                  <>
                    <option value="food">Food</option>
                    <option value="no_alcohol">Everything but alcohol</option>
                  </>
                )}
              </select>
            </label>
          )}
          {scope === 'group' && (
            <>
              <label className={labelClass}>
                People needed
                <input
                  className={fieldClass}
                  type="number"
                  name="dealSize"
                  min="2"
                  defaultValue={form?.group_size ?? 2}
                  required
                />
              </label>
              <label className={labelClass}>
                Deal closes
                <input
                  className={fieldClass}
                  type="datetime-local"
                  name="dealBy"
                  defaultValue={localInput(form?.group_by)}
                  required
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  name="dealSmaller"
                  checked={smaller}
                  onChange={(e) => setSmaller(e.target.checked)}
                />{' '}
                Give a smaller deal if the group falls short
              </label>
              {smaller && (
                <Benefit
                  key={kind}
                  prefix="dealFallback"
                  smaller={kind}
                  money={priced || payHere}
                  original={form?.if_short}
                />
              )}
            </>
          )}
        </>
      )}
    </fieldset>
  );
}

export default function PlanBusinessFields({
  business,
  kind,
  initial,
}: {
  business?: plans.BusinessHost;
  kind: plans.Kind;
  initial?: plans.Detail;
}) {
  const [priced, setPriced] = useState(!!initial?.price);
  const [payHere, setPayHere] = useState(!!initial?.pay_here);
  const price = initial?.price?.was_cents ?? initial?.price?.cents;
  const editablePrice =
    ((business?.can?.price && business.payouts_ready) || !!initial?.price) && !initial?.going_count;
  const location = business?.locations.find((l) => l.is_primary) ?? business?.locations[0];
  const labels = business?.kinds.find((entry) => entry.kind === kind)?.labels;
  return (
    <>
      {labels && (
        <label className={labelClass}>
          What guests see it called
          <select name="label" className={fieldClass} defaultValue={initial?.label || ''} required>
            <option value="" disabled>
              Choose a label
            </option>
            {labels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.text}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={labelClass}>
        Business location
        <select
          className={fieldClass}
          name="businessLocation"
          defaultValue={initial ? '' : location?.id}
          required={!initial}
        >
          {initial && (
            <option value="">
              {initial.place?.name} · {initial.place?.address}
            </option>
          )}
          {business?.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {[l.label, l.address].filter(Boolean).join(' · ')}
            </option>
          ))}
        </select>
      </label>
      {business && (
        <p className="text-sm text-app-muted">
          Schedule a date up to {business.limits.days_ahead} days ahead.
        </p>
      )}
      {editablePrice ? (
        <>
          <label className="block">
            <input
              type="checkbox"
              name="price"
              checked={priced}
              onChange={(e) => setPriced(e.target.checked)}
            />{' '}
            Price a spot
          </label>
          {priced && (
            <label className={labelClass}>
              Price per spot in dollars
              <input
                className={fieldClass}
                name="priceAmount"
                type="number"
                min="1"
                max="500"
                step="0.01"
                defaultValue={price == null ? '' : price / 100}
                required
              />
            </label>
          )}
        </>
      ) : (
        initial?.price && <p>Price per spot · {initial.price.text}</p>
      )}
      {((business?.can?.pay_here && business.payouts_ready) || initial?.pay_here) && (
        <>
          <label className="block">
            <input
              name="payHere"
              type="checkbox"
              checked={payHere}
              onChange={(e) => setPayHere(e.target.checked)}
            />{' '}
            Guests can pay their check here
          </label>
          {payHere && (
            <label className="block">
              <input
                name="tips"
                type="checkbox"
                defaultChecked={initial?.pay_here?.tips_on ?? ['walk_coffee', 'watch_party'].includes(kind)}
              />{' '}
              Accept tips
            </label>
          )}
        </>
      )}
      {business && (business.can?.price || business.can?.pay_here) && !business.payouts_ready && (
        <Link
          className="block text-sm font-semibold text-primary-700"
          href={'/app/businesses/' + business.user_id + '/dashboard?tab=payments'}
        >
          Set up payouts
        </Link>
      )}
      {priced ? (
        <p className="text-sm text-app-muted">Guests get a spot when their payment is confirmed.</p>
      ) : (
        <label className={labelClass}>
          Who gets in?
          <select
            className={fieldClass}
            name="admission"
            defaultValue={initial && initial.how_people_get_in !== 'automatic' ? 'approve' : 'open'}
          >
            <option value="open">Everyone, right away</option>
            <option value="approve">I approve each guest</option>
          </select>
        </label>
      )}
      {business?.can?.deals && <DealFields initial={initial} priced={priced} payHere={payHere} />}
    </>
  );
}
