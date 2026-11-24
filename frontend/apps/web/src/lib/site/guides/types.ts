// ─────────────────────────────────────────────────────────────────────────────
// The guides' content, typed. Each guide is data: the page at /guides/<slug> draws it, and its Article, FAQPage and
// BreadcrumbList structured data are built from the same objects, so what search engines read is what people read.
//
// Text may carry links as [words](/path) or [words](https://…); renderInline (render.tsx) draws them, and plainText
// strips them for structured data. Every outside fact names its source in the text and appears in `sources` with the
// date it was read. Pantopus is mentioned only where it helps, and every claim about it was read from the code.
// ─────────────────────────────────────────────────────────────────────────────

export type GuideBlock = { p: string } | { ul: string[] } | { ol: string[] };

export type GuideSection = { h2: string; blocks: GuideBlock[] };

export type GuideSource = {
  /** Who published it: "FEMA", "U.S. Environmental Protection Agency". */
  publisher: string;
  /** The page's own title. */
  title: string;
  url: string;
  /** The day this build read it (YYYY-MM-DD, Pacific). */
  read: string;
};

export type GuideQuestion = { q: string; a: string };

export type Guide = {
  slug: string;
  /** The page title, 60 characters or fewer, ending "| Pantopus". */
  title: string;
  /** 140 to 160 characters: what the reader gets. */
  description: string;
  h1: string;
  /** The short line under the h1, also the /guides list's line. */
  lede: string;
  /** YYYY-MM-DD. */
  written: string;
  /** YYYY-MM-DD: the day every outside fact was last read again. */
  checked: string;
  sections: GuideSection[];
  questions: GuideQuestion[];
  sources: GuideSource[];
  /** Where Pantopus helps with this, drawn as the closing card. */
  pantopus: { title: string; text: string; href: string; label: string };
  /** Sibling pages and guides. */
  related: { href: string; label: string }[];
  /** One plain line for guides about buying, appeals or proof of address. */
  notAdvice?: string;
};
