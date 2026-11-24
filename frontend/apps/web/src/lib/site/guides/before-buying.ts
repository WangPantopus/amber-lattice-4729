import type { Guide } from './types';

const READ = '2026-11-23';

export const beforeBuying: Guide = {
  slug: 'what-to-check-before-buying-a-house',
  title: 'What to check before buying a house | Pantopus',
  description:
    'The public records a buyer can read free before making an offer: the county record, the flood zone, radon, lead paint, property tax and the closing papers.',
  h1: 'What to check before buying a house',
  lede: 'A listing shows a house at its best. The public record shows it as it is on paper. Here is what a buyer can check, free, before an offer.',
  written: '2026-11-23',
  checked: '2026-11-23',
  sections: [
    {
      h2: 'Start with the county record',
      blocks: [
        { p: 'Every county keeps a record of each property for taxes: the parcel, the building, the land and the value the county puts on them. Read it next to the listing and look for differences.' },
        {
          ul: [
            'Year built. It tells you what to ask about: wiring, plumbing and roofing all age on their own schedules.',
            'Living area and lot size. If the listing claims much more space than the record, ask why. A finished basement or an addition may not be on the record, and you’ll want to know whether it had a permit.',
            'Bedrooms, bathrooms and stories.',
            'Recorded sales. How often a house has sold, and for how much, can say a lot.',
          ],
        },
        { p: 'Our guide to [reading a property record](/guides/how-to-read-a-property-record) explains each line, and the [county pages](/property-records) list each county’s own offices.' },
      ],
    },
    {
      h2: 'Check the flood zone, even far from water',
      blocks: [
        { p: 'FEMA’s flood maps mark Special Flood Hazard Areas: land with a 1 percent or greater chance of flooding in any given year ([FEMA, Flood Zones](https://www.fema.gov/about/glossary/flood-zones), read November 23, 2026). FEMA also says most homeowners insurance does not cover flood damage, that homes in high-risk flood areas with mortgages from government-backed lenders are required to have flood insurance, and that an NFIP policy typically takes 30 days to go into effect ([FEMA, Flood Insurance](https://www.fema.gov/flood-insurance), read November 23, 2026).' },
        { p: 'So look up the zone before you make an offer, not after. Our guide to [finding your flood zone](/guides/how-to-find-your-flood-zone) walks through the map.' },
      ],
    },
    {
      h2: 'Radon and lead paint',
      blocks: [
        { p: 'The U.S. Environmental Protection Agency says to test every home for radon, no matter where it is, and to fix a home at 4 picocuries per liter or higher ([EPA Map of Radon Zones](https://www.epa.gov/radon/epa-map-radon-zones), read November 23, 2026). A test during the inspection period costs little next to a fix after you move in. More in [what a radon zone means](/guides/what-a-radon-zone-means).' },
        { p: 'For most homes built before 1978, federal law requires the seller to give you EPA’s lead pamphlet, tell you about any known lead-based paint, hand over the reports they have, and give you 10 days to have the paint inspected, unless you both agree in writing to a different period or you waive it ([EPA, Real Estate Disclosures about Potential Lead Hazards](https://www.epa.gov/lead/real-estate-disclosures-about-potential-lead-hazards), read November 23, 2026).' },
      ],
    },
    {
      h2: 'Wildfire, earthquake and heat',
      blocks: [
        { p: 'These are rated by place, not by house. For any U.S. address, Pantopus shows the U.S. Forest Service’s Wildfire Hazard Potential, which describes the landscape’s fuels rather than predicting what happens to one home, and the U.S. Geological Survey’s seismic design category for earthquakes. Neither says what will happen to this house, but both tell you which questions to ask an inspector and an insurer before you commit.' },
      ],
    },
    {
      h2: 'Property tax: what you will actually pay',
      blocks: [
        { p: 'The tax the seller paid may not be the tax you will pay. In Washington, for example, the Department of Revenue explains that assessed value, the value taxes are based on, may be lower than market value when an owner receives an exemption or reduction ([Washington Department of Revenue](https://dor.wa.gov/taxes-rates/property-tax/appealing-your-property-assessment-county-board-equalization), read November 23, 2026). If the seller had an exemption, ask the county whether it ends with the sale and what the bill would be without it.' },
      ],
    },
    {
      h2: 'The papers at the end',
      blocks: [
        { p: 'If you are borrowing, the Consumer Financial Protection Bureau says the lender must give you the Closing Disclosure, a five-page form with the final loan terms and closing costs, at least three business days before you close, so you can compare it with the Loan Estimate you received earlier ([CFPB, What is a Closing Disclosure?](https://www.consumerfinance.gov/ask-cfpb/what-is-a-closing-disclosure-en-1983/), read November 23, 2026). Use those three days. Read every line against the estimate and ask about each difference.' },
      ],
    },
    {
      h2: 'Checking a house with Pantopus',
      blocks: [
        { p: 'Type the address into [the lookup](/start) and Pantopus reads the public record for you, free and with no account: the flood zone and what flood insurance costs nearby, wildfire, earthquake, radon and lead-paint rules, the drinking-water system, registered pollution sites nearby, and the districts the address sits in. Where Pantopus carries the county’s records, you also see the home’s year built, size, lot, bedrooms and bathrooms. Every fact names its source. [Buying a home](/home-buying) gathers all of it in one place.' },
      ],
    },
  ],
  questions: [
    { q: 'What public records can I check before buying a house?', a: 'The county’s property record (the building, the land, the value and recorded sales), FEMA’s flood map, EPA’s radon zone, the lead-paint disclosure for homes built before 1978, permits, and the property tax bill.' },
    { q: 'How do I know if a house is in a flood zone?', a: 'Look the address up on FEMA’s Flood Map Service Center, or type it into the Pantopus lookup, which shows FEMA’s zone and names the source.' },
    { q: 'Should I test for radon before buying?', a: 'EPA says to test every home for radon no matter where it is. A test during your inspection period is the easiest time.' },
    { q: 'Does the seller have to tell me about lead paint?', a: 'For most homes built before 1978, yes. EPA’s rule requires a pamphlet, disclosure of known lead-based paint, the reports the seller has, and a 10-day chance to inspect unless you agree otherwise or waive it.' },
    { q: 'Will my property tax be the same as the seller’s?', a: 'Not always. The seller’s bill may reflect an exemption that was theirs. Ask the county whether it ends with the sale and what the bill would be without it.' },
    { q: 'When do I get the final loan papers?', a: 'The CFPB says the lender must give you the Closing Disclosure at least three business days before closing.' },
  ],
  sources: [
    { publisher: 'FEMA', title: 'Flood Zones', url: 'https://www.fema.gov/about/glossary/flood-zones', read: READ },
    { publisher: 'FEMA', title: 'Flood Insurance', url: 'https://www.fema.gov/flood-insurance', read: READ },
    { publisher: 'U.S. Environmental Protection Agency', title: 'The EPA Map of Radon Zones', url: 'https://www.epa.gov/radon/epa-map-radon-zones', read: READ },
    { publisher: 'U.S. Environmental Protection Agency', title: 'Real Estate Disclosures about Potential Lead Hazards', url: 'https://www.epa.gov/lead/real-estate-disclosures-about-potential-lead-hazards', read: READ },
    { publisher: 'Washington Department of Revenue', title: 'Appealing Your Property Assessment to the County Board of Equalization', url: 'https://dor.wa.gov/taxes-rates/property-tax/appealing-your-property-assessment-county-board-equalization', read: READ },
    { publisher: 'Consumer Financial Protection Bureau', title: 'What is a Closing Disclosure?', url: 'https://www.consumerfinance.gov/ask-cfpb/what-is-a-closing-disclosure-en-1983/', read: READ },
  ],
  pantopus: {
    title: 'Look up the house you’re thinking of buying',
    text: 'Flood zone, wildfire, earthquake, radon, water and the county record, each with its source. Free, no account needed.',
    href: '/home-buying',
    label: 'Check a home before you buy it',
  },
  related: [
    { href: '/home-buying', label: 'Buying a home' },
    { href: '/home-safety', label: 'How safe is your address?' },
    { href: '/guides/how-to-find-your-flood-zone', label: 'How to find your flood zone' },
    { href: '/guides/how-to-read-a-property-record', label: 'How to read a property record' },
    { href: '/property-records', label: 'Property records by county' },
  ],
  notAdvice: 'This guide is general information, not legal, tax or financial advice.',
};
