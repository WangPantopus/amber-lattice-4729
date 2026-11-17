# Plans for the holidays: hand-off

Written November 16, 2026, 5:45 PM Pacific, by the second designer-and-coordinator
session, for a fresh set of sessions under another account. Read this file first.
It says what is being built, what is done, what is left, and when it is done.
Check every state below against GitHub before relying on it: pull requests move
after a hand-off is written.

## 1. What is being built

Plans is the part of Pantopus where people post small get-togethers. This build
makes it carry holiday plans and lets a business charge a guest through
Pantopus. Three parts:

| Part | What a person gets |
| --- | --- |
| **The people track** | A guest answers an invitation in a browser with no account; one open link for everyone; adults and kids, Maybe; a bring list; occasions (Thanksgiving dinner, Friendsgiving, and so on); a plan that moves to a home keeps its address private; the open link also works for someone who has the app |
| **The business track** | On a business's plan: deals without money (B1), paying to join with a group price (B2 to B4), the bill at the place with a tip (B5), a tip after a paid plan (B6). Money through the payment company, in test mode only so far |
| **The six extras** | The same people again; chip in (the guest pays the host on the host's own Venmo, PayPal or Cash App link, no money through Pantopus); find a date; a gift exchange where nobody sees who drew whom; photos afterwards, kept private; one person pays for the group |

Everything is behind switches that are off. Production has none of this code.

**The documents** are this folder, all on `dev`:

| File | Holds |
| --- | --- |
| [README.md](README.md) | The reading order and the status table |
| [01-design.md](01-design.md) | What people and businesses get, the rules that keep Plans clean, the founder's decisions |
| [02-payments.md](02-payments.md) | Paying a business: the two payments, tips, the cut, deals, refunds, and the worked examples that are the money tests |
| [03-build-contract.md](03-build-contract.md) | The contract between the server, the web and the apps: data, routes, rules, and "Done when" (section 16) |
| [04-build-plan.md](04-build-plan.md) | Steps, gates, rules every session follows |
| [05-session-briefs.md](05-session-briefs.md) | The briefs of the first sessions (1 to 8) |
| [06-screens.md](06-screens.md) | The people track's screens, element by element |
| [07-screens-business.md](07-screens-business.md) | The business track's screens, element by element |
| [08-extras.md](08-extras.md) | The six extras: design, contract, screens, "Done when", and every answer settled while they were built |
| [screens/](screens/) | The thirty-one boards as pictures |

The founder's checklist is `NEXT_STEPS.md`, section "Plans for the holidays".
It records every merged piece with what its session saw and what was not
checked. Keep it true.

**Outside the repository**, on the founder's Mac:

- The canvas of thirty-one boards: <https://claude.ai/artifact/8FbzKc3ZQMCH8HRBzVzcNe>
  (private to the account that drew it; the founder gives it to the next
  coordinator). Its sources: `~/pantopus-plans/design-src/plans-holiday-canvas/project/`.
- The build sessions' notes: `~/pantopus-plans/holidays-notes/` (a copy made at
  this hand-off of the first sessions' shared folder). The files that matter:
  `HOLSRV-extras-api-for-apps.md` and `HOLSRV-business-api-for-apps.md` (the
  server's routes and shapes for the apps, one section a piece, each marked
  merged), `HOLSRV-status.md` and `HOLSRV-6-HANDOFF.md` (the server rig),
  `HOLIOS-rig.md` and `HOLIOS-4-brief.md` (the iPhone rig and its next steps),
  `HOLAND-android-notes.md` and `HOLAND-4-brief.md` (the Android rig and its
  state), `HOLAND-business-android-plan.md` (answers that hold for both
  phones). New sessions keep writing their notes there.
- Each stream's tools, logs and hand-off: `~/.config/pantopus/launch-kit/streams/`
  `HOLSRV`, `HOLIOS`, `HOLAND`, `PLANSBIZ`.
- The running history, decision by decision: the memory file
  `plans-holiday-assessment-2026-11-15.md` (its last bullets are this session's).

## 2. The founder's words, and what stays the founder's

November 16: "Just please make sure all the sessions here keep going keep
working until everything is done and verified working well. By everything I
mean all the things we discussed and in the designs and plans. No need to ask
me whether to build next one or not, just work on all of them until all done."

So nobody asks "shall I build the next piece". These stay the founder's:
switching anything on in production; the promotion of `dev` to master; store
builds; real money; a new table; anything that loosens a security or privacy
check; changes to hosted services. Designer's calls made during the build are
written into the documents and told to the founder, who can change them.

How it runs: one Fable session designs, answers questions, checks claims and
keeps the documents true, and writes no product code. Opus 5.5 sessions at
Extra High build, one area each, in their own worktrees.

## 3. Exactly what is done

Merged into `dev`, each checked by its own session on a local backend and
database (a simulator, an emulator or a browser as the piece needs), with the
switch off equal to untouched `dev`. Numbers are pull requests.

| Part | Server and web | iPhone | Android |
| --- | --- | --- | --- |
| Answers without an account, the open link, adults and kids, Maybe (H1) | 4183, 4184, 4187, 4192, 4198 | 4193, 4201 | 4191 |
| The bring list (H2) | 4185 | 4199 | 4197 |
| Occasions (H3) | 4186, 4227 | 4204 | 4200 |
| The open link for someone with the app | 4196 | 4211 | 4203 |
| "Room for" and "Kids welcome" on a private plan's Change screen | 4227 (the room an occasion starts with) | 4236 | **not built** |
| Deals without money (B1) | 4209, 4212, 4214 | 4243 | 4240 |
| Paying to join, the group price (B2 to B4) | 4215, 4216, 4221, 4252 | 4254 | 4258 |
| The bill at the place, tips (B5) | 4222 | **not started** | 4267 |
| A tip after a paid plan (B6) | 4223 | **not started** | 4268 |
| The same people again | 4234 | **not started** | **not started** |
| Chip in | 4235 | **not started** | **not started** |
| Find a date | 4237, 4245 | **not started** | **not started** |
| Gift exchange | 4239 | **not started** | **not started** |
| Photos afterwards | 4242, 4249 | **not started** | **not started** |
| One person pays for the group | 4255, 4259, 4261 | **not started** | **not started** |

Also done:

- **The two-phone check of the people track** (iPhone simulator, Android
  emulator and a browser on one local stack, both ways round), written into
  `NEXT_STEPS.md`.
- **The refund fix** (4252): after a refund in part, a second refund on the
  same plan payment was refused, so a guest who left after a group price came
  back was not sent the rest. Fixed for plan payments only; refunds of gigs and
  invoices are untouched. Seen passing on the server rig, on the iPhone
  simulator and against Android's setup. Contract 10.4 has the rule.
- **Android's business track** was built and emulator-checked by its session,
  which ran out of room before merging. A server session then merged all four
  pull requests (4240, 4258, 4267, 4268) on those checks, each after green
  checks on a head that contained `dev`, without changing Android code; the
  last went in at 6:33 PM Pacific on November 16. The merged build was then
  run by the next Android session at about 8:15 PM (`dev` 2492118e8d, an
  emulator, test mode): deals, paying for a spot, the group price coming back
  and a guest leaving after it, the bill with a tip and the tip afterwards
  all worked, to the cent (`NEXT_STEPS.md` has what it saw).

**Switches** (all `FeatureFlag` rows, all off everywhere but a session's own
rig, except one): `plans_guest_answers` (on in staging only, at the founder's
word), `plans_bring_list`, `plans_occasions`, `plans_deals`, `plans_paid`,
`plans_pay_here`, `business_statement`, `plans_same_people`, `plans_chip_in`,
`plans_find_date`, `plans_gift_exchange`, `plans_photos`, `plans_group_pay`.
The apps tell the server what they can draw with the markers `guests=1`,
`more=1`, `biz=1` and `extras=1`.

**Staging** (corrected by the third coordinator at 7:50 PM Pacific on
November 16, from each run's "Release backend" job): two releases deployed
after `dev` 742e533365, at 4:08 PM (`dev` 9b8bbbeefc, which has 4259 and 4261)
and at 7:22 PM (`dev` 2d7e0857d9). So staging's server has the whole business
track and all six extras as they are on `dev`, every new switch off. A staging
release follows
each `dev` CI run that passes; with merges every few minutes most runs are
replaced before they finish, so read the "Release backend" job of a "Deploy
Backend to staging" run, never the run's conclusion (a skipped release still
says success).

## 4. Exactly what is left

In the order it should be done. Each item is its own small pull request into
`dev` unless it says otherwise.

**Android**

1. Done November 16, about 8:15 PM Pacific: the merged build smoke-checked
   on the emulator in test mode (deals, paying for a spot, the bill with a
   tip, the tip afterwards), nothing broken.
2. One small fix from the people track's two-phone check: on a private plan's
   Change screen, "Room for" (from the people already in up to 100) and "Kids
   welcome"; the occasion's tag on the page of a person who is in; an
   occasion's form starting at the server's room. The iPhone's is 4236.
3. The six extras, in `08-extras.md` section 8's order: the same people again,
   chip in, find a date, gift exchange, photos afterwards, one person pays for
   the group.

**iPhone**

4. The bill at the place with tips, and the business's guest list with money
   (B5): screens C1, C2, C3 of `07-screens-business.md`, worked examples 3 and
   4 of `02-payments.md` to the cent.
5. The tip after a paid plan (B6): screen C4.
6. The six extras, in the same order as Android's.

**Both phones together**

7. A two-phone check of the business track in the payment company's test mode,
   a guest on one phone and the business on the other, both ways round, after
   a relaunch of each app: a deal that unlocks and one that falls short; paying
   for a spot; the group price coming back and then leaving; the bill with a
   deal and a tip; the tip afterwards. Written into `NEXT_STEPS.md` the way the
   people track's check is.
8. A two-phone check of each extra, with a browser guest where the extra has
   one, written into `NEXT_STEPS.md`.

**Server and web**

9. Two sentences to change, found by Android's smoke check and settled in
   contract 9.2 and 10.2: "Unlocked: 1 are in" and "Paid $18.00" after $4.00
   came back. The list a server session works from, with its brief, is
   `~/pantopus-plans/holidays-notes/HOLSRV-gaps.md`. Otherwise a server
   session is needed when a phone session finds a gap. Staging carries 4259 and 4261 since 4:08 PM Pacific on
   November 16 (section 3).

**Documents**

10. `NEXT_STEPS.md` and the [README](README.md)'s status table after every
    merge; `08-extras.md` and the contract when a build question is settled.

**Not built, by decision** (do not build without the founder's word): a named
group kept between plans (it needs a new table); "My place" on the Change
screen of a plan posted at a public place; "Two for one" as a deal; a screen
for the business statement (its route exists, off).

**Never checked by any session**: a physical phone; real push on an iPhone;
hosted email delivery; Apple Pay and Google Pay; the payment company's
call-back; live mode; the real picture check for photos (the rigs have no key
for it, so it was tried against a stand-in); hosted private storage; the canvas
page itself.

**The founder's own list** is the "Only you" item at the end of the section in
`NEXT_STEPS.md`: look at boards 24 to 31; the staging check of guests answering
in a browser; the "Fee" look in the live Stripe dashboard; the gates before any
paid step is switched on (the by-hand trial, the lawyer, both stores' payment
rules, the accountant, one real payment on staging); before photos is switched
on anywhere, one picture seen passing the real check on staging; the promotion
to master (it carries one added step in account deletion, which removes a
person's plan photos, and the refund fix in the shared refund code); each
switch in production; the store builds.

## 5. When it is done

- The business track and the six extras are on `dev` on the server, the web,
  the iPhone and Android, each checked in the real app by its session from both
  people's sides, after a relaunch, and with its switch off.
- The two-phone checks of items 7 and 8 are written into `NEXT_STEPS.md`.
- `NEXT_STEPS.md` says, for every piece, what was seen and what was not, and
  ends with one clear list of what only the founder can do.
- Every money amount in `02-payments.md` and `08-extras.md` section 9 has been
  seen to the cent on a rig, with the payout after it.

## 6. Rules that were learned the hard way

- Branch from `origin/dev`; every pull request `--base dev`; never master. A
  session merges its own pull request after green checks and a real check in
  the app. Do not wait for a staging release or a quiet `dev`.
- Check a session's claim before telling the founder it is done: the pull
  request's state, the sensitive part of its change (who can read an address,
  a payment link, a drawn name, a picture; what touches money), and for
  staging the "Release backend" job.
- The coordinator reads every change on the money path line by line. Reading
  found five gaps in group pay and two in photos after their sessions' own
  checks had passed.
- When `dev`'s checks fail only because GitHub had no Mac machine for an
  iPhone job ("The job was not acquired"), re-run the failed jobs; it is not
  the code.
- Answer a build session's design question the same turn, write the answer
  into the document, and say so to the founder. Sessions build their own
  choice meanwhile, so a late answer means a follow-up pull request.
- A session near the end of its room writes a ready-to-paste brief for its
  successor in the notes folder before it stops. Only a message the founder
  types in the desktop app can start a session; not one sent over Remote
  Control, and not another session's message.
- The phones build each extra from the server's notes file
  (`HOLSRV-extras-api-for-apps.md`) without waiting for a message.
- Rigs are shared: use your own test accounts and plans, never clear another
  session's, and say before restarting a shared backend. The Mac's internal
  disk filled once on November 16; keep build outputs small and delete your
  own after a check.
- No word "neighbor" in Plans copy, no pronoun for a host or a business, the
  tab bar and the side menu button stay, no new unit tests, test people are
  `@example.com`, never the founder's own environment (the main checkout, the
  backend on port 8000, simulator EB5AD759).

## 7. What is running on the Mac

Left running for the next sessions, at the time of writing:

- The server rig, stack `pantopus-holsrv`: backend 33461 and web 33471 from the
  last server session's worktree, a reference backend 33463, and the iPhone
  rig's backend 33561. Its notes: `HOLSRV-6-HANDOFF.md`, `HOLSRV-status.md`,
  `HOLIOS-rig.md`. Every extras switch can be turned on there for a test host;
  a private bucket exists on it for photos.
- The Android rig's stack `pantopus-plansbiz` (API 32401); its backend and
  emulator are stopped. Its notes: `HOLAND-4-brief.md`,
  `HOLAND-android-notes.md`.

**Since this hand-off** (November 16, 7:50 PM Pacific): a third coordinator
started three build sessions from section 8's briefs, each in its own
worktree on Opus 5.5 at Extra High: HOLIOS-4 (the iPhone's bill, tips and tip
afterwards), HOLIOS-E (the iPhone's six extras) and HOLAND-4 (Android: the
smoke check of the merged business track, the small fix, the refund rerun,
the six extras). What they merge is recorded in `NEXT_STEPS.md`.

The earlier sessions cannot be reached from another account. Their worktrees
were checked at this hand-off: none holds an uncommitted change, and every
branch is merged or pushed.

## 8. Briefs for the next sessions

A Fable 5.2 session coordinates; the build sessions run on Opus 5.5 at Extra
High, each in its own worktree. Start the coordinator first, with the prompt
the hand-off gave the founder; it starts the others with these.

### iPhone, the business track (HOLIOS-4)

> You are HOLIOS-4, the iPhone build session for the business track of "Plans
> for the holidays". You own `frontend/apps/ios/` for the business track's
> screens; never touch the server, the web or Android. Put your branch on
> `origin/dev`. Read `AGENTS.md`, then
> `docs/product/plans-holidays/09-handoff.md`, then
> `~/pantopus-plans/holidays-notes/HOLIOS-4-brief.md` and follow it, with these
> corrections: report to the coordinator session that started you; 4243 and
> 4254 are merged, so start at B5; the stack `pantopus-holsrv` is shared, so
> use your own accounts and plans; a second iPhone session builds the six
> extras, so keep pull requests small and merge `origin/dev` into your branch
> before each push. Build B5 (the bill, tips, the business's guest list with
> money) and B6 (the tip after a paid plan), each as its own pull request into
> `dev`, merged by you after green checks and a check on the simulator as the
> guest and as the business, after a relaunch, with worked examples 3 and 4 of
> `02-payments.md` to the cent. Money only in the payment company's test mode.
> After each pull request send the coordinator three lines: the pull request,
> what you saw, what you could not verify. At about 75% of your room write a
> ready-to-paste successor brief in the notes folder and say so.

### iPhone, the six extras (HOLIOS-E)

> You are HOLIOS-E, the iPhone build session for the six extras of "Plans for
> the holidays". You own `frontend/apps/ios/` for the extras' screens; another
> iPhone session owns the business track's. Put your branch on `origin/dev`.
> Read `AGENTS.md`, `docs/product/plans-holidays/09-handoff.md`,
> `08-extras.md` whole (each section's "Screens" and every "Settled",
> "Decided" and "Built" block), `05-session-briefs.md` briefs 2 and 8,
> `06-screens.md`, pictures `screens/24-…` to `31-…`, and in
> `~/pantopus-plans/holidays-notes/`: `HOLSRV-extras-api-for-apps.md` (the
> server's routes and shapes, all six marked merged), `HOLIOS-rig.md`,
> `HOLSRV-6-HANDOFF.md`. Build, each as its own small pull request into `dev`,
> in this order: the same people again (the row in the invite sheet, board
> 30); chip in (the host form's row, the card of board 27, "Mark paid"); find
> a date (boards 24, 25, 26, "Picking a date" in lists); gift exchange (the
> host form's row, the card before and after the draw, board 28); photos
> afterwards (board 29); one person pays for the group (board 31, the buyer's
> spots, the claimer's line; test mode only). Send `extras=1` on every
> `/api/plans` request. Every word that names money or a date is the server's.
> Each extra behind its own switch, on for your test host on the rig only; use
> your own simulators, accounts and plans. Check each on the simulator as the
> host and as a second account, with a browser guest where the extra has one,
> after a relaunch, in light and dark, at the largest text size, with VoiceOver
> names, and with the switch off; `08-extras.md` section 9 is the bar. Merge
> each after green checks and that check, then send the coordinator three
> lines. Ask the coordinator only where the document and the notes disagree
> or leave something out. At about 75% of your room write a successor brief.

### Android (HOLAND-4)

> You are HOLAND-4, the Android build session for "Plans for the holidays".
> You own `frontend/apps/android/`; never touch the server, the web or the
> iPhone app. Read `AGENTS.md`, `docs/product/plans-holidays/09-handoff.md`,
> and `~/pantopus-plans/holidays-notes/HOLAND-4-brief.md` with the files it
> names (the rig, the emulator, the traps). Its "Merge rule" section is out of
> date: merge each pull request on its own green checks, with no wait for a
> staging release and no HOLD lines. Report to the coordinator session that
> started you. Do, in order: (1) the four business pull requests (4240,
> 4258, 4267, 4268) are merged, on the earlier session's emulator checks:
> build current `origin/dev` and smoke-check deals, paying for a spot, the
> bill with a tip and the tip afterwards on the emulator in test mode, and
> say what you saw; (2) the small fix of the hand-off's section 4, item 2;
> (3) rerun on the emulator, against a backend on current `origin/dev`: two
> guests pay $18.00, the group price comes back, one leaves in time; expect
> the rest sent and the notice "$14.00 is on its way back to your card";
> (4) the six extras in `08-extras.md` section 8's
> order, each as its own small pull request, as the iPhone extras brief
> describes them, with TalkBack and the largest font in place of VoiceOver and
> text size. Send `extras=1` from the first extras pull request on. After each
> pull request send the coordinator three lines. At about 75% of your room
> write a successor brief.

### Server and web (start only when a phone session finds a gap)

> You are the server-and-web session for "Plans for the holidays". You own
> `backend/`, `supabase/migrations/` and `frontend/apps/web/` for this build.
> Read `AGENTS.md`, `docs/product/plans-holidays/09-handoff.md`, and in
> `~/pantopus-plans/holidays-notes/`: the end of `HOLSRV-status.md`,
> `HOLSRV-6-HANDOFF.md` (the rig and its check scripts),
> `HOLSRV-extras-api-for-apps.md`. Fix the gap the coordinator names as one
> small pull request into `dev`, checked on the rig with the existing scripts
> and with every switch off equal to `dev`; money to the cent, the payout
> after each; payments are live for gigs and invoices, so a change to shared
> payment code must leave them exactly as they were. Keep the notes file exact
> after each merge.
