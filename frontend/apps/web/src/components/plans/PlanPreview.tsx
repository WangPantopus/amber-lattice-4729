import { useQuery } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { buttonClass, secondaryClass } from './PlansWorkspace';

export type DealQuote = Pick<
  plans.NewBusinessPlan,
  'host_as' | 'deal' | 'spots' | 'starts_at' | 'price_cents' | 'pay_here'
>;
type ReviewActions = { saving: boolean; error?: string; onBack: () => void; onPost: () => void };
export function PlanReviewActions({
  quote,
  label,
  saving,
  error,
  onBack,
  onPost,
}: ReviewActions & { quote?: DealQuote; label: string }) {
  const preview = useQuery({
    queryKey: ['plans', 'deal-preview', quote],
    queryFn: () => plans.dealPreview(quote!.host_as.business_user_id, quote!),
    enabled: !!quote?.deal,
    retry: false,
    gcTime: 0,
  });
  return (
    <>
      {quote?.deal && (
        <div role="status">
          {preview.isLoading
            ? 'Checking your deal…'
            : [
                preview.data?.text,
                preview.data?.condition_text,
                preview.data?.if_short_text,
                preview.data?.claim_text,
                ...Object.values(preview.data?.errors || {}),
              ]
                .filter(Boolean)
                .join(' ')}
          {preview.isError && (
            <button className={secondaryClass} onClick={() => void preview.refetch()}>
              Retry deal preview
            </button>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className={secondaryClass} disabled={saving} onClick={onBack}>
          Back to editing
        </button>
        <button
          className={buttonClass}
          disabled={saving || (!!quote?.deal && !preview.data?.ok)}
          onClick={onPost}
        >
          {saving ? 'Saving…' : label}
        </button>
      </div>
    </>
  );
}
export default function PlanPreview({
  draft,
  business,
  saving,
  error,
  onBack,
  onPost,
}: {
  draft: plans.NewPlan | plans.NewBusinessPlan;
  business?: plans.BusinessHost;
  saving: boolean;
  error?: string;
  onBack: () => void;
  onPost: () => void;
}) {
  const paid = 'host_as' in draft ? draft : null;
  const location =
    'place' in draft
      ? draft.place.kind === 'home'
        ? 'At home'
        : draft.place.kind === 'online'
          ? 'Online'
          : draft.place.name
      : business?.locations.find((p) => p.id === draft.business_location_id)?.address;
  return (
    <section className="space-y-3 rounded-xl border border-app p-4">
      <h3 className="text-lg font-semibold">Preview your plan</h3>
      <p>
        {plans.kindNames[draft.kind]} ·{' '}
        {business?.name ||
          ('audience' in draft && draft.audience === 'invited' ? 'Only people I invite' : 'People nearby')}
      </p>
      <h4 className="text-xl font-bold">{draft.title}</h4>
      {draft.about && <p>{draft.about}</p>}
      <p>
        {draft.date_options ? 'Picking a date' : new Date(draft.starts_at).toLocaleString()} · {location} ·{' '}
        {draft.spots} spots
      </p>
      {'place' in draft && draft.place.kind !== 'public' && (
        <p className="text-sm">
          Only confirmed guests see the {draft.place.kind === 'home' ? 'address' : 'meeting link'}.
        </p>
      )}
      {draft.bring?.items.length ? (
        <p>Bring list · {draft.bring.items.map((it) => it.label).join(', ')}</p>
      ) : null}
      {draft.chip_in && <p>Chip in · {draft.chip_in.note}</p>}
      {draft.gift && <p>Gift exchange · up to ${(draft.gift.budget_cents / 100).toFixed(2)}</p>}
      {paid && (
        <p>
          {paid.price_cents ? `$${(paid.price_cents / 100).toFixed(2)} per spot` : 'Free'} ·{' '}
          {paid.pay_here ? 'Pay here' : 'No check in the app'}
        </p>
      )}
      <PlanReviewActions
        quote={paid ?? undefined}
        label="Post plan"
        saving={saving}
        error={error}
        onBack={onBack}
        onPost={onPost}
      />
    </section>
  );
}
