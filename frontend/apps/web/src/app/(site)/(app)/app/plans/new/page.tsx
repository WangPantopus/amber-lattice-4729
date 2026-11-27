import PlanForm from '@/components/plans/PlanForm';

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ again?: string; samePeople?: string; moment?: string }>;
}) {
  const { again, samePeople, moment } = await searchParams;
  // `moment`: "Want to come?" from the person's own Moment (Pulse, reinvented); absent, today's form.
  return <PlanForm againId={again} samePeople={samePeople === '1'} fromMoment={moment || undefined} />;
}
