import type { TopicPage } from './types';

export const homeBuying: TopicPage = {
  path: '/home-buying',
  route: 'topic:home-buying',
  title: 'Buying a home? Check its record first, free',
  description:
    'Before you buy a home, check its public record free: flood zone, wildfire, earthquake, radon, water and the county’s facts about the house, each with a source.',
  label: 'Buying a home',
  h1: 'Check a home *before you buy it.*',
  lede: 'Type the address of a house you are thinking about. Pantopus reads its public record in plain words: the risks of the place, the health of the home and what the county knows about it. Every fact names its source. Free to look, no account needed.',
  lookup: true,
  lookupText: { title: 'Look up the house', line: 'Any U.S. address. Nobody at that address is told you looked.' },
  sections: [
    {
      h2: 'What can you check about a house before buying it?',
      blocks: [
        { p: 'For any U.S. address, the lookup shows:' },
        {
          ul: [
            'Its FEMA flood zone, and what flood insurance actually costs in its census tract.',
            'Wildfire hazard from the U.S. Forest Service, and the earthquake design category from the U.S. Geological Survey.',
            'EPA’s radon zone for the county, and the lead-paint rule for the home’s build year.',
            'The drinking-water system that serves it, and its record with EPA.',
            'EPA-registered sites nearby.',
            'Air quality and weather alerts today.',
            'The districts it sits in and who represents it, and the area’s rent range.',
          ],
        },
      ],
      more: { href: '/guides/what-to-check-before-buying-a-house', label: 'What to check before buying a house' },
    },
    {
      h2: 'What does the county record say about the house?',
      blocks: [
        { p: 'Where Pantopus carries the county’s records, the lookup also shows the home’s year built, living area, lot size, bedrooms, bathrooms and stories, with the county named and the date it was updated. Sign in, free, and in the counties where Pantopus opens it, more of the public record follows: the county’s value, recorded sales, the tax and permits. Read it next to the listing, and ask about anything that doesn’t match.' },
      ],
      more: { href: '/guides/how-to-read-a-property-record', label: 'How to read a property record' },
    },
    {
      h2: 'Is the house in a flood zone?',
      blocks: [
        { p: 'FEMA says homes in high-risk flood areas with mortgages from government-backed lenders must carry flood insurance, and that a new policy typically takes 30 days to start ([FEMA, Flood Insurance](https://www.fema.gov/flood-insurance), read November 23, 2026). Check the zone before you make an offer, not after.' },
      ],
      more: { href: '/guides/how-to-find-your-flood-zone', label: 'How to find your flood zone' },
    },
    {
      h2: 'Should I test for radon before buying?',
      blocks: [
        { p: 'EPA says to test every home, whatever its zone ([EPA Map of Radon Zones](https://www.epa.gov/radon/epa-map-radon-zones), read November 23, 2026). The inspection period is the easiest time.' },
      ],
      more: { href: '/guides/what-a-radon-zone-means', label: 'What a radon zone means' },
    },
    {
      h2: 'After you move in',
      blocks: [
        { p: 'Add the home and Place keeps going: the roof, heating, water heater and electrical panel estimated from the build year and correctable by you, your property-tax dates and a check of your state’s exemption programs, a mortgage-rate watch, and Today’s list of what is due at home. A confirmed owner sees the full county record, its value and last sale.' },
      ],
      more: { href: '/home-management', label: 'Run your home together' },
    },
  ],
  questions: [
    { q: 'Can I look up any house?', a: 'Any U.S. address. The area’s flood, wildfire, earthquake, radon, water and air facts come for every address; the county’s facts about the house come where Pantopus carries that county’s records.' },
    { q: 'Is it free to look up a home?', a: 'Yes. Looking up an address is free and needs no account. Saving a home takes a free account with no card.' },
    { q: 'Will the owner know I looked their house up?', a: 'No. Nobody at the address is told about a lookup.' },
    { q: 'Where do the facts come from?', a: 'Public sources, named on each fact: FEMA, EPA, the U.S. Geological Survey, the U.S. Forest Service, the National Weather Service, the Census Bureau, HUD and the county’s own records.' },
    { q: 'Is this a home inspection?', a: 'No. It is the public record about the place and the house. Hire an inspector, and test for radon, before you buy.' },
    { q: 'Can I see what the house sold for?', a: 'In the counties where Pantopus opens the public record to signed-in people, you see its recorded sales and the county’s value. The confirmed owner always sees them.' },
  ],
  related: [
    { href: '/guides/what-to-check-before-buying-a-house', label: 'What to check before buying a house' },
    { href: '/home-safety', label: 'How safe is your address?' },
    { href: '/property-records', label: 'Property records by county' },
    { href: '/tax-check', label: 'The property tax check' },
    { href: '/place', label: 'Place' },
  ],
  close: {
    title: 'See what’s true about *your address.*',
    line: 'Type an address and get its public record in plain words.',
  },
  notAdvice: 'This page is general information, not legal, tax or financial advice.',
};
