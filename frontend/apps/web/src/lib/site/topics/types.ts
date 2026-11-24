// The four topic pages' words, typed like the guides (../guides/types.ts): sections of paragraphs and lists, with
// [words](/path) links, and "Questions people ask" that draw both the page and its FAQPage structured data.

import type { GuideBlock, GuideQuestion } from '../guides/types';

export type TopicSection = {
  /** A heading people would type as a question, or the homepage's own heading for the same thing; a *starred* part
   *  is drawn in gold italic, as on the homepage. */
  h2: string;
  /** Optional small line above the heading, like the homepage's eyebrows. */
  eyebrow?: string;
  blocks: GuideBlock[];
  /** A link under the section, to the pillar page or guide that says more. */
  more?: { href: string; label: string };
};

export type TopicPage = {
  /** "/home-buying". */
  path: string;
  /** "topic:home-buying": the route a sign-up from this page is counted under. */
  route: string;
  /** Without the " | Pantopus" the page's metadata adds; 49 characters or fewer. */
  title: string;
  /** 140 to 160 characters. */
  description: string;
  /** The footer's and the breadcrumb's short name. */
  label: string;
  /** May star its last words, like the homepage: "A home is hard *to fake.*". */
  h1: string;
  lede: string;
  /** Whether the page opens with the address lookup under its lede. */
  lookup: boolean;
  /** The lookup's heading and line, when it has one. */
  lookupText?: { title: string; line: string };
  sections: TopicSection[];
  questions: GuideQuestion[];
  /** The pillars closest to the topic, listed first under "More of Pantopus" (the rest follow). */
  pillars: ('place' | 'today' | 'mail' | 'pulse' | 'support-train' | 'plans' | 'moments' | 'chat')[];
  /** Guides and pages to read next. */
  related: { href: string; label: string }[];
  /** The closing heading and line above the lookup and the app buttons. */
  close: { title: string; line: string };
  notAdvice?: string;
};
