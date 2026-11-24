import type { Guide } from './types';

const READ = '2026-11-23';

export const propertyRecord: Guide = {
  slug: 'how-to-read-a-property-record',
  title: 'How to read a property record | Pantopus',
  description:
    'A line-by-line guide to a county property record: parcel number, legal description, land and building values, assessed versus market value, sales and deeds.',
  h1: 'How to read a property record',
  lede: 'A county property record is short, dense and full of words nobody explains. Here is what each part means and where it comes from.',
  written: '2026-11-23',
  checked: '2026-11-23',
  sections: [
    {
      h2: 'Two kinds of records',
      blocks: [
        { p: 'What people call “the property record” is usually two things kept side by side. The assessment record is the county’s description of the property for tax: the parcel, the land, the building and their values. The recorded documents are the papers filed when something legal happens: a deed when the home is sold, a mortgage or deed of trust when it is borrowed against, a lien, a release. Different offices often keep them, and the [county pages](/property-records) list each county’s own.' },
      ],
    },
    {
      h2: 'The parcel number',
      blocks: [
        { p: 'Every piece of land the county taxes has an identifier, called a parcel number, an assessor’s parcel number, a tax ID or an account number depending on the county. It is the most reliable way to find a property, because addresses can be written many ways and one parcel can have several addresses. Appeal forms ask for it: Washington’s form, for example, needs the parcel number of the property you are appealing ([Washington Department of Revenue](https://dor.wa.gov/taxes-rates/property-tax/appealing-your-property-assessment-county-board-equalization), read November 23, 2026).' },
      ],
    },
    {
      h2: 'The legal description',
      blocks: [
        { p: 'The legal description is the property’s boundary in words: a lot and block in a recorded subdivision, or a survey’s measurements from a fixed point. It is what deeds transfer, not the street address. FEMA, for one, asks for it when you request a change to your flood zone ([FEMA, Change Your Flood Zone Designation](https://www.fema.gov/flood-maps/change-your-flood-zone), read November 23, 2026).' },
      ],
    },
    {
      h2: 'Land, improvements and the total',
      blocks: [
        { p: 'Values are usually split in two. Land is the lot itself. Improvements (sometimes “buildings” or “structures”) are what stands on it: the house, a garage, a shed. The total is their sum. Washington’s Change of Value Notice, for example, shows the assessed value of the land and of the improvements.' },
      ],
    },
    {
      h2: 'Assessed, market and appraised value',
      blocks: [
        { p: 'These are not the same number, and the rules differ by state. Washington’s Department of Revenue gives one clear set of definitions: state law requires assessors to value property at 100 percent of its true and fair market value; appraised value is what a willing buyer would pay a willing seller; assessed value is the value your taxes are based on, and it may be lower than the appraised value if you receive an exemption or reduction. Washington also requires real property to be revalued every year, with a physical inspection at least every six years ([Washington Department of Revenue](https://dor.wa.gov/taxes-rates/property-tax/appealing-your-property-assessment-county-board-equalization), read November 23, 2026).' },
        { p: 'Other states set their own rules for how assessed value relates to market value and how often it changes, so ask your assessor how yours works. Either way, don’t read a county’s value as a price. Read it as the starting point of the tax bill.' },
      ],
    },
    {
      h2: 'The building’s facts',
      blocks: [
        { p: 'Year built, living area, lot size, bedrooms, bathrooms, stories, sometimes the heating, the roof or the construction type. These come from permits, past sales and the assessor’s own visits, so they can be out of date. A finished basement or an addition built without a permit may be missing; a room removed years ago may still be counted. If a number matters to you, ask why it differs from what you see.' },
      ],
    },
    {
      h2: 'Sales and deeds',
      blocks: [
        { p: 'A sale shows as a recorded deed with a date. Some records show a price, some don’t. A sale for very little, or between people with the same last name, may be a transfer within a family or into a trust rather than a market sale, so be careful using it to judge value. The kind of deed (warranty, quitclaim, trustee’s) tells you what kind of transfer it was.' },
      ],
    },
    {
      h2: 'Exemptions and the owner’s name',
      blocks: [
        { p: 'An exemption line means the owner receives a reduction: for a primary home, a senior, a veteran, a disability. The owner’s name and mailing address are often part of the public record. That is the county’s record of the owner, not a statement about who lives there now.' },
      ],
    },
    {
      h2: 'Reading a record with Pantopus',
      blocks: [
        { p: 'Type an address into [the lookup](/start). Where Pantopus carries the county’s records, it shows the home’s year built, living area, lot size, bedrooms, bathrooms and stories in plain words, with the county named and the date it was updated. A home’s confirmed owner sees the full county record, with its values and sales. The [county pages](/property-records) say which counties Pantopus carries and link each county’s own offices.' },
      ],
    },
  ],
  questions: [
    { q: 'What is a parcel number?', a: 'The county’s identifier for a piece of land, also called an assessor’s parcel number, tax ID or account number. It is the most reliable way to find a property in county records.' },
    { q: 'What is the difference between assessed value and market value?', a: 'Market value is what a willing buyer would pay. Assessed value is the value taxes are based on; depending on the state it can be lower because of exemptions, caps or a set percentage.' },
    { q: 'What is a legal description?', a: 'The property’s boundary in words, such as a lot and block in a subdivision. It is what a deed transfers, not the street address.' },
    { q: 'Why does the county record show a different square footage than the listing?', a: 'County facts come from permits, sales and assessor visits and can be out of date. An addition or finished basement may be missing, especially without a permit.' },
    { q: 'Are property records public?', a: 'Generally, yes: assessment records and recorded documents are kept for the public. What each county publishes online, and how, differs.' },
    { q: 'Where do I find my county’s property records?', a: 'At your county assessor and recorder. The Pantopus county pages link each county’s own offices.' },
  ],
  sources: [
    { publisher: 'Washington Department of Revenue', title: 'Appealing Your Property Assessment to the County Board of Equalization', url: 'https://dor.wa.gov/taxes-rates/property-tax/appealing-your-property-assessment-county-board-equalization', read: READ },
    { publisher: 'FEMA', title: 'Change Your Flood Zone Designation', url: 'https://www.fema.gov/flood-maps/change-your-flood-zone', read: READ },
  ],
  pantopus: {
    title: 'Read your home’s record in plain words',
    text: 'Pantopus reads the county record for an address and names the county and the date for every fact.',
    href: '/start',
    label: 'Look up an address',
  },
  related: [
    { href: '/property-records', label: 'Property records by county' },
    { href: '/home-buying', label: 'Buying a home' },
    { href: '/guides/how-to-appeal-a-property-tax-value', label: 'How to appeal a property tax value' },
    { href: '/guides/what-to-check-before-buying-a-house', label: 'What to check before buying a house' },
  ],
};
