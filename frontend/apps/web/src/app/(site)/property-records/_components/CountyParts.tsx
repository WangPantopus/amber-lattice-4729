// The county page's parts (COUNTY-PAGES.md): its offices' rows, what Pantopus holds, what the land is like, what owning
// here involves, the homes in numbers and the questions people ask. The city pages use the rows, the homes and the
// questions. Each part shows only where the backend's answer holds it, and each figure names its office and its date.
// Server-rendered, no script.

import { dateWords, dollars, type GuideCountyPage, type GuideOffice, type GuideQuestion } from '../_lib/guide';
import { linkClass } from './Chrome';

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="mt-10">
      <h2 id={`${id}-title`} className="text-xl font-bold text-app-text dark:text-white">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Source({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-xs leading-relaxed text-app-text-muted">{children}</p>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-app-border-subtle bg-app-surface px-4 py-3.5">{children}</div>;
}

/** An office's rows: what it holds, its own page, and the day it was read. */
export function OfficeRows({ rows }: { rows: GuideOffice[] }) {
  if (!rows.length) return null;
  return (
    <ul className="mt-2 divide-y divide-app-border-subtle rounded-2xl border border-app-border-subtle bg-app-surface">
      {rows.map((row) => (
        <li key={`${row.id}:${row.url}`} className="px-4 py-3.5">
          <p className="font-semibold text-app-text dark:text-white">{row.title}</p>
          {row.office ? <p className="text-sm text-app-text-secondary dark:text-app-text-muted">{row.office}</p> : null}
          {row.line ? <p className="mt-1 text-sm text-app-text-secondary dark:text-app-text-muted">{row.line}</p> : null}
          <a href={row.url} target="_blank" rel="noopener noreferrer nofollow" className={`mt-1 inline-block text-sm font-medium ${linkClass}`}>
            {row.host || 'Open the office’s page'}
          </a>
          {row.from ? <p className="mt-1 text-xs text-app-text-muted">{row.from}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The questions people ask, each answered with the office that holds the answer. */
export function Questions({ questions }: { questions: GuideQuestion[] }) {
  if (!questions.length) return null;
  return (
    <Section id="questions" title="Questions people ask">
      <div className="divide-y divide-app-border-subtle rounded-2xl border border-app-border-subtle bg-app-surface">
        {questions.map((item) => (
          <div key={item.id} className="px-4 py-3.5">
            <h3 className="font-semibold text-app-text dark:text-white">{item.q}</h3>
            <p className="mt-1 text-app-text-secondary dark:text-app-text-muted leading-relaxed">{item.a}</p>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className={`mt-1 inline-block text-sm ${linkClass}`}>
                {hostOf(item.url) ?? 'Open the office’s page'}
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The questions as FAQ structured data. */
export function faqLd(questions: GuideQuestion[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

const read = (iso: string | null | undefined) => (dateWords(iso) ? `, read ${dateWords(iso)}` : '');

export function Holds({ page }: { page: GuideCountyPage }) {
  const holds = page.holds;
  if (holds) {
    // "the Clark County Assessor's weekly file"
    const office = /^the /i.test(holds.publisher) ? holds.publisher : `the ${holds.publisher}`;
    const file = holds.dataset ? `${office}'s ${holds.dataset}` : `${office}'s file`;
    return (
      <Section id="holds" title="What Pantopus holds here">
        <Card>
          <p className="text-app-text dark:text-white leading-relaxed">
            Pantopus reads {file} of {dateWords(holds.as_of)}
            {holds.records ? <>: more than {holds.records.toLocaleString('en-US')} property records.</> : '.'}
          </p>
          <p className="mt-1.5 text-sm text-app-text-secondary dark:text-app-text-muted leading-relaxed">
            A home&apos;s own record is shown to its confirmed owner. The count takes in every kind of property on file, land
            and businesses too.
          </p>
        </Card>
      </Section>
    );
  }
  // A live county whose file couldn't be read safely says nothing rather than something untrue.
  if (page.live) return null;
  return (
    <Section id="holds" title="What Pantopus holds here">
      <Card>
        <p className="text-app-text-secondary dark:text-app-text-muted leading-relaxed">
          Pantopus doesn&apos;t read {page.county.in_name}&apos;s property file yet.
          {page.offices.rows.length || page.offices.towns.length ? ` The offices above hold its records.` : ''} The lookup
          still shows federal data for any address here.
        </p>
      </Card>
    </Section>
  );
}

// FEMA's five ratings as filled dots, lowest first; the word beside them is FEMA's own.
function Dots({ level }: { level: number }) {
  const tone = level >= 4 ? 'bg-app-warning-solid' : level === 3 ? 'bg-primary-500' : 'bg-app-text-muted';
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((step) => (
        <span key={step} className={`h-1.5 w-3 rounded-full ${step <= level ? tone : 'bg-app-border'}`} />
      ))}
    </span>
  );
}

const RADON = {
  1: { title: 'Zone 1', line: 'Highest radon potential: EPA expects average indoor levels above 4 pCi/L.' },
  2: { title: 'Zone 2', line: 'Moderate radon potential: EPA expects average indoor levels from 2 to 4 pCi/L.' },
  3: { title: 'Zone 3', line: 'Low radon potential: EPA expects average indoor levels below 2 pCi/L.' },
} as const;

export function Land({ page }: { page: GuideCountyPage }) {
  const { hazards, disasters, radon, flood_cost: flood } = page;
  if (!hazards && !disasters && !radon && !flood) return null;
  const ranked = hazards ? [...hazards.rows].sort((a, b) => b.level - a.level) : [];
  return (
    <Section id="land" title="What the land is like">
      <div className="space-y-4">
        {hazards ? (
          <Card>
            <h3 className="font-semibold text-app-text dark:text-white">FEMA&apos;s hazard ratings for {page.county.in_name}</h3>
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {ranked.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-app-text dark:text-white">{row.label}</span>
                  <span className="flex items-center gap-2 text-app-text-secondary dark:text-app-text-muted">
                    <span className="sr-only sm:not-sr-only whitespace-nowrap">{row.word}</span>
                    <Dots level={row.level} />
                    <span className="sm:hidden whitespace-nowrap">{row.word}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Source>
              <a href={hazards.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{hazards.source}</a>
              {hazards.version ? `, ${hazards.version} release` : ''}{read(hazards.read)}. Each rating compares this {page.state.unit} with
              the others in the country and is for the whole {page.state.unit}, not a test of any home. FEMA made the index for planning.
            </Source>
          </Card>
        ) : null}
        {disasters ? (
          <Card>
            <h3 className="font-semibold text-app-text dark:text-white">Federal disasters declared</h3>
            <p className="mt-1 text-sm text-app-text-secondary dark:text-app-text-muted">
              FEMA lists {disasters.total.toLocaleString('en-US')} {disasters.total === 1 ? 'declaration' : 'declarations'} naming {page.county.in_name}
              {disasters.first ? ` since ${disasters.first.slice(0, 4)}` : ''}. The latest:
            </p>
            <ul className="mt-2 divide-y divide-app-border-subtle">
              {disasters.items.map((item) => (
                <li key={item.number} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-sm">
                  <span className="text-app-text dark:text-white">
                    {item.incident || 'Declaration'}
                    {item.kind ? <span className="text-app-text-secondary dark:text-app-text-muted"> · {item.kind}</span> : null}
                  </span>
                  <span className="text-app-text-secondary dark:text-app-text-muted whitespace-nowrap">
                    {dateWords(item.date)} · {item.id}
                  </span>
                </li>
              ))}
            </ul>
            <Source>
              <a href={disasters.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{disasters.source}</a>
              {read(disasters.read)}. {disasters.notice}
            </Source>
          </Card>
        ) : null}
        {radon ? (
          <Card>
            <h3 className="font-semibold text-app-text dark:text-white">Radon: {RADON[radon.zone].title}</h3>
            <p className="mt-1 text-sm text-app-text-secondary dark:text-app-text-muted">
              {RADON[radon.zone].line} The zone is for the {page.state.unit}; only a test shows a home&apos;s level.
            </p>
            <Source>
              <a href={radon.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{radon.source}</a>.
            </Source>
          </Card>
        ) : null}
        {flood ? (
          <Card>
            <h3 className="font-semibold text-app-text dark:text-white">What flood policies cost here</h3>
            <p className="mt-1 text-sm text-app-text-secondary dark:text-app-text-muted">
              The middle yearly premium of federal flood policies that began in the {flood.months} months before it was read:{' '}
              <span className="font-semibold text-app-text dark:text-white">{dollars(flood.median)}</span>
              {flood.p25 && flood.p75 ? `, with half between ${dollars(flood.p25)} and ${dollars(flood.p75)}` : ''}. A policy&apos;s price
              depends on the home; this is not a quote.
            </p>
            <Source>{flood.source}{read(flood.read)}. {flood.notice}</Source>
          </Card>
        ) : null}
      </div>
    </Section>
  );
}

export function Owning({ page }: { page: GuideCountyPage }) {
  const { exemption, appeal } = page;
  if (!exemption && !appeal) return null;
  return (
    <Section id="owning" title="What owning here involves">
      <div className="space-y-4">
        {exemption ? (
          <Card>
            <h3 className="font-semibold text-app-text dark:text-white">{exemption.label}</h3>
            <p className="mt-1 text-sm text-app-text-secondary dark:text-app-text-muted leading-relaxed">{exemption.note}</p>
            <Source>
              <a href={exemption.source_url} target="_blank" rel="noopener noreferrer" className={linkClass}>{exemption.source_name}</a>
              {read(exemption.read)}.
            </Source>
          </Card>
        ) : null}
        {appeal ? (
          <Card>
            <h3 className="font-semibold text-app-text dark:text-white">Asking for a value to be reviewed</h3>
            <p className="mt-1 text-sm text-app-text-secondary dark:text-app-text-muted leading-relaxed">{appeal.note}</p>
            <Source>
              <a href={appeal.source.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{appeal.source.name}</a>
              {read(appeal.read)}.
            </Source>
          </Card>
        ) : null}
      </div>
    </Section>
  );
}

export function Homes({ page }: { page: { homes?: GuideCountyPage['homes'] } }) {
  const homes = page.homes;
  if (!homes || (!homes.median_year_built && !homes.median_value)) return null;
  return (
    <Section id="homes" title="Homes here, in numbers">
      <div className="grid grid-cols-2 gap-3">
        {homes.median_year_built ? (
          <Card>
            <p className="text-sm text-app-text-secondary dark:text-app-text-muted">Median year a home was built</p>
            <p className="mt-1 text-2xl font-bold text-app-text dark:text-white">{homes.median_year_built}</p>
          </Card>
        ) : null}
        {homes.median_value ? (
          <Card>
            <p className="text-sm text-app-text-secondary dark:text-app-text-muted">Median value of an owner-occupied home</p>
            <p className="mt-1 text-2xl font-bold text-app-text dark:text-white">{dollars(homes.median_value)}</p>
          </Card>
        ) : null}
      </div>
      <Source>
        <a href={homes.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{homes.source}</a>, {homes.survey}. Owners
        tell the survey what their home is worth; it is not a county value.
      </Source>
    </Section>
  );
}
