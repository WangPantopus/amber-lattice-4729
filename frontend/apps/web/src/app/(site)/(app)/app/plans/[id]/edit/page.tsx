'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { detailPath } from '@/components/plans/PlansWorkspace';
import PlanForm from '@/components/plans/PlanForm';
export default function EditPlanPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery({
    queryKey: ['plans', 'edit', id],
    queryFn: () => plans.detail(id),
    gcTime: 0,
    retry: false,
  });
  if (detail.isPending) return <p role="status">Loading plan…</p>;
  if (
    !detail.data ||
    detail.isError ||
    detail.data.viewer.role !== 'host' ||
    !['upcoming', 'live'].includes(detail.data.state)
  )
    return (
      <p>
        This plan can’t be edited.{' '}
        <Link href={detailPath(id)} className="text-primary-700">
          Back to plan
        </Link>
      </p>
    );
  return <PlanForm key={id} initial={detail.data} />;
}
