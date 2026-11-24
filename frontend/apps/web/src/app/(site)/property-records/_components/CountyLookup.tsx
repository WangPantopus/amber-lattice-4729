'use client';

// ============================================================
// The county page's address box: the same public suggestions as the homepage and /start, and the lookup at /start
// with the address typed (StartFunnel reads `?address=` and shows that address's preview). The address goes to
// /start from the browser, never in a link on the page, so a search engine follows no address.
//
// Counting: the funnel's beacons carry the route this browser came in on (api.rememberFunnelRoute). A lookup started
// here records `county-page:<FIPS>` (`city-page:<place FIPS>` on a city's page) unless an earlier visit (a mailed card's `?r=`, the homepage) already set one, as
// the homepage does, so the preview, the wall and an account made after count toward the county page. Visits are
// counted per county and day by the page's own beacon (countVisit); backend/services/countyGuide/report.cjs adds it
// all up.
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import * as api from '@pantopus/api';
import AddressAutocomplete, { type SelectedAddress } from '@/components/place/AddressAutocomplete';

// One visit per tab and page: the backend counts visits per county or city and day, nothing else (countyGuide/visits.js).
function countVisit(fips: string) {
  try {
    const key = `pantopus_county_visit:${fips}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Without storage a reload counts again; the count is still a county's, never a person's.
  }
  void fetch('/api/public/county-guide/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fips }),
    keepalive: true,
  }).catch(() => {});
}

/** `fips` is the county's FIPS code, or on a city's page the city's place FIPS code (its Census GEOID). */
export default function CountyLookup({ fips, inName, kind = 'county' }: { fips: string; inName: string; kind?: 'county' | 'city' }) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [fallbackAddress, setFallbackAddress] = useState<string | null>(null);
  const [going, setGoing] = useState(false);

  useEffect(() => {
    countVisit(fips);
  }, [fips]);

  const go = (address: string | null) => {
    if (!address) return;
    setGoing(true);
    if (!api.getFunnelRoute()) api.rememberFunnelRoute(`${kind}-page:${fips}`);
    router.push(`/start?address=${encodeURIComponent(address)}`);
  };
  const submit = () => go(selected?.label ?? fallbackAddress);
  const ready = Boolean(selected || fallbackAddress);

  return (
    <section aria-labelledby="lookup-title" className="mt-8 rounded-2xl border border-app-border-subtle bg-app-surface-raised p-4 sm:p-5 shadow-sm">
      <h2 id="lookup-title" className="text-lg sm:text-xl font-bold text-app-text dark:text-white">
        Look up any home in {inName}
      </h2>
      <p className="mt-1 text-sm text-app-text-secondary dark:text-app-text-muted">
        Public records, the area&apos;s hazards and what is known about the address, with each source named.
      </p>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <div className="flex-1 min-w-0">
          <AddressAutocomplete
            ariaLabel={`An address in ${inName}`}
            placeholder="Start typing an address"
            submitLabel="Look it up"
            onSelect={(place) => {
              setSelected(place);
              go(place.label);
            }}
            onClear={() => setSelected(null)}
            onFallbackChange={setFallbackAddress}
            onSubmit={submit}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!ready || going}
          className="h-[54px] shrink-0 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-primary-600 px-5 text-[15px] font-semibold text-white enabled:hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {going ? 'Opening…' : 'Look it up'}
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2.5 text-sm text-app-text-secondary dark:text-app-text-muted">
        Free: looking up an address needs no account, and saving a home takes an account with no card.
      </p>
    </section>
  );
}
