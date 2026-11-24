import type { TopicPage } from './types';

export const homeManagement: TopicPage = {
  path: '/home-management',
  route: 'topic:home-management',
  title: 'Home management: run your home together',
  description:
    'Run your home together: shared tasks with an owner and a due date, pickup reminders, documents, access codes, a maintenance log and mail for your home, free.',
  label: 'Home management',
  h1: 'Run your home *together.*',
  lede: 'One place for the household. Everyone at home sees what is due, who has it and when it was done, beside the weather, the trash night and the plans for the week.',
  lookup: true,
  lookupText: { title: 'Start with your home', line: 'Type your address. It’s free, and your household’s tasks stay inside your home.' },
  sections: [
    {
      eyebrow: 'Today',
      h2: 'Everyone at home sees *what’s due.*',
      blocks: [
        { p: 'The sky over your own house, and the day under it. Weather outside, what is due inside, and what is happening around you.' },
        {
          ul: [
            'Coming up at home: pickups, tasks, plans and property-tax dates for the next days.',
            'Bin-night reminders, set once or from a photo of the flyer.',
            'Needs you: requests, invitations and overdue tasks.',
            'A radon test, turned into a task.',
            'Morning and evening briefings, only when there is something useful.',
            'On your lock screen and home screen.',
          ],
        },
      ],
      more: { href: '/today', label: 'More about Today' },
    },
    {
      h2: 'How do you share chores with the people you live with?',
      blocks: [
        { p: 'Invite the people you live with to your home, each with a role. Give every task an owner and a due date. Tasks can repeat every week or month and carry photos, so “done” is something everyone can see, not something one person remembers.' },
      ],
      more: { href: '/guides/how-to-share-household-tasks', label: 'How to share household tasks' },
    },
    {
      h2: 'What does a home management app keep track of?',
      blocks: [
        {
          ul: [
            'Members with roles, and people you invite.',
            'Shared tasks with an owner and a due date.',
            'Documents where the right people find them.',
            'Guest passes, access codes and a maintenance log.',
            'Roof, heating, water heater and electrical panel, by age, correctable by you.',
            'Emergency information, and a fridge card for 911.',
            'Bills, packages, pets, polls and the family calendar.',
          ],
        },
      ],
    },
    {
      h2: 'What is the home maintenance schedule for my house?',
      blocks: [
        { p: 'Place estimates your roof, heating and cooling, water heater and electrical panel from the year the house was built, and marks each as an estimate until your household corrects it. Put the service dates on the task list with a repeat, and log the work when it’s done, so the next person, or the next owner, knows.' },
      ],
    },
    {
      eyebrow: 'Mail',
      h2: 'Letters and cards, delivered *at 7 a.m.*',
      blocks: [
        { p: 'A mailbox for your home, on your phone. Incoming, a Counter for what needs an answer by its due date, and a Vault for taxes, receipts and the rest. Pantopus reads each letter for you: a summary and the key facts. Hold your mail while you are away.' },
      ],
      more: { href: '/mail', label: 'More about Mail' },
    },
    {
      h2: 'Who can see your household’s tasks?',
      blocks: [
        { p: 'The people in your home, by their roles. Someone who looks up your address sees only public information about the place, never your household’s tasks or documents.' },
      ],
    },
  ],
  questions: [
    { q: 'What is a home management app?', a: 'An app that keeps a household’s shared work in one place: tasks and who owns them, reminders, documents, access codes and maintenance. Pantopus puts that beside your home’s weather, pickups and mail.' },
    { q: 'Can my whole household use it?', a: 'Yes. Invite the people you live with, each with a role, and everyone sees the tasks that are theirs to see.' },
    { q: 'Does Pantopus remind us about trash night?', a: 'Yes. Set your pickup day once, or from a photo of the flyer, and get a reminder the evening before.' },
    { q: 'Can tasks repeat?', a: 'Yes. A task can repeat, and each one has an owner, a due date and room for a photo.' },
    { q: 'Is it only for homeowners?', a: 'No. It works for a home you own, rent or share.' },
    { q: 'Is it free?', a: 'Yes. Pantopus is free on iPhone and Android, and on the web.' },
  ],
  related: [
    { href: '/today', label: 'Today' },
    { href: '/guides/how-to-share-household-tasks', label: 'How to share household tasks' },
    { href: '/guides/what-a-radon-zone-means', label: 'What a radon zone means' },
    { href: '/home-safety', label: 'How safe is your address?' },
    { href: '/mail', label: 'Mail' },
  ],
  close: {
    title: 'Pantopus starts with your home.',
    line: 'Type your address, or get the app.',
  },
};
