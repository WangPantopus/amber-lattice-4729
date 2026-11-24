import type { ReactNode } from 'react';
import type { ProfileLane, ProfileRings } from '@pantopus/api';
import ProfileAvatar from '@/components/profile/public/atoms/ProfileAvatar';
import {
  CHART_SIZE, FAN_H, FAN_W, MARK_SIZE, avatarRingWidth, fullChartShapes, headerMarkShapes, markFacts, presentLanes,
  workFanShapes, type FanDot, type RingRole, type RingShape,
} from './rings';

// The page's colours for the rings' roles: theme variables, so the rings follow light and dark (and print light).
const THEME: Record<RingRole, string> = {
  ink: 'rgb(var(--app-text))',
  guide: 'rgb(var(--app-border))',
  plate: 'rgb(var(--app-surface))',
  now: 'var(--color-link)',
  band: 'rgb(var(--app-surface-sunken))',
  tick: 'rgb(var(--app-text-muted) / 0.7)',
  label: 'rgb(var(--app-text-muted))',
  hub: 'rgb(var(--app-surface-sunken))',
  home: 'var(--color-identity-home)',
  work: 'var(--color-identity-business)',
  others: 'var(--color-identity-personal)',
};

const paint = (value?: string) => (value ? THEME[value as RingRole] ?? value : 'none');

function Shapes({ shapes }: { shapes: RingShape[] }) {
  return (
    <>
      {shapes.map((s, i) => {
        if (s.type === 'circle') {
          return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={paint(s.fill)} stroke={s.stroke ? paint(s.stroke) : undefined} strokeWidth={s.strokeWidth} strokeDasharray={s.dash} opacity={s.opacity} />;
        }
        if (s.type === 'path') {
          return <path key={i} d={s.d} fill={s.fill ? paint(s.fill) : 'none'} stroke={paint(s.stroke)} strokeWidth={s.strokeWidth} strokeLinecap={s.cap} strokeDasharray={s.dash} opacity={s.opacity} />;
        }
        return <text key={i} x={s.x} y={s.y} textAnchor={s.anchor} fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" fontSize={s.size} fontWeight={s.weight} fill={paint(s.fill)}>{s.text}</text>;
      })}
    </>
  );
}

/** "12 years on record", "1 year on record", "Less than a year on record". */
export function yearsText(years: number): string {
  const whole = Math.floor(years);
  if (whole < 1) return 'Less than a year on record';
  return `${whole} ${whole === 1 ? 'year' : 'years'} on record`;
}

/** The mark around a portrait (176 at full size): one line a year, the portrait in the middle. */
export function RingMark({ rings, name, hasName = true, photoUrl, seed, size = MARK_SIZE, wrapPortrait }: {
  rings: ProfileRings;
  name: string;
  hasName?: boolean;
  photoUrl?: string | null;
  seed: string;
  size?: number;
  /** Wraps the portrait (the Moments ring and link around today's profile photo). */
  wrapPortrait?: (portrait: ReactNode) => ReactNode;
}) {
  const scale = size / MARK_SIZE;
  const portrait = Math.round(80 * scale);
  const facts = markFacts(rings);
  const label = `${hasName ? `${name}'s` : 'Their'} rings: ${yearsText(facts.years).toLowerCase()}`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`} width={size} height={size} className="block">
        <Shapes shapes={headerMarkShapes(rings)} />
      </svg>
      <div className="absolute" style={{ left: (size - portrait) / 2, top: (size - portrait) / 2 }}>
        {wrapPortrait
          ? wrapPortrait(<ProfileAvatar name={hasName ? name : null} seed={seed} photoUrl={photoUrl} size={portrait} />)
          : <ProfileAvatar name={hasName ? name : null} seed={seed} photoUrl={photoUrl} size={portrait} />}
      </div>
    </div>
  );
}

const LANE_WORD: Record<ProfileLane, string> = { home: 'Home', work: 'Work', others: 'With others' };
const LANE_DOT: Record<ProfileLane, string> = { home: 'bg-[var(--color-identity-home)]', work: 'bg-[var(--color-identity-business)]', others: 'bg-[var(--color-identity-personal)]' };

/** The Record chart, the legend in words, and how to read it. Lanes whose part is off are absent from all three. */
export function RecordChart({ rings, firstName, caption }: { rings: ProfileRings; firstName: string; caption?: string | null }) {
  const lanes = presentLanes(rings);
  const lanesWords = lanes.map((lane) => LANE_WORD[lane].toLowerCase());
  const label = `${firstName}'s rings in full. Each ring is a year, from ${rings.from} at the centre to this year outside, with January at the top.`
    + (lanes.length > 0 ? ` The lines are ${lanesWords.join(', ')}.` : '')
    + ' Thick lines are seen, thin lines are signed, dotted lines are said.';
  return (
    <div>
      <svg role="img" aria-label={label} viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} className="block w-full max-w-[24rem] h-auto mx-auto">
        <Shapes shapes={fullChartShapes(rings)} />
      </svg>
      <div className="mt-2 px-1 flex flex-col gap-2 text-xs leading-4 text-app-muted" aria-hidden="true">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><i className="block w-[18px] h-[5px] rounded-sm bg-[rgb(var(--app-text))]" />Seen</span>
          <span className="inline-flex items-center gap-1.5"><i className="block w-[18px] h-[1.5px] bg-[rgb(var(--app-text))]" />Signed</span>
          <span className="inline-flex items-center gap-1.5"><i className="block w-[18px] h-[2px] bg-[repeating-linear-gradient(90deg,rgb(var(--app-text-muted))_0_2px,transparent_2px_5px)]" />Said</span>
        </div>
        {lanes.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {lanes.map((lane) => (
              <span key={lane} className="inline-flex items-center gap-1.5"><i className={`block w-2 h-2 rounded-full ${LANE_DOT[lane]}`} />{LANE_WORD[lane]}</span>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 px-1 text-xs leading-4 text-app-muted">
        {caption || `The centre is ${rings.from} and the outer ring is this year.`}
      </p>
    </div>
  );
}

/** An avatar wearing the outer ring of its mark (board 6): thicker with years on record, dotted until something is seen. */
export function AvatarRing({ rings, children }: { rings: ProfileRings; children: ReactNode }) {
  const facts = markFacts(rings);
  const style = facts.seen
    ? { borderWidth: avatarRingWidth(facts.years), borderStyle: 'solid' as const, borderColor: 'rgb(var(--app-text))' }
    : { borderWidth: 1.5, borderStyle: 'dotted' as const, borderColor: 'rgb(var(--app-text-muted))' };
  return <span className="inline-flex shrink-0 rounded-full p-0.5" style={style}>{children}</span>;
}

/** The work rings opened flat, with a dot per piece and the legend in words (board 7). */
export function WorkFan({ from, now, months, dots, label }: { from: number; now: string; months: string[]; dots: FanDot[]; label: string }) {
  return (
    <div>
      <svg role="img" aria-label={label} viewBox={`0 0 ${FAN_W} ${FAN_H}`} className="block w-full max-w-[24rem] h-auto mx-auto">
        <Shapes shapes={workFanShapes({ from, now, months }, dots)} />
      </svg>
      <div aria-hidden="true" className="mt-1.5 px-1 flex flex-wrap gap-x-3.5 gap-y-1 text-xs leading-4 text-app-muted">
        <span className="inline-flex items-center gap-1.5"><i className="block w-2.5 h-2.5 rounded-full bg-[var(--color-identity-business)]" />Seen</span>
        <span className="inline-flex items-center gap-1.5"><i className="flex w-2.5 h-2.5 rounded-full border-[1.5px] border-[var(--color-identity-business)] items-center justify-center"><i className="block w-[3px] h-[3px] rounded-full bg-[var(--color-identity-business)]" /></i>Signed</span>
        <span className="inline-flex items-center gap-1.5"><i className="block w-2.5 h-2.5 rounded-full border-[1.5px] border-dotted border-[var(--color-identity-business)]" />Said</span>
        <span>A dot is a piece</span>
      </div>
    </div>
  );
}
