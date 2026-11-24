'use client';

// The address box on the public pages: the homepage's lookup (the same public suggestions), opening /start with the
// address typed, where StartFunnel shows its preview. The address goes to /start from the browser, never in a link on
// the page, so a search engine follows no address.
//
// Counting, as on the county pages (property-records/_components/CountyLookup.tsx): a lookup started here records
// the route `pillar:<name>` (or `topic:<name>`, `guide:<slug>` on the pages that reuse this shell) unless an earlier
// visit (a mailed card's `?r=`, the homepage) already set one, so the preview, the wall and an account made after
// count toward this page. Nothing new on the backend.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '@pantopus/api';
import AddressAutocomplete, { type SelectedAddress } from '@/components/place/AddressAutocomplete';
import home from '../../_components/home.module.css';
import styles from './public.module.css';

export default function PillarLookup({ route, label = 'See your place', placeholder = 'Start typing your address' }: { route: string; label?: string; placeholder?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [fallbackAddress, setFallbackAddress] = useState<string | null>(null);
  const [going, setGoing] = useState(false);

  const go = (address: string | null) => {
    if (!api.getFunnelRoute()) api.rememberFunnelRoute(route);
    setGoing(true);
    router.push(address ? `/start?address=${encodeURIComponent(address)}` : '/start');
  };

  return (
    <div className={styles.lookupBlock}>
      <div className={home.lookup}>
        <div className={home.field}>
          <AddressAutocomplete
            ariaLabel="Your address"
            placeholder={placeholder}
            onSelect={(place) => {
              setSelected(place);
              go(place.label);
            }}
            onClear={() => setSelected(null)}
            onFallbackChange={setFallbackAddress}
            onSubmit={() => go(selected?.label ?? fallbackAddress)}
          />
        </div>
        <button type="button" className={home.lookupBtn} onClick={() => go(selected?.label ?? fallbackAddress)}>
          {going ? 'Opening…' : label}
        </button>
      </div>
      <p className={styles.lookupNote}>Free to look. No account needed.</p>
    </div>
  );
}
