'use client';

// "Tips for each screen" (GUIDE SPEC §4): the tab cards that are on for this account, each
// by its title. Tapping one shows that card again; that doesn't change its record. The web
// has no Help page, so the row that opens this list is at the bottom of Settings.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import * as api from '@pantopus/api';
import { getAuthToken } from '@pantopus/api';
import { useMe } from '@/lib/me';
import { launchFeatures } from '@/lib/featureFlags';
import { myHomesQuery } from '@/lib/myHomes';
import { mailCard, placeSavedCard, pulseCard, todayCard, welcomeCard, type CentreCardContent } from '@/components/guidance/cards';
import { replayCard } from '@/components/guidance/replay';
import { isSeen } from '@/components/guidance/store';
import { useProfileGuidance } from '@/components/guidance/profileGuidance';
import { useTodayHouse } from '@/lib/todayHouse';

export default function GuidanceTipsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signedIn = mounted && !!getAuthToken();
  const me = useMe({ enabled: signedIn });
  const user = me.data;
  const userId = user?.id;
  const guidance = useProfileGuidance(userId);
  const houseOn = useTodayHouse();
  const on = !!guidance?.enabled && user?.accountType !== 'business';

  useEffect(() => {
    if (mounted && !getAuthToken()) router.push('/login');
  }, [mounted, router]);
  // The list is for accounts the cards are on for; Settings shows its row only then.
  useEffect(() => {
    if (user && guidance && !on) router.replace('/app/profile/settings');
  }, [user, guidance, on, router]);

  const saved = useQuery({
    queryKey: ['place-entry', userId, 'saved'],
    queryFn: () => api.savedPlaces.getSavedPlaces(),
    enabled: !!userId && on,
    staleTime: 60_000,
    retry: false,
  });
  const homes = useQuery({ ...myHomesQuery(), enabled: !!userId && on });
  const hasSavedAddress = (saved.data?.savedPlaces ?? []).some((p) => p.user_id === userId)
    || (!!userId && isSeen(userId, 'place_saved'));
  const homeList = homes.data?.homes ?? [];
  const invited = homeList.length > 0 && homeList.every((h) => h.occupancy?.verification_source === 'household');

  const computer = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 768px)').matches : false);
  const tips: { id: string; title: string; card: () => CentreCardContent }[] = [
    { id: 'welcome', title: 'Welcome to Pantopus', card: () => welcomeCard({ computer: computer(), invited }) },
    ...(hasSavedAddress ? [{ id: 'place_saved', title: 'This is your Place', card: placeSavedCard }] : []),
    // Not while the house on Today is on: Today's picture and its card say it themselves.
    ...(houseOn ? [] : [{ id: 'tab_today', title: 'Today', card: () => todayCard({ aroundYou: false }) }]),
    ...(launchFeatures.mailbox ? [{ id: 'tab_mail', title: 'Mail', card: () => mailCard({ letters: launchFeatures.mailExtras }) }] : []),
    { id: 'tab_pulse', title: 'Pulse', card: pulseCard },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-1.5 hover:bg-app-hover rounded-lg transition" aria-label="Back">
          <ArrowLeft className="w-5 h-5 text-app-text" />
        </button>
        <h1 className="text-xl font-bold text-app-text">Tips for each screen</h1>
      </div>
      {on ? (
        <ul data-testid="guidance.tips" className="bg-surface rounded-xl border border-app divide-y divide-app overflow-hidden">
          {tips.map((tip) => (
            <li key={tip.id}>
              <button
                type="button"
                data-testid={`guidance.tips.${tip.id}`}
                onClick={() => replayCard(tip.card())}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover-bg-app transition"
              >
                <span className="font-medium text-app">{tip.title}</span>
                <ChevronRight aria-hidden className="w-5 h-5 shrink-0 text-app-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
