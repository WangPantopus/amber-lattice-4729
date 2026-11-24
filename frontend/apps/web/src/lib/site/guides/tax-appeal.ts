import type { Guide } from './types';

const READ = '2026-11-23';

export const taxAppeal: Guide = {
  slug: 'how-to-appeal-a-property-tax-value',
  title: 'How to appeal your property tax value | Pantopus',
  description:
    'How a property tax value appeal works: read the notice, talk to the assessor, file on time and bring sales of similar homes, with three states’ own rules.',
  h1: 'How to appeal a property tax value',
  lede: 'You can’t appeal the tax rate, but you can ask for the county’s value of your home to be reviewed. Here are the general steps, and three states’ own rules.',
  written: '2026-11-23',
  checked: '2026-11-23',
  sections: [
    {
      h2: 'What you are appealing',
      blocks: [
        { p: 'Your property tax is the county’s value for your home multiplied by the local rates. An appeal is about the value: whether the county’s number matches what your home would actually sell for. Saying the tax is too high isn’t enough. Washington’s Department of Revenue puts it plainly: statements that the valuation is too high or that taxes are excessive are not sufficient; you must say specifically why the value doesn’t reflect market value ([Washington Department of Revenue](https://dor.wa.gov/taxes-rates/property-tax/appealing-your-property-assessment-county-board-equalization), read November 23, 2026).' },
      ],
    },
    {
      h2: 'Step 1: read your notice and its date',
      blocks: [
        { p: 'Counties mail a notice when your value changes. It has different names: a Change of Value Notice in Washington, a notice of appraised value in Texas. Find the date it was mailed or issued. Most deadlines count from it, and they are short.' },
      ],
    },
    {
      h2: 'Step 2: talk to the assessor first',
      blocks: [
        { p: 'Many disagreements end with a phone call or an informal meeting. Washington’s Department of Revenue says owners can often settle at the assessor’s office, but should still file the appeal form on time to keep their rights. Texas says you may ask the appraisal district for an informal conference before the formal hearing ([Texas Comptroller](https://comptroller.texas.gov/taxes/property-tax/protests/), read November 23, 2026).' },
      ],
    },
    {
      h2: 'Step 3: file on time, on the right form',
      blocks: [
        { p: 'Each state sets its own body, form and deadline. Three examples, from each state’s own page, read November 23, 2026:' },
        {
          ul: [
            'Washington: file a Taxpayer Petition for Review of Property Valuation Determination with the county Board of Equalization, by July 1 of the assessment year or within 30 days of the Change of Value Notice, whichever is later. Some counties allow 60 days. A letter or phone call is not accepted instead of the form ([Washington Department of Revenue](https://dor.wa.gov/taxes-rates/property-tax/appealing-your-property-assessment-county-board-equalization)).',
            'Texas: file a notice of protest (Form 50-132) with the appraisal review board, in most cases by May 15 or 30 days after the appraisal district mails its notice, whichever is later ([Texas Comptroller](https://comptroller.texas.gov/taxes/property-tax/protests/)).',
            'Florida: file a petition with the Value Adjustment Board clerk in the county where the property is ([Florida Department of Revenue](https://floridarevenue.com/property/Pages/VAB.aspx)). The state’s page sends taxpayers to its guide on petitions for the details.',
          ],
        },
        { p: 'For any other state, search for your county assessor or your state’s department of revenue and “property tax appeal”. The [county pages](/property-records) link each county’s own offices.' },
      ],
    },
    {
      h2: 'Step 4: bring evidence about value',
      blocks: [
        { p: 'Washington’s guidance lists the kind of evidence that works: a recent appraisal of your home, serious deterioration, and sales of similar homes that point to a lower value. For each similar sale, give the parcel number, address, date of sale and price, and compare the things that drive value: location, lot size, living area, year built, condition, bedrooms and bathrooms, and features like a garage or a view.' },
        { p: 'Choose sales close to your home and close to the date the county valued it. Photographs and written repair estimates help when condition is the reason. Washington asks for evidence at least 21 business days before the hearing; check your own state’s rule.' },
      ],
    },
    {
      h2: 'Step 5: the hearing, and after',
      blocks: [
        { p: 'At the hearing, a board listens to you and to the assessor or appraisal district, then decides. Keep to value and evidence. If you disagree with the result, there is usually a next step: in Texas, for example, the Comptroller lists appeals to state district court, and in some cases to the State Office of Administrative Hearings or to binding arbitration.' },
      ],
    },
    {
      h2: 'Where Pantopus helps',
      blocks: [
        { p: 'The [tax check](/tax-check) compares the county’s value for your home, per square foot, with similar houses on your street, where the county’s records allow it. That comparison is shown to the home’s confirmed owner, who also sees how an appeal works in the states whose rules we have read, and a check of the home against the state’s property-tax exemption programs.' },
      ],
    },
  ],
  questions: [
    { q: 'Can I appeal my property taxes?', a: 'You can usually appeal the county’s value of your home, not the tax rate. The appeal asks whether the value matches what the home would sell for.' },
    { q: 'What is the deadline to appeal a property tax value?', a: 'It depends on the state and often counts from the date of your value notice. In Washington it is July 1 or 30 days after the notice, whichever is later; in Texas it is usually May 15 or 30 days after the notice is mailed, whichever is later.' },
    { q: 'What evidence do I need for a property tax appeal?', a: 'Evidence about market value: a recent appraisal, sales of similar homes near yours close to the valuation date, and photos or repair estimates if condition is the reason.' },
    { q: 'Should I call the assessor before filing?', a: 'Yes, many disagreements end there. But file the appeal by the deadline anyway, so you keep your right to a hearing.' },
    { q: 'Is “my taxes went up” a reason to appeal?', a: 'Not by itself. Washington’s Department of Revenue says statements that taxes are excessive are not sufficient; you need market reasons.' },
    { q: 'What happens if I lose the appeal?', a: 'Most states have a further step. In Texas, for example, the Comptroller lists appeals to state district court, and in some cases to the State Office of Administrative Hearings or binding arbitration.' },
  ],
  sources: [
    { publisher: 'Washington Department of Revenue', title: 'Appealing Your Property Assessment to the County Board of Equalization', url: 'https://dor.wa.gov/taxes-rates/property-tax/appealing-your-property-assessment-county-board-equalization', read: READ },
    { publisher: 'Texas Comptroller of Public Accounts', title: 'Appraisal Protests and Appeals', url: 'https://comptroller.texas.gov/taxes/property-tax/protests/', read: READ },
    { publisher: 'Florida Department of Revenue', title: 'Value Adjustment Board', url: 'https://floridarevenue.com/property/Pages/VAB.aspx', read: READ },
  ],
  pantopus: {
    title: 'Does the county value your home above similar homes?',
    text: 'Where county records allow it, Pantopus compares the county’s value per square foot with similar houses on your street.',
    href: '/tax-check',
    label: 'Run the tax check',
  },
  related: [
    { href: '/tax-check', label: 'The property tax check' },
    { href: '/guides/how-to-read-a-property-record', label: 'How to read a property record' },
    { href: '/property-records', label: 'Property records by county' },
    { href: '/home-buying', label: 'Buying a home' },
  ],
  notAdvice: 'This guide is general information, not legal, tax or financial advice.',
};
