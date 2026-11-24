'use client';

// A paid ad's code on a public page's link (`?r=ad-…` or `?route=ad-…`) is remembered as the visitor arrives, as
// /start remembers it, so the lookup they start here (PillarLookup keeps a route already set) and the account they make
// count under the ad in the funnel's "By source". Any other code, and a visit with no code, behave as before. Draws
// nothing; stores only the code, in the same place /start does.

import { useEffect } from 'react';
import * as api from '@pantopus/api';

export default function AdRoute() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const route = (params.get('r') || params.get('route') || '').trim();
    if (/^ad-/i.test(route)) api.rememberFunnelRoute(route);
  }, []);
  return null;
}
