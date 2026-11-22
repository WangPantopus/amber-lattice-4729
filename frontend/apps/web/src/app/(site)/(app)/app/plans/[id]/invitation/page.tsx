'use client';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { claimKey } from '@/components/plans/OpenPlanOnWeb';
import { buttonClass, detailPath } from '@/components/plans/PlansWorkspace';

export default function ClaimInvitation() {
  const { id } = useParams<{ id: string }>(),
    router = useRouter(),
    client = useQueryClient();
  const claim = useMutation({
    mutationFn: async () => {
      const raw = sessionStorage.getItem(claimKey(id));
      if (!raw) throw new Error('Reopen the invitation link in this tab to continue.');
      const value = JSON.parse(raw);
      await plans.claimInvitation(id, value);
      sessionStorage.removeItem(claimKey(id));
      await client.invalidateQueries({ queryKey: ['plans'] });
      router.replace(detailPath(id));
    },
  });
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold">Your invitation</h2>
      <p>Open this invitation with your signed-in account to see the plan and answer.</p>
      <button
        className={buttonClass}
        disabled={claim.isPending || claim.isSuccess}
        onClick={() => claim.mutate()}
      >
        Open invitation
      </button>
      {claim.error && <p role="alert">{claim.error.message}</p>}
    </section>
  );
}
