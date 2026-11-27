'use strict';

// Pulse, reinvented, phase 2: a person's own "Pantopus AI" switch (coord CONTRACT 7d; approved by LEAD-2 for the founder,
// 2026-11-27). On by default. Off, Pantopus AI writes nothing for that person (no field card for them, no Illuminate
// suggestion), and no photo of theirs goes to the model (they place no thing to name; a tap on a thing of theirs that has
// no kept card makes no call). The safety checks (words, pictures) stay on whatever it says.
//
// Kept in the person's existing settings, the User row's `security_prefs`, as `pantopus_ai_off: true` only while it is
// off (no new table, no new column). Every reader of security_prefs today takes only the keys it knows
// (authNotifyService.normalizePrefs), so no answer of today's routes changes; its PATCH keeps keys it doesn't know.

const supabaseAdmin = require('../../config/supabaseAdmin');

const KEY = 'pantopus_ai_off';
const OFF = { status: 403, code: 'PANTOPUS_AI_OFF', message: 'Pantopus AI is off for you. Turn it on in Settings.' };

function fail({ status, code, message }) {
  return Object.assign(new Error(message), { status, code });
}

async function stored(userId) {
  const { data, error } = await supabaseAdmin.from('User').select('security_prefs').eq('id', userId).maybeSingle();
  if (error) throw new Error(`Failed to read the Pantopus AI setting: ${error.message}`);
  const raw = data?.security_prefs;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

/** Whether Pantopus AI is on for this person (on unless they turned it off; a failed read counts as on). */
async function aiOn(userId) {
  try {
    return (await stored(userId))[KEY] !== true;
  } catch {
    return true;
  }
}

/** The setting as the new Settings row reads it. */
async function settingsOf(userId) {
  return { pantopus_ai: await aiOn(userId) };
}

/** Turns it on or off; the other keys of security_prefs stay as they are. */
async function setAi(userId, on) {
  const current = await stored(userId);
  const { [KEY]: _was, ...rest } = current;
  const next = on ? rest : { ...rest, [KEY]: true };
  const { error } = await supabaseAdmin.from('User').update({ security_prefs: next }).eq('id', userId);
  if (error) throw new Error(`Failed to keep the Pantopus AI setting: ${error.message}`);
  return { pantopus_ai: Boolean(on) };
}

module.exports = { aiOn, settingsOf, setAi, OFF, offError: () => fail(OFF), KEY };
