// The Studio's text looks (Pulse, reinvented; design: "Aa: ten or more fonts"). Each look has a shared name the three
// apps put on its chip; each app draws it with its own fonts and burns the words into the picture, so only the name
// crosses apps. On the web the fonts are open-licence Google fonts served with the site (next/font), declared here and
// loaded only by the Studio's own chunk (never preloaded), and fetched by the browser only once a look is picked.

import {
  Bebas_Neue,
  Caveat,
  Courier_Prime,
  DM_Serif_Display,
  Nunito,
  Pacifico,
  Permanent_Marker,
  Playfair_Display,
  Space_Mono,
} from 'next/font/google';

const serif = DM_Serif_Display({ weight: '400', subsets: ['latin'], preload: false, display: 'swap' });
const typewriter = Courier_Prime({ weight: '700', subsets: ['latin'], preload: false, display: 'swap' });
const marker = Permanent_Marker({ weight: '400', subsets: ['latin'], preload: false, display: 'swap' });
const handwritten = Caveat({ weight: '700', subsets: ['latin'], preload: false, display: 'swap' });
const rounded = Nunito({ weight: '900', subsets: ['latin'], preload: false, display: 'swap' });
const tall = Bebas_Neue({ weight: '400', subsets: ['latin'], preload: false, display: 'swap' });
const script = Pacifico({ weight: '400', subsets: ['latin'], preload: false, display: 'swap' });
const mono = Space_Mono({ weight: '700', subsets: ['latin'], preload: false, display: 'swap' });
const elegant = Playfair_Display({ weight: '700', style: 'italic', subsets: ['latin'], preload: false, display: 'swap' });

export interface TextLook {
  /** The shared name on the chip. */
  name: string;
  /** What `Artwork.font` carries: the CSS family list and weight the canvas draws with (unset for Classic). */
  font?: { family: string; weight: number; style?: 'italic' };
}

const of = (f: { style: { fontFamily: string } }, weight: number, style?: 'italic') => ({
  family: f.style.fontFamily,
  weight,
  ...(style ? { style } : {}),
});

/** In the order the chips show. Classic is today's words exactly. */
export const TEXT_LOOKS: readonly TextLook[] = [
  { name: 'Classic' },
  { name: 'Serif', font: of(serif, 400) },
  { name: 'Typewriter', font: of(typewriter, 700) },
  { name: 'Marker', font: of(marker, 400) },
  { name: 'Handwritten', font: of(handwritten, 700) },
  { name: 'Rounded', font: of(rounded, 900) },
  { name: 'Tall', font: of(tall, 400) },
  { name: 'Script', font: of(script, 400) },
  { name: 'Mono', font: of(mono, 700) },
  { name: 'Elegant', font: of(elegant, 700, 'italic') },
];

/** The CSS `font` the canvas draws a look with at `px`. */
export const fontAt = (look: TextLook['font'], px: number) =>
  look ? `${look.style ? look.style + ' ' : ''}${look.weight} ${px}px ${look.family}` : `700 ${px}px system-ui, sans-serif`;

/** Wait until the browser has the look's font, so the canvas never draws it in a stand-in. */
export async function fontReady(look: TextLook['font'], text: string) {
  if (!look || typeof document === 'undefined' || !document.fonts) return;
  try {
    await document.fonts.load(fontAt(look, 48), text || 'Aa');
  } catch {
    /* a font that can't load draws in the stand-in, as the CSS says */
  }
}
