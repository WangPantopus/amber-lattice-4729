'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ChevronDown,
  List,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { plans } from '@pantopus/api';
import { useAreaPicker } from '@/hooks/useAreaPicker';
import { useFeatureFlagState } from '@/hooks/useFeatureFlag';
import BottomSheet from '@/components/ui/BottomSheet';
import { toast } from '@/components/ui/toast-store';
import { useSocket } from '@/contexts/SocketContext';
import './plans-map.css';

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
  if (plan.time_text) return plan.time_text;
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
  host: plans.HostFilter;
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
  const businessFlag = useFeatureFlagState('plans_business');
  const [chosenHost, setHost] = useState<plans.HostFilter>('all');
  const host = businessFlag.enabled ? chosenHost : 'all';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [fullWindow, setFullWindow] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const listToggleRef = useRef<HTMLButtonElement>(null);
  const onList = pathname === plansPath;
  const composing = pathname === plansPath + '/new' || pathname.endsWith('/edit');
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

  useEffect(() => {
    if (onList && showList) resultsRef.current?.focus({ preventScroll: true });
  }, [onList, showList]);

  const closeList = () => {
    setShowList(false);
    listToggleRef.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!onList) setFullWindow(false);
    if (!onList || (!fullWindow && !showList)) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      if (showList) closeList();
      else setFullWindow(false);
    };
    document.addEventListener('keydown', exit);
    return () => document.removeEventListener('keydown', exit);
  }, [fullWindow, onList, showList]);

  const areaLabel =
    area.viewingLabel === 'Set area' ? (point ? 'Current area' : 'Choose area') : area.viewingLabel;
  const extraFilters = Number(!!kind) + Number(host !== 'all');
  const openArea = () => {
    area.setShowAreaPicker(true);
    setFiltersOpen(true);
  };
  const closeFilters = () => {
    setFiltersOpen(false);
    area.setShowAreaPicker(false);
  };

  return (
    <Browse.Provider value={{ point, gps, refreshGPS: area.refreshDeviceLocation, time, kind, host }}>
      <section
        className={onList ? 'plans-explorer' : 'mx-auto flex min-h-0 max-w-[1600px] flex-col text-app'}
        data-full-window={(onList && fullWindow) || undefined}
      >
        {onList ? (
          <header className="plans-map-header">
            <div className="plans-surface relative flex min-w-0 items-center gap-2.5 rounded-2xl p-2 pr-3.5 sm:gap-3 sm:pr-5">
              <span className="plans-calendar grid h-10 w-10 shrink-0 place-items-center rounded-xl">
                <CalendarDays size={22} aria-hidden />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-6 tracking-tight text-app sm:text-2xl sm:leading-7">
                  Plans
                </h1>
                <button
                  type="button"
                  onClick={openArea}
                  aria-label={'Change area, ' + areaLabel}
                  aria-haspopup="dialog"
                  className="flex max-w-full items-center gap-1 text-xs font-medium leading-5 text-app-secondary after:absolute after:inset-0 after:rounded-2xl hover:underline"
                >
                  <span className="truncate">{areaLabel}</span>
                  <ChevronDown size={13} className="shrink-0" />
                </button>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <Link
                href={plansPath + '/new'}
                className="plans-host inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold sm:px-5"
              >
                <Plus size={18} aria-hidden />
                <span>Host a plan</span>
              </Link>
              <button
                type="button"
                className="plans-surface plans-icon-button"
                title={fullWindow ? 'Exit full window' : 'Expand map to full window'}
                aria-label={fullWindow ? 'Exit full window' : 'Expand map to full window'}
                onClick={() => setFullWindow(!fullWindow)}
              >
                {fullWindow ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
              </button>
            </div>
          </header>
        ) : (
          <header className="flex items-center gap-2 border-b border-app bg-surface px-4 py-3 lg:px-6">
            <CalendarDays className="h-5 w-5 text-primary-600" />
            <h1 className="text-xl font-semibold">Plans</h1>
          </header>
        )}
        <div
          className={
            onList
              ? 'contents'
              : composing
                ? ''
                : 'flex flex-col md:grid md:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.35fr)]'
          }
        >
          {!composing && (
            <div
              className={
                onList
                  ? 'plans-canvas'
                  : 'relative hidden md:col-start-2 md:row-start-1 md:block md:h-[calc(100dvh-8rem)]'
              }
            >
              {point ? (
                <PlansMap
                  point={point}
                  time={time}
                  kind={kind}
                  selectedId={onList ? undefined : pathname.split('/').at(-1)}
                  onShowList={onList ? () => setShowList(true) : undefined}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-muted p-4 text-center">
                  <MapPin size={28} className="text-app-muted" aria-hidden />
                  {area.areaStatus === 'resolving' ? (
                    <span role="status">Finding your area…</span>
                  ) : (
                    <Link href={plansPath} className={secondaryClass} onClick={openArea}>
                      Choose an area to see plans
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
          <div
            ref={resultsRef}
            id={onList ? 'plans-list' : undefined}
            role={onList ? 'region' : undefined}
            aria-label={onList ? 'Plan list' : undefined}
            tabIndex={onList ? -1 : undefined}
            hidden={onList && !showList}
            className={
              onList
                ? 'plans-results plans-surface relative rounded-2xl px-4 py-4 sm:px-5'
                : composing
                  ? 'mx-auto max-w-2xl px-4 py-5'
                  : 'min-w-0 bg-surface px-4 py-4 md:col-start-1 md:row-start-1 md:max-h-[calc(100dvh-8rem)] md:overflow-y-auto md:border-r md:border-app lg:px-5'
            }
          >
            {onList && showList && (
              <button
                type="button"
                aria-label="Close plan list"
                onClick={closeList}
                className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full text-app-muted hover-bg-app"
              >
                <X size={17} />
              </button>
            )}
            {children}
          </div>
        </div>
        {onList && (
          <div className="plans-dock plans-surface flex items-center gap-1 rounded-full p-1">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              aria-label={['Filters', windows[time], kind && plans.kindNames[kind], host !== 'all' && host]
                .filter(Boolean)
                .join(', ')}
              className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-app hover-bg-app sm:px-4"
            >
              <SlidersHorizontal size={17} aria-hidden />
              {windows[time]}
              {extraFilters > 0 && <span className="plans-filter-count">{extraFilters}</span>}
            </button>
            <button
              ref={listToggleRef}
              type="button"
              aria-expanded={showList}
              aria-controls="plans-list"
              onClick={() => setShowList(!showList)}
              className="plans-list-toggle flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
            >
              <List size={18} aria-hidden />
              {showList ? 'Hide list' : 'Show list'}
            </button>
          </div>
        )}
        <BottomSheet
          open={onList && filtersOpen}
          onClose={closeFilters}
          title="Plan filters"
          className="flex max-h-dvh flex-col"
          footer={
            <button className={buttonClass + ' w-full'} onClick={closeFilters}>
              Done
            </button>
          }
        >
          <div className="space-y-5 text-app">
            <div>
              <p className="mb-2 text-sm font-semibold">Area</p>
              <button
                className={secondaryClass + ' w-full justify-start'}
                onClick={() => area.setShowAreaPicker(!area.showAreaPicker)}
                aria-expanded={area.showAreaPicker}
              >
                <MapPin size={17} className="shrink-0 text-primary-700" />
                <span className="min-w-0 flex-1 truncate text-left">{areaLabel}</span>
                <ChevronDown size={15} />
              </button>
              {area.showAreaPicker && (
                <div className="mt-2 space-y-1">
                  <input
                    className={fieldClass}
                    aria-label="Search area"
                    placeholder="Search city or area"
                    value={area.areaQuery}
                    onChange={(e) => area.setAreaQuery(e.target.value)}
                  />
                  <button
                    className="flex min-h-10 items-center gap-2 text-sm font-medium text-primary-700"
                    onClick={() => void area.useCurrentArea()}
                  >
                    <LocateFixed size={16} />
                    Use my location
                  </button>
                  {area.areaSuggestions.map((suggestion, i) => (
                    <button
                      key={suggestion.id ?? i}
                      className="block w-full rounded-lg px-2 py-2 text-left text-sm hover-bg-app"
                      onClick={() => area.selectAreaSuggestion(suggestion)}
                    >
                      {suggestion.label || suggestion.text || suggestion.primary_text}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">When</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(windows).map(([key, name]) => (
                  <label key={key} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="plans-time-window"
                      value={key}
                      checked={time === key}
                      onChange={() => setTime(key as plans.TimeWindow)}
                      className="peer sr-only"
                    />
                    <span className="plans-time-option flex min-h-10 items-center justify-center gap-1 rounded-xl border border-app px-1 text-sm font-medium peer-focus-visible:ring-2">
                      {time === key && <Check size={15} aria-hidden />}
                      {name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className={businessFlag.enabled ? 'grid gap-3 sm:grid-cols-2' : ''}>
              <label className="block text-sm font-semibold">
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
              {businessFlag.enabled && (
                <label className="block text-sm font-semibold">
                  Hosted by
                  <select
                    className={fieldClass}
                    value={host}
                    onChange={(e) => setHost(e.target.value as plans.HostFilter)}
                  >
                    <option value="all">Everyone</option>
                    <option value="neighbors">People</option>
                    <option value="businesses">Businesses</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        </BottomSheet>
      </section>
    </Browse.Provider>
  );
}
