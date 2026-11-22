'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, MapPin, Plus, SlidersHorizontal } from 'lucide-react';
import { plans } from '@pantopus/api';
import { useAreaPicker } from '@/hooks/useAreaPicker';
import { useFeatureFlagState } from '@/hooks/useFeatureFlag';
import { toast } from '@/components/ui/toast-store';
import { useSocket } from '@/contexts/SocketContext';

const PlansMap = dynamic(() => import('./PlansMap'), { ssr: false });
export const plansPath = '/app/plans';
export const detailPath = (id: string) => plansPath + '/' + encodeURIComponent(id);
export const buttonClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50';
export const secondaryClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-app bg-surface px-3 py-2 text-sm font-medium text-app hover-bg-app disabled:opacity-50';
export const fieldClass =
  'mt-1 block w-full rounded-xl border border-app bg-surface px-3 py-2.5 text-base font-normal text-app';
const say = (message: string) => toast.info(message);
const windows: Record<plans.TimeWindow, string> = {
  now: 'Now',
  today: 'Today',
  week: 'This week',
  weekend: 'This weekend',
};

export function planTime(plan: plans.Card, includeEnd = false) {
  if (!plan.starts_at) return [plan.starts_on, plan.day_part].filter(Boolean).join(' · ');
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: plan.timezone,
    timeZoneName: 'short',
  });
  const start = new Date(plan.starts_at);
  return includeEnd && plan.ends_at
    ? formatter.formatRange(start, new Date(plan.ends_at))
    : formatter.format(start);
}

interface BrowseContext {
  point: plans.Point | null;
  gps?: plans.GPS;
  refreshGPS: () => Promise<plans.GPS | null>;
  time: plans.TimeWindow;
  kind: plans.Kind | '';
}
const Browse = createContext<BrowseContext | null>(null);
export function usePlansArea() {
  const context = useContext(Browse);
  if (!context) throw new Error('Plans needs its workspace');
  return context;
}

export default function PlansWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  // The original public checkout and prepaid-spot links return through these authenticated routes.
  if (/^\/app\/plans\/[^/]+\/(join|spot)\/?$/.test(pathname)) return <>{children}</>;
  return <PlansGate pathname={pathname}>{children}</PlansGate>;
}

function PlansGate({ pathname, children }: { pathname: string; children: ReactNode }) {
  const flag = useFeatureFlagState('plans');
  if (!flag.enabled)
    return (
      <div className="mx-auto max-w-lg space-y-3 p-8 text-app" role="status">
        {flag.isLoading ? (
          'Loading Plans…'
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              {flag.error ? 'Couldn’t load Plans' : 'Plans is unavailable'}
            </h1>
            <Link href="/app/place" className="text-primary-700">
              Back to Place
            </Link>
          </>
        )}
      </div>
    );
  return <Workspace pathname={pathname}>{children}</Workspace>;
}

function Workspace({ pathname, children }: { pathname: string; children: ReactNode }) {
  const area = useAreaPicker(say);
  const [time, setTime] = useState<plans.TimeWindow>('week');
  const [kind, setKind] = useState<plans.Kind | ''>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const onList = pathname === plansPath;
  const composing = pathname === plansPath + '/new';
  const latitude = area.viewingLat ?? area.userLat;
  const longitude = area.viewingLng ?? area.userLng;
  const point = latitude != null && longitude != null ? { latitude, longitude } : null;
  const gps =
    area.userLat != null && area.userLng != null && area.gpsTimestamp
      ? { latitude: area.userLat, longitude: area.userLng, timestamp: area.gpsTimestamp }
      : undefined;
  const client = useQueryClient();
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const refresh = (notice: { type?: string }) => {
      if (notice?.type?.startsWith('plan_')) void client.invalidateQueries({ queryKey: ['plans'] });
    };
    socket.on('notification:new', refresh);
    return () => {
      socket.off('notification:new', refresh);
    };
  }, [client, socket]);

  return (
    <Browse.Provider value={{ point, gps, refreshGPS: area.refreshDeviceLocation, time, kind }}>
      <section className="mx-auto flex min-h-0 max-w-[1600px] flex-col text-app">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-app bg-surface px-4 py-3 lg:px-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="h-5 w-5 text-primary-600" />
            Plans
          </h1>
          {onList && (
            <div className="flex items-center gap-2">
              <button
                className={secondaryClass}
                aria-expanded={filtersOpen}
                aria-label="Area and time filters"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal size={16} />
                <span>{windows[time]}</span>
              </button>
              <Link href={plansPath + '/new'} className={buttonClass}>
                <Plus size={16} />
                Host a plan
              </Link>
            </div>
          )}
        </header>
        {onList && filtersOpen && (
          <div className="grid gap-3 border-b border-app bg-surface px-4 py-3 sm:grid-cols-3">
            <div>
              <button
                className={secondaryClass}
                onClick={() => area.setShowAreaPicker(!area.showAreaPicker)}
                aria-expanded={area.showAreaPicker}
              >
                <MapPin size={16} />
                {area.viewingLabel || 'Choose area'}
                <ChevronDown size={14} />
              </button>
              {area.showAreaPicker && (
                <div className="mt-2 space-y-2">
                  <input
                    className={fieldClass}
                    aria-label="Search area"
                    placeholder="Search city or area"
                    value={area.areaQuery}
                    onChange={(e) => area.setAreaQuery(e.target.value)}
                  />
                  <button className="text-sm text-primary-700" onClick={() => void area.useCurrentArea()}>
                    Use my location
                  </button>
                  {area.areaSuggestions.map((s, i) => (
                    <button
                      key={s.id ?? i}
                      className="block text-left text-sm"
                      onClick={() => area.selectAreaSuggestion(s)}
                    >
                      {s.label || s.text || s.primary_text}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="text-sm font-medium">
              When
              <select
                className={fieldClass}
                value={time}
                onChange={(e) => setTime(e.target.value as plans.TimeWindow)}
              >
                {Object.entries(windows).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Kind
              <select
                className={fieldClass}
                value={kind}
                onChange={(e) => setKind(e.target.value as plans.Kind | '')}
              >
                <option value="">All kinds</option>
                {Object.entries(plans.kindNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div
          className={
            composing ? '' : 'flex flex-col md:grid md:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.35fr)]'
          }
        >
          {!composing && (
            <div
              className={`order-1 relative md:col-start-2 md:row-start-1 md:!block md:!h-[calc(100dvh-8rem)] ${onList && !expanded ? 'h-[36dvh]' : 'hidden'}`}
            >
              {point ? (
                <PlansMap
                  point={point}
                  time={time}
                  kind={kind}
                  selectedId={onList ? undefined : pathname.split('/').at(-1)}
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-surface-muted p-4">
                  {area.areaStatus === 'resolving' ? (
                    'Finding your area…'
                  ) : (
                    <Link
                      href={plansPath}
                      className={secondaryClass}
                      onClick={() => {
                        setFiltersOpen(true);
                        area.setShowAreaPicker(true);
                      }}
                    >
                      Choose an area to see plans
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
          <div
            className={
              composing
                ? 'mx-auto max-w-2xl px-4 py-5'
                : 'order-2 min-w-0 bg-surface px-4 py-4 md:col-start-1 md:row-start-1 md:max-h-[calc(100dvh-8rem)] md:overflow-y-auto md:border-r md:border-app lg:px-5'
            }
          >
            {onList && (
              <button
                className="mx-auto mb-2 flex items-center gap-2 rounded-lg px-3 py-1 text-sm font-medium text-app-secondary md:hidden"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                <span className="h-1 w-6 rounded-full bg-app-border" />
                {expanded ? 'Show map' : 'Expand list'}
              </button>
            )}
            {children}
          </div>
        </div>
      </section>
    </Browse.Provider>
  );
}
