import type { Guide } from './types';

const READ = '2026-11-23';

export const radonZone: Guide = {
  slug: 'what-a-radon-zone-means',
  title: 'What a radon zone means, and how to test | Pantopus',
  description:
    'What EPA’s radon zones 1, 2 and 3 mean, why the zone doesn’t decide whether to test, how a home radon test works, and what to do at 4 pCi/L or higher.',
  h1: 'What a radon zone means',
  lede: 'Your county’s radon zone is a rough guess about the area. Only a test tells you about your home. Here is how to read the zone and when to test.',
  written: '2026-11-23',
  checked: '2026-11-23',
  sections: [
    {
      h2: 'What radon is',
      blocks: [
        { p: 'Radon is a naturally occurring radioactive gas that can enter homes from the ground and build up to dangerous levels. You can’t see or smell it, and testing is the only way to know your level ([EPA, Radon](https://www.epa.gov/radon) and [Radon Risks and Solutions](https://www.epa.gov/radon/radon-risks-and-solutions), read November 23, 2026).' },
        { p: 'It matters because of lung cancer. EPA estimates radon is the number one cause of lung cancer among people who don’t smoke and the second leading cause overall, responsible for about 21,000 lung cancer deaths a year, about 2,900 of them among people who never smoked ([EPA, Health Risk of Radon](https://www.epa.gov/radon/health-risk-radon), read November 23, 2026).' },
      ],
    },
    {
      h2: 'The three radon zones',
      blocks: [
        { p: 'EPA drew its Map of Radon Zones in 1993, county by county, from indoor measurements, geology, aerial radioactivity, soil and foundation types. Its key reads ([EPA Map of Radon Zones](https://www.epa.gov/radon/epa-map-radon-zones), the map’s own legend, read November 23, 2026):' },
        {
          ul: [
            'Zone 1 (red): highest potential. Average indoor radon levels may be greater than 4 picocuries per liter (pCi/L).',
            'Zone 2 (orange): moderate potential. Average levels may be between 2 and 4 pCi/L.',
            'Zone 3 (yellow): low potential. Average levels may be less than 2 pCi/L.',
          ],
        },
        { p: 'For scale, EPA puts the average indoor level at about 1.3 pCi/L and the average outdoor level at about 0.4 pCi/L ([Health Risk of Radon](https://www.epa.gov/radon/health-risk-radon)).' },
      ],
    },
    {
      h2: 'Why your zone doesn’t decide whether to test',
      blocks: [
        { p: 'EPA is direct about this: the map “should not be used to determine if individual homes need to be tested”, homes with elevated radon have been found in all three zones, and all homes should be tested. The map was made to help governments target their work and write radon-resistant building codes. Two houses on the same street can test very differently.' },
      ],
    },
    {
      h2: 'What the numbers mean',
      blocks: [
        { p: 'EPA’s action level is 4 pCi/L: fix your home if a test reads 4 pCi/L or higher, and consider fixing it between 2 and 4 pCi/L. EPA also notes that getting below 2 pCi/L is difficult ([EPA Map of Radon Zones](https://www.epa.gov/radon/epa-map-radon-zones); [Health Risk of Radon](https://www.epa.gov/radon/health-risk-radon)). Some states set their own guidance, and EPA says the action level should follow the local authority’s.' },
      ],
    },
    {
      h2: 'How to test a home for radon',
      blocks: [
        {
          ol: [
            'Get a kit. EPA says test kits are sold online and in home improvement stores, and your state radon program can tell you about free or discounted kits ([EPA, Find a Radon Test Kit](https://www.epa.gov/radon/find-radon-test-kit-or-measurement-and-mitigation-professional), read November 23, 2026).',
            'Place it exactly as the packaging says. Where it goes, and for how long, changes the result.',
            'Send it to the lab named on the packaging, and keep the report.',
            'If it reads 4 pCi/L or higher, contact your state radon program for a list of credentialed radon professionals. EPA asks states it funds to list only providers credentialed by the state or by a recognized national radon proficiency program.',
          ],
        },
        { p: 'If you are buying a house, test during the inspection period. If you rent, ask the landlord whether the building has been tested and when.' },
      ],
    },
    {
      h2: 'Keeping track with Pantopus',
      blocks: [
        { p: 'Place shows your county’s EPA radon zone and the lead-paint rule for your home’s build year, with sources. On iPhone and Android, Today turns a radon test into a task for your household, and you can add the lab’s report by taking a photo of it: Pantopus reads the result into the record. With suggestions turned on, a result of 4 pCi/L or higher with no follow-up on the list comes back with cards for a follow-up test and for mitigation quotes.' },
      ],
    },
  ],
  questions: [
    { q: 'What does radon zone 1 mean?', a: 'EPA’s zone 1 is the highest radon potential: average indoor levels in the county may be above 4 pCi/L. It describes the county, not your house.' },
    { q: 'If I live in zone 3, do I still need to test?', a: 'Yes. EPA says homes with high radon have been found in all three zones and that every home should be tested.' },
    { q: 'What radon level is dangerous?', a: 'EPA says to fix a home at 4 pCi/L or higher and to consider fixing it between 2 and 4 pCi/L.' },
    { q: 'How do I test my home for radon?', a: 'Buy a kit online or at a home improvement store, place it as the packaging says, send it to the lab, and read the report. Your state radon program can help.' },
    { q: 'What is the average radon level in a home?', a: 'EPA puts the average indoor level at about 1.3 pCi/L and the average outdoor level at about 0.4 pCi/L.' },
    { q: 'Who can fix a radon problem?', a: 'Your state radon program can give you a list of credentialed radon professionals.' },
  ],
  sources: [
    { publisher: 'U.S. Environmental Protection Agency', title: 'Radon', url: 'https://www.epa.gov/radon', read: READ },
    { publisher: 'U.S. Environmental Protection Agency', title: 'Radon Risks and Solutions', url: 'https://www.epa.gov/radon/radon-risks-and-solutions', read: READ },
    { publisher: 'U.S. Environmental Protection Agency', title: 'The EPA Map of Radon Zones', url: 'https://www.epa.gov/radon/epa-map-radon-zones', read: READ },
    { publisher: 'U.S. Environmental Protection Agency', title: 'Health Risk of Radon', url: 'https://www.epa.gov/radon/health-risk-radon', read: READ },
    { publisher: 'U.S. Environmental Protection Agency', title: 'Find a Radon Test Kit or Measurement and Mitigation Professional', url: 'https://www.epa.gov/radon/find-radon-test-kit-or-measurement-and-mitigation-professional', read: READ },
  ],
  pantopus: {
    title: 'See your radon zone, then turn a test into a task',
    text: 'Pantopus shows EPA’s zone for your county and keeps the test on your household’s list until it’s done.',
    href: '/home-safety',
    label: 'How safe is your address?',
  },
  related: [
    { href: '/home-safety', label: 'How safe is your address?' },
    { href: '/home-management', label: 'Run your home together' },
    { href: '/guides/how-to-find-your-flood-zone', label: 'How to find your flood zone' },
    { href: '/guides/what-to-check-before-buying-a-house', label: 'What to check before buying a house' },
  ],
};
