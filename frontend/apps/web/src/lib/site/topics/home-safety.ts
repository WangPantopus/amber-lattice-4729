import type { TopicPage } from './types';

export const homeSafety: TopicPage = {
  path: '/home-safety',
  route: 'topic:home-safety',
  title: 'Home safety check for any U.S. address',
  description:
    'Check any U.S. address free: flood zone, wildfire and earthquake ratings, radon, lead paint, drinking water and pollution sites nearby, each with its source.',
  label: 'Home safety',
  h1: 'How safe is *your address?*',
  lede: 'Type an address and see the risks of the place in plain words: flood, wildfire, earthquake, radon, lead paint, water and what is nearby. Every fact names its source, and says when it is county-wide and when it is about this exact spot.',
  lookup: true,
  lookupText: { title: 'Check an address', line: 'Flood, fire, earthquake, radon, water and what is nearby.' },
  sections: [
    {
      h2: 'Is my house in a flood zone?',
      blocks: [
        { p: 'Pantopus shows the FEMA flood zone for the address and, beside it, what flood insurance actually costs nearby: the middle yearly premium of recent federal flood policies in the census tract, where there are enough to show one. FEMA says most homeowners insurance does not cover flood damage ([FEMA, Flood Insurance](https://www.fema.gov/flood-insurance), read November 23, 2026).' },
      ],
      more: { href: '/guides/how-to-find-your-flood-zone', label: 'How to find your flood zone' },
    },
    {
      h2: 'What is the wildfire risk at my address?',
      blocks: [
        { p: 'The U.S. Forest Service’s Wildfire Hazard Potential for the spot. It rates the landscape and its fuels, not your house, so it is a reason to ask questions, not a prediction.' },
      ],
    },
    {
      h2: 'What is the earthquake risk?',
      blocks: [
        { p: 'The U.S. Geological Survey’s seismic design category for the address, from very low expected shaking upward: the level of shaking buildings there are designed for.' },
      ],
    },
    {
      h2: 'Is there radon in my area?',
      blocks: [
        { p: 'EPA’s radon zone for your county, from the highest potential (zone 1) to the lowest (zone 3). EPA says to test every home whatever its zone ([EPA Map of Radon Zones](https://www.epa.gov/radon/epa-map-radon-zones), read November 23, 2026), so for a home you add, Today turns the test into a task and keeps the result.' },
      ],
      more: { href: '/guides/what-a-radon-zone-means', label: 'What a radon zone means' },
    },
    {
      h2: 'Is the water safe to drink?',
      blocks: [
        { p: 'The public water system that serves the address, from EPA’s drinking-water records, with any health-based violations that began in the last five years. A private well isn’t on it; test that yourself.' },
      ],
    },
    {
      h2: 'Lead paint and pollution nearby',
      blocks: [
        { p: 'The lead-paint rule for the home’s build year: for most homes built before 1978, sellers and landlords must disclose known lead-based paint ([EPA, Real Estate Disclosures](https://www.epa.gov/lead/real-estate-disclosures-about-potential-lead-hazards), read November 23, 2026). And the EPA-registered sites near the address, from EPA’s enforcement records.' },
      ],
    },
    {
      h2: 'Heat, cold and today’s alerts',
      blocks: [
        { p: 'Weather alerts in the official words, air quality from the nearest monitor, and for a home you add, the National Weather Service’s heat risk and the coming cold.' },
      ],
      more: { href: '/today', label: 'More about Today' },
    },
    {
      h2: 'Be ready',
      blocks: [
        { p: 'For your own home, Place adds an emergency checklist and a fridge card for 911: the household’s key information on one card, shared by a link.' },
      ],
    },
  ],
  questions: [
    { q: 'How do I check if my house is in a flood zone?', a: 'Type the address into the Pantopus lookup, which shows FEMA’s flood zone, or use FEMA’s Flood Map Service Center.' },
    { q: 'How do I find the radon level in my area?', a: 'EPA’s radon zone for your county is a starting point; only a test tells you your home’s level. EPA says to test every home.' },
    { q: 'How do I check wildfire risk at an address?', a: 'Pantopus shows the U.S. Forest Service’s Wildfire Hazard Potential for the address. It rates the landscape, not the house.' },
    { q: 'Is my drinking water safe?', a: 'Pantopus names the public water system that serves the address and shows its record with EPA. For a private well, test it.' },
    { q: 'Does a home safety check replace an inspection?', a: 'No. It is the public record about the place. An inspector and a radon test tell you about the house itself.' },
    { q: 'Is the home safety check free?', a: 'Yes. Looking up an address is free and needs no account.' },
  ],
  pillars: ['place', 'today'],
  related: [
    { href: '/guides/how-to-find-your-flood-zone', label: 'How to find your flood zone' },
    { href: '/guides/what-a-radon-zone-means', label: 'What a radon zone means' },
    { href: '/home-buying', label: 'Buying a home' },
    { href: '/place', label: 'Place' },
    { href: '/property-records', label: 'Property records by county' },
  ],
  close: {
    title: 'See what’s true about *your address.*',
    line: 'Every fact names its source.',
  },
};
