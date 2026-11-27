'use client';

// "Want to come?" (Pulse, reinvented, phase 1 piece 12; coord/CONTRACT.md §6g): the author starts a plan in Plans from
// their own live Moment, with today's plan form filled from the Moment (its words as the title, its place); the plan is
// the person's own, never a business's, and goes through Plans' own rules. Others then see, over the Moment, "Want to
// come?" (or "You're in") opening the plan's own screen in Plans, which says only what Plans lets that reader see.

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Ticket } from 'lucide-react';
import { moments } from '@pantopus/api';
import { post } from '@pantopus/api/client';
import type { Detail, NewPlan } from '@pantopus/api/endpoints/plans';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useMe } from '@/lib/me';
import './plan.css';

/** A Moment's plan, as a switch-on reader may see it in Plans (CONTRACT 6g); null when none. */
export interface MomentPlan {
  id: string;
  kind: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  state: string;
  going_count: number | null;
  area_label: string | null;
  viewer_role: string | null;
}
type PlanMoment = Moment & { plan?: MomentPlan | null; post_as?: string | null };

/** What today's plan form is filled with: the Moment's words and, when it has one, the place everyone sees. */
export interface MomentPlanSeed {
  id: string;
  title: string;
  place?: { name: string; address: string | null; latitude: number; longitude: number };
}

/** The plan form's `?moment=<id>`: the author's own live Moment, read to fill the form. */
export function useMomentPlanSeed(id: string | undefined) {
  return useQuery({
    queryKey: ['reinvented', 'plan-seed', id],
    enabled: !!id,
    retry: false,
    gcTime: 0,
    queryFn: async (): Promise<MomentPlanSeed> => {
      const { moment: m } = await moments.read(id!);
      const words = (m.kind === 'text' ? m.text : m.caption)?.trim() || '';
      const placed = !m.no_location && m.latitude != null && m.longitude != null;
      return {
        id: m.id,
        title: words.slice(0, 80),
        ...(placed
          ? { place: { name: m.place_label || '', address: null, latitude: m.latitude!, longitude: m.longitude! } }
          : {}),
      };
    },
  });
}

/** Starts the plan from the Moment: Plans' own request and answer, through the Moment's route (CONTRACT 6g). */
export async function startPlanFromMoment(id: string, plan: NewPlan): Promise<Detail> {
  const res = await post<{ plan: Detail }>(`/api/reinvented/moments/${encodeURIComponent(id)}/plan`, plan, {
    params: { more: '1', guests: '1', extras: '1' },
  });
  return res.plan;
}

function when(at: string | null) {
  if (!at) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(/\s?AM$/, ' am').replace(/\s?PM$/, ' pm');
}

/** Over the viewer's picture: the Moment's plan, "Want to come?" or "You're in", opening it in Plans. */
export function PlanOverPicture({ moment }: { moment: Moment }) {
  const plan = (moment as PlanMoment).plan;
  const account = useMe().data?.id;
  if (!plan) return null;
  const own = moment.author?.id === account;
  const going = plan.going_count ? ` · ${plan.going_count} going` : '';
  const stop = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };
  return (
    <Link className="wc-plan" href={`/app/plans/${encodeURIComponent(plan.id)}`} {...stop}>
      <Ticket size={18} aria-hidden="true" />
      <span>
        <strong>{own ? 'Your plan' : plan.viewer_role === 'guest' ? 'You’re in' : 'Want to come?'}</strong>
        <small>
          {plan.title}
          {plan.starts_at ? ` · ${when(plan.starts_at)}` : ''}
          {going}
        </small>
      </span>
    </Link>
  );
}

/** In Moment options, on the author's own live Moment with no plan yet, under their own name, while Plans is on. */
export function StartPlanEntry({ moment, close }: { moment: Moment; close(): void }) {
  const m = moment as PlanMoment;
  const account = useMe().data?.id;
  const plansOn = useFeatureFlag('plans', { enabled: !!account });
  const router = useRouter();
  const live = Date.parse(m.expires_at || '') > Date.now();
  if (!plansOn || !account || m.author?.id !== account || !live || m.plan || m.post_as === 'pen_name') return null;
  return (
    <button
      type="button"
      className="mo-action"
      onClick={() => {
        router.push(`/app/plans/new?moment=${encodeURIComponent(m.id)}`);
        close();
      }}
    >
      <CalendarPlus />
      Want to come? Start a plan
    </button>
  );
}
