// ============================================================
// /plan-invitation/<plan id>?key=<guest's key>: the link in an email to a guest without an account (Plans for the
// holidays, H1). It keeps the key in this browser's HttpOnly cookie for that plan, the one the page and the answer
// route read, and opens the plan's page without it, so the key is never in a link the page shows.
//
// The path is one the apps don't open: the iPhone app opens /plans/* and the Android app every link it has a
// screen for, and a guest who answered in a browser may still have the app installed.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { buildPlanPath } from '@pantopus/utils';

export const dynamic = 'force-dynamic';

const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_-]{43}$/;
const MAX_AGE_S = 90 * 24 * 60 * 60;

/**
 * A redirect on this same host: a relative Location, so the cookie set here goes with the next page (behind a proxy
 * the request's own URL may name another host).
 */
function redirectHere(path: string): NextResponse {
  return new NextResponse(null, { status: 302, headers: { Location: path } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PLAN_ID.test(id)) return redirectHere('/');
  const key = req.nextUrl.searchParams.get('key') || '';
  const res = redirectHere(buildPlanPath(id.toLowerCase()));
  res.headers.set('Cache-Control', 'private, no-store');
  // The link's own address stays out of the next page's Referer.
  res.headers.set('Referrer-Policy', 'no-referrer');
  if (KEY.test(key)) {
    res.cookies.set(`pantopus_plan_guest_${id.toLowerCase()}`, key, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_S,
    });
  }
  return res;
}
