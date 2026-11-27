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

/** The setting as the new Settings row reads it. */
async function settingsOf(userId) {
  return { pantopus_ai: await aiOnOrThrow(userId) };
}

/** Turns it on or off. On removes the row, so the default is what's left. */
async function setAi(userId, on) {
  const { error } = on
    ? await supabaseAdmin.from('PersonChoice').delete().eq('user_id', userId).eq('choice', CHOICE)
    : await supabaseAdmin.from('PersonChoice').upsert({
      user_id: userId, choice: CHOICE, value: { on: false }, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,choice' });
  if (error) throw new Error(`Failed to keep the Pantopus AI setting: ${error.message}`);
  return { pantopus_ai: Boolean(on) };
}

module.exports = { aiOn, aiOnOrThrow, settingsOf, setAi, OFF, offError: () => fail(OFF), CHOICE };
