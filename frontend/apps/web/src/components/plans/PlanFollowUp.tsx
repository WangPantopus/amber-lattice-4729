'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { detailPath, plansPath, secondaryClass } from './PlansWorkspace';

export function isPlanToday(card: plans.Card) {
  if (card.state === 'live') return true;
  if (card.state !== 'upcoming' || card.dates || !card.starts_at) return false;
  const day = new Intl.DateTimeFormat('en-US', { timeZone: card.timezone });
  return day.format(new Date(card.starts_at)) === day.format(new Date());
}

function seriesContinues(card: plans.Card) {
  const series = card.repeat;
  if (!series || (series.index && series.total && series.index >= series.total)) return false;
  return !series.last_on || !card.starts_on || card.starts_on < series.last_on;
}

export function PlanAfterActions({ card, samePeople }: { card: plans.Card; samePeople?: boolean }) {
  const client = useQueryClient();
  const answer = useMutation({
    mutationFn: (value: 'great' | 'ok' | 'not_right') => plans.feedback(card.id, value),
    onSuccess: () => client.invalidateQueries({ queryKey: ['plans'] }),
  });
  if (card.viewer.role === 'host') {
    if (card.business) return null;
    const hostAgain = plansPath + '/new?again=' + encodeURIComponent(card.id);
    return (
      <div className="flex flex-wrap gap-2">
        {!seriesContinues(card) && (
          <Link className={secondaryClass} href={hostAgain}>
            Host again
          </Link>
        )}
        {samePeople && (
          <Link className={secondaryClass} href={hostAgain + '&samePeople=1'}>
            Plan the next one with the same people
          </Link>
        )}
      </div>
    );
  }
  if (card.viewer.role !== 'guest') return null;
  if (answer.isSuccess || card.viewer.feedback_given)
    return (
      <p className="text-sm" role="status">
        Thanks for your feedback.
      </p>
    );
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">How was {card.title}?</h3>
      <p className="text-sm">Only Pantopus sees your answer.</p>
      <div className="flex flex-wrap gap-2">
        {(['great', 'ok', 'not_right'] as const).map((value, i) => (
          <button
            key={value}
            className={secondaryClass}
            disabled={answer.isPending}
            onClick={() => answer.mutate(value)}
          >
            {['Great', 'It was OK', 'Something wasn’t right'][i]}
          </button>
        ))}
      </div>
      {answer.isError && <p role="alert">{answer.error.message}</p>}
    </section>
  );
}

export default function TodayPlans() {
  const enabled = useFeatureFlag('plans');
  const router = useRouter();
  const client = useQueryClient();
  const mine = useQuery({ queryKey: ['plans', 'mine'], queryFn: plans.mine, enabled, gcTime: 0 });
  const way = useMutation({
    mutationFn: plans.onMyWay,
    onSuccess: () => client.invalidateQueries({ queryKey: ['plans'] }),
  });
  const open = useMutation({
    mutationFn: async ({ card, intent }: { card: plans.Card; intent: 'meeting' | 'chat' }) => {
      const plan = await plans.detail(card.id);
      if (plan.viewer.role === 'guest' || plan.viewer.role === 'host') {
        if (intent === 'chat' && plan.chat_open && plan.chat_room_id) {
          router.push(
            '/app/chat/' +
              encodeURIComponent(plan.chat_room_id) +
              '?returnTo=' +
              encodeURIComponent(detailPath(card.id)),
          );
          return;
        }
        const place = plan.place;
        if (intent === 'meeting' && place) {
          if (plan.place_kind === 'online' && place.link && /^https?:\/\//i.test(place.link)) {
            window.location.assign(place.link);
            return;
          }
          if (place.latitude != null && place.longitude != null) {
            window.location.assign(
              'https://www.google.com/maps/dir/?api=1&destination=' +
                encodeURIComponent(place.latitude + ',' + place.longitude),
            );
            return;
          }
        }
      }
      router.push(detailPath(card.id));
    },
  });
  if (!enabled || !mine.data || mine.isError) return null;
  const current = [...mine.data.hosting, ...mine.data.going].filter(isPlanToday);
  const recent = mine.data.recent.filter(
    (c) =>
      c.state === 'ended' &&
      (c.viewer.role === 'host' ? !c.business && !seriesContinues(c) : !c.viewer.feedback_given),
  );
  if (!current.length && !recent.length) return null;
  return (
    <section className="space-y-3">
      {current.map((c) => (
        <div key={c.id} className="space-y-2 rounded-xl border border-app bg-surface p-4">
          <p className="text-sm">{c.viewer.role === 'host' ? 'You’re hosting today' : 'Going today'}</p>
          <Link className="font-semibold text-primary-700" href={detailPath(c.id)}>
            {c.title}
          </Link>
          <p className="text-sm text-app-muted">
            {c.going_count} going · {c.spots_left} spots left
          </p>
          {c.viewer.role === 'guest' && (
            <button
              className={secondaryClass}
              disabled={open.isPending}
              onClick={() => open.mutate({ card: c, intent: 'meeting' })}
            >
              {c.place_kind === 'online' ? 'Join online' : 'Directions'}
            </button>
          )}
          {c.viewer.role === 'host' && !c.business && (
            <button
              className={secondaryClass}
              disabled={open.isPending}
              onClick={() => open.mutate({ card: c, intent: 'chat' })}
            >
              Message guests
            </button>
          )}
          {c.viewer.role === 'guest' && c.place_kind !== 'online' && (
            <button
              className={secondaryClass}
              disabled={way.isPending || c.my_request?.on_my_way}
              onClick={() => way.mutate(c.id)}
            >
              {c.my_request?.on_my_way ? 'On the way' : 'On my way'}
            </button>
          )}
        </div>
      ))}
      {(way.error || open.error) && <p role="alert">{(way.error || open.error)?.message}</p>}
      {recent.map((c) => (
        <div key={c.id} className="rounded-xl border border-app bg-surface p-4">
          <Link href={detailPath(c.id)} className="text-primary-700">
            {c.title}
          </Link>
          <PlanAfterActions card={c} />
        </div>
      ))}
    </section>
  );
}
