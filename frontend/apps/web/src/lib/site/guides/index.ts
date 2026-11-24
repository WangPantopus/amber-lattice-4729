// The ten guides, in the order /guides lists them. Each file holds one guide's words; types.ts says what a guide is.

import type { Guide } from './types';
import { organizeMeals } from './organize-meals';
import { beforeBuying } from './before-buying';
import { floodZone } from './flood-zone';
import { radonZone } from './radon-zone';
import { taxAppeal } from './tax-appeal';
import { propertyRecord } from './property-record';
import { householdTasks } from './household-tasks';
import { getTogether } from './get-together';
import { christmasCard } from './christmas-card';
import { proofOfAddress } from './proof-of-address';

export type { Guide, GuideBlock, GuideQuestion, GuideSection, GuideSource } from './types';

export const GUIDES: Guide[] = [
  organizeMeals,
  beforeBuying,
  floodZone,
  radonZone,
  taxAppeal,
  propertyRecord,
  householdTasks,
  getTogether,
  christmasCard,
  proofOfAddress,
];

export function guideBySlug(slug: string): Guide | null {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}

/** Text with its [words](href) links reduced to the words, for structured data and counts. */
export function plainText(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1');
}

/** "November 23, 2026" from "2026-11-23". */
export function dateWords(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
