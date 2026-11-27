'use client';

import { useId } from 'react';
import type { StampValues } from './stampTypes';

type Value = NonNullable<StampValues['postmark']>;
const INK = { wet: '#C81E1E', dry: '#1E293B' } as const;
const FONT = "-apple-system, 'Helvetica Neue', Arial, sans-serif";

/** A size that keeps a line of capitals inside an arc about `room` units long. */
function fit(text: string, size: number, spacing: number, room: number) {
  const wide = text.length * (size * 0.66 + spacing);
  return wide <= room ? size : Math.max(4.6, (size * room) / wide);
}

/**
 * The postmark (boards B1, B2, B3): place, date, time and weather in one round mark. Wet red ink while the Moment is
 * live, dark ink once it has dried. Drawn at 100% of its box; the box sets the size.
 */
export default function Postmark({ value, ink = 'wet' }: { value: Value; ink?: 'wet' | 'dry' }) {
  const id = useId().replace(/:/g, '');
  const color = INK[ink];
  const top = value.place.toUpperCase();
  const bottom = value.weather ? `${value.weather.temp_f}°F · ${value.weather.label}`.toUpperCase() : '';
  const topSize = fit(top, 8.4, 1.6, 74);
  const bottomSize = fit(bottom, 7.4, 1.3, 84);
  return (
    <svg viewBox="0 0 76 76" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <path id={`${id}-t`} d="M 13 38 A 25 25 0 0 1 63 38" />
        <path id={`${id}-b`} d="M 9.5 38 A 28.5 28.5 0 0 0 66.5 38" />
      </defs>
      <circle cx="38" cy="38" r="37" fill="rgba(255,251,240,0.94)" />
      <circle cx="38" cy="38" r="34.5" fill="none" stroke={color} strokeWidth="1.8" />
      <circle cx="38" cy="38" r="20" fill="none" stroke={color} strokeWidth="1" />
      <text fill={color} fontSize={topSize} fontWeight="800" letterSpacing={topSize < 8.4 ? 0.8 : 1.6} fontFamily={FONT}>
        <textPath href={`#${id}-t`} startOffset="50%" textAnchor="middle">
          {top}
        </textPath>
      </text>
      {bottom && (
        <text fill={color} fontSize={bottomSize} fontWeight="800" letterSpacing={bottomSize < 7.4 ? 0.6 : 1.3} fontFamily={FONT}>
          <textPath href={`#${id}-b`} startOffset="50%" textAnchor="middle">
            {bottom}
          </textPath>
        </text>
      )}
      <text x="38" y="36" textAnchor="middle" fill={color} fontSize="9.6" fontWeight="800" fontFamily={FONT}>
        {value.date_label.toUpperCase()}
      </text>
      {value.time_label && (
        <text x="38" y="46" textAnchor="middle" fill={color} fontSize="7.6" fontWeight="700" fontFamily={FONT}>
          {value.time_label}
        </text>
      )}
    </svg>
  );
}
