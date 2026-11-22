import PlanForm from '@/components/plans/PlanForm';

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ again?: string; samePeople?: string }>;
}) {
  const { again, samePeople } = await searchParams;
  return <PlanForm againId={again} samePeople={samePeople === '1'} />;
}
