'use client';

// ============================================================
// The hero's address lookup — the page's main way in.
//
// Pick an address and three sourced facts about it appear over the scene, from the same public preview /start shows.
// "See everything" opens /start for that address, which reads the cached preview. If the preview takes longer than
// LOOKUP_PATIENCE_MS, the visitor goes straight to /start instead of waiting here. The funnel records a preview seen on
// the homepage. All of this works as it did on the earlier homepage; only the look changed.
//
// Renders the lookup block and, as its sibling, the facts, which the hero's grid places beside the words on a wide
// screen and below them on a narrow one.
// ============================================================

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import AddressAutocomplete, { type SelectedAddress } from '@/components/place/AddressAutocomplete';
import { lookupLimitMessage } from '@/components/place/lookupLimit';
import ScaleGlyph from './ScaleGlyph';
import { heroFacts, scaleWord } from './heroFacts';
import styles from './home.module.css';

const LOOKUP_PATIENCE_MS = 2500;

function startHref(label: string): string {
  return `/start?address=${encodeURIComponent(label)}`;
}

export default function HeroLookup() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [fallbackAddress, setFallbackAddress] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['place', 'public-preview', submitted],
    queryFn: () => api.place.getPublicPlacePreview(submitted as string),
    enabled: !!submitted,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const looking = !!submitted && preview.isFetching && !preview.data;

  // A slow preview shouldn't keep anyone waiting on the homepage.
  useEffect(() => {
    if (!submitted || !looking) return;
    const id = window.setTimeout(() => router.push(startHref(submitted)), LOOKUP_PATIENCE_MS);
    return () => window.clearTimeout(id);
  }, [submitted, looking, router]);

  // Funnel: a preview seen on the homepage. The route is kept unless an
  // earlier visit (a mailed card's ?r=) already set one.
  const status = preview.data?.status ?? null;
  useEffect(() => {
    if (!submitted || !status) return;
    if (!api.getFunnelRoute()) api.rememberFunnelRoute('home');
    api.recordFunnelEvent('t0_preview_viewed', { status, surface: 'home' });
  }, [submitted, status]);

  const choose = (place: SelectedAddress) => {
    setSelected(place);
    setSubmitted(place.label);
  };
  const go = () => {
    const address = selected?.label ?? fallbackAddress;
    if (!address) {
      router.push('/start');
    } else if (submitted === address && preview.data) {
      router.push(startHref(address));
    } else {
      setSubmitted(address);
    }
  };

  const data = preview.data;
  const ready = data && (data.status === 'ready' || data.status === 'partial');
  const facts = ready ? heroFacts(data) : [];
  const placeLine = data?.place ? [data.place.address, data.place.city].filter(Boolean).join(', ') : submitted;

  return (
    <>
      <div className={styles.lookupBlock}>
        <div className={styles.lookup}>
          <div className={styles.field}>
            <AddressAutocomplete
              ariaLabel="Your address"
              placeholder="Start typing your address"
              onSelect={choose}
              onFallbackChange={setFallbackAddress}
              onClear={() => {
                setSelected(null);
                setSubmitted(null);
              }}
              onSubmit={go}
            />
          </div>
          <button type="button" className={styles.lookupBtn} onClick={go}>
            {looking ? 'Looking…' : 'See your place'}
          </button>
        </div>
        {submitted ? (
          <div className={styles.scanTrack} aria-hidden="true">
            <div key={submitted} className={looking || facts.length ? styles.scanBarRunning : styles.scanBar} />
          </div>
        ) : null}
        <div className={styles.heroMeta}>
          <button className={styles.play} type="button" data-film>
            <i aria-hidden="true" />
            Watch the film · 70 s
          </button>
          {looking ? (
            <span className={styles.heroStatus} role="status">Reading public records, the sky and civic boundaries for this address…</span>
          ) : preview.isError ? (
            <span role="alert">
              {lookupLimitMessage(preview.error) ?? (
                <>
                  We couldn’t load this address just now.{' '}
                  <button type="button" className={styles.textBtn} onClick={() => preview.refetch()}>Try again</button>
                </>
              )}
            </span>
          ) : data?.status === 'could_not_place' ? (
            <span role="alert">We couldn’t find that address. Adding the city and state usually does it.</span>
          ) : data?.status === 'unsupported_region' ? (
            <span role="alert">Home features are U.S.-only for now. Records and risks come from U.S. public sources.</span>
          ) : (
            <span>Free to look. No account needed.</span>
          )}
        </div>
      </div>

      {ready && submitted ? (
        <div className={styles.facts}>
          <div className={styles.factsStack} aria-live="polite">
            <span className={styles.factsHead}>{placeLine}</span>
            {facts.map((f, i) => (
              <div key={f.key} className={styles.fact} style={{ '--delay': `${i * 0.3}s` } as CSSProperties}>
                <ScaleGlyph scale={f.scale} size={24} />
                <div className={styles.factText}>
                  <span className={styles.factLabel}>{f.label} · {scaleWord(f.scale)}</span>
                  <span className={styles.factValue}>{f.value}</span>
                  <span className={styles.factSource}>{f.source}</span>
                </div>
              </div>
            ))}
            <Link href={startHref(submitted)} className={styles.factsMore} style={{ '--delay': `${facts.length * 0.3}s` } as CSSProperties}>
              See everything for this address →
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
