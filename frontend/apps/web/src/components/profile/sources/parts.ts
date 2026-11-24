// The parts a link shows (board 21), in its order and groups, with the words under each switch.

/** Board 21's words for each part, in its order and groups. A part the server doesn't send isn't drawn. */
export const GROUPS: Array<{ title: string; parts: Array<{ key: string; label: string; detail?: string }> }> = [
  {
    title: 'About you',
    parts: [
      { key: 'says', label: 'Says', detail: 'Your one line' },
      { key: 'prompts', label: 'Get to know', detail: 'Your answers' },
      { key: 'shelf', label: 'Shelf' },
      { key: 'city', label: 'City' },
    ],
  },
  {
    title: "What you've done",
    parts: [
      { key: 'work', label: 'Work', detail: 'Your pieces and what you can do' },
      { key: 'known_for', label: 'Known for', detail: 'Writers show by name only if they allow it.' },
      { key: 'reviews', label: 'Reviews', detail: 'What people wrote after a paid job' },
      { key: 'record_work', label: 'Record: work and learning' },
      { key: 'record_home', label: 'Record: home', detail: 'That your home is verified. Never the address.' },
      { key: 'record_others', label: 'Record: with others' },
      { key: 'met', label: 'Met in person', detail: 'A count. Names are never on a shared page.' },
    ],
  },
  {
    title: 'Reaching you',
    parts: [
      { key: 'doors', label: 'Doors', detail: 'Hire, ask, send a card, leave a card. A visitor signs in to use one.' },
    ],
  },
];

/** A part's short name, for a link's summary ("Work, Known for, Record"). */
export const PART_SHORT: Record<string, string> = {
  says: 'Says', prompts: 'Get to know', shelf: 'Shelf', city: 'City', work: 'Work', known_for: 'Known for', reviews: 'Reviews',
  record_work: 'Record', record_home: 'Record', record_others: 'Record', met: 'Met in person', doors: 'Doors',
};
