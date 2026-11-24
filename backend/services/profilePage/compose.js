/**
 * Composes the profile page for one view (CONTRACT.md sections 2 to 5, 9): every line with its ink and how, month
 * data for the rings, the blocks of each tab, and the parts. Nothing a view may not see is put in the answer: a part
 * that doesn't reach the view contributes no line, no month and no count (SPEC 4.2, 4.3).
 */

const { reaches } = require('./parts');

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

  // Work: pieces (said in phase 1) and skills counted from them.
  const pieces = (sources.pieces || []).map((row) => {
    const media = (row.media_urls || []).filter(Boolean);
    const links = [row.external_url, row.github_url, row.demo_url].map(safeUrl).filter(Boolean);
    const pm = monthOf(row.completed_at) || monthOf(row.created_at);
    return {
      row,
      month: pm,
      piece: {
        id: row.id,
        title: row.title,
        kind: null,
        when: pm ? pm.slice(0, 4) : null,
        cover_url: safeUrl(row.thumbnail_url) || safeUrl(media.find((u) => IMAGE_EXT.test(u))) || null,
        media: {
          photos: media.filter((u) => IMAGE_EXT.test(u)).length,
          videos: media.filter((u) => VIDEO_EXT.test(u)).length,
          documents: (row.file_ids || []).length,
          links: links.length,
        },
        ink: 'said',
        text: row.title,
        how: `In ${first}'s words`,
        lane: 'work',
        link: { kind: 'piece', id: row.id },
      },
    };
  }).filter((p) => p.row.title);
  for (const p of pieces) {
    mark('work', [p.month], 'said', ['record_work', 'work']);
    if (p.month) events.push({ month: p.month, parts: ['work'], line: { ...line('said', p.piece.title, `In ${first}'s words`, 'work', p.piece.link) } });
  }
  const skills = (sources.skills || []).map((skill) => {
    const name = String(skill.skill_name || '').trim();
    const n = pieces.filter((p) => (p.row.skills_used || []).some((s) => String(s).trim().toLowerCase() === name.toLowerCase())).length;
    const vm = monthOf(skill.verified_at);
    const ink = skill.is_verified ? 'signed' : 'said';
    let how;
    if (skill.is_verified) how = `Confirmed${vm ? ` ${monthLabel(vm)}` : ''}${n ? `, ${plural(n, 'piece', 'pieces')}` : ''}`;
    else how = n ? plural(n, 'piece', 'pieces') : `In ${first}'s words, no pieces yet`;
    const sm = skill.is_verified ? (vm || monthOf(skill.created_at)) : monthOf(skill.created_at);
    mark('work', [sm], ink, ['record_work', 'work']);
    if (sm) events.push({ month: sm, parts: ['work'], line: line(ink, name, how, 'work', null) });
    return line(ink, name, how, 'work', null, { name, pieces: n, inks: { seen: 0, signed: 0, said: n } });
  }).filter((s) => s.name);

  return { entries, months, events, pieces, skills };
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
    shelf: false,
    city: Boolean(ctx.placeLabel || ctx.homePlaceLabel),
    work: record.pieces.length > 0 || record.skills.length > 0 || has('owns'),
    known_for: false,
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
  const person = [];
  const keyLines = record.entries.filter((e) => e.place === 'key' && visible(e)).sort((a, b) => a.rank - b.rank).map(lineOf).slice(0, 3);
  if (keyLines.length) person.push({ kind: 'lines', id: 'key_lines', title: null, lines: keyLines, more: null });
  const bio = String(ctx.shown.bio || '').trim();
  if (bio && on('says')) {
    person.push({ kind: 'says', id: 'says', title: 'Says', line: line('said', bio, `In ${ctx.firstName}'s words`, null, null) });
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
    const pinned = record.pieces.filter((p) => p.row.is_featured).slice(0, 3);
    const rest = record.pieces.filter((p) => !pinned.includes(p)).slice(0, 30);
    if (pinned.length) {
      work.push({ kind: 'pieces', id: 'pinned', title: `Pinned by ${ctx.firstName}`, style: 'pinned', subtitle: `${pinned.length} of 3`,
        pieces: pinned.map((p) => p.piece), filters: null, more: null });
    }
    // The work line of this tab: its pieces and skills (the `work` part), whether or not record_work is on.
    const workMonths = record.months.filter((m) => m.lane === 'work' && m.parts.includes('work'));
    if (record.pieces.length) {
      const wr = ringsFor(workMonths, now);
      const perYear = {};
      for (const p of record.pieces) if (p.month) perYear[p.month.slice(0, 4)] = (perYear[p.month.slice(0, 4)] || 0) + 1;
      work.push({
        kind: 'work_rings', id: 'work_rings', title: `${plural(wr.summary.years, 'year', 'years')} of work`,
        from: wr.from, now: nowDate, months: wr.strings.work,
        dots: record.pieces.filter((p) => p.month).map((p) => ({ piece_id: p.row.id, month: p.month })),
        years: Object.entries(perYear).sort((a, b) => b[0].localeCompare(a[0])).map(([year, n]) => ({ year: Number(year), pieces: n })),
      });
    }
    if (rest.length) {
      work.push({ kind: 'pieces', id: 'all', title: pinned.length ? 'All pieces' : 'Pieces', style: 'list', subtitle: null,
        pieces: rest.map((p) => p.piece), filters: null, more: null });
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

/** GET …/piece/:id: one piece, opened. Null when the work part doesn't reach the view. */
function composePiece(ctx, row) {
  if (!reaches(ctx.parts, 'work', ctx.view)) return null;
  const first = ctx.firstName;
  const media = (row.media_urls || []).map(safeUrl).filter(Boolean);
  const pm = monthOf(row.completed_at) || monthOf(row.created_at);
  const links = [row.external_url, row.demo_url, row.github_url].map(safeUrl).filter(Boolean)
    .map((url) => ({ url, title: null, site: hostOf(url) }));
  const description = String(row.description || '').trim();
  return {
    v: 1,
    view: ctx.view,
    piece: {
      id: row.id,
      title: row.title,
      kind: null,
      when: pm ? pm.slice(0, 4) : null,
      cover_url: safeUrl(row.thumbnail_url) || media.find((u) => IMAGE_EXT.test(u)) || null,
      media: media.map((url) => ({
        kind: VIDEO_EXT.test(url) ? 'video' : (IMAGE_EXT.test(url) ? 'photo' : 'document'),
        url,
        thumbnail_url: IMAGE_EXT.test(url) ? url : null,
      })),
      ink: 'said',
      text: row.title,
      how: `In ${first}'s words`,
      lane: 'work',
      link: null,
      description: description ? line('said', description, `In ${first}'s words`, 'work', null) : null,
      links,
      skills: (row.skills_used || []).filter(Boolean),
    },
  };
}

module.exports = {
  buildRecord, composePage, composeMonth, composePiece, partContent, ringsFor, monthOf, monthLabel, localDate, firstWord,
  PACIFIC,
};
