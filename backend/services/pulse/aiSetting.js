'use strict';

// Pulse, reinvented, phase 2: a person's own "Pantopus AI" switch (coord CONTRACT 7d; approved by LEAD-2 for the founder,
// 2026-11-27). On by default. Off, Pantopus AI writes nothing for that person (no field card for them, no Illuminate
// suggestion), and no photo of theirs goes to the model (they place no thing to name; a tap on a thing of theirs that has
// no kept card makes no call). The safety checks (words, pictures) stay on whatever it says.
//
// Kept in "PersonChoice" (migration 20261127123000, approved by LEAD-3 for the founder): one row per person per choice,
// here `pantopus_ai` = { on: false } only while it is off. No app role reads the table, and nothing of today's does.

const supabaseAdmin = require('../../config/supabaseAdmin');

const CHOICE = 'pantopus_ai';
const OFF = { status: 403, code: 'PANTOPUS_AI_OFF', message: 'Pantopus AI is off for you. Turn it on in Settings.' };
const UNREADABLE = { status: 503, code: 'PANTOPUS_AI_UNAVAILABLE', message: "Pantopus AI couldn't check your settings. Please try again." };

function fail({ status, code, message }) {
  return Object.assign(new Error(message), { status, code });
}

/** Whether Pantopus AI is on for this person (on unless they turned it off). Throws when the choice can't be read. */
async function aiOnOrThrow(userId) {
  const { data, error } = await supabaseAdmin.from('PersonChoice').select('value')
    .eq('user_id', userId).eq('choice', CHOICE).maybeSingle();
  if (error) throw fail(UNREADABLE);
  return data?.value?.on !== false;
}

/**
 * Whether Pantopus AI is on, where nothing is sent to the model on the answer (posting a thing to name only keeps a dot):
 * a read that fails counts as on. Before a call, use aiOnOrThrow: a choice that can't be read makes no call.
 */
async function aiOn(userId) {
  try {
    return await aiOnOrThrow(userId);
  } catch {
    return true;
  }
}

// Strands (CONTRACT 8c; LEAD-3 06:19): "Tell people when their post led me somewhere", on by default. Off, no strand is
// ever made from this person's acts. Kept beside the AI switch, as `strands` = { on: false } only while it is off.
const STRANDS_CHOICE = 'strands';

/** Whether strands are on for these people, by id (on unless they turned it off); one read. Throws when unreadable. */
async function strandsOnFor(userIds) {
  const ids = [...new Set((userIds || []).map(String))];
  const out = new Map(ids.map((id) => [id, true]));
  if (!ids.length) return out;
  const { data, error } = await supabaseAdmin.from('PersonChoice').select('user_id, value')
    .in('user_id', ids).eq('choice', STRANDS_CHOICE);
  if (error) throw new Error(`Failed to read the strands setting: ${error.message}`);
  for (const row of data || []) if (row.value?.on === false) out.set(String(row.user_id), false);
  return out;
}

/** The settings as the new Settings rows read them. */
async function settingsOf(userId) {
  // eslint-disable-next-line global-require
  const [cabinet, echoes] = [require('./cabinet'), require('./echoes')];
  const [ai, strands, cabinetShown, echoLevel] = await Promise.all([
    aiOnOrThrow(userId), strandsOnFor([userId]), cabinet.shownOn(userId), echoes.levelOf(userId)]);
  // `cabinet_shown` (CONTRACT 9d): "Show my cabinet to people I know". `echoes` (9e): 'off' (the default), 'on' or 'names'.
  return { pantopus_ai: ai, strands: strands.get(String(userId)), cabinet_shown: cabinetShown, echoes: echoLevel };
}

/** Turns strands on or off for this person. On removes the row, so the default is what's left. */
async function setStrands(userId, on) {
  const { error } = on
    ? await supabaseAdmin.from('PersonChoice').delete().eq('user_id', userId).eq('choice', STRANDS_CHOICE)
    : await supabaseAdmin.from('PersonChoice').upsert({
      user_id: userId, choice: STRANDS_CHOICE, value: { on: false }, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,choice' });
  if (error) throw new Error(`Failed to keep the strands setting: ${error.message}`);
}

/** Turns it on or off. On removes the row, so the default is what's left. */
async function setAi(userId, on) {
  const { error } = on
    ? await supabaseAdmin.from('PersonChoice').delete().eq('user_id', userId).eq('choice', CHOICE)
    : await supabaseAdmin.from('PersonChoice').upsert({
      user_id: userId, choice: CHOICE, value: { on: false }, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,choice' });
  if (error) throw new Error(`Failed to keep the Pantopus AI setting: ${error.message}`);
}

module.exports = { aiOn, aiOnOrThrow, settingsOf, setAi, setStrands, strandsOnFor, OFF, offError: () => fail(OFF), CHOICE, STRANDS_CHOICE };
