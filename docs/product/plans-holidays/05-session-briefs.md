# Plans for the holidays: session briefs

November 15, 2026. The briefs for the three sessions of the people track. Each
is a fresh session on Opus 5.5 at Extra High, in its own worktree and branch
from `origin/dev`. The founder said "yes, let's start" on November 15 and asked
that every session be given clear instructions, the design and the screens for
exactly what it builds. That is this file plus the four it points to.

The business track's briefs are written when its gates open
([04-build-plan.md](04-build-plan.md), section 3).

**Where the documents are.** `docs/product/plans-holidays/` on `dev` once its
docs PR is merged. Until then: `git fetch origin
claude/holiday-plans-analysis-8c8644` and read them from `FETCH_HEAD` (for a
picture: `git show FETCH_HEAD:docs/product/plans-holidays/screens/<name>.png >
/tmp/<name>.png`, then open it).

**What every session reads first.**

1. `AGENTS.md`.
2. [README.md](README.md) and [01-design.md](01-design.md). Section 5 of the
   design, "Keeping Plans clean", is a hard rule.
3. [04-build-plan.md](04-build-plan.md), section 4: the rules every session
   follows.
4. Its own brief below, and every section and picture that brief names.

**What every session is given, exactly.**

| | Where |
| --- | --- |
| The data, routes, states, limits and words of the server | [03-build-contract.md](03-build-contract.md) |
| Every screen, element by element, with its words, states and the route each action calls | [06-screens.md](06-screens.md) |
| A picture of every screen | [screens/](screens/), named in 06-screens |
| The boards' own HTML, for exact sizes | `~/pantopus-plans/design-src/plans-holiday-canvas/project/` on this Mac |
| How to tell it is done | The contract's section 16 |

Where a document is unclear, wrong, or contradicts the code: stop on that point,
say so plainly in your turn's last message with the choice you would make, and
carry on with everything that does not depend on it. Do not guess on anything
that touches a home address, an email to a guest, or money.

---

## Brief 1: server and web (stream HOLSRV)

**Goal.** The people track on the server and the web: H1 (answers without an
account), then H2 (the bring list), then H3 (occasions). Each behind its own
switch, starting off.

**Your area.** `backend/`, `supabase/migrations/`, `frontend/apps/web/`. Not the
iPhone or Android apps.

**Exactly what to build.**

| PR | Step | Build | From |
| --- | --- | --- | --- |
| 1 | H1 | The migration: columns and widened checks on `Plan`, `PlanInvite`, `PlanRequest`; the switch `plans_guest_answers` | Contract 4, 5 |
| 1 | H1 | Reading: `GET /api/public/plans/:id` with `open` and `guest`, the `answer` and `for_guest` parts | Contract 6.1, 6.2 |
| 1 | H1 | Answering: `POST` and `PATCH /api/public/plans/:id/answers`, every row of the table in 6.3 | Contract 6.3 |
| 1 | H1 | The host's side: the open link (make, rotate, turn off), the invitation list's new parts, Let in, Remove, Remind, Maybe for an account; `kids_welcome`, room to 100, adults and kids on the ask; seats | Contract 5.3, 5.4, 6.4, 6.5 |
| 1 | H1 | The three emails, with the words in 06-screens ("The emails"); the limits; the four notices of H1; the marker `guests=1` and what a build without it reads | Contract 4, 6.6, 6.7, 12; 06-screens |
| 2 | H1 | The web page: W1, W2, W3, every state in their tables, light and dark, phone width first | 06-screens W1 to W3; pictures 05, 15, 06 |
| 3 | H2 | The bring list: the value, `plan_bring_swap`, the six routes, the list in a card and in `for_guest`, the two notices; the web's bring list in W3; the switch `plans_bring_list` | Contract 7, 12; 06-screens W3 |
| 4 | H3 | Occasions: the list, the seasons, `GET /api/plans/occasions`, `occasion` on a plan and a card; the switch `plans_occasions` | Contract 8 |

Tell the founder when PR 1 is merged into `dev`: the iPhone and Android
sessions build against it.

**Start from what exists.**

- Invitations: `backend/services/plans/planInvites.js` (tokens, email
  invitations, the host's view, `needs_host_ok`, the address confirmation),
  migration `20261031190000_plan_invites.sql`.
- The signed-out page: `backend/services/plans/planPublic.js`,
  `backend/routes/public.js`, `frontend/apps/web/src/app/(site)/plans/[id]/`.
- Rules, seats and limits: `backend/services/plans/planRules.js`,
  `planService.seatsTaken`, `planActions.js`.
- Guests without accounts are not new to Pantopus: Support Trains take a
  guest's name and email and email them an address
  (`backend/routes/supportTrains.js`, `sendGuestReservationAddressEmail`). Use
  the same care; do not copy its tables.
- Switches: `20261025160000_plans_sports_flag.sql` for the row's shape.
- Markers: how `more=1` and `biz=1` are read.

**Check, for real.** A local stack and backend from the launch kit, the web in a
browser, email in Mailpit. The contract's "Done when" for H1, H2, H3 (section
16), each line seen, not assumed. The home address is the thing to try to
break: read the page and call the API with every secret you should not have
(no secret, the open token alone, another guest's key, a removed guest's key)
and write down what each returned. An API answer alone is not a check of the
page.

**Do not.** Add a table. Edit an applied migration. Write new unit tests. Use
the word "neighbor" in new copy, or a pronoun for a host. Build anything from
the business track (deals, prices, checks). Turn a switch on anywhere but your
rig. Merge to master. Touch the founder's own running environment.

**Report** in each PR: what was built, what you saw working (the stack's name
and the head SHA), and what you could not verify.

---

## Brief 2: iPhone (stream HOLIOS)

**Goal.** The people track on iPhone: H1, then H2, then H3, each after its
server part is on `dev`.

**Your area.** `frontend/apps/ios/`. Ask the founder for a server change; do not
make it.

**Exactly what to build.** Each screen is specified in
[06-screens.md](06-screens.md) under the id given; build what that section
says, with its words and every state.

| PR | Step | Screen | Spec | Picture |
| --- | --- | --- | --- | --- |
| 1 | H1 | The Plans list gains "Yours" | A1 | 01 |
| 1 | H1 | The host form: "Room for" to 100, "Kids welcome" in the "Add to this plan" card | A3, rows 1 and 2 | 03 |
| 1 | H1 | Inviting: one link for everyone | A4 | 16 |
| 1 | H1 | Who's coming | A5 | 17 |
| 1 | H1 | The host's plan page: the counts, the people line, "Share link", "Remind" | A6, items 2, 4, 5 | 04 |
| 1 | H1 | Answering: adults, kids, Maybe | A7 | 18 |
| 1 | H1 | A guest's plan page: the banner and "Change" | A8, item 1 | 20 |
| 1 | H1 | The two H1 notices, with "Let in" and "Not this time" as buttons on the notice | "Notices the apps must handle" | |
| 2 | H2 | The bring list for the host | A9; A3's "Bring list" row; A6 item 3 | 19, 03, 04 |
| 2 | H2 | The bring list for a guest | A8, item 2 | 20 |
| 2 | H2 | The two bring-list notices | "Notices the apps must handle" | |
| 3 | H3 | Occasions on the kind picker, the filled-in form, the occasion's name on a plan's tag | A2; A6 item 1 | 02 |

PR 1 may be split in two if it grows large: the host's side, then the guest's.
Send `guests=1` on every `/api/plans` request from PR 1 on.

**Not in this build**, though drawn: the list's filter and business rows on
picture 01; "Let guests pick the date", "Chip in" and "Gift exchange" on picture
03; pictures 07 to 14.

**Start from what exists.** `frontend/apps/ios/Pantopus/Features/Plans/`:
`Host/PlanInviteSheet.swift` and `PlanInviteViewModel.swift` (the ways to
invite), `Host/PlanComposerPrivate.swift` and `PlanDetailsForm.swift` (the host
form), `Host/PlanTypePickerMore.swift` (the kind picker),
`Plan/PlanGoingAndHosting.swift` and `PlanPeopleLine.swift` (the plan's page),
`Plan/PlanAskSheet.swift` (I'm in), `Push/` (notice buttons). The notes from
the last Plans build on iPhone are in the launch kit,
`streams/PLANSMORE/status/ios.md`.

**Keep.** The map, the sheet, the rows, the tab bar and the side menu button as
shipped. Each page's layout. Existing colors and type. A count or one tag is
the only thing on the right of a row.

**If H1's server PR is not on `dev` yet,** set up your rig, read everything
above, and build A1 and A3, which need no new answers. Wait for the merge for
the rest; do not build against guessed answers.

**Check, for real.** A simulator against a local stack and backend. For H1: host
a private dinner at a home, share the link, answer it in a browser with no
account, let the guest in from the phone, see the counts, relaunch and see them
again; a second account answers in the app with adults and kids, then changes
to Maybe. For H2: two accounts and a browser guest on one list. Light and dark,
the largest text size, VoiceOver names for every new control.

**Do not.** Redesign a working screen. Add unit tests. Use "neighbor" or a
pronoun for a host. Turn switches on outside your rig.

**Report** in each PR as brief 1 asks, with what you saw on the simulator.

---

## Brief 3: Android (stream HOLAND)

The same build as brief 2, on Android: the same table of PRs, screens, specs
and pictures, the same "not in this build", "keep", "if the server PR is not on
`dev` yet" and "do not".

**Your area.** `frontend/apps/android/`.

**Start from what exists.**
`frontend/apps/android/app/src/main/java/app/pantopus/android/ui/screens/plans/`
and `data/plans/`, and the Plans models under `data/api/models/plans/`. The
launch kit's notes for building Android with the launch keys, and its emulator
port and AVD name checks, apply.

**Check, for real.** As brief 2, with an emulator, TalkBack and the largest
font. Also check that a Plans notice still shows when the app is closed, and
that its buttons act.

---

## Words for the founder to start them

A new session on Opus 5.5 at Extra High for each, with one line:

- Server and web: "Read `docs/product/plans-holidays/05-session-briefs.md` and
  do brief 1."
- iPhone: "Read `docs/product/plans-holidays/05-session-briefs.md` and do brief
  2."
- Android: "Read `docs/product/plans-holidays/05-session-briefs.md` and do
  brief 3."
