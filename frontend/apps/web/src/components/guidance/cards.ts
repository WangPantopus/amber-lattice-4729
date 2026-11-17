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

/** A centre card as it shows: a title, up to three rows, one button. */
export interface CentreCardContent {
  id: string;
  title: string;
  button: string;
  lines: GuidanceLine[];
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
export const KNOWN_CARD_IDS: readonly string[] = [...TAB_CARD_IDS, ...POINTERS.map((p) => p.id)];
