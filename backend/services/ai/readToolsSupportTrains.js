/**
 * Support Trains for the assistant: the ones the person organizes, receives, helps with or is invited to, the ones
 * listed near them, and one train in short with its open dates.
 *
 * Every read mirrors one the apps make (routes/supportTrains.js):
 *   - their own list is GET /me/support-trains: the trains they organize or co-organize, the published ones they
 *     receive, the ones they signed up to help with, and pending invitations to published trains;
 *   - nearby is GET /nearby (rpc list_support_trains_nearby), from the place Today shows: only trains whose organizer
 *     listed them for people nearby, each with its town and how far the area its page shows is, never an address;
 *   - one train is what its page shows someone in that role. Someone who isn't part of it reads it only when it is
 *     listed near them or they were invited, and only what the page shows before signing up: the title, the story's
 *     summary, the kinds of help and the open dates. The delivery address, phone numbers, the organizer's private
 *     notes and other helpers' names never reach the model.
 *
 * Read only: nothing here signs anyone up, answers an invitation or tells an organizer anything.
 */
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { listEffectivelyOpenSlots } = require('../supportTrainSlotAvailability');
const { resolveLocation } = require('../context/locationResolver');
const { OTHERS_WORDS, isUuid, clip } = require('./assistantKit');

// Trains in one answer.
const MAX_TRAINS = 15;
// Open dates listed for one train; the rest are counted.
const MAX_OPEN_DATES = 12;
// About 25 miles, the Support Trains list's own default (GET /nearby).
const NEARBY_METERS = 40234;
const STATUSES = ['draft', 'published', 'active', 'paused', 'completed', 'archived'];
const ROLE_WORDS = {
  organizer: 'they organize it',
  co_organizer: 'they help organize it',
  recipient_delegate: 'they speak for the person it is for',
  recipient: 'it is for them',
  helper: 'they signed up to help',
  invited: 'they were invited to help and have not signed up yet',
};

const supportTrainReadToolDefinitions = [
  {
    name: 'list_user_support_trains',
    description: "The Support Trains the person is part of, newest first: the ones they organize or help organize, published ones that are for them, ones they signed up to help with, and ones they were invited to. Each has its support_train_id, title, status and their part in it. Use it for \"my Support Trains\", \"what did I sign up for\" or \"was I invited to anything\", then get_support_train_summary for one.",
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: ['string', 'null'],
          enum: [...STATUSES, null],
          description: 'Only trains in this status, or null for all.',
        },
      },
      required: ['status'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_support_trains_nearby',
    description: "Support Trains listed for people near the person's home or saved place (within about 25 miles), nearest first: meals, takeout or groceries someone organized for a person going through something hard. Each has its support_train_id, title, town, about how far it is and how many dates still need someone. Only trains their organizers chose to list nearby; a train shared by link or with connections only isn't here. Use it for \"who near me needs help\" or \"is there a Support Train I can help with\", then get_support_train_summary for the open dates.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: ['string', 'null'], maxLength: 100, description: 'Words the title or town must contain, or null to list all.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_support_train_summary',
    description: "One Support Train in short, by a support_train_id from list_user_support_trains or find_support_trains_nearby: its title, status, the person's part in it, the kinds of help it takes, what the household needs to know (size, dietary needs, allergies, contactless drop-off) and the dates that still need someone. For a train they aren't part of, only what its page shows before signing up. Never the delivery address.",
    input_schema: {
      type: 'object',
      properties: {
        support_train_id: { type: 'string', description: 'UUID of the Support Train.' },
      },
      required: ['support_train_id'],
      additionalProperties: false,
    },
  },
];

const SUPPORT_TRAIN_TOOL_NAMES = new Set(supportTrainReadToolDefinitions.map((tool) => tool.name));

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}

const TRAIN_COLUMNS = 'id, status, published_at, created_at, Activity!inner ( title )';

async function read(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** The person's trains with their part in each, as GET /me/support-trains lists them. */
async function participations(userId, status) {
  const withStatus = (query) => (status ? query.eq('status', status) : query);
  const [owned, organizerRows, received, reservations, invitations] = await Promise.all([
    read(withStatus(supabaseAdmin.from('SupportTrain').select(TRAIN_COLUMNS).eq('organizer_user_id', userId))),
    read(supabaseAdmin.from('SupportTrainOrganizer').select('support_train_id, role').eq('user_id', userId).neq('role', 'primary')),
    // A train that is for them shows once it is published, never an organizer's unpublished draft.
    read(withStatus(supabaseAdmin.from('SupportTrain').select(TRAIN_COLUMNS).eq('recipient_user_id', userId).not('published_at', 'is', null))),
    read(supabaseAdmin.from('SupportTrainReservation').select('support_train_id').eq('user_id', userId).neq('status', 'canceled')),
    read(supabaseAdmin.from('SupportTrainInvite').select('support_train_id').eq('invitee_user_id', userId).eq('status', 'pending')),
  ]);
  const found = new Map();
  const add = (train, role) => { if (train && !found.has(train.id)) found.set(train.id, { train, role }); };
  for (const train of owned) add(train, 'organizer');

  const organizerRole = new Map(organizerRows.map((row) => [row.support_train_id, row.role]));
  const helperIds = [...new Set(reservations.map((row) => row.support_train_id))];
  const invitedIds = [...new Set(invitations.map((row) => row.support_train_id))];
  const others = [...new Set([...organizerRole.keys(), ...helperIds, ...invitedIds])].filter((id) => !found.has(id));
  const rows = others.length
    ? await read(withStatus(supabaseAdmin.from('SupportTrain').select(TRAIN_COLUMNS).in('id', others)))
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const [id, role] of organizerRole) add(byId.get(id), role || 'co_organizer');
  for (const train of received) add(train, 'recipient');
  for (const id of helperIds) add(byId.get(id), 'helper');
  // An invitation shows only for a train that is running, as the Invitations tab has it.
  for (const id of invitedIds) {
    const train = byId.get(id);
    if (train && ['published', 'active'].includes(train.status) && train.published_at) add(train, 'invited');
  }
  return [...found.values()].sort((a, b) => String(b.train.created_at || '').localeCompare(String(a.train.created_at || '')));
}

async function listMine(args, ctx) {
  const status = STATUSES.includes(args.status) ? args.status : null;
  const all = await participations(ctx.userId, status);
  const shown = all.slice(0, MAX_TRAINS);
  return compact({
    note: OTHERS_WORDS,
    support_trains: shown.map(({ train, role }) => compact({
      // `id` too: the name this list has always used.
      id: train.id,
      support_train_id: train.id,
      title_text: clip(train.Activity?.title, 120),
      title: clip(train.Activity?.title, 120),
      status: train.status,
      their_part: ROLE_WORDS[role] || role,
      published_at: train.published_at || null,
    })),
    more: all.length > shown.length ? all.length - shown.length : null,
    empty: shown.length ? null : 'They are not part of any Support Train right now. find_support_trains_nearby lists ones near them that need help, and draft_support_train_from_story starts one.',
  });
}

const wordsOf = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);

function milesWords(meters) {
  const miles = Number(meters) / 1609.344;
  if (!Number.isFinite(miles)) return null;
  if (miles < 1) return 'under a mile away';
  return `about ${Math.round(miles)} mile${Math.round(miles) === 1 ? '' : 's'} away`;
}

/** The trains listed near the place Today shows (GET /nearby), or null when they have no place. */
async function nearbyRows(userId) {
  const location = await resolveLocation(userId);
  if (!location || location.source === 'none' || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  const { data, error } = await supabaseAdmin.rpc('list_support_trains_nearby', {
    p_lat: location.latitude, p_lng: location.longitude, p_radius_meters: NEARBY_METERS, p_limit: 40,
  });
  if (error) throw error;
  return data || [];
}

async function findNearby(args, ctx) {
  const rows = await nearbyRows(ctx.userId);
  if (!rows) return { empty: 'They have no home or saved place yet, so nothing can be listed near them. Suggest adding their home on Place.' };
  const asked = wordsOf(args.query);
  const found = rows.filter((row) => {
    if (!asked.length) return true;
    const have = wordsOf(`${row.title} ${row.city || ''} ${row.state || ''}`);
    return asked.every((word) => have.some((own) => own.startsWith(word)));
  });
  const shown = found.slice(0, MAX_TRAINS);
  return compact({
    note: `${OTHERS_WORDS} Distances are to the area each train's page shows, never to an address.`,
    support_trains: shown.map((row) => compact({
      support_train_id: row.support_train_id,
      title_text: clip(row.title, 120),
      town: [row.city, row.state].filter(Boolean).join(', ') || null,
      distance: milesWords(row.distance_meters),
      dates_that_need_someone: Number(row.open_slots_count) || 0,
      status: row.status,
    })),
    more: found.length > shown.length ? found.length - shown.length : null,
    empty: shown.length ? null : (asked.length
      ? 'No Support Train listed near them matches that. Read again without a query to see all of them.'
      : 'No Support Trains are listed near them right now. One shared by link or with connections only would not show here.'),
  });
}

/** Their part in a train, as its page decides it, or null when they have none. */
async function partIn(train, userId) {
  if (train.organizer_user_id === userId) return 'organizer';
  if (train.recipient_user_id && train.recipient_user_id === userId) return 'recipient';
  const [{ data: organizer }, { count: reserved }] = await Promise.all([
    supabaseAdmin.from('SupportTrainOrganizer').select('role').eq('support_train_id', train.id).eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('SupportTrainReservation').select('id', { count: 'exact', head: true })
      .eq('support_train_id', train.id).eq('user_id', userId).in('status', ['reserved', 'delivered', 'confirmed']),
  ]);
  if (organizer) return organizer.role === 'primary' ? 'organizer' : organizer.role || 'co_organizer';
  if ((reserved || 0) > 0) return 'helper';
  return null;
}

/** True when someone who isn't part of the train may read its page: invited, or listed near them. */
async function mayLookIn(train, userId) {
  if (!['published', 'active'].includes(train.status)) return { invited: false, listed: false };
  const { count } = await supabaseAdmin.from('SupportTrainInvite').select('id', { count: 'exact', head: true })
    .eq('support_train_id', train.id).eq('invitee_user_id', userId);
  if ((count || 0) > 0) return { invited: true, listed: false };
  const rows = await nearbyRows(userId).catch(() => null);
  return { invited: false, listed: Boolean(rows && rows.some((row) => row.support_train_id === train.id)) };
}

const hhmm = (time) => (typeof time === 'string' && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : null);

async function summary(args, ctx) {
  const id = args.support_train_id;
  if (!isUuid(id)) return { error: 'That is not a Support Train id. Use list_user_support_trains or find_support_trains_nearby first.' };
  const { data: train, error } = await supabaseAdmin
    .from('SupportTrain')
    .select('id, status, organizer_user_id, recipient_user_id, enable_home_cooked_meals, enable_takeout, enable_groceries, Activity!inner ( title, summary )')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!train) return { error: 'Support Train not found.' };

  let part = await partIn(train, ctx.userId);
  if (!part) {
    const door = await mayLookIn(train, ctx.userId);
    if (!door.invited && !door.listed) return { error: 'NOT_AUTHORIZED' };
    part = door.invited ? 'invited' : 'not_part';
  }
  const inside = part !== 'invited' && part !== 'not_part';

  const [openSlots, { data: profile }] = await Promise.all([
    listEffectivelyOpenSlots({ supportTrainId: id }),
    supabaseAdmin.from('SupportTrainRecipientProfile')
      .select('household_size, dietary_styles, allergies, contactless_preferred')
      .eq('support_train_id', id).maybeSingle(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = openSlots.filter((slot) => !slot.slot_date || String(slot.slot_date) >= today);
  // The profile keeps these as { items: [...] } (older rows as a bare list).
  const list = (value) => {
    const items = Array.isArray(value) ? value : (Array.isArray(value?.items) ? value.items : []);
    return items.map((item) => clip(String(item), 40)).filter(Boolean).join(', ') || null;
  };
  const recipientSummary = profile
    ? `Household of ${profile.household_size || '?'}${profile.contactless_preferred ? ', contactless preferred' : ''}`
    : null;
  const help = [
    train.enable_home_cooked_meals ? 'home-cooked meals' : null,
    train.enable_takeout ? 'takeout' : null,
    train.enable_groceries ? 'groceries' : null,
  ].filter(Boolean);

  return compact({
    note: OTHERS_WORDS,
    id: train.id,
    support_train_id: train.id,
    title: clip(train.Activity?.title, 120),
    title_text: clip(train.Activity?.title, 120),
    summary_text: clip(train.Activity?.summary, 400),
    status: train.status,
    their_part: part === 'not_part' ? 'they are not part of it; it is listed for people nearby' : (ROLE_WORDS[part] || part),
    kinds_of_help: help.length ? help : null,
    recipient_summary: recipientSummary,
    dietary_text: profile ? list(profile.dietary_styles) : null,
    allergies_text: profile ? list(profile.allergies) : null,
    open_slots_count: upcoming.length,
    open_dates: upcoming.slice(0, MAX_OPEN_DATES).map((slot) => compact({
      date: slot.slot_date,
      what: clip(slot.slot_label, 40),
      from: hhmm(slot.start_time),
      to: hhmm(slot.end_time),
    })),
    more_open_dates: upcoming.length > MAX_OPEN_DATES ? upcoming.length - MAX_OPEN_DATES : null,
    how_to_help: inside ? null : 'They sign up for a date on the train\'s own page (the support_train button opens it). You can\'t sign them up.',
    summary_chips: [],
  });
}

const EXECUTORS = {
  list_user_support_trains: listMine,
  find_support_trains_nearby: findNearby,
  get_support_train_summary: summary,
};

async function runSupportTrainReadTool(name, args, ctx) {
  const executor = EXECUTORS[name];
  if (!executor) return null;
  try {
    return await executor(args || {}, ctx);
  } catch (err) {
    logger.error(`${name} error`, { userId: ctx.userId, error: err?.message });
    return name === 'get_support_train_summary'
      ? { error: 'Failed to retrieve Support Train summary.' }
      : { support_trains: [], error: "That couldn't be read just now." };
  }
}

module.exports = { supportTrainReadToolDefinitions, runSupportTrainReadTool, SUPPORT_TRAIN_TOOL_NAMES };
