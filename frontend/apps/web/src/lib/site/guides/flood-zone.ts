import type { Guide } from './types';

const READ = '2026-11-23';

export const floodZone: Guide = {
  slug: 'how-to-find-your-flood-zone',
  title: 'How to find your flood zone, and what it means | Pantopus',
  description:
    'Find your FEMA flood zone by address, read what Zone AE, X and the others mean, and learn when flood insurance is required and how to ask FEMA for a change.',
  h1: 'How to find your flood zone',
  lede: 'Your flood zone decides whether a lender requires flood insurance and roughly how worried you should be. Here is how to look it up and read it.',
  written: '2026-11-23',
  checked: '2026-11-23',
  sections: [
    {
      h2: 'Where flood zones come from',
      blocks: [
        { p: 'Flood zones are drawn by FEMA on Flood Insurance Rate Maps, for the National Flood Insurance Program. FEMA calls its Flood Map Service Center “the official public source for flood hazard information” produced for that program, and says its maps are continually updated, so a map you printed years ago may no longer be current ([FEMA Flood Map Service Center](https://msc.fema.gov/portal/home), read November 23, 2026).' },
      ],
    },
    {
      h2: 'How to look up your flood zone',
      blocks: [
        {
          ol: [
            'Open FEMA’s [Flood Map Service Center](https://msc.fema.gov/portal/home).',
            'Type your address, a place, or its coordinates into the search box.',
            'Open the map for your address and find your home on it. The zone label is printed in the shaded area your home sits in.',
            'Note the map’s effective date. If a newer, preliminary map is being drawn for your community, it may show a different zone.',
          ],
        },
        { p: 'Or type the address into [the Pantopus lookup](/start), which reads FEMA’s zone for the point and names the source.' },
      ],
    },
    {
      h2: 'What the zone letters mean',
      blocks: [
        { p: 'FEMA groups its zones in three bands ([FEMA, Flood Zones](https://www.fema.gov/about/glossary/flood-zones), read November 23, 2026):' },
        {
          ul: [
            'High risk, the Special Flood Hazard Area: Zone A, AO, AH, A1 to A30, AE, A99, AR and its combinations, V, VE and V1 to V30. This is land that the flood with a 1 percent chance of happening in any given year would cover, the flood people call the “100-year flood”.',
            'Moderate risk: Zone B or shaded Zone X, between the 1 percent flood and the 0.2 percent (“500-year”) flood.',
            'Minimal risk: Zone C or unshaded Zone X, outside the high-risk area and higher than the 0.2 percent flood.',
          ],
        },
      ],
    },
    {
      h2: 'A “100-year flood” is not once a century',
      blocks: [
        { p: 'The name misleads. A 1 percent chance each year adds up: over the 30 years of a typical mortgage, the chance of at least one such flood is about 26 percent, roughly one in four (that is 1 minus 0.99 to the 30th power). And a moderate or minimal zone is not a no-flood zone. FEMA’s own words are “Floods can happen anywhere” ([FEMA, Flood Insurance](https://www.fema.gov/flood-insurance), read November 23, 2026).' },
      ],
    },
    {
      h2: 'When flood insurance is required',
      blocks: [
        { p: 'FEMA says homes and businesses in high-risk flood areas with mortgages from government-backed lenders are required to have flood insurance, that most homeowners insurance does not cover flood damage, and that the program insures owners, renters and businesses, covering the building, what is in it, or both ([FEMA, Flood Insurance](https://www.fema.gov/flood-insurance), read November 23, 2026).' },
        { p: 'Plan ahead: FEMA says there is typically a 30-day waiting period before a National Flood Insurance Program policy takes effect, unless it is bought because a lender requires it or because a community’s flood map changed.' },
      ],
    },
    {
      h2: 'If you think the map is wrong',
      blocks: [
        { p: 'If you believe your property was put in a high-risk area by mistake, you can ask FEMA for a formal decision, called a Letter of Map Change. A Letter of Map Amendment covers a building or land on naturally high ground; a Letter of Map Revision Based on Fill covers ground raised with earthen fill. If FEMA grants it, FEMA says the owner may no longer be required to carry flood insurance and can send the letter to the lender. Requests can be made online or on paper, and FEMA asks for the property’s location, its legal description and whether fill was used ([FEMA, Change Your Flood Zone Designation](https://www.fema.gov/flood-maps/change-your-flood-zone), read November 23, 2026).' },
      ],
    },
    {
      h2: 'What Pantopus shows for your address',
      blocks: [
        { p: 'Place, Pantopus’s page for an address, shows FEMA’s flood zone and, beside it, what flood insurance actually costs nearby: the middle yearly premium of recent federal flood policies in your census tract, from FEMA’s open data, where there are enough policies to show one. It also shows wildfire, earthquake, heat, radon and drinking water, each with its source. Looking up an address is free and needs no account.' },
      ],
    },
  ],
  questions: [
    { q: 'How do I find my flood zone by address?', a: 'Type the address into FEMA’s Flood Map Service Center at msc.fema.gov, or into the Pantopus lookup, which shows FEMA’s zone with its source.' },
    { q: 'What does Zone AE mean?', a: 'Zone AE is part of FEMA’s Special Flood Hazard Area: land the flood with a 1 percent chance each year would cover. It is a high-risk zone.' },
    { q: 'What does Zone X mean?', a: 'Shaded Zone X is moderate risk, between the 1 percent and 0.2 percent floods. Unshaded Zone X is minimal risk. Neither means no risk.' },
    { q: 'Do I need flood insurance in Zone X?', a: 'A government-backed lender requires it in high-risk areas, not usually in Zone X. FEMA notes that floods can happen anywhere and that most homeowners policies don’t cover flood damage.' },
    { q: 'How long until a flood insurance policy starts?', a: 'FEMA says a National Flood Insurance Program policy typically has a 30-day waiting period, with exceptions such as when a lender requires it.' },
    { q: 'Can I get my home taken out of a flood zone?', a: 'You can ask FEMA for a Letter of Map Amendment or a Letter of Map Revision Based on Fill if you believe the map is wrong for your property.' },
    { q: 'Can renters get flood insurance?', a: 'Yes. FEMA says the National Flood Insurance Program covers renters, and a policy can cover the contents of a home.' },
  ],
  sources: [
    { publisher: 'FEMA', title: 'Flood Map Service Center', url: 'https://msc.fema.gov/portal/home', read: READ },
    { publisher: 'FEMA', title: 'Flood Zones', url: 'https://www.fema.gov/about/glossary/flood-zones', read: READ },
    { publisher: 'FEMA', title: 'Flood Insurance', url: 'https://www.fema.gov/flood-insurance', read: READ },
    { publisher: 'FEMA', title: 'Change Your Flood Zone Designation', url: 'https://www.fema.gov/flood-maps/change-your-flood-zone', read: READ },
  ],
  pantopus: {
    title: 'See your flood zone, and what insurance costs nearby',
    text: 'Type your address. Pantopus shows FEMA’s zone and the middle flood premium in your census tract, with sources.',
    href: '/home-safety',
    label: 'How safe is your address?',
  },
  related: [
    { href: '/home-safety', label: 'How safe is your address?' },
    { href: '/home-buying', label: 'Buying a home' },
    { href: '/guides/what-a-radon-zone-means', label: 'What a radon zone means' },
    { href: '/guides/what-to-check-before-buying-a-house', label: 'What to check before buying a house' },
  ],
};
