'use client';

// The yearly poster (Pulse, reinvented, phase 4; coord/CONTRACT.md §9d; board B8): the reader's own year, their numbers
// and one kept Moment a month (the one most people marked), private to them. Nothing of it is shared by the server: the
// picture is made here, in the browser, and saved to the reader's own device only when they ask.

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, X } from 'lucide-react';
import { get } from '@pantopus/api/client';
import { colors } from '@/components/moments/momentState';
import type { ListMoment } from '../pulse/listApi';
import { Shelves, type Numbers } from './Cabinet';
import './cabinet.css';

interface PosterAnswer {
  year: number;
  numbers: Numbers;
  months: { month: number; moment: ListMoment }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** This year in the poster's own time zone (Pacific). */
export function posterYear(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric' }).format(now));
}

const pictureOf = (m: ListMoment) => (m.kind === 'video' ? m.poster_url : m.kind === 'photo' ? m.media_url : null);

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The first colour of a CSS colour or gradient, for a canvas. */
function firstColour(css: string): string {
  return /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i.exec(css)?.[0] ?? '#0e6f73';
}

/** The poster as a picture, 1080 × 1350: the year, the numbers, and the twelve months. Pictures that can't be read stay colour. */
async function drawPoster(p: PosterAnswer, name: string): Promise<Blob | null> {
  const W = 1080,
    H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#0f172a';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.font = '700 72px system-ui, sans-serif';
  g.fillText(String(p.year), 64, 120);
  g.font = '500 32px system-ui, sans-serif';
  g.fillStyle = '#cbd5e1';
  g.fillText(`${name}’s year in Moments`, 64, 172);
  const nums = p.numbers;
  const count = (n: number, one: string, many: string) => (n ? `${n.toLocaleString('en-US')} ${n === 1 ? one : many}` : null);
  const line = [
    count(nums.places_stood, 'place stood', 'places stood'),
    nums.highest_ft != null ? `${nums.highest_ft.toLocaleString('en-US')} ft highest` : null,
    count(nums.specimens, 'specimen', 'specimens'),
    count(nums.questions_helped, 'question helped', 'questions helped'),
    count(nums.strands_sparked, 'strand sparked', 'strands sparked'),
    count(nums.canvases, 'canvas', 'canvases'),
  ].filter(Boolean) as string[];
  g.font = '600 28px system-ui, sans-serif';
  g.fillStyle = '#fde68a';
  g.fillText(line.slice(0, 3).join(' · '), 64, 232);
  g.fillText(line.slice(3).join(' · '), 64, 272);
  const byMonth = new Map(p.months.map((m) => [m.month, m.moment]));
  const cols = 3,
    gap = 20,
    top = 320,
    size = (W - 64 * 2 - gap * (cols - 1)) / cols;
  for (let i = 0; i < 12; i++) {
    const x = 64 + (i % cols) * (size + gap),
      y = top + Math.floor(i / cols) * (size * 0.76 + gap);
    const h = size * 0.76;
    const m = byMonth.get(i + 1);
    // A canvas paints one colour, not the CSS gradient a words-only Moment wears: its first colour stands in.
    g.fillStyle = m ? firstColour(colors[m.background || 'teal']) : '#1e293b';
    g.fillRect(x, y, size, h);
    const src = m ? pictureOf(m) : null;
    const img = src ? await load(src) : null;
    if (img) {
      const r = Math.max(size / img.width, h / img.height);
      const w2 = img.width * r,
        h2 = img.height * r;
      g.save();
      g.beginPath();
      g.rect(x, y, size, h);
      g.clip();
      g.drawImage(img, x + (size - w2) / 2, y + (h - h2) / 2, w2, h2);
      g.restore();
    }
    g.fillStyle = '#0f172acc';
    g.fillRect(x, y + h - 40, 90, 40);
    g.fillStyle = '#fff';
    g.font = '700 24px system-ui, sans-serif';
    g.fillText(MONTHS[i], x + 14, y + h - 12);
  }
  g.fillStyle = '#94a3b8';
  g.font = '500 22px system-ui, sans-serif';
  g.fillText('Pantopus', 64, H - 14);
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

export default function PosterView({ account, name, onClose }: { account: string; name: string; onClose(): void }) {
  const year = posterYear();
  const box = useRef<HTMLDivElement>(null);
  const poster = useQuery({
    queryKey: ['reinvented', 'poster', account, year],
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => get<{ poster: PosterAnswer }>(`/api/reinvented/poster/${year}`, {}, { signal }),
  });
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState('');
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const p = poster.data?.poster;
  async function save() {
    if (!p || saving) return;
    setSaving(true);
    setSaid('');
    const blob = await drawPoster(p, name);
    setSaving(false);
    if (!blob) return setSaid('The picture couldn’t be made here. Try again.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pantopus-${p.year}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSaid('Saved to this device. Nothing was shared.');
  }
  const byMonth = new Map((p?.months || []).map((m) => [m.month, m.moment]));
  return (
    <div className="ps-scrim" onClick={(e) => e.target === e.currentTarget && onClose()} data-covers-shell="">
      <div ref={box} className="ps-box" role="dialog" aria-modal="true" aria-label={`Your ${year} poster`} tabIndex={-1}>
        <header className="ps-head">
          <div>
            <p className="ps-kicker">Your year</p>
            <h2>{year}</h2>
          </div>
          <button type="button" className="ps-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>
        {poster.isPending ? (
          <p className="cb-empty">Laying out your year…</p>
        ) : !p ? (
          <p className="cb-empty">Your poster couldn’t load.</p>
        ) : (
          <>
            <Shelves numbers={p.numbers} />
            <ol className="ps-months">
              {MONTHS.map((label, i) => {
                const m = byMonth.get(i + 1);
                const src = m ? pictureOf(m) : null;
                return (
                  <li key={label} style={m && !src ? { background: colors[m.background || 'teal'] } : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- the reader's own signed picture */}
                    {src && <img src={src} alt="" />}
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
            <div className="ps-actions">
              <small>Only you see your poster. Saving makes the picture on this device.</small>
              <button type="button" className="ps-save" onClick={() => void save()} disabled={saving}>
                <Download size={16} aria-hidden="true" />
                {saving ? 'Making it…' : 'Save the picture'}
              </button>
            </div>
            {said && (
              <p className="cb-note" role="status">
                {said}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
