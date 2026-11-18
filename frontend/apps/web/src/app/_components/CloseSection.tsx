'use client';

// ============================================================
// The close, as dawn comes round the Earth: the address field again (picking an address opens its preview on
// /start), then the app — the phone's own store badge on a phone, or the QR code that opens /get and both badges on
// a computer — and the film. /get sends computers here (#get-the-app).
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AddressAutocomplete, { type SelectedAddress } from '@/components/place/AddressAutocomplete';
import AppDownload from './AppDownload';
import styles from './home.module.css';

export default function CloseSection() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [fallbackAddress, setFallbackAddress] = useState<string | null>(null);
  const open = (address: string | null) => router.push(address ? `/start?address=${encodeURIComponent(address)}` : '/start');

  return (
    <section className={styles.close} id="get-the-app" data-close="" data-u="5" data-scrim=".4" aria-labelledby="close-title">
      <div className={styles.wrap}>
        <div className={styles.closeBox}>
          <h2 id="close-title" className={styles.closeTitle}>
            <span>Social media gave everyone a feed.</span>Pantopus gives everyone <em>a place.</em>
          </h2>
          <div className={styles.promise}>
            <span>Your address is never sold</span>
            <span>Never used for ads</span>
            <span>Free on iPhone and Android</span>
          </div>
          <div className={styles.closeLookup}>
            <div className={styles.field}>
              <AddressAutocomplete
                ariaLabel="Your address"
                placeholder="Start with your address"
                onSelect={(place) => {
                  setSelected(place);
                  open(place.label);
                }}
                onClear={() => setSelected(null)}
                onFallbackChange={setFallbackAddress}
                onSubmit={() => open(selected?.label ?? fallbackAddress)}
              />
            </div>
            <button type="button" className={styles.lookupBtn} onClick={() => open(selected?.label ?? fallbackAddress)}>
              See your place
            </button>
          </div>
          <div className={styles.closeActions}>
            <AppDownload variant="close" />
            <button className={styles.btnGhost} type="button" data-film>
              Watch the film
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
