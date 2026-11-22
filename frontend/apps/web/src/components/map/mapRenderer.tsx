'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import type { StandardMapProps } from './StandardMap';
import { MapSkeleton } from './MapSkeleton';
import { MAP_PUBLIC_TOKEN } from './constants';

export { MAP_PUBLIC_TOKEN };
export function initialMapRenderer(): '3d' | 'flat' {
  return MAP_PUBLIC_TOKEN && typeof window !== 'undefined' && typeof window.WebGL2RenderingContext !== 'undefined' ? '3d' : 'flat';
}

// The 3D map (mapbox-gl and its CSS) loads only here, when it's used. If its code can't be
// fetched, the flat map takes over.
function GlMapUnavailable({ onUnavailable }: { onUnavailable: (reason: string) => void }) {
  useEffect(() => onUnavailable('chunk'), [onUnavailable]);
  return <MapSkeleton />;
}
export const StandardGlMap = dynamic<StandardMapProps>(
  () => import('./StandardMap').catch(() => ({ default: GlMapUnavailable })),
  { ssr: false, loading: () => <MapSkeleton /> },
);
