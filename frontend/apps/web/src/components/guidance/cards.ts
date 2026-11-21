// ============================================================
// Guidance cards: ids and words (founder approval 2026-11-16, draft 2 of the drawings).
//
// One source with the iPhone and Android apps (GUIDE SPEC §5): every title, line and
// button here matches theirs word for word, except where the web's own screen differs
// and the spec gives the web's line. Card 1's first two lines are the founder's own
// words: never change their wording or punctuation. No card says "neighbor" or
// "neighborhood".
// ============================================================

/** Lucide icon names for the rows (components/guidance/GuidanceIcon.tsx draws them). */
export type GuidanceIconName =
  | 'house' | 'lock' | 'panel-bottom' | 'panel-left' | 'list' | 'sun' | 'circle-check' | 'newspaper'
  | 'mail' | 'inbox' | 'ellipsis' | 'activity' | 'map' | 'users' | 'bell' | 'shield-check'
  | 'message-circle' | 'clock' | 'send' | 'calendar' | 'link' | 'map-pin';

export type GuidanceLine = readonly [GuidanceIconName, string];

/** What a card's button opens besides closing it (spec §5, cards 24-27; card 16 while the home has no pickup schedule). */
export type GuidanceAction = 'add_address' | 'setup_home' | 'verify' | 'invite' | 'pickup_day';

/** A centre card as it shows: a title, up to three rows, one button. */
export interface CentreCardContent {
  id: string;
  title: string;
  button: string;
  lines: GuidanceLine[];
  action?: GuidanceAction;
}

/** A pointer bubble: a bold title and one sentence, ringed around one control. */
export interface PointerContent {
  id: string;
  title: string;
  text: string;
  /** The ringed control's data-testid. */
  anchor: string;
}

/** The tab cards (1–7): each shows the first time its tab opens, limited only by "one on screen". */
export const TAB_CARD_IDS = ['welcome', 'place_saved', 'tab_today', 'tab_mail', 'tab_pulse'] as const;
export type TabCardId = (typeof TAB_CARD_IDS)[number];

export interface WelcomeFacts {
  /** Web on a computer: no bottom tabs and no menu button; the list on the left. */
  computer: boolean;
  /** Joined by a household invitation: they never typed an address. */
  invited: boolean;
}

/** 1. Place, the first time a new account reaches it. */
export function welcomeCard({ computer, invited }: WelcomeFacts): CentreCardContent {
  const lines: GuidanceLine[] = [['house', 'Pantopus starts with your home.']];
  if (!invited) lines.push(['lock', 'Only you see the address you type, others see your first name, never your address.']);
  lines.push(computer
    ? ['panel-left', 'The list on the left opens each part of the app.']
    : ['panel-bottom', 'The tabs at the bottom open each part of the app. The menu at the top left has everything else.']);
  return { id: 'welcome', title: 'Welcome to Pantopus', button: 'Get started', lines };
}

/** 2. Place, the first time it shows an address the person has just saved. The web's button reads “Set up this home”. */
export function placeSavedCard(): CentreCardContent {
  return {
    id: 'place_saved',
    title: 'This is your Place',
    button: 'Got it',
    lines: [
      ['list', 'This page shows what is public about your address: weather, risks, pickup days and more.'],
      ['lock', 'It is saved privately. Only you can see it.'],
      ['house', 'Live here? Tap “Set up this home” to get pickup and radon reminders and to share tasks with your household.'],
    ],
  };
}

/** 3. Today, first open. The third line only while the At home | Around you switch is on screen. */
export function todayCard({ aroundYou }: { aroundYou: boolean }): CentreCardContent {
  const lines: GuidanceLine[] = [
    ['sun', 'Today shows the weather and daylight where you live, hour by hour.'],
    ['circle-check', 'It also lists what needs you today, like pickup day or a task that is due.'],
  ];
  if (aroundYou) lines.push(['newspaper', 'Switch to “Around you” for local headlines and events.']);
  return { id: 'tab_today', title: 'Today', button: 'Got it', lines };
}

/** 4. Mail, first open. The web's Mail has no pencil: writing a letter is in its ••• menu, while letters are on. */
export function mailCard({ letters }: { letters: boolean }): CentreCardContent {
  const lines: GuidanceLine[] = [
    ['mail', 'This is your mailbox in Pantopus. Letters and cards sent to you arrive once a day, in the morning.'],
    ['inbox', '“Counter” holds mail that needs you to do something, like pay a bill. “Vault” keeps mail you want to save.'],
  ];
  if (letters) lines.push(['ellipsis', 'To write a letter, tap ••• and choose “Write a letter”.']);
  return { id: 'tab_mail', title: 'Mail', button: 'Got it', lines };
}

/** 5. Pulse, first open. */
export function pulseCard(): CentreCardContent {
  return {
    id: 'tab_pulse',
    title: 'Pulse',
    button: 'Got it',
    lines: [
      ['activity', 'Pulse is where people near you post: questions, recommendations, events and more.'],
      ['map', '“List” shows the posts. “Map” shows the same posts on a map.'],
      ['users', '“Nearby” is everyone near you. “Connections” is only the people you are connected with.'],
    ],
  };
}

// ── Right after doing something for the first time (16–23; 19 and 20 are phones only) ──

/**
 * 16. Place, right after “Set up this home” finishes. While the home has no pickup schedule, the button reads
 * “Set pickup day” and opens the pickup editor for that home, besides closing the card (JOURNEYS, 2026-11-21).
 */
export function homeSetUpCard({ needsPickupDay = false }: { needsPickupDay?: boolean } = {}): CentreCardContent {
  return {
    id: 'done_home_setup',
    title: 'Your home is set up',
    button: needsPickupDay ? 'Set pickup day' : 'Got it',
    ...(needsPickupDay ? { action: 'pickup_day' as const } : {}),
    lines: [
      ['circle-check', '“Tasks” is a shared to-do list for your home.'],
      ['users', '“Members” is where you invite the people you live with.'],
      ['bell', 'Tell Pantopus your pickup day and it will remind you the night before.'],
    ],
  };
}

/** 17. Place, first open after the address becomes verified. The Mail line only while the Mailbox is on. */
export function verifiedCard({ mailbox }: { mailbox: boolean }): CentreCardContent {
  const lines: GuidanceLine[] = [
    ['shield-check', 'Your profile now shows a Verified badge.'],
    ['message-circle', 'You can now send a message to homes near you.'],
  ];
  if (mailbox) lines.push(['mail', '“Home” in Mail is now open, for mail to everyone at your address.']);
  return { id: 'done_verified', title: "You're verified", button: 'Got it', lines };
}

/** 18. Pulse, right after the person's first post is up. The web's menu row is “My posts”. */
export function firstPostCard(): CentreCardContent {
  return {
    id: 'done_first_post',
    title: 'Your post is up',
    button: 'Got it',
    lines: [
      ['users', 'People near you can see it and reply.'],
      ['bell', 'The bell at the top tells you when someone replies.'],
      ['list', 'Find your posts again in the menu, under “My posts”.'],
    ],
  };
}

/** 21. Messages, the first time a connection request is accepted either way. */
export function connectedCard(): CentreCardContent {
  return {
    id: 'done_connected',
    title: "You're connected",
    button: 'Got it',
    lines: [
      ['message-circle', 'You two can now message each other.'],
      ['activity', 'Their posts show in Pulse under “Connections”.'],
    ],
  };
}

/** 22. Mail, right after the first letter or card is sent. */
export function firstLetterCard(): CentreCardContent {
  return {
    id: 'done_first_letter',
    title: "It's on its way",
    button: 'Got it',
    lines: [
      ['mail', 'It arrives with the morning mail.'],
      ['send', 'See everything you have sent under “Sent”.'],
    ],
  };
}

/** 23. Place, right after the first other person joins the household. */
export function householdCard(): CentreCardContent {
  return {
    id: 'done_household',
    title: 'Your household',
    button: 'Got it',
    lines: [
      ['users', 'Everyone in your household sees the same tasks and reminders.'],
      ['lock', 'Each person still has their own private mail and messages.'],
    ],
  };
}

export const AFTER_ACTION_IDS = ['done_home_setup', 'done_verified', 'done_first_post', 'done_connected', 'done_first_letter', 'done_household'] as const;

// ── Reminders of the next step (24–27): at most one a week, each at most twice ──

/** 24. Place, two days after sign-up, no saved address or home. The web's Place has no address box: “Preview an address”. */
export function addAddressCard(): CentreCardContent {
  return {
    id: 'next_add_address',
    title: 'Add your address',
    button: 'Add my address',
    action: 'add_address',
    lines: [
      ['house', 'Type your address to see flood risk, air quality and pickup days for your home.'],
      ['lock', 'Only you see it.'],
    ],
  };
}

/** 25. Place, three days after saving an address, no home set up. The web's button reads “Set up this home”. */
export function setUpHomeCard(): CentreCardContent {
  return {
    id: 'next_setup_home',
    title: 'Set up your home',
    button: 'Set up this home',
    action: 'setup_home',
    lines: [
      ['bell', 'Get reminders for pickup day and for testing your home for radon.'],
      ['circle-check', 'Keep a to-do list for your home and share it with the people you live with.'],
    ],
  };
}

/** 26. Place, seven days after the home is set up, not verified. */
export function verifyReminderCard(): CentreCardContent {
  return {
    id: 'next_verify',
    title: 'Verify your address',
    button: 'Verify address',
    action: 'verify',
    lines: [
      ['shield-check', 'Prove you live here to get your Verified badge.'],
      ['message-circle', 'Verified people can send a message to homes near them.'],
    ],
  };
}

/** 27. Place, seven days after the home is set up, the person is its only member. */
export function inviteCard(): CentreCardContent {
  return {
    id: 'next_invite',
    title: 'Invite your household',
    button: 'Invite someone',
    action: 'invite',
    lines: [
      ['users', 'Add the people you live with.'],
      ['circle-check', 'You will all see the same tasks and reminders for your home.'],
    ],
  };
}

export const REMINDER_IDS = ['next_add_address', 'next_setup_home', 'next_verify', 'next_invite'] as const;

// ── Introducing something new (28's pattern; older accounts too) ──

/**
 * 28. The first app open after an introduction is switched on, on whichever tab is open. The web has no Plans tab,
 * so the line about its tab at the bottom is left out here.
 */
export function introducingPlansCard(): CentreCardContent {
  return {
    id: 'new_plans',
    title: 'Introducing Plans',
    button: 'Continue',
    lines: [['calendar', 'Plans are get-togethers near you: a walk, a game night, a dinner.']],
  };
}

const INTRODUCTIONS: Record<string, () => CentreCardContent> = { new_plans: introducingPlansCard };

/** The introductions switched on. Ships empty: the founder picks the first one later. */
export const ACTIVE_INTRODUCTIONS: readonly string[] = [];

export function introductionCard(id: string): CentreCardContent | null {
  return INTRODUCTIONS[id]?.() ?? null;
}

/** Every centre card (for "never on a day another centre card showed"). */
export const CENTRE_CARD_IDS: readonly string[] = [
  'welcome', 'place_saved', 'tab_today', 'tab_mail', 'tab_pulse', 'tab_moments', 'tab_plans',
  'done_home_setup', 'done_verified', 'done_first_post', 'done_first_moment', 'done_first_plan', 'done_connected',
  'done_first_letter', 'done_household', ...Object.keys(INTRODUCTIONS),
];

// ── Pointers (8–15): new accounts, from the second app open, one per app open, in this order ──
// The web has no Ask Pantopus sparkle on Place (8) and no “Your home at a glance” rows (12), so
// those two never find their control here. On a computer there is no ☰, so 10 never shows there.

export const POINTERS: PointerContent[] = [
  { id: 'tip_ask', title: 'Ask Pantopus', text: 'Ask a question about your home, or about how to do something in the app.', anchor: 'place.askPantopus' },
  { id: 'tip_messages', title: 'Messages', text: 'Your chats with people and groups open here.', anchor: 'shell.messages' },
  // The web's menu lists the parts of the app rather than your homes (phone width only).
  { id: 'tip_menu', title: 'Menu', text: 'Every part of the app is listed here, with your connections and settings.', anchor: 'shell.menu' },
  { id: 'tip_verify', title: 'Verify your address', text: 'Prove you live here. Then you get a Verified badge and can send a message to homes near you.', anchor: 'place.verifyAddress' },
  { id: 'tip_place_row', title: 'See more', text: 'Tap + to open a row and read the details.', anchor: 'place.firstRowPlus' },
  { id: 'tip_pulse_post', title: 'Post to Pulse', text: 'Ask a question, recommend a place or share an event with people near you.', anchor: 'pulse.post' },
  { id: 'tip_pulse_area', title: 'Your area', text: 'Tap here to change how far around you Pulse looks.', anchor: 'pulse.area' },
  { id: 'tip_mail_me_home', title: 'Me and Home', text: '“Me” is mail for you. “Home” is mail for everyone at your address.', anchor: 'mailbox.meHome' },
];

export function pointerById(id: string): PointerContent | undefined {
  return POINTERS.find((p) => p.id === id);
}

/** Every card id the web knows (for the force switch). */
export const KNOWN_CARD_IDS: readonly string[] = [
  ...TAB_CARD_IDS, ...POINTERS.map((p) => p.id), ...AFTER_ACTION_IDS, ...REMINDER_IDS, ...Object.keys(INTRODUCTIONS),
];
