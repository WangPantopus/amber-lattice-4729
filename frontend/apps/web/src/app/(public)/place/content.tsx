// ─────────────────────────────────────────────────────────────────────────────
// /place: property details for any U.S. address. The homepage's Place section (heading, lines and groups, as the
// founder approved them on 2026-11-18), with what each line is underneath, read from the code:
// backend/serializers/placeIntelligenceSerializer.js (the sections and their sources),
// backend/services/placeIntelligenceService.js (who sees what), backend/services/propertyRecords/facts.js (the county
// record's facts), backend/services/nfipPremiumService.js (flood policies by census tract),
// backend/services/ballot/governments.js, backend/services/pmmsService.js, backend/data/homesteadPrograms.js, and who
// sees a home's value: backend/services/homeRecord/index.js (`buyerReportFor`: the county's public half for anyone signed
// in, in the counties on `buyer_report`) and ownerPart.js (`buyerCountyBlocks`).
// ─────────────────────────────────────────────────────────────────────────────

import { Sources } from '../_components/parts';
import type { PillarContent } from '../_components/PillarPage';

export const PLACE: PillarContent = {
  key: 'place',
  path: '/place',
  name: 'Place',
  icon: 'home',
  title: (
    <>
      See what’s true about <em>your address.</em>
    </>
  ),
  lede: 'Type an address and get its public record in plain words. Every fact names its source, and says when it is county-wide and when it is about this exact home.',
  more: 'Flood zone, wildfire and earthquake risk, radon and drinking water, the county’s record of the home, property-tax help, and who represents you, for any address in the United States. Looking needs no account.',
  action: 'lookup',
  route: 'pillar:place',
  glance: [
    { value: 'Free', label: 'Look up any U.S. address. No account needed.' },
    { value: 'Up to 86 facts', label: 'about one home, from the county’s own record' },
    { value: '50 states and DC', label: 'each state’s property-tax exemption program' },
    { value: 'Every fact sourced', label: 'with the agency’s name, and whether it is county-wide or about this home' },
  ],
  clip: { name: 'place', label: 'The Place tab: an address is typed and sourced facts appear', caption: 'Place · every fact names its source' },
  can: {
    title: (
      <>
        What can you learn about <em>an address?</em>
      </>
    ),
    intro: 'Four kinds of facts, read from public sources and put in plain words. Most are for anyone who looks. A home’s value is for its confirmed owner, and for anyone signed in where Pantopus opens the county’s public record; the household’s own records are for the people who live there.',
    groups: [
      {
        title: 'Risk and health',
        items: [
          {
            text: 'Your flood zone, and what flood insurance really costs nearby',
            small: 'The FEMA flood zone at the exact spot, and what flood policies in your census tract actually cost, from FEMA’s own policy records.',
          },
          {
            text: 'Wildfire, earthquake, heat and cold',
            small: 'Wildfire hazard from the U.S. Forest Service, earthquake design values from the USGS, and heat risk from the National Weather Service.',
          },
          {
            text: 'Radon, lead paint and your drinking water',
            small: 'The EPA’s radon zone, whether the lead-paint rule applies to a home of that age, and the public water system that serves you.',
          },
          {
            text: 'Registered pollution sites near you',
            small: 'Facilities registered with the EPA near the address, from its enforcement and compliance records.',
          },
          {
            text: 'An emergency checklist and a fridge card for 911',
            small: 'A checklist for the risks your address has, and a household card with what a 911 call needs, shared by link.',
          },
        ],
      },
      {
        title: 'Money',
        items: [
          {
            text: 'Value, last sale and the area’s trend',
            small: 'The county’s values and the recorded sales. The confirmed owner always sees them; anyone signed in sees them too in the counties where Pantopus opens the public record to signed-in people.',
          },
          {
            text: 'A property-tax exemption check in all 50 states',
            small: 'Whether the county record shows a homestead-style exemption on the home, and how your state’s program works. All 50 states and DC.',
          },
          {
            text: 'Rent range, and real rent on your block',
            small: 'HUD’s county-wide rent range, and what verified renters on your block pay, shown only once at least 10 households have shared.',
          },
          {
            text: 'How your bills compare',
            small: 'Your household’s bills beside similar homes nearby, never shown with fewer than 10 households.',
          },
          {
            text: 'A mortgage-rate watch',
            small: 'Freddie Mac’s weekly average mortgage rates, watched for you.',
          },
          {
            text: 'Home Money Check, with a ready tax-appeal packet',
            small: 'The county’s value for your home beside similar homes, and a packet ready for a property-tax appeal.',
          },
        ],
      },
      {
        title: 'Civic',
        items: [
          {
            text: 'Your districts and who represents you',
            small: 'Your federal and state districts and the people who hold those seats, with how to reach them.',
          },
          {
            text: 'Every government you live inside',
            small: 'The nation, the state, the county, the city and the school district whose lines take in the address.',
          },
          {
            text: 'A ballot guide, with live official counts',
            small: 'Before an election: what is on your ballot with the official links, and the official counts as they come in where the state publishes them.',
          },
          {
            text: 'Council meetings and tax dates on your calendar',
            small: 'Upcoming council meetings and property-tax due dates for the address, in Today’s calendar.',
          },
        ],
      },
      {
        title: 'The home and the household',
        items: [
          {
            text: 'Up to 86 facts from the county record',
            small: 'Year built, size, lot, rooms, construction and sales, from the county’s own file, each with its date.',
          },
          {
            text: 'Roof, heating, water heater and panel, by age',
            small: 'Estimated from the year the home was built, marked as estimates, until your household corrects them.',
          },
          {
            text: 'Members with roles, and people you invite',
            small: 'The people you live with, each with a role, and anyone you invite to the home.',
          },
          {
            text: 'Shared tasks with an owner and a due date',
            small: 'Tasks that repeat, carry photos and belong to someone, so everyone at home sees what is due.',
          },
          {
            text: 'Documents where the right people find them',
            small: 'A vault for the home’s papers, kept for its members.',
          },
          {
            text: 'Guest passes, access codes and a maintenance log',
            small: 'Passes and codes for the people you let in, and a record of the work done on the home.',
          },
          {
            text: 'Bills, packages, pets, polls and the family calendar',
            small: 'The household’s bills, deliveries, pets, quick polls and calendar, in one place.',
          },
        ],
      },
    ],
  },
  how: {
    title: (
      <>
        How do you see <em>your place?</em>
      </>
    ),
    steps: [
      { title: 'Type an address', text: 'Any U.S. address. The public record appears in plain words, each fact with its source. No account needed.' },
      { title: 'Save it, or add your home', text: 'Keep an address you care about, or add the home you live in. An account is free and asks for no card.' },
      {
        title: 'Prove you live there',
        text: 'A code on a postcard mailed to your door, a bill or your lease, your landlord’s yes, or a fast check. Verifying opens the Verified mark and the home’s mail; confirming you own it opens the home’s money.',
      },
      { title: 'Bring your household', text: 'Invite the people you live with. Everyone at home sees the same tasks, documents and dates.' },
    ],
  },
  privacy: {
    title: (
      <>
        Who sees <em>your address?</em>
      </>
    ),
    quote: 'Only you see the address you type, others see your first name, never your address',
    items: [
      { title: 'Never sold, never used for ads.', text: 'Your address stays yours.' },
      { title: 'Nobody sees your house number or unit.', text: 'A first name and a street, at most.' },
      { title: 'Verified homes are counted in ranges,', text: 'never shown as dots on a map.' },
      { title: 'See your home the way an outsider sees it,', text: 'before anyone else does.' },
      { title: 'Take your address off data-broker sites,', text: 'from the same place you look it up.' },
      { title: 'A lookup never shows a home’s value.', text: 'The confirmed owner sees it, and so does anyone signed in where Pantopus opens the county’s public record. A verified renter sees rent and bills.' },
    ],
  },
  extra: [
    {
      id: 'sources',
      label: 'Sources',
      kicker: 'Sources',
      title: (
        <>
          Which public records does <em>Place read?</em>
        </>
      ),
      intro: 'Each fact on Place carries its source. These are the main ones.',
      body: (
        <Sources
          items={[
            { name: 'FEMA National Flood Hazard Layer', gives: 'Flood zone at the exact spot' },
            { name: 'OpenFEMA flood policies', gives: 'What flood insurance costs in your census tract' },
            { name: 'National Weather Service', gives: 'Weather alerts and heat risk' },
            { name: 'U.S. Geological Survey', gives: 'Earthquake design values' },
            { name: 'U.S. Forest Service', gives: 'Wildfire hazard potential' },
            { name: 'U.S. Environmental Protection Agency', gives: 'Radon zones, drinking water, registered sites, air quality (AirNow)' },
            { name: 'U.S. Department of Housing and Urban Development', gives: 'Lead-paint rules and fair market rents' },
            { name: 'U.S. Census Bureau', gives: 'Area facts from the American Community Survey, and the governments around you' },
            { name: 'Freddie Mac', gives: 'Weekly average mortgage rates' },
            { name: 'Google Civic Information', gives: 'Districts and the people who represent you' },
            { name: 'The county’s property file', gives: 'Year built, size, lot, sales and values, where Pantopus has the county’s file' },
            { name: 'Verified residents', gives: 'Real rent and bills on your block, from 10 households or more' },
          ]}
        />
      ),
    },
  ],
  deeper: {
    title: (
      <>
        Want the <em>county’s side?</em>
      </>
    ),
    links: [
      {
        href: '/property-records',
        label: 'Property records by county',
        text: 'Each county’s own property offices, the federal hazard ratings for the area, and a lookup for any home.',
      },
      {
        href: '/tax-check',
        label: 'Is your home valued above similar homes?',
        text: 'Where county records allow it, the county’s value for your home beside similar houses on your street.',
      },
      { href: '/start', label: 'Look up an address', text: 'The public record for any U.S. address, free, with every source named.' },
      {
        href: '/home-buying',
        label: 'Buying a home?',
        text: 'What to check about a house before you buy it, from the public record.',
        listed: true,
      },
      { href: '/home-safety', label: 'How safe is your address?', text: 'Flood, wildfire, earthquake, radon and more, for any U.S. address.', listed: true },
    ],
  },
  questions: {
    title: (
      <>
        What people ask about <em>property details</em>
      </>
    ),
    items: [
      {
        q: 'Is it free to look up an address?',
        a: 'Yes. Looking up an address needs no account. Saving a home takes a free account, with no card.',
      },
      {
        q: 'How do I find the flood zone for my address?',
        a: 'Type the address. Place shows the FEMA flood zone for that exact spot, from FEMA’s National Flood Hazard Layer, and what flood policies in the same census tract cost.',
      },
      {
        q: 'Who represents me?',
        a: 'Place lists your federal and state districts and the people who hold those seats, with how to reach them, and every government whose lines take in your address.',
      },
      {
        q: 'Where do the facts come from?',
        a: 'From public sources, each named beside its fact: FEMA, the National Weather Service, the USGS, the U.S. Forest Service, the EPA, HUD, the U.S. Census Bureau, Freddie Mac and the county’s own property file, among others. Each fact says whether it is county-wide or about this exact home.',
      },
      {
        q: 'Which addresses does it cover?',
        a: 'Any address in the United States. Hazards, weather, air and civic facts cover the whole country. The county’s own record of a home shows where Pantopus has that county’s file; the property records pages list each county.',
      },
      {
        q: 'Who can see a home’s value?',
        a: 'Its confirmed owner, always. In the counties where Pantopus opens the public record to signed-in people, anyone signed in also sees the county’s value and the recorded sales. A lookup without an account never shows the value. A renter who proves they live there sees rent ranges and bill comparisons.',
      },
      {
        q: 'Will other people see my address?',
        a: 'No. Nobody sees your house number or unit, and verified homes are counted in ranges, never shown as dots. Your address is never sold and never used for ads.',
      },
      {
        q: 'Is this legal or tax advice?',
        a: 'No. Place shows public records in plain words, with their sources. For a decision about taxes, insurance or a purchase, check with the office named or a professional.',
      },
    ],
  },
  related: ['today', 'mail', 'pulse'],
  close: {
    title: (
      <>
        Pantopus starts with <em>your home.</em>
      </>
    ),
    text: 'Type your address and see what is true about it, in plain words, with every source named.',
  },
};
