import type { Guide } from './types';

const READ = '2026-11-23';

export const organizeMeals: Guide = {
  slug: 'how-to-organize-meals-for-a-family',
  title: 'How to organize meals for a family in need | Pantopus',
  description:
    'Organize meals after a surgery, a new baby or a loss: ask what they need, set a calendar people can keep, keep food safe and keep their address private.',
  h1: 'How to organize meals for a family',
  lede: 'After a surgery, a new baby or a loss, a few weeks of dinners can matter more than anything you could say. Here is how to set it up so it actually helps.',
  written: '2026-11-23',
  checked: '2026-11-23',
  sections: [
    {
      h2: 'Ask what they actually need',
      blocks: [
        { p: 'Before anyone cooks, talk to one person in the household, or to the friend who speaks for them. People in a hard week rarely want to manage a dozen kind offers. One conversation, one set of answers, and you carry it from there.' },
        { p: 'Ask these questions once and write the answers down where every helper will see them:' },
        {
          ul: [
            'How many people are eating, and how many of them are children?',
            'Allergies, and foods they simply don’t eat.',
            'A few meals they love, and a few they are tired of.',
            'When food should arrive, and whether they want a knock or a quiet drop-off at the door.',
            'Where to leave it: a cooler on the porch, a side door, a building lobby.',
            'Dinners, lunches, groceries, or a mix. Some households would rather have a grocery run than a casserole.',
          ],
        },
      ],
    },
    {
      h2: 'Pick a schedule people can keep',
      blocks: [
        { p: 'Every night for a month sounds generous and usually leaves a fridge full of leftovers and a calendar full of gaps. Start smaller and add days if they are taken quickly.' },
        {
          ul: [
            'Three dinners a week (for example Monday, Wednesday and Friday) leaves room for leftovers.',
            'Every dinner makes sense for the first week after a birth or a hospital stay.',
            'A weekly grocery run works well for longer recoveries.',
            'Plan two weeks at a time, then ask the family whether to keep going.',
          ],
        },
        { p: 'Give each day to one helper. When two people bring dinner on the same night, one meal goes to waste and another night goes empty.' },
      ],
    },
    {
      h2: 'Put allergies where nobody can miss them',
      blocks: [
        { p: 'The U.S. Food and Drug Administration names nine major food allergens: milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soybeans and sesame ([FDA, Food Allergies](https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies), read November 23, 2026). Ask about each one by name, because “no allergies” often means “none I thought of”.' },
        { p: 'Ask helpers to tape a short note to each dish: what it is, what is in it, and how to reheat it. It saves a tired person from guessing.' },
      ],
    },
    {
      h2: 'Keep the food safe on the way',
      blocks: [
        { p: 'Food that sits in a warm car or on a porch is the most common way a kind meal goes wrong. FoodSafety.gov, run by the federal government, gives the rules ([4 Steps to Food Safety](https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety), read November 23, 2026):' },
        {
          ul: [
            'Never leave perishable food out of the refrigerator for more than 2 hours, or 1 hour when it is above 90°F, like a hot car.',
            'Keep hot food at 140°F or above until it is served; between 40°F and 140°F is where germs grow fastest.',
            'A refrigerator should be at 40°F or below.',
          ],
        },
        { p: 'Drop-off windows help with this. If the family is out at 5:30, a meal left at 3:00 has already used up most of its two hours. Disposable containers help too: nobody should have to track down and return your dish.' },
      ],
    },
    {
      h2: 'Protect their address and their quiet',
      blocks: [
        { p: 'A meal sign-up often travels further than you expect: a group chat, a school list, a forwarded email. Share the street address only with the people who have actually signed up for a day, and keep the public version to the town.' },
        { p: 'Keep one place for updates, so the family answers questions once instead of twenty times. If they asked for contactless drop-off, tell helpers plainly: text when you arrive, leave the food, and go.' },
      ],
    },
    {
      h2: 'Say thank you, and know when to stop',
      blocks: [
        { p: 'Put an end date on the calendar from the start. It is easier to extend a plan that is working than to let one fade out. When it ends, thank the helpers by name, and ask the family a week later how they are doing. The meals stop; the care doesn’t have to.' },
      ],
    },
    {
      h2: 'Doing it with a Support Train',
      blocks: [
        { p: 'Pantopus has this built in. A [Support Train](/support-train) is a calendar of home-cooked meals, takeout or groceries, one helper a day, with the household’s allergies, favorites, drop-off window and contactless preference on the page. Helpers can sign up with only a name and an email, and get a reminder the evening before and on the day. People who aren’t helping see the city, never the street address, and the organizer shares the address with each helper. Updates, a group chat and thank-you letters to Mail are part of it.' },
      ],
    },
  ],
  questions: [
    { q: 'How many days of meals should I organize?', a: 'Start with two weeks, three or four dinners a week, then ask the family whether to keep going. It is easier to add days than to fill a month of empty ones.' },
    { q: 'What do I ask the family before I set it up?', a: 'How many people are eating, allergies and dislikes, favorite meals, when and where to drop food off, and whether they want dinners, lunches or groceries.' },
    { q: 'How long can a meal sit on the porch?', a: 'FoodSafety.gov says perishable food should not sit out of the refrigerator for more than 2 hours, or 1 hour above 90°F. Set a drop-off window around when someone is home.' },
    { q: 'Should I share the family’s address on the sign-up?', a: 'Share it only with people who have signed up for a day. Keep the public sign-up to the town.' },
    { q: 'Can people help who don’t live nearby?', a: 'Yes. Takeout ordered for delivery or a grocery delivery covers a day just as well as a home-cooked meal.' },
    { q: 'Do helpers need an app to sign up for a Support Train?', a: 'No. On Pantopus a helper can sign up for a day with a name and an email, and gets reminders by email.' },
  ],
  sources: [
    { publisher: 'U.S. Food and Drug Administration', title: 'Food Allergies', url: 'https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies', read: READ },
    { publisher: 'FoodSafety.gov', title: '4 Steps to Food Safety', url: 'https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety', read: READ },
  ],
  pantopus: {
    title: 'Start a Support Train',
    text: 'A calendar of meals, one helper a day, with allergies and drop-off times on the page. Helpers can sign up with an email.',
    href: '/support-train',
    label: 'How Support Train works',
  },
  related: [
    { href: '/support-train', label: 'Support Train' },
    { href: '/guides/how-to-plan-a-get-together', label: 'How to plan a get-together' },
    { href: '/guides/how-to-share-household-tasks', label: 'How to share household tasks' },
    { href: '/home-management', label: 'Run your home together' },
  ],
};
