import type { Guide } from './types';

const READ = '2026-11-23';

export const householdTasks: Guide = {
  slug: 'how-to-share-household-tasks',
  title: 'How to share household tasks fairly | Pantopus',
  description:
    'A simple way to share chores and household tasks: list the invisible work too, give each task one owner and a due date, make done visible, check in weekly.',
  h1: 'How to share household tasks',
  lede: 'Most arguments about chores aren’t about the dishes. They’re about who has to remember. Here is a way to share the work and the remembering.',
  written: '2026-11-23',
  checked: '2026-11-23',
  sections: [
    {
      h2: 'How much work a home takes',
      blocks: [
        { p: 'More than it looks like. In the U.S. Bureau of Labor Statistics’ American Time Use Survey for 2025, 81 percent of people did household activities such as housework, cooking, lawn care or household management on an average day, spending about 2 hours on them. It wasn’t shared evenly: 87 percent of women and 75 percent of men did some, and on the days they did, women spent an average of 2.8 hours and men 2.1 ([BLS, American Time Use Survey Summary](https://www.bls.gov/news.release/atus.nr0.htm), released June 25, 2026, read November 23, 2026).' },
      ],
    },
    {
      h2: 'Step 1: list everything, including the invisible work',
      blocks: [
        { p: 'Sit down together for twenty minutes and write every recurring job down. The visible ones come first: dishes, laundry, floors, bathrooms, the yard. Then the ones nobody sees:' },
        {
          ul: [
            'Knowing which night the trash and recycling go out.',
            'Booking the dentist, the vet, the furnace service.',
            'Paying bills and renewing the insurance.',
            'Noticing the soap is low before it runs out.',
            'Keeping track of what the kids need for school.',
          ],
        },
        { p: 'Remembering is work. If one person carries the whole list in their head, the chores aren’t shared even when the doing is.' },
      ],
    },
    {
      h2: 'Step 2: give every task one owner',
      blocks: [
        { p: 'An owner doesn’t just do the task; they are the one who remembers it, decides when, and makes sure it happens. “Helping” with a task someone else owns still leaves them with the remembering. Split by whole tasks, not by halves of tasks. If one person owns the laundry, they own it from the basket to the drawer.' },
        { p: 'Trade on preference. Someone who hates calling offices may happily own the yard. Fair doesn’t mean identical; it means both people would call the split fair.' },
      ],
    },
    {
      h2: 'Step 3: put a date on it, and let it repeat',
      blocks: [
        { p: 'A task without a date is a wish. Give each one a due date and, for the recurring ones, a repeat: weekly bathrooms, monthly filters, a yearly smoke-alarm battery. Put the repeating list somewhere everyone can see, not in one person’s phone.' },
      ],
    },
    {
      h2: 'Step 4: make “done” visible',
      blocks: [
        { p: 'Much of the friction comes from not knowing. Did anyone call the plumber? Mark a task done where everyone can see it, with a photo when it helps: the fixed faucet, the cleared gutter. It saves the question and the reminder.' },
      ],
    },
    {
      h2: 'Step 5: check in once a week',
      blocks: [
        { p: 'Ten minutes, same time each week. Look at what is coming up, what slipped, and whether the split still feels fair. Life changes: a new job, a new baby, an injury. The list should change with it.' },
      ],
    },
    {
      h2: 'Kids and roommates',
      blocks: [
        { p: 'Children can own tasks too, sized to their age: feeding a pet, setting the table, taking out the recycling. Owning one small thing teaches more than helping with many. With roommates, agree on the shared spaces and the shared bills in writing on the first week, while everyone is still polite.' },
      ],
    },
    {
      h2: 'Sharing tasks with Pantopus',
      blocks: [
        { p: 'Invite the people you live with to your home on Pantopus, and give each task an owner and a due date. Tasks can repeat and carry photos, and everyone at home sees what’s due. On iPhone and Android, Today’s “Coming up at home” shows the next days’ tasks beside trash pickups and plans, and “Needs you” lists what is overdue or assigned to you. Set your pickup day once, or from a photo of the flyer, and get a reminder the evening before.' },
      ],
    },
  ],
  questions: [
    { q: 'How do you split household chores fairly?', a: 'List every recurring task, including the planning and remembering, give each one a single owner and a due date, and check in weekly on whether the split still feels fair.' },
    { q: 'What is invisible household work?', a: 'The remembering and planning: knowing trash night, booking appointments, paying bills, noticing what is running out. It is work even when nobody sees it.' },
    { q: 'How much time do people spend on household tasks?', a: 'In the Bureau of Labor Statistics’ American Time Use Survey for 2025, people who did household activities on an average day spent about 2 hours on them.' },
    { q: 'What chores can kids own?', a: 'Tasks sized to their age, like feeding a pet, setting the table or taking out the recycling. Owning one small task teaches more than helping with many.' },
    { q: 'How do roommates share chores?', a: 'Agree on shared spaces and shared bills in writing early, give each shared task an owner, and keep the list where everyone can see it.' },
    { q: 'Can everyone at home see the same task list on Pantopus?', a: 'Yes. Invite the people you live with, and each task shows its owner, its due date and when it was done.' },
  ],
  sources: [
    { publisher: 'U.S. Bureau of Labor Statistics', title: 'American Time Use Survey Summary, 2025 results', url: 'https://www.bls.gov/news.release/atus.nr0.htm', read: READ },
  ],
  pantopus: {
    title: 'Everyone at home sees what’s due',
    text: 'Shared tasks with an owner and a due date, repeating, with photos, beside pickups and plans on Today.',
    href: '/home-management',
    label: 'Run your home together',
  },
  related: [
    { href: '/home-management', label: 'Run your home together' },
    { href: '/today', label: 'Today' },
    { href: '/guides/how-to-organize-meals-for-a-family', label: 'How to organize meals for a family' },
    { href: '/guides/how-to-plan-a-get-together', label: 'How to plan a get-together' },
  ],
};
