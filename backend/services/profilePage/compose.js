/**
 * Composes the profile page for one view (CONTRACT.md sections 2 to 5, 9): every line with its ink and how, month
 * data for the rings, the blocks of each tab, and the parts. Nothing a view may not see is put in the answer: a part
 * that doesn't reach the view contributes no line, no month and no count (SPEC 4.2, 4.3).
 */

const { reaches, readShare } = require('./parts');

const INK_LEVEL = { said: 1, signed: 2, seen: 3 };
const LEVEL_INK = { 1: 'said', 2: 'signed', 3: 'seen' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
const LANE_PART = { home: 'record_home', work: 'record_work', others: 'record_others' };
const PACIFIC = 'America/Los_Angeles';

// The city's time zone from its state (the most-used zone where a state has two). Unknown: no clock is sent.
const STATE_TZ = (() => {
  const zones = {
    'America/Los_Angeles': 'WA OR CA NV',
    'America/Phoenix': 'AZ',
    'America/Denver': 'MT WY CO NM UT ID',
    'America/Chicago': 'TX OK KS NE SD ND MN IA MO AR LA MS AL WI IL TN',
    'America/New_York': 'ME NH VT MA RI CT NY NJ PA DE MD DC VA WV NC SC GA FL OH MI IN KY',
    'America/Anchorage': 'AK',
    'Pacific/Honolulu': 'HI',
    'America/Puerto_Rico': 'PR VI',
  };
  const map = {};
  for (const [tz, states] of Object.entries(zones)) for (const state of states.split(' ')) map[state] = tz;
  return map;
})();

// ---------- small helpers ----------

function monthOf(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month) {
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function monthsBetween(fromMonth, toMonth) {
  const out = [];
  if (!fromMonth || !toMonth || fromMonth > toMonth) return out;
  let [y, m] = fromMonth.split('-').map(Number);
  const [ey, em] = toMonth.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) { y += 1; m = 1; }
  }
  return out;
}

/** "June 2026", "April to November 2026", "March 2024 to November 2026". */
function rangeLabel(months) {
  const sorted = [...new Set(months.filter(Boolean))].sort();
  if (!sorted.length) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) return monthLabel(first);
  const [fy, fm] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  if (fy === ly) return `${MONTHS[fm - 1]} to ${MONTHS[lm - 1]} ${ly}`;
  return `${monthLabel(first)} to ${monthLabel(last)}`;
}

function yearsLabel(months) {
  const years = [...new Set(months.filter(Boolean).map((m) => m.slice(0, 4)))].sort();
  if (!years.length) return null;
  return years.length === 1 ? years[0] : `${years[0]} to ${years[years.length - 1]}`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The date in a time zone as YYYY-MM-DD, and the clock as "7:12 PM". */
function localDate(now, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function localClock(now, tz) {
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
  let sky = 'night';
  if (hour >= 5 && hour < 7) sky = 'dawn';
  else if (hour >= 7 && hour < 17) sky = 'day';
  else if (hour >= 17 && hour < 20) sky = 'evening';
  return { time, sky };
}

function line(ink, text, how, lane = null, link = null, extra = {}) {
  return { ink, text, how, lane, link, ...extra };
}

function firstWord(name) {
  return String(name || '').trim().split(/\s+/)[0] || null;
}

function initials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || null;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|avif)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|$)/i;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return null;
  }
}

function safeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

// ---------- a piece ----------

const KIND_WORD = { did: 'Did', built: 'Built', owns: 'Owns' };

// ---------- credits (phase 2B, CONTRACT P2.5) ----------

const ORDER = { signed: 0, said: 1, asked: 2, declined: 3 };

// "Carpenter" → "carpenter"; "TV installer" stays as written.
function lowerFirst(text) {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

/** What a credited party did, for a party shown without a name ("A carpenter", "Someone who hired Maria"). */
function didOf(credit, first) {
  if (credit.relation === 'for') return `Someone who hired ${first}`;
  const role = String(credit.role || '').trim();
  if (role) return `${/^[aeiou]/i.test(role) ? 'An' : 'A'} ${lowerFirst(role)}`;
  // `led`: the owner led them (board 9's "Has taught or led"); `learned_from`: the owner learned from them.
  return { with: `Someone who worked with ${first}`, led: `Someone ${first} led`, learned_from: `Someone ${first} learned from` }[credit.relation]
    || 'Someone on it';
}

function askedWords(at, now) {
  if (!at) return 'Asked';
  if (localDate(new Date(at), PACIFIC) === localDate(now, PACIFIC)) return 'Asked today';
  return `Asked ${new Date(at).toLocaleDateString('en-US', { timeZone: PACIFIC, month: 'long', day: 'numeric' })}`;
}

/**
 * One credit as this view sees it. Signed-in views name a signed person and a typed name; a page opened without
 * signing in (the link view) names a signed person only if they allowed it, and a typed name never, each shown by
 * what they did instead. The owner reads an ask as "Asked today" and a "Not me" as `did_not_confirm`.
 */
function creditOf(c, { view, first, now = new Date(), viewerId = null }) {
  const typed = !c.party_user_id;
  const named = view !== 'link' || (!typed && c.name_on_links === true);
  const shown = c.party_shown || {};
  const did = didOf(c, first);
  const party = named
    ? { name: typed ? c.party_name : (shown.name || null), user_id: typed ? null : c.party_user_id,
      username: typed ? null : (shown.username || null), portrait_url: typed ? null : (shown.avatar || null), typed, did }
    : { name: null, user_id: null, username: null, portrait_url: null, typed, did };
  let status = c.status;
  let ink = 'said';
  let how;
  if (c.status === 'signed') {
    ink = 'signed';
    how = `Signed, ${monthLabel(monthOf(c.signed_at))}`;
  } else if (c.status === 'said') how = `In ${first}'s words`;
  else if (c.status === 'asked') how = view === 'owner' ? askedWords(c.asked_at, now) : 'Asked of you';
  else {
    status = 'did_not_confirm';
    how = 'Did not confirm';
  }
  const answer = { id: c.id, party, role: String(c.role || '').trim() || null, relation: c.relation || null, ink, how, status };
  // The signer reading their own signed credit gets their two choices, to draw the switches beside "Take my name off"
  // (PATCH /me/ties/:id). Nobody else's credit carries them.
  if (c.status === 'signed' && view !== 'link' && viewerId && String(c.party_user_id) === String(viewerId)) {
    answer.mine = { show_on_my_work: c.show_on_party_work !== false, show_name_on_links: c.name_on_links === true };
  }
  return answer;
}

/**
 * The credits on one piece that this view sees (sources.creditsFrom already left out what nobody may see): signed
 * and typed for everyone, an ask for the owner and the one asked, "did not confirm" for the owner alone.
 */
function creditsFor(credits, pieceId, { view, viewerId = null, first, now = new Date() }) {
  return (credits || [])
    .filter((c) => String(c.piece_id) === String(pieceId))
    .filter((c) => c.status === 'signed' || c.status === 'said'
      || (c.status === 'asked' && (view === 'owner' || (viewerId && view !== 'link' && String(c.party_user_id) === String(viewerId))))
      || (c.status === 'declined' && view === 'owner'))
    .sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || String(a.created_at).localeCompare(String(b.created_at)))
    .map((c) => ({ raw: c, credit: creditOf(c, { view, first, now, viewerId }) }));
}

/**
 * Who signed, the one who hired first: "Dan R.", "Dan R. and Aiko M.", "Dan R. and 2 others", "someone who hired
 * Maria and 2 others" (a party this view may not name, by what they did).
 */
function signedWords(signed) {
  const ordered = [...signed.filter((c) => c.relation === 'for'), ...signed.filter((c) => c.relation !== 'for')];
  const names = ordered.map((c) => c.party.name || (c.party.did[0].toLowerCase() + c.party.did.slice(1)));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/**
 * One UserPortfolio row as a Piece (CONTRACT P2.1), and the month it marks. Owner fields only for the owner.
 * `credits`: this view's credits on it (creditsFor); a signed one makes a piece without a job or plan Signed.
 */
function pieceOf(row, first, owner, credits = []) {
  const media = (row.media_urls || []).filter(Boolean);
  const files = (row.file_ids || []).length;
  const cards = Array.isArray(row.links) ? row.links.length : [row.external_url, row.github_url, row.demo_url].map(safeUrl).filter(Boolean).length;
  const to = row.source_at ? monthOf(row.source_at) : monthOf(row.completed_at);
  const from = monthOf(row.started_on);
  const month = to || from || monthOf(row.created_at);
  const seen = row.source_kind === 'gig' || row.source_kind === 'plan';
  const signed = credits.map((c) => c.credit || c).filter((c) => c.status === 'signed');
  const by = signed.length ? signedWords(signed) : null;
  const sourceWords = row.source_kind === 'gig' ? 'A paid job on Pantopus' : 'A plan that took place on Pantopus';
  const piece = {
    id: row.id,
    title: row.title,
    kind: KIND_WORD[row.piece_kind] ? row.piece_kind : null,
    when: monthLabel(to || from),
    from,
    to,
    place: null, // set by the composer where the city part reaches the viewer
    cover_url: safeUrl(row.thumbnail_url) || safeUrl(media.find((u) => IMAGE_EXT.test(u))) || null,
    media: {
      photos: media.filter((u) => IMAGE_EXT.test(u)).length,
      videos: media.filter((u) => VIDEO_EXT.test(u)).length,
      // Counted from File by the rows (CONTRACT p2.12: a piece may keep pictures that aren't files); else, as before,
      // file_ids holds every attachment (photos and videos also sit in media_urls) and the rest are documents.
      documents: row.document_count != null ? Number(row.document_count) : Math.max(0, files - media.length),
      links: cards,
    },
    ink: seen ? 'seen' : (by ? 'signed' : 'said'),
    text: row.title,
    how: seen ? `${sourceWords}${by ? `, signed by ${by}` : ''}` : (by ? `Signed by ${by}` : `In ${first}'s words`),
    lane: 'work',
    pinned: row.is_featured === true,
    link: { kind: 'piece', id: row.id },
  };
  if (owner) Object.assign(piece, { audience: row.audience || 'anyone', draft: row.is_draft === true, hidden: row.is_visible === false });
  return { row, month, piece };
}

/**
 * The "With <owner>" ties this viewer may see: all of them for the person and for the piece's owner; for any other
 * signed-in viewer only where the owner's piece opens for them (a public or members-only profile they may find, no
 * block either way, and the owner's Work part and the piece's "who sees it" both reaching them); none on a link view.
 */
function withTiesFor(ctx, list, view) {
  if (view === 'link' || !(list || []).length) return [];
  const viewerId = ctx.viewerId ? String(ctx.viewerId) : null;
  return list.filter((t) => {
    if (!t.piece?.title) return false;
    if (view === 'owner' || (viewerId && String(t.owner_id) === viewerId)) return true;
    const side = t.viewer_side || {};
    if (side.blocked === true || (t.owner_visibility || 'public') === 'private') return false;
    const findable = t.owner_search_visibility || 'everyone';
    if (findable === 'nobody' || (findable === 'mutuals' && side.connected !== true)) return false;
    const ownerView = side.household === true ? 'household' : (side.connected === true ? 'connection' : 'member');
    return reaches(readShare(t.owner_share).parts, 'work', ownerView)
      && reaches({ piece: t.piece.audience || 'anyone' }, 'piece', ownerView);
  });
}

// ---------- roles and schools, and the work circle (phase 2B, CONTRACT P2.6) ----------

function yearsWords(from, to) {
  const fy = from ? String(from).slice(0, 4) : null;
  const ty = to ? String(to).slice(0, 4) : null;
  if (!fy) return null;
  if (!ty) return `${fy} to now`;
  return fy === ty ? fy : `${fy} to ${ty}`;
}

/**
 * A role or school as this view sees it. The owner sees everything, the business named. Others see an asked role as
 * the person's own words with the business unnamed, a signed one with it named (on a link only if the business
 * allowed it), and a typed place named on every view, a link included, as Said: a school or a company isn't a person,
 * and a work history with its places cut out is no use on a link sent for a job (design session, 2026-11-24). A
 * "Not me" never reaches them.
 */
function roleOf(r, { view, first, now = new Date() }) {
  const owner = view === 'owner';
  const typed = !r.party_user_id;
  const biz = r.party || {};
  const signed = r.status === 'signed';
  const named = owner || typed || (signed && (view !== 'link' || r.name_on_links === true));
  const place = typed ? r.party_name : (biz.name || null);
  const title = String(r.role || '').trim();
  let status = r.status;
  let how;
  if (signed) how = named ? `Signed by ${place}` : 'Signed by a business on Pantopus';
  else if (r.status === 'asked' && owner) how = askedWords(r.asked_at, now);
  else if (r.status === 'declined') {
    status = 'did_not_confirm';
    how = 'Did not confirm';
  } else how = `In ${first}'s words`;
  if (!owner && status === 'asked') status = 'said';
  const month = (d) => (d ? String(d).slice(0, 7) : null);
  return line(signed ? 'signed' : 'said', named && place ? `${title} at ${place}` : title,
    [how, yearsWords(r.from_month, r.to_month)].filter(Boolean).join(', '), 'work',
    named && !typed && biz.username ? { kind: 'business', username: biz.username } : null, {
      id: r.id, title, relation: r.relation, from: month(r.from_month), to: month(r.to_month),
      where: named
        ? { name: place, user_id: typed ? null : r.party_user_id, username: typed ? null : (biz.username || null),
          picture_url: typed ? null : (biz.picture_url || null), typed }
        : { name: null, user_id: null, username: null, picture_url: null, typed },
      status,
      // An active owner of the business that signed reads its choice, to change it or take the signature off
      // (PATCH / DELETE /me/ties/:id with this line's id). Nobody else, never on a link view.
      ...(signed && view !== 'link' && view !== 'owner' && r.viewer_owns === true
        ? { mine: { show_name_on_links: r.name_on_links === true } } : {}),
    });
}

// ---------- Known for (phase 3A, CONTRACT P3.2) ----------

const KNOWN_FOR_YEAR = 12;

/** What the writer did with the person, from the record the line is tied to. */
function knownForDid(relation, first) {
  return {
    hired: `hired ${first}`, did_job_for: `did a job for ${first}`, went_to_plan: `went to ${first}'s plan`,
    hosted_plan: `hosted a plan ${first} went to`, train: `helped alongside ${first}`, with: `worked with ${first}`,
    learned: `learned from ${first}`, taught: `taught ${first}`,
  }[relation] || `knows ${first}`;
}

/**
 * One Known-for line as this view sees it. Signed in, the writer is named (writing a line is signing it); on a page
 * opened without signing in, or by a link, only if they ticked "Show my name on pages opened by a link". A job is
 * never named (its title is its poster's words); a piece only where this viewer may open it. The writer's own line
 * says nothing of whether it is shown.
 */
function knownForLineOf(t, { view, first, viewerId = null, openPieces = new Map(), onTop = [] }) {
  const named = view !== 'link' || t.name_on_links === true;
  const shown = t.party_shown || {};
  const did = knownForDid(t.relation, first);
  const when = monthLabel(monthOf(t.from_month)) || monthLabel(monthOf(t.created_at));
  const who = named
    ? { name: shown.name || null, user_id: t.party_user_id, username: shown.username || null, portrait_url: shown.avatar || null, did }
    : { name: null, user_id: null, username: null, portrait_url: null, did: `Someone who ${did}` };
  let tied;
  if (t.relation === 'hired' || t.relation === 'did_job_for') tied = { kind: 'gig', id: null, text: `Tied to a paid job${when ? `, ${when}` : ''}` };
  else if (t.relation === 'went_to_plan' || t.relation === 'hosted_plan') {
    tied = { kind: 'plan', id: null, text: t.plan_title ? `Tied to ${t.plan_title}, a plan that took place` : 'Tied to a plan that took place' };
  } else if (t.relation === 'train') tied = { kind: 'train', id: null, text: 'Tied to a Support Train they both helped on' };
  else if (t.piece_id && openPieces.has(String(t.piece_id))) {
    tied = { kind: 'piece', id: t.piece_id, text: `Tied to the piece ${openPieces.get(String(t.piece_id))}` };
  } else tied = { kind: t.piece_id ? 'piece' : 'role', id: null, text: t.piece_id ? 'Tied to work they did together' : 'Tied to a role they both confirmed' };
  const by = who.name || who.did[0].toLowerCase() + who.did.slice(1);
  const answer = line('signed', t.note, `Written by ${by}${when ? `, ${when}` : ''}`, 'others', null, {
    id: t.id, who, when, tied_to: tied, on_top: onTop.includes(String(t.id)),
  });
  if (viewerId && String(t.party_user_id) === String(viewerId) && view !== 'owner') answer.mine = { take_back: true };
  return answer;
}

/** The lines this view sees on the page: shown ones (on top first, then newest), and a writer's own line. */
function knownForLines(ctx, sources, record, view) {
  const first = ctx.firstName;
  const onTop = (readShare(ctx.share || null).known_for_top || []).map(String);
  const openPieces = new Map(record.pieces.filter((p) => !p.with && !p.row.is_draft && p.row.is_visible !== false).map((p) => [String(p.row.id), p.row.title]));
  const mine = (t) => ctx.viewerId && String(t.party_user_id) === String(ctx.viewerId);
  return (sources.knownFor || []).filter((t) => t.status === 'signed' || (view !== 'owner' && mine(t)))
    .map((t) => knownForLineOf(t, { view, first, viewerId: ctx.viewerId, openPieces, onTop }))
    // The person's "on top" lines first, in the order they chose; then the newest.
    .sort((a, b) => {
      const ra = a.on_top ? onTop.indexOf(String(a.id)) : 99;
      const rb = b.on_top ? onTop.indexOf(String(b.id)) : 99;
      return ra - rb;
    });
}

const CIRCLE_GROUPS = [['taught_or_led', 'Has taught or led'], ['works_beside', 'Works beside'], ['learned_from', 'Learned from']];
// A credit on the person's own piece: `led` → they led them; `learned_from` → they learned from them.
const OWN_GROUP = { led: 'taught_or_led', with: 'works_beside', learned_from: 'learned_from' };
// A piece of someone else's that the person signed: the owner's word, turned round.
const SIGNED_GROUP = { with: 'works_beside', led: 'learned_from', learned_from: 'taught_or_led' };

/**
 * The work circle for this view (board 9): from the pieces this viewer can open (signed credits and typed names on
 * the person's own pieces, and the "With" pieces they signed) and their schools and places they learned. A tie both
 * sides confirmed is Signed, a typed name Said; an ask is never in it. Hiring is only the count under it.
 */
function circleOf(ctx, record) {
  const people = new Map();
  const shared = new Map();
  const add = (group, key, person, ink, pieceId) => {
    const k = `${group}|${key}`;
    const had = people.get(k);
    if (!had) people.set(k, { group, key, person: { ...person, ink }, order: people.size });
    // The same party twice in a group (two roles at one business): the signed one's words stand.
    else if (ink === 'signed' && had.person.ink !== 'signed') had.person = { ...person, ink };
    if (pieceId) {
      if (!shared.has(key)) shared.set(key, new Set());
      shared.get(key).add(String(pieceId));
    }
  };
  const first = ctx.firstName;
  const live = record.pieces.filter((p) => !p.row.is_draft && p.row.is_visible !== false);
  for (const p of live) {
    if (p.with) {
      const t = p.tie;
      const group = SIGNED_GROUP[t.relation];
      if (!group) continue;
      const o = t.owner_shown || {};
      add(group, `u:${t.owner_id}`, { kind: 'person', name: o.name || null, user_id: t.owner_id, username: o.username || null,
        portrait_url: o.avatar || null, did: String(t.piece.owner_role || '').trim() || `Worked with ${first}` }, 'signed', p.row.id);
      continue;
    }
    for (const { raw, credit } of p.credits || []) {
      if (credit.status !== 'signed' && credit.status !== 'said') continue;
      const group = OWN_GROUP[raw.relation];
      if (!group) continue;
      const key = raw.party_user_id ? `u:${raw.party_user_id}` : `t:${String(raw.party_name).toLowerCase()}`;
      // Credits name people only (a business is never credited on a piece), typed or on Pantopus.
      add(group, key, { kind: 'person', name: credit.party.name, user_id: credit.party.user_id, username: credit.party.username,
        portrait_url: credit.party.portrait_url, did: credit.role || credit.party.did }, credit.ink, p.row.id);
    }
  }
  for (const r of record.roles || []) {
    if (r.relation !== 'learned' || r.status === 'did_not_confirm') continue;
    const key = r.where.user_id ? `u:${r.where.user_id}` : `r:${r.id}`;
    // A business on Pantopus is one only where this view may know it (named, or signed: "Signed by a business on
    // Pantopus"); a typed place, or a business still asked and unnamed here, is a place.
    const kind = !r.where.typed && (r.where.name || r.ink === 'signed') ? 'business' : 'place';
    add('learned_from', key, { kind, name: r.where.name, user_id: r.where.user_id, username: r.where.username,
      portrait_url: r.where.picture_url, did: [r.title, yearsWords(r.from, r.to)].filter(Boolean).join(', '), place: true }, r.ink, null);
  }
  return CIRCLE_GROUPS.map(([key, title]) => {
    const list = [...people.values()].filter((p) => p.group === key)
      .map((p) => ({ ...p.person, shared_pieces: shared.get(p.key)?.size || 0, _order: p.order }))
      .sort((a, b) => (a.ink === b.ink ? 0 : a.ink === 'signed' ? -1 : 1) || b.shared_pieces - a.shared_pieces || a._order - b._order)
      .map(({ _order, place, ...person }) => (place ? { ...person, _place: true } : person));
    return { key, title, people: list };
  }).filter((g) => g.people.length);
}

/**
 * "Hired by 14 households and 2 businesses": the people and businesses whose paid jobs the person completed, counted
 * once each, Seen. Households are counted, never named. Null when there are none.
 */
function hiredBy(paidJobs) {
  const households = new Set();
  const businesses = new Set();
  for (const job of paidJobs || []) {
    if (!job.poster_id) continue;
    (job.poster_type === 'business' ? businesses : households).add(String(job.poster_id));
  }
  if (!households.size && !businesses.size) return null;
  const parts = [households.size ? plural(households.size, 'household', 'households') : null,
    businesses.size ? plural(businesses.size, 'business', 'businesses') : null].filter(Boolean);
  return line('seen', `Hired by ${parts.join(' and ')}`, 'Pantopus\'s own records. Households are counted, never named.', 'work', null);
}

// ---------- the record: every line, its part and its months ----------

/**
 * Builds every line the person's rows give, each tagged with the parts it needs and where it goes. Nothing is
 * filtered by view here; `forView` filters.
 *   entries: { id, parts: [..], place: 'key'|'record_home'|..., line }
 *   months:  { lane, month, level, parts: [..] }   (one per month a line marks)
 *   events:  { month, parts, line }                (what happened in a month, for the month read)
 */
function buildRecord(ctx, sources, { now }) {
  const first = ctx.firstName;
  const nowMonth = monthOf(now);
  const entries = [];
  const months = [];
  const events = [];
  const mark = (lane, monthList, ink, parts) => {
    for (const month of monthList) {
      if (month && month <= nowMonth) months.push({ lane, month, level: INK_LEVEL[ink], parts });
    }
  };

  // Home verified (seen).
  const homes = (sources.homes || []).slice(0, 3);
  homes.forEach((home, i) => {
    const vm = monthOf(home.verified_at);
    const how = {
      mail: 'By mail', owner: 'As its verified owner', fast_phone: 'By a phone check', fast_location: 'By a check at home',
      fast_document: 'By a document',
    }[home.source] || 'By Pantopus';
    const cityLabel = home.city ? [home.city, home.state].filter(Boolean).join(', ') : null;
    const make = (withCity) => line('seen', withCity && cityLabel ? `Home verified in ${cityLabel}` : 'Home verified',
      vm ? `${how}, ${monthLabel(vm)}` : how, 'home', vm ? { kind: 'month', month: vm } : null);
    entries.push({ id: `home_${i}`, parts: ['record_home'], place: 'record_home', make, cityAware: true });
    if (i === 0) entries.push({ id: 'key_home', parts: ['record_home'], place: 'key', make, cityAware: true, rank: 0 });
    mark('home', monthsBetween(vm, nowMonth), 'seen', ['record_home']);
    if (vm) events.push({ month: vm, parts: ['record_home'], make, cityAware: true });
    // Every later month it lights shows it too, so a lit month never opens empty (rule 4.3).
    const since = (withCity) => line('seen', withCity && cityLabel ? `Home verified in ${cityLabel}` : 'Home verified',
      `Since ${monthLabel(vm)}`, 'home', { kind: 'month', month: vm });
    for (const m of monthsBetween(vm, nowMonth).slice(1)) events.push({ month: m, parts: ['record_home'], make: since, cityAware: true });
  });

  // A business they own (seen): Record's Work lines, the first tab's key lines and Work's Owns.
  (sources.businesses || []).forEach((biz, i) => {
    const sm = monthOf(biz.since);
    const ln = line('seen', `Owns ${biz.name}`, sm ? `A verified business on Pantopus since ${monthLabel(sm)}` : 'A verified business on Pantopus',
      'work', biz.username ? { kind: 'business', username: biz.username } : null);
    entries.push({ id: `biz_${i}`, parts: ['record_work'], place: 'record_work', line: ln, order: 0 });
    entries.push({ id: `owns_biz_${i}`, parts: ['work'], place: 'owns', line: { ...ln, badge: { initials: initials(biz.name), picture_url: biz.picture_url } }, order: 0 });
    if (i === 0) entries.push({ id: 'key_biz', parts: ['record_work'], place: 'key', line: ln, rank: 2 });
    mark('work', monthsBetween(sm, nowMonth), 'seen', ['record_work']);
    if (sm) events.push({ month: sm, parts: ['record_work'], line: line('seen', `Began ${biz.name}`, 'A verified business on Pantopus', 'work', ln.link) });
    const owning = line('seen', `Owns ${biz.name}`, `Since ${monthLabel(sm)}`, 'work', ln.link);
    for (const m of monthsBetween(sm, nowMonth).slice(1)) events.push({ month: m, parts: ['record_work'], line: owning });
  });

  // Paid jobs completed (seen).
  const jobs = sources.paidJobs || [];
  if (jobs.length) {
    const jobMonths = jobs.map((j) => monthOf(j.owner_confirmed_at || j.worker_completed_at || j.updated_at));
    entries.push({ id: 'paid_jobs', parts: ['record_work'], place: 'record_work', order: 1,
      line: line('seen', `${plural(jobs.length, 'paid job', 'paid jobs')} completed`, rangeLabel(jobMonths), 'work', null) });
    mark('work', jobMonths, 'seen', ['record_work']);
    const byMonth = {};
    for (const m of jobMonths) if (m) byMonth[m] = (byMonth[m] || 0) + 1;
    for (const [m, n] of Object.entries(byMonth)) {
      events.push({ month: m, parts: ['record_work'], line: line('seen', `Completed ${plural(n, 'paid job', 'paid jobs')}`, 'Pantopus\'s own records', 'work', null) });
    }
  }

  // Certifications: signed when checked, said otherwise.
  (sources.certifications || []).forEach((cert, i) => {
    const im = monthOf(cert.issue_date);
    const em = monthOf(cert.expiry_date);
    let ln;
    if (cert.is_verified) {
      // Nothing records who checked a certification or with whom, so the line says only that Pantopus verified it.
      ln = line('signed', cert.certification_name, em ? `Verified by Pantopus, good through ${monthLabel(em)}` : 'Verified by Pantopus', 'work', null);
    } else {
      const bits = [cert.certification_name, cert.issuing_organization, im ? im.slice(0, 4) : null].filter(Boolean);
      ln = line('said', `${bits.join(', ')}.`, `In ${first}'s words`, 'work', null);
    }
    entries.push({ id: `cert_${i}`, parts: ['record_work'], place: 'record_work', line: ln, order: cert.is_verified ? 2 : 4 });
    entries.push({ id: `owns_cert_${i}`, parts: ['work'], place: 'owns', line: { ...ln, badge: null }, order: 1 });
    if (cert.is_verified && !entries.some((e) => e.id === 'key_cert')) {
      entries.push({ id: 'key_cert', parts: ['record_work'], place: 'key', line: ln, rank: 1 });
    }
    const cm = im || monthOf(cert.created_at);
    mark('work', [cm], cert.is_verified ? 'signed' : 'said', ['record_work']);
    if (cm) events.push({ month: cm, parts: ['record_work'], line: ln });
  });

  // A verified professional profile (signed).
  if (sources.professional) {
    const pm = monthOf(sources.professional.verification_completed_at);
    const ln = line('signed', 'Verified professional on Pantopus', pm ? `Checked ${monthLabel(pm)}` : 'Checked', 'work', null);
    entries.push({ id: 'professional', parts: ['record_work'], place: 'record_work', line: ln, order: 3 });
    mark('work', [pm], 'signed', ['record_work']);
    if (pm) events.push({ month: pm, parts: ['record_work'], line: ln });
  }

  // Reviews with words (signed), in Work under the `reviews` part.
  (sources.reviews?.rows || []).forEach((review, i) => {
    const rm = monthOf(review.created_at);
    const did = { hired: `hired ${first}`, worked_for: `did a job for ${first}` }[review.role] || `worked with ${first}`;
    // Signed in: the writer by name (their page opens from `who`) and the job the line opens. A link: by what they did.
    const make = (linkView) => {
      const named = !linkView && review.reviewer_name;
      const by = named ? review.reviewer_name : `someone who ${did}`;
      return line('signed', String(review.comment).trim().slice(0, 500), `Written by ${by}${rm ? `, ${monthLabel(rm)}` : ''}`, 'work',
        !linkView && review.gig_id ? { kind: 'gig', id: review.gig_id } : null, {
          who: named
            ? { name: review.reviewer_name, user_id: review.reviewer_id, username: review.reviewer_username, portrait_url: review.reviewer_avatar, did }
            : { name: null, user_id: null, username: null, portrait_url: null, did: `Someone who ${did}` },
          when: rm ? monthLabel(rm) : null,
        });
    };
    entries.push({ id: `review_${i}`, parts: ['reviews'], place: 'reviews', make, linkAware: true });
    mark('work', [rm], 'signed', ['record_work', 'reviews']);
    if (rm) events.push({ month: rm, parts: ['reviews'], make, linkAware: true });
  });

  // With others (seen).
  const plans = sources.plansHosted || [];
  if (plans.length) {
    const pms = plans.map((p) => monthOf(p.ended_at || p.updated_at));
    entries.push({ id: 'plans', parts: ['record_others'], place: 'others', order: 0,
      line: line('seen', `Hosted ${plural(plans.length, 'plan', 'plans')} that took place`, `Pantopus's own records, ${yearsLabel(pms)}`, 'others', null) });
    mark('others', pms, 'seen', ['record_others']);
    const byMonth = {};
    for (const m of pms) if (m) byMonth[m] = (byMonth[m] || 0) + 1;
    for (const [m, n] of Object.entries(byMonth)) {
      events.push({ month: m, parts: ['record_others'], line: line('seen', `Hosted ${plural(n, 'plan', 'plans')} that took place`, 'Pantopus\'s own records', 'others', null) });
    }
  }
  const trains = sources.supportTrains || [];
  const trainIds = new Set(trains.map((t) => t.support_train_id));
  if (trainIds.size) {
    const tms = trains.map((t) => monthOf(t.slot?.slot_date || t.created_at));
    entries.push({ id: 'trains', parts: ['record_others'], place: 'others', order: 1,
      line: line('seen', `Helped on ${plural(trainIds.size, 'Support Train', 'Support Trains')}`, `Pantopus's own records, ${yearsLabel(tms)}`, 'others', null) });
    mark('others', tms, 'seen', ['record_others']);
    for (const m of new Set(tms)) {
      if (m) events.push({ month: m, parts: ['record_others'], line: line('seen', 'Helped on a Support Train', 'Pantopus\'s own records', 'others', null) });
    }
  }
  const helpful = sources.helpful;
  if (helpful && helpful.count > 0) {
    const hms = helpful.months.map(monthOf);
    const make = (linkView) => line('seen', `${plural(helpful.count, 'Helpful mark', 'Helpful marks')} on ${first}'s posts`,
      'Pantopus\'s own records', 'others', linkView ? null : { kind: 'posts', user_id: ctx.userData.id });
    entries.push({ id: 'helpful', parts: ['record_others'], place: 'others', order: 2, make, linkAware: true });
    mark('others', hms, 'seen', ['record_others']);
    const byMonth = {};
    for (const m of hms) if (m) byMonth[m] = (byMonth[m] || 0) + 1;
    for (const [m, n] of Object.entries(byMonth)) {
      events.push({ month: m, parts: ['record_others'], line: line('seen', `${plural(n, 'Helpful mark', 'Helpful marks')} on ${first}'s posts`, 'Pantopus\'s own records', 'others', null) });
    }
  }

  // Work: pieces (SPEC phase 2A) and Can do counted from them. A piece reaches a viewer when its own "who sees it"
  // does (the Work part is checked by the composer); hidden and draft pieces come only for the owner (sources.js).
  // A caller that forgets the view gets the narrowest one, so it can only show less.
  const viewOf = ctx.view || 'link';
  const creditsOf = (id) => creditsFor(sources.credits, id, { view: viewOf, viewerId: ctx.viewerId, first, now });
  const pieces = (sources.pieces || []).filter((row) => row.title && reaches({ piece: row.audience || 'anyone' }, 'piece', viewOf))
    .map((row) => {
      const credits = creditsOf(row.id);
      return { ...pieceOf(row, first, viewOf === 'owner', credits), credits };
    });
  // "With <owner>" (phase 2B): a piece of someone else's that this person signed and shows on their Work, kept once
  // (the owner's piece, never a copy), only where this viewer may open the owner's piece; Signed in this person's
  // record. Never on a page opened without signing in: the owner never allowed their name there.
  for (const t of withTiesFor(ctx, sources.withTies, viewOf)) {
    const ownerName = t.owner_shown?.name || null;
    const base = pieceOf(t.piece, firstWord(ownerName) || 'them', false);
    const username = t.owner_shown?.username || null;
    pieces.push({
      row: t.piece,
      month: base.month,
      with: true,
      tie: t,
      piece: {
        ...base.piece, ink: 'signed', how: ownerName ? `With ${ownerName}` : 'Signed together', pinned: false,
        link: { kind: 'piece', id: t.piece.id, user_id: t.owner_id, username },
        with: { name: ownerName, user_id: t.owner_id, username },
        // The signer's own view: the tie to change or take off, and their choices (shown here, so on their Work).
        ...(viewOf === 'owner' ? { tie_id: t.id, mine: { show_on_my_work: true, show_name_on_links: t.name_on_links === true } } : {}),
      },
    });
  }
  for (const p of pieces) {
    if (p.row.is_draft || p.row.is_visible === false) continue;
    mark('work', [p.month], p.piece.ink, ['record_work', 'work']);
    if (p.month) events.push({ month: p.month, parts: ['work'], line: line(p.piece.ink, p.piece.title, p.piece.how, 'work', p.piece.link) });
  }
  // Can do: every skill named on a piece this viewer can open (five a piece at most), and each skill the person
  // listed; a listed skill with no piece stays a Said line, as in phase 1.
  // Skills are the owner's words about their own pieces: a "With" piece adds none to this person's.
  const shown = pieces.filter((p) => !p.with && !p.row.is_draft && p.row.is_visible !== false);
  const skillPieces = new Map();
  for (const p of shown) {
    for (const raw of (p.row.skills_used || []).slice(0, 5)) {
      const name = String(raw || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!skillPieces.has(key)) skillPieces.set(key, { name, pieces: [] });
      skillPieces.get(key).pieces.push(p);
    }
  }
  const listed = new Map((sources.skills || []).map((skill) => [String(skill.skill_name || '').trim().toLowerCase(), skill]));
  const names = [...new Set([...listed.keys(), ...skillPieces.keys()])].filter(Boolean);
  const skills = names.map((key) => {
    const skill = listed.get(key);
    const fromPieces = skillPieces.get(key)?.pieces || [];
    const name = skill ? String(skill.skill_name).trim() : skillPieces.get(key).name;
    const n = fromPieces.length;
    const inks = { seen: 0, signed: 0, said: 0 };
    for (const p of fromPieces) inks[p.piece.ink] += 1;
    const vm = monthOf(skill?.verified_at);
    // A skill's line takes the weakest ink it depends on: confirmed (Signed) only when someone confirmed it.
    const ink = skill?.is_verified ? 'signed' : (n && inks.said === 0 && inks.signed === 0 ? 'seen' : (n && inks.said === 0 ? 'signed' : 'said'));
    let how;
    if (skill?.is_verified) how = `Confirmed${vm ? ` ${monthLabel(vm)}` : ''}${n ? `, ${plural(n, 'piece', 'pieces')}` : ''}`;
    else how = n ? plural(n, 'piece', 'pieces') : `In ${first}'s words, no pieces yet`;
    if (skill) {
      const sm = skill.is_verified ? (vm || monthOf(skill.created_at)) : monthOf(skill.created_at);
      mark('work', [sm], skill.is_verified ? 'signed' : 'said', ['record_work', 'work']);
      if (sm) events.push({ month: sm, parts: ['work'], line: line(skill.is_verified ? 'signed' : 'said', name, how, 'work', null) });
    }
    return line(ink, name, how, 'work', null, { name, pieces: n, inks });
  }).sort((a, b) => b.pieces - a.pieces);

  // "Tools she brings": one Said line on Owns.
  const tools = String(sources.tools || '').trim();
  if (tools) {
    entries.push({ id: 'owns_tools', parts: ['work'], place: 'owns', order: 2,
      line: line('said', `Tools: ${tools}`, `In ${first}'s words`, 'work', null, { badge: null }) });
  }

  // Known for (phase 3A): each shown line marks its month Signed on the "with others" lane and is a Record line.
  for (const t of (sources.knownFor || []).filter((k) => k.status === 'signed')) {
    const km = monthOf(t.from_month) || monthOf(t.created_at);
    mark('others', [km], 'signed', ['known_for']);
    const did = knownForDid(t.relation, first);
    entries.push({ id: `known_for_${t.id}`, parts: ['known_for', 'record_others'], place: 'others', order: 3,
      make: (linkOnly) => line('signed', t.note, `Written by ${(!linkOnly || t.name_on_links) && t.party_shown?.name ? t.party_shown.name
        : `someone who ${did}`}${km ? `, ${monthLabel(km)}` : ''}`, 'others', null), linkAware: true });
    if (km) events.push({ month: km, parts: ['known_for'], line: line('signed', t.note, `A line about ${first}`, 'others', null) });
  }

  // Roles and schools (phase 2B): lines only, no months (a six-year role would fill the rings).
  const roles = (sources.roles || []).map((r) => roleOf(r, { view: viewOf, first, now }));
  roles.forEach((ln, i) => entries.push({ id: `role_${i}`, parts: ['record_work'], place: 'record_work', order: 5, line: ln }));

  return { entries, months, events, pieces, skills, roles };
}

const SOCIAL_LINKS = [['website', 'Website'], ['linkedin', 'LinkedIn'], ['twitter', 'X'], ['instagram', 'Instagram'], ['facebook', 'Facebook']];

function socialLinkLines(socialLinks, first) {
  if (!socialLinks || typeof socialLinks !== 'object') return [];
  return SOCIAL_LINKS
    .map(([key, label]) => [label, safeUrl(socialLinks[key])])
    .filter(([, url]) => url)
    .map(([label, url]) => line('said', label, `${first}'s own link`, null, { kind: 'url', url, site: hostOf(url) }));
}

// ---------- per view ----------

function ringsFor(monthsList, now) {
  const nowMonth = monthOf(now);
  const nowYear = Number(nowMonth.slice(0, 4));
  const byLane = { home: new Map(), work: new Map(), others: new Map() };
  let firstYear = null;
  for (const { lane, month, level } of monthsList) {
    const prev = byLane[lane].get(month) || 0;
    if (level > prev) byLane[lane].set(month, level);
    const y = Number(month.slice(0, 4));
    if (firstYear === null || y < firstYear) firstYear = y;
  }
  const from = firstYear || nowYear;
  const strings = {};
  for (const lane of Object.keys(byLane)) {
    strings[lane] = [];
    for (let y = from; y <= nowYear; y += 1) {
      let s = '';
      for (let m = 1; m <= 12; m += 1) s += String(byLane[lane].get(`${y}-${String(m).padStart(2, '0')}`) || 0);
      strings[lane].push(s);
    }
  }
  let seen = 0; let signed = 0; let said = 0;
  for (let yi = 0; yi < strings.home.length; yi += 1) {
    for (let m = 0; m < 12; m += 1) {
      const top = Math.max(+strings.home[yi][m], +strings.work[yi][m], +strings.others[yi][m]);
      if (top === 3) seen += 1; else if (top === 2) signed += 1; else if (top === 1) said += 1;
    }
  }
  return { from, strings, summary: { years: nowYear - from + 1, seen_months: seen, signed_months: signed, said_months: said } };
}

/** Which parts have something in them (the share read's has_content, and more_closer). */
function partContent(ctx, record) {
  const has = (place) => record.entries.some((e) => e.place === place);
  return {
    says: Boolean(String(ctx.shown.bio || '').trim()),
    prompts: ctx.prompts.length > 0,
    shelf: (ctx.shelf || []).length > 0,
    city: Boolean(ctx.placeLabel || ctx.homePlaceLabel),
    work: record.pieces.length > 0 || record.skills.length > 0 || has('owns'),
    known_for: record.entries.some((e) => String(e.id).startsWith('known_for_')),
    record_work: has('record_work'),
    record_home: has('record_home'),
    record_others: has('others'),
    met: false,
    doors: false,
    reviews: has('reviews'),
  };
}

function composePage(ctx, sources, extras, { now = new Date() } = {}) {
  const { view, parts } = ctx;
  const on = (part) => reaches(parts, part, view);
  const record = extras.record || buildRecord(ctx, sources, { now });
  const linkView = view === 'link';
  const homeStandsIn = !ctx.placeLabel && ctx.homePlaceLabel && on('record_home');
  const placeLabel = ctx.placeLabel || (homeStandsIn ? ctx.homePlaceLabel : null);
  const placeState = ctx.placeLabel ? ctx.placeState : (homeStandsIn ? ctx.homePlaceState : null);
  const cityShown = Boolean(placeLabel) && on('city') && ctx.cityByPrivacy;
  const cityOk = on('city') && ctx.cityByPrivacy;
  const visible = (entry) => entry.parts.every(on);
  const lineOf = (entry) => {
    if (entry.make) return entry.make(entry.cityAware ? cityOk : linkView);
    return entry.line;
  };
  const shownEntries = (place) => record.entries
    .filter((e) => e.place === place && visible(e))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(lineOf);

  // Rings: lanes whose record part reaches the view, and of their months only those whose parts all reach it.
  const shownMonths = record.months.filter((m) => on(LANE_PART[m.lane]) && m.parts.every(on));
  const rings = ringsFor(shownMonths, now);
  const nowDate = localDate(now, PACIFIC);

  // Header place.
  let place = null;
  if (cityShown) {
    const tz = STATE_TZ[String(placeState || '').toUpperCase()] || null;
    const clock = tz ? localClock(now, tz) : { time: null, sky: null };
    place = { label: placeLabel, tz, time: clock.time, sky: clock.sky };
  }

  const header = {
    user_id: ctx.userData.id,
    username: ctx.username,
    name: ctx.displayName,
    account_name: view === 'owner' ? ctx.accountName : null,
    first_name: ctx.firstName,
    headline: String(ctx.shown.tagline || '').trim() || null,
    portrait_url: ctx.shown.profile_picture_url || null,
    seen_as: {
      owner: 'This is your page', household: 'Seen as someone you live with', connection: 'Seen as a connection',
      member: 'Seen as someone on Pantopus', link: null,
    }[view],
    place,
    rings: { from: rings.from, now: nowDate, home: rings.strings.home, work: rings.strings.work, others: rings.strings.others },
  };

  // ---- person tab ----
  // What the person's own app can't show yet comes first: one `notice` each (index.noticesFor; owner only).
  const person = [...(view === 'owner' ? (ctx.notices || []) : [])];
  // The person's own view: lines waiting for "Show it" or "Keep it hidden" (phase 3A).
  if (view === 'owner' && sources.knownForOn) {
    const onTop = (readShare(ctx.share || null).known_for_top || []).map(String);
    const waiting = (sources.knownFor || []).filter((t) => t.status === 'asked')
      .map((t) => ({ ...knownForLineOf(t, { view, first: ctx.firstName, onTop }), status: 'waiting' }));
    if (waiting.length) person.push({ kind: 'lines_for_you', id: 'lines_for_you', title: 'Lines for you', lines: waiting });
  }
  const keyLines = record.entries.filter((e) => e.place === 'key' && visible(e)).sort((a, b) => a.rank - b.rank).map(lineOf).slice(0, 3);
  if (keyLines.length) person.push({ kind: 'lines', id: 'key_lines', title: null, lines: keyLines, more: null });
  const bio = String(ctx.shown.bio || '').trim();
  if (bio && on('says')) {
    person.push({ kind: 'says', id: 'says', title: 'Says', line: line('said', bio, `In ${ctx.firstName}'s words`, null, null) });
  }
  // Known for (phase 3A): shown lines where the part reaches the view; a writer's own line; and "Write a line" for
  // someone who shares a record with the person (and nobody else).
  if (sources.knownForOn && on('known_for')) {
    const kLines = knownForLines(ctx, sources, record, view);
    const w = sources.knownForWriter;
    const hasLive = kLines.some((l) => l.mine);
    const write = w && w.sharesRecord && !ctx.blockedEitherWay && !hasLive && readShare(ctx.share || null).known_for_enabled
      ? { text: `Write a line about ${ctx.firstName}`, left_this_year: Math.max(0, KNOWN_FOR_YEAR - w.linesThisYear), of: KNOWN_FOR_YEAR,
        link: { kind: 'known_for_write' } } : null;
    if (kLines.length || write) {
      person.push({
        kind: 'known_for', id: 'known_for', title: 'Known for', lines: kLines.slice(0, 2),
        more: kLines.length > 2 ? { text: `All ${kLines.length} lines`, link: { kind: 'known_for' } } : null, write,
      });
    }
  }
  if (extras.inCommon && ['member', 'connection', 'household'].includes(view)) {
    const ic = extras.inCommon;
    if (ic.connections?.count > 0 || ic.plans?.length || ic.support_trains?.length || ic.skills?.length) {
      person.push({ kind: 'in_common', id: 'in_common', title: `You and ${ctx.firstName}`, ...ic });
    }
  }
  if (view === 'member') {
    const content = partContent(ctx, record);
    const closer = Object.keys(content).some((part) => content[part] && parts[part] === 'connections')
      || (content.city && on('city') && ctx.cityLimit === 'connections');
    if (closer) {
      person.push({
        kind: 'more_closer', id: 'more_closer', title: `${ctx.firstName} shows more to connections`,
        text: `${ctx.firstName}'s connections see more of this page.`,
        action: ctx.relationship === 'none' ? { kind: 'connect' } : null,
      });
    }
  }
  // The shelf (phase 3C), only when it holds something, the owner's view included: `shelf` is a v1 block kind that a
  // released app may draw, so it never arrives empty. The owner's own screens offer "Add" from GET /me/shelf.
  const shelf = ctx.shelf || [];
  if (shelf.length && (view === 'owner' || on('shelf'))) {
    person.push({
      kind: 'shelf', id: 'shelf', title: `On ${ctx.firstName}'s shelf`,
      objects: shelf.map((o) => ({ id: o.id, picture_url: o.picture_url, caption: o.caption, ink: 'said' })),
    });
  }
  if (ctx.prompts.length && on('prompts')) {
    person.push({
      kind: 'prompts', id: 'prompts', title: `Get to know ${ctx.firstName}`,
      prompts: ctx.prompts.map((p) => line('said', p.answer, `In ${ctx.firstName}'s words`, null, null, { key: p.key, answer: p.answer })),
    });
  }
  if (!linkView && sources.pinned) {
    person.push({ kind: 'pinned_posts', id: 'pinned_posts', title: 'Pinned', user_id: ctx.userData.id,
      source: `/api/posts/user/${ctx.userData.id}/pinned` });
  }
  const others = shownEntries('others');
  if (others.length) person.push({ kind: 'lines', id: 'with_others', title: 'With others', lines: others, more: null });
  // The person's own links (Edit profile's website and social links), to signed-in views only: never on a link.
  if (!linkView) {
    const links = socialLinkLines(ctx.userData.social_links, ctx.firstName);
    if (links.length) person.push({ kind: 'lines', id: 'links', title: 'Links', lines: links, more: null });
  }
  if (!linkView) {
    // Moments: only when the person has a live Moment this viewer may see (index.momentsFor); the count is of those
    // on the map, and only when there are some.
    const moments = extras.moments;
    person.push({ kind: 'rows', id: 'rows', title: null, rows: [
      ...(moments ? [{ key: 'moments', title: 'Moments', detail: moments.placed ? `${moments.placed} on the map` : null,
        link: { kind: 'moments', user_id: ctx.userData.id } }] : []),
      { key: 'posts', title: 'Posts in Pulse', detail: null, link: { kind: 'posts', user_id: ctx.userData.id } },
    ] });
  }

  // ---- work tab ----
  const work = [];
  if (on('work')) {
    if (record.skills.length) {
      work.push({ kind: 'can_do', id: 'can_do', title: 'Can do', subtitle: `Counted from ${ctx.firstName}'s pieces`, skills: record.skills });
    }
    // A piece's city only where the city part reaches this viewer (never an address).
    // A "With" piece is someone else's: no city from it here.
    const withPlace = (p) => ({ ...p.piece, place: !p.with && cityOk && p.row.place_city ? [p.row.place_city, p.row.place_state].filter(Boolean).join(', ') : null });
    const live = record.pieces.filter((p) => !p.row.is_draft && p.row.is_visible !== false);
    const pinned = live.filter((p) => !p.with && p.row.is_featured).slice(0, 3);
    // The owner's list also carries their drafts and hidden pieces (marked); nobody else's does.
    // `all` is EVERY piece this viewer can open, pinned ones included (each carries `pinned`; the rows hold up to 80), so
    // a year's chip count equals its dots and its list (board 7); nothing is cut.
    const rest = record.pieces;
    const kindsHere = ['did', 'built', 'owns'].filter((k) => live.some((p) => p.piece.kind === k));
    const filters = kindsHere.length ? ['all', ...kindsHere] : null;
    if (pinned.length) {
      work.push({ kind: 'pieces', id: 'pinned', title: `Pinned by ${ctx.firstName}`, style: 'pinned', subtitle: `${pinned.length} of 3`,
        pieces: pinned.map(withPlace), filters: null, more: null });
    }
    // The work line of this tab: its pieces and skills (the `work` part), whether or not record_work is on.
    const workMonths = record.months.filter((m) => m.lane === 'work' && m.parts.includes('work'));
    if (live.length) {
      const wr = ringsFor(workMonths, now);
      const perYear = {};
      for (const p of live) if (p.month) perYear[p.month.slice(0, 4)] = (perYear[p.month.slice(0, 4)] || 0) + 1;
      work.push({
        kind: 'work_rings', id: 'work_rings', title: `${plural(wr.summary.years, 'year', 'years')} of work`,
        from: wr.from, now: nowDate, months: wr.strings.work,
        dots: live.filter((p) => p.month).map((p) => ({ piece_id: p.row.id, month: p.month, ink: p.piece.ink })),
        years: Object.entries(perYear).sort((a, b) => b[0].localeCompare(a[0])).map(([year, n]) => ({ year: Number(year), pieces: n })),
      });
    }
    if (rest.length) {
      work.push({ kind: 'pieces', id: 'all', title: pinned.length ? 'All pieces' : 'Pieces', style: 'list', subtitle: null,
        pieces: rest.map(withPlace), filters, more: null });
    }
    // The work circle and "Worked and learned" (phase 2B); none after the emergency off PROFILE_TIES=0.
    if (sources.tiesOn) {
      const circle = circleBlock(ctx, record, sources, on);
      if (circle) work.push(circle);
      if (record.roles.length) work.push({ kind: 'lines', id: 'worked_learned', title: 'Worked and learned', lines: record.roles, more: null });
    }
    const owns = shownEntries('owns');
    if (owns.length) work.push({ kind: 'owns', id: 'owns', title: 'Owns', lines: owns });
  }
  const reviews = shownEntries('reviews');
  if (reviews.length) work.push({ kind: 'lines', id: 'reviews', title: 'Reviews', lines: reviews, more: null });

  // ---- record tab ----
  const recordTab = [];
  const chartLanes = ['home', 'work', 'others'].filter((lane) => on(LANE_PART[lane]) && rings.strings[lane].some((s) => /[123]/.test(s)));
  if (chartLanes.length) {
    recordTab.push({
      kind: 'record_chart', id: 'record_chart', title: `${plural(rings.summary.years, 'year', 'years')} on record`,
      subtitle: `${rings.from} to today`, from: rings.from, now: nowDate,
      lanes: chartLanes.map((lane) => ({ lane, months: rings.strings[lane] })),
      note: `The centre is ${rings.from} and the outer ring is this year. Open a ring to see what happened in it.`,
      as_of: nowDate,
    });
  }
  for (const [id, title, place] of [['record_home', 'Home', 'record_home'], ['record_work', 'Work', 'record_work'], ['record_others', 'With others', 'others']]) {
    const lines = shownEntries(place);
    if (lines.length) recordTab.push({ kind: 'lines', id, title, lines, more: null });
  }

  const tabs = [
    { key: 'person', title: ctx.firstName, blocks: person },
    { key: 'work', title: 'Work', blocks: work },
    { key: 'record', title: 'Record', blocks: recordTab },
  ].filter((tab) => tab.blocks.length);

  // ---- actions ----
  const shareUrl = ctx.shareUrl;
  const actions = [];
  if (view === 'owner') {
    actions.push({ kind: 'edit' }, { kind: 'preview_as', views: ['link', 'member', 'connection'] }, { kind: 'share', url: shareUrl });
  } else if (view !== 'link') {
    if (view === 'member' || (view === 'household' && ctx.relationship !== 'connected')) {
      if (ctx.relationship !== 'blocked') {
        const state = { pending_sent: 'requested', pending_received: 'incoming' }[ctx.relationship] || 'none';
        if (ctx.relationship !== 'connected') actions.push({ kind: 'connect', state });
      }
    }
    if (ctx.canMessage || view === 'household' || view === 'connection') actions.push({ kind: 'message' });
    if (view === 'household' || view === 'connection') {
      if (ctx.userData.show_phone && ctx.userData.phone_number) actions.push({ kind: 'call', phone: ctx.userData.phone_number });
      if (ctx.userData.show_email && ctx.userData.email) actions.push({ kind: 'email', email: ctx.userData.email });
    }
    actions.push({ kind: 'share', url: shareUrl });
  }

  return {
    v: 1,
    view,
    // Never listed: a profile that isn't public (founder, item 9.5).
    listed: Boolean(ctx.searchEngines) && (ctx.userData.profile_visibility || 'public') === 'public',
    header,
    summary: rings.summary,
    tabs,
    actions,
    footer: linkView ? { text: `${ctx.firstName} chose what this page shows.`, as_of: nowDate } : null,
  };
}

/** GET …/month/:month: what happened that month, from parts that reach the view. Null when nothing. */
function composeMonth(ctx, record, month) {
  const on = (part) => reaches(ctx.parts, part, ctx.view);
  const cityOk = on('city') && ctx.cityByPrivacy;
  const linkView = ctx.view === 'link';
  const lines = record.events
    .filter((e) => e.month === month && e.parts.every(on))
    .map((e) => (e.make ? e.make(e.cityAware ? cityOk : linkView) : e.line));
  if (!lines.length) return null;
  const counts = { seen: 0, signed: 0, said: 0 };
  for (const l of lines) counts[l.ink] += 1;
  const mix = ['seen', 'signed', 'said'].filter((ink) => counts[ink]).map((ink) => `${counts[ink]} ${ink}`);
  const mixText = mix.length > 1 ? `${mix.slice(0, -1).join(', ')} and ${mix[mix.length - 1]}` : mix[0];
  return {
    v: 1,
    view: ctx.view,
    month,
    title: monthLabel(month),
    subtitle: `${plural(lines.length, 'line', 'lines')}, ${mixText}`,
    lines,
  };
}

/**
 * GET …/piece/:id: one piece, opened (CONTRACT P2.2). Null when the Work part or the piece's own "who sees it" doesn't
 * reach the view. Never the job's address, price or poster: the job appears only as "a paid job, completed".
 */
function composePiece(ctx, row, { attachments = [], reviews = [], credits = null, party = false, suggested = null, now = new Date() } = {}) {
  const view = ctx.view;
  // `party`: the viewer was asked to sign a credit on this piece, or signed one; they may open it whatever its "who sees
  // it" (they were shown it when asked). Everyone else by the Work part and the piece's own setting.
  if (!party && (!reaches(ctx.parts, 'work', view) || !reaches({ piece: row.audience || 'anyone' }, 'piece', view))) return null;
  const first = ctx.firstName;
  const owner = view === 'owner';
  // `credits` null: after the emergency off PROFILE_TIES=0, and the answer has no `credits` key at all.
  const shownCredits = credits ? creditsFor(credits, row.id, { view, viewerId: ctx.viewerId, first, now }) : [];
  const { piece } = pieceOf(row, first, owner, shownCredits);
  const cityOk = reaches(ctx.parts, 'city', view) && ctx.cityByPrivacy;
  piece.place = cityOk && row.place_city ? [row.place_city, row.place_state].filter(Boolean).join(', ') : null;
  const description = String(row.description || '').trim();
  const howWeKnow = [];
  if (row.source_kind === 'gig') {
    howWeKnow.push(line('seen', 'A paid job, completed on Pantopus', row.source_at ? dayLabel(row.source_at) : 'Pantopus\'s own records', 'work', null));
  } else if (row.source_kind === 'plan') {
    howWeKnow.push(line('seen', 'A plan that took place on Pantopus', row.source_at ? dayLabel(row.source_at) : 'Pantopus\'s own records', 'work', null));
  }
  const RELATION_HOW = { with: `Worked with ${first}`, led: `${first} led them`, learned_from: `${first} learned from them`, for: `Hired ${first}` };
  const signed = shownCredits.filter((c) => c.credit.status === 'signed');
  for (const { credit } of signed) {
    const who = credit.party.name || (credit.party.did[0].toLowerCase() + credit.party.did.slice(1));
    howWeKnow.push(line('signed', `Signed by ${who}`, [credit.role || RELATION_HOW[credit.relation] || null,
      credit.how.replace(/^Signed, /, '')].filter(Boolean).join(', '), 'work', null));
  }
  if (description) howWeKnow.push(line('said', `${first}'s own words`, 'Said', 'work', null));
  const linkView = view === 'link';
  // What the person who hired them wrote about this job (the review on the piece's job), named by the v1.2 rules, and
  // only where the `reviews` part reaches this viewer (rule 4.3; a link for one purpose's own parts included).
  const written = row.source_gig_id && reaches(ctx.parts, 'reviews', view) ? reviews.filter((r) => String(r.gig_id) === String(row.source_gig_id)).map((review) => {
    const did = { hired: `hired ${first}`, worked_for: `did a job for ${first}` }[review.role] || `worked with ${first}`;
    const rm = monthOf(review.created_at);
    const named = !linkView && review.reviewer_name;
    return line('signed', String(review.comment).trim().slice(0, 500), `Written by ${named ? review.reviewer_name : `someone who ${did}`}${rm ? `, ${monthLabel(rm)}` : ''}`,
      'work', null, {
        who: named ? { name: review.reviewer_name, user_id: review.reviewer_id, username: review.reviewer_username, portrait_url: review.reviewer_avatar, did }
          : { name: null, user_id: null, username: null, portrait_url: null, did: `Someone who ${did}` },
        when: rm ? monthLabel(rm) : null,
      });
  }) : [];
  const answer = {
    v: 1,
    view,
    piece: {
      ...piece,
      link: null,
      description: description ? line('said', description, `In ${first}'s words`, 'work', null) : null,
      how_we_know: howWeKnow,
      shows_can: (row.skills_used || []).filter(Boolean).slice(0, 5),
      // v1's shape, kept: the photos and videos as a list (the counts stay on list Pieces only).
      media: attachments.filter((a) => a.kind === 'photo' || a.kind === 'video')
        .map((a) => ({ kind: a.kind, url: a.url, thumbnail_url: a.thumbnail_url })),
      attachments,
      owner_role: String(row.owner_role || '').trim() || null,
      links: Array.isArray(row.links) ? row.links.map((c) => cardOf(c, first, owner)) : [],
      ...(credits ? { credits: shownCredits.map((c) => c.credit) } : {}),
      written,
      kept_once: keptOnce(first, signed),
      skills: (row.skills_used || []).filter(Boolean).slice(0, 5),
    },
  };
  if (owner) {
    const { howItWillShow } = require('./pieces');
    answer.piece.how_it_will_show = howItWillShow(row, ctx.parts.work, shownCredits.map((c) => c.credit));
    // Who hired them, when they could be asked now (owner only; ties.suggestionsFor).
    if (suggested) answer.piece.suggested_credits = suggested;
  }
  return answer;
}

const CIRCLE_BLOCK_PEOPLE = 6;

/** The circle as the Work tab's block (CONTRACT section 3.2's `circle`, p2.6): up to six a group, `count` all. */
function circleBlock(ctx, record, sources, on) {
  const groups = circleOf(ctx, record);
  // Hiring is counted from paid jobs, which the Record's work part holds.
  const hired = on('record_work') ? hiredBy(sources.paidJobs) : null;
  if (!groups.length && !hired) return null;
  // People only: the places they learned (a school, a business) are in the circle but not counted as people.
  const n = new Set(groups.flatMap((g) => g.people.filter((p) => !p._place).map((p) => p.user_id || `${g.key}:${p.name}:${p.did}`))).size;
  const clean = (list) => list.map(({ _place, ...person }) => person);
  return {
    kind: 'circle', id: 'circle', title: 'Work circle',
    text: n ? `${plural(n, 'person', 'people')} on ${ctx.firstName}'s work` : (hired ? hired.text : `Where ${ctx.firstName} learned`),
    groups: groups.map((g) => ({ key: g.key, title: g.title, count: g.people.length, people: clean(g.people.slice(0, CIRCLE_BLOCK_PEOPLE)) })),
    hired_by: hired,
    link: groups.length ? { kind: 'circle' } : null,
  };
}

/** GET …/circle: every group in full and the hiring count, or null when the Work part doesn't reach this view. */
function composeCircle(ctx, record, sources) {
  const on = (part) => reaches(ctx.parts, part, ctx.view);
  if (!on('work')) return null;
  const groups = circleOf(ctx, record).map((g) => ({ ...g, count: g.people.length, people: g.people.map(({ _place, ...person }) => person) }));
  return { v: 1, groups, hired_by: on('record_work') ? hiredBy(sources.paidJobs) : null };
}

/**
 * GET …/circle/:userId: the pieces the person and that account share that this viewer can open: the person's own
 * pieces where that account signed a credit, and that account's pieces the person signed ("With").
 */
function composeCirclePieces(ctx, record, userId) {
  const on = (part) => reaches(ctx.parts, part, ctx.view);
  if (!on('work')) return null;
  const cityOk = on('city') && ctx.cityByPrivacy;
  const id = String(userId);
  const pieces = record.pieces.filter((p) => !p.row.is_draft && p.row.is_visible !== false).filter((p) => (p.with
    ? String(p.tie.owner_id) === id
    : (p.credits || []).some(({ raw, credit }) => credit.status === 'signed' && String(raw.party_user_id) === id && credit.party.user_id)));
  return { v: 1, pieces: pieces.map((p) => ({ ...p.piece, place: !p.with && cityOk && p.row.place_city ? [p.row.place_city, p.row.place_state].filter(Boolean).join(', ') : null })) };
}

/**
 * "One piece, kept once. It shows on Maria's, Tom's and Aiko's Work." Only the names this view may read, of the
 * people who signed and show it on their own Work; null when nobody else shows it, or no such name may show.
 */
function keptOnce(first, signed) {
  const names = signed.filter(({ raw, credit }) => raw.show_on_party_work !== false && credit.party.name)
    .map(({ credit }) => firstWord(credit.party.name)).filter(Boolean);
  if (!names.length) return null;
  const all = [first, ...names].map((n) => `${n}'s`);
  return `One piece, kept once. It shows on ${all.length === 2 ? all.join(' and ') : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`} Work.`;
}

// Pages anyone can edit can't be proven as one person's (design review of #4823): a line in their head proves
// nothing about who made the page. CONTRACT P2.4.
const OPEN_EDIT_HOSTS = /(^|\.)(wikipedia\.org|wikimedia\.org|wiktionary\.org|wikidata\.org|fandom\.com)$/i;

function provable(card) {
  let host = card.site || '';
  try { host = new URL(card.url).hostname; } catch (_) { /* the kept site stands in */ }
  return !OPEN_EDIT_HOSTS.test(String(host).replace(/\.$/, ''));
}

/**
 * A link card as the piece read sends it (CONTRACT P2.4): words only, never the proof line, never a page picture.
 * The owner's card also says whether the page can be proven theirs at all (`provable`).
 */
function cardOf(card, first, owner = false) {
  const pm = monthOf(card.proven_at);
  return {
    id: card.id, url: card.url, site: card.site, kind: card.kind || 'site', title: card.title || null,
    description: card.description || null, picture_url: null,
    ink: card.proven_at ? 'seen' : 'said',
    how: card.proven_at ? `Proven ${first}'s, ${monthLabel(pm)}` : (owner ? 'Not proven yours yet' : `Not proven ${first}'s yet`),
    ...(owner ? { provable: provable(card) } : {}),
  };
}

function dayLabel(at) {
  return new Date(at).toLocaleDateString('en-US', { timeZone: PACIFIC, month: 'long', day: 'numeric', year: 'numeric' });
}

module.exports = {
  pieceOf, cardOf, provable, creditsFor, creditOf, roleOf, knownForLineOf, knownForLines, KNOWN_FOR_YEAR, buildRecord, composeCircle, composeCirclePieces, composePage, composeMonth, composePiece, partContent, ringsFor, monthOf, monthLabel, localDate, firstWord,
  PACIFIC,
};
