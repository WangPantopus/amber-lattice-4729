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

## Brief 4: the open link for a person who has the app (added November 15)

The founder accepted this design on November 15 ("Yes, go ahead"). It is the
contract's section 6.9, with its "Done when" lines in section 16, the screens
A10, A11 and A5's added paragraph in [06-screens.md](06-screens.md), and
pictures 21, 22 and 23. Everything above in this file still holds: areas,
rules, checks, "do not".

**Why.** The open link's address sits under `/plans/`, which every iPhone
build opens in the app, and no app knows an open link. A person who has
Pantopus would land on a private plan they cannot answer.

### 4a. Server and web (stream HOLSRV), one PR

| Build | From |
| --- | --- |
| The open link's address becomes `/plan-link/<id>?open=<token>` | 6.9 item 1 |
| The web serves the guest's page (W1, W2, W3) at `/plan-link/<id>`, with no redirect to `/plans/`; `/plan-invitation/<id>?key=` opens `/plan-link/<id>` | 6.9 item 2 |
| "Open app" on a page with a live open link opens `pantopus://plans/<id>?open=<token>` | 6.9 item 3; `OpenInAppButton` |
| `POST /api/plans/:id/invites/claim` takes `open`: every row of the table | 6.9 item 5 |
| `my_invite.via`, and the host's list: `via`, the ask's id, `asked` for a person from the link who waits | 6.9 items 5 and 6 |
| The move to a home covers people with an account from the link; their notice | 6.9 item 7 |
| A browser answer becomes the account's, with the answer, the numbers, the host's yes and the bring-list claims; this replaces "answers anew" for email invitations | 6.9 item 8 |
| One additive migration widening `plan_invite_channel_fields` | 6.9, Data |

Start from `planInvites.claimInvite`, `attachEmailInvites` and `assertInvitable`;
`planGuests.makeOpenLink`, `holdForHome` and `movedToHome`; `planActions.askToJoin`
and the accept and decline of an ask; `planBring` for the claims;
`frontend/apps/web/src/app/(site)/plans/[id]/` and `plan-invitation/[id]/route.ts`;
`components/public-share/OpenInAppButton.tsx`.

Check for real: section 16's lines for 6.9 that need no phone, on the rig with
two accounts and a browser. The home address is the thing to try to break: a
person who claimed with "I say yes first" on, a removed person, a blocked
person, and an account whose email is typed but not verified, each reading the
plan through the app's routes. With the switch off, every answer is today's.

Tell the founder and the two app sessions when it is on `dev`.

### 4b. iPhone (stream HOLIOS), one PR, after 4a is on `dev`

| Build | From |
| --- | --- |
| `DeepLinkRouter`: `open` on `/plans/<id>` beside `invite`, for `pantopus://` and `https://` | 6.9 item 4 |
| Signed in: claim with `open`, then the plan it answers; `404 invite_unavailable` shows the shipped screen | A10 |
| Signed out: the link is kept through sign-in or sign-up, as plan links are today, then claimed | 6.9 item 4 |
| The line under "I'm in" for `my_invite.via == open` with the host's yes needed | A10 item 5 |
| Who's coming: a person with an account from the link, in all three sections; "Let in" and "Not this time" on their ask | A5's added paragraph; picture 23 |
| The notice to a person the move makes wait opens the plan | "Notices the apps must handle" |

Do not add `/plan-link/` to `apple-app-site-association`.

Check for real, on a simulator against a local stack: "Open app" from the
browser page opens the plan with "{Host} invited you"; with and without "I say
yes first"; the host's phone shows the person under "Waiting for you" and lets
them in; a removed person; signed out, then signed in; relaunch. With the
store build installed instead, the open link and the emailed link tapped in
Messages end on the browser page.

### 4c. Android (stream HOLAND), one PR, after 4a is on `dev`

The same as 4b, and:

| Build | From |
| --- | --- |
| `DeepLinkRouter` also resolves `https://…/plan-link/<id>?open=<token>` to the plan: signed in it claims; signed out, or without `open`, it goes on to the browser (`WebLinkFallback`) | 6.9 item 4 |

Check for real, on an emulator: as 4b, and the open link tapped in Messages
opens the plan in the app when signed in. With the store build installed
instead, tap the open link and the emailed "You're in" link from Messages and
from Gmail, and write down where each ends: it must be the browser page, with
the form or the address, never the app's page for a private plan (contract 17,
item 9).

## The business track (added November 16)

On November 16 the founder said: "make sure all the sessions here keep going
keep working until everything is done and verified working well. By everything
I mean all the things we discussed and in the designs and plans. No need to ask
me whether to build next one or not, just work on all of them until all done."
So the business track is built now, step after step, by the same three
streams. Its gates ([04-build-plan.md](04-build-plan.md), section 3) guard
switching a step on for real people and real money, which stays the founder's;
they no longer hold the build. Every step is built behind its switch, which
stays off everywhere but a session's own rig.

What every session of this track reads, beside "What every session reads
first": the contract's sections 9, 10 and 11 and their lines in section 16;
[02-payments.md](02-payments.md) whole (its worked examples are the tests);
[07-screens-business.md](07-screens-business.md) whole; pictures 07 to 14. Two
earlier bodies of work are not on `dev` and are read from their branches:

- Plans with businesses: `git fetch origin claude/plans-feature-eval-c3208d`,
  then `docs/product/plans-with-businesses/` from `FETCH_HEAD` (its build
  contract's sections 4.2 and 5.6 are the paid spot this track builds; its
  steps 1 and 2, a business hosting a plan, are built and on `dev` behind
  `plans_business`).
- The business graph: `git fetch origin claude/business-graph-plan`, then
  `docs/product/business-graph/` from `FETCH_HEAD` (its
  `02-shared-pieces-contract.md` sections 4 and 5 and brief A in
  `05-session-briefs.md` are step B0; its pieces A1 and A2 are built).

Money rules for every session: the payment company's test mode only, on the
session's own rig, with test businesses and the provider's published test
cards; never a live key, never a real charge; the amounts in
[02-payments.md](02-payments.md) come out to the cent or the step is not done.
Payments are live in production for gigs and invoices: a change to shared
payment code must leave every existing payment exactly as it was, shown by
comparing the same payments before and after.

### Brief 5: the server and web (stream HOLSRV), in this order

| PR | Step | Build | From |
| --- | --- | --- | --- |
| 5.1 | B0 | The sale on `Payment` (`sold_type`, `sold_id`, `fee_basis`, `fee_pct`, `tip_cents`, `payout_after`), `priceSale`, the fill of old rows, invoices writing `sold_type` | Business graph shared pieces 5.1 to 5.3 and its brief A (A3); contract 10.1 |
| 5.2 | B0 | The customer record (`BusinessCustomer`), its one writing function, the invoice call, the first fill | Business graph shared pieces 4 and its brief A (A4) |
| 5.3 | B1 | `Plan.deal`, `PlanRequest.deal_used_at` and `deal_cents`, the settle on the Plans tick, the card's `deal`, `deal-preview`, `deal-used`, the four notices, the list's tag and filter, the switch `plans_deals` | Contract 9, 12; 07-screens D1 to D4 |
| 5.4 | B2 | A price on a business's plan, the `paying` hold, the payment with `sold_type = 'plan_spot'`, who may charge, no price online, refunds, the card's `price` and `paid`, the switch `plans_paid` | Contract 10.2; Plans with businesses 4.2 and 5.6; 02-payments 3, 4, 8 |
| 5.5 | B3 | The plan's web page: sign-in, join and pay | Contract 10.3; 07-screens P2 |
| 5.6 | B4 | The money kinds on a spot, the group price and its refund on the tick | Contract 10.4; 02-payments 6 |
| 5.7 | B5 | Checks on `BusinessInvoice`, `pay_here` and `tips_on`, the six routes, the discount and tip rules, the tip's share of the card fee, disputes, the switch `plans_pay_here` | Contract 11.1 to 11.4; 02-payments 5, 7, 9 |
| 5.8 | B6 | The tip after a paid plan; the statement's route, which is not built yet, behind `business_statement` | Contract 11.5; business graph shared pieces 5.4 |

`BusinessCustomer` is the one new table in this track. It is the business
graph's, which the founder approved on November 11; no other table is added.

After each PR: merge it yourself after green CI and the real check, confirm
its staging release really ran, write the shapes the apps need into the notes
folder, and tell the coordinator, who tells the app sessions. Then start the
next row without waiting.

### Brief 6: iPhone (stream HOLIOS) and Brief 7: Android (stream HOLAND)

After the people track's list and the two-phone check are done. Each row after
its server part is on `dev`.

| PR | Step | Screens | Spec | Picture |
| --- | --- | --- | --- | --- |
| 1 | B1 | The deal card on a business's plan; "Your deal" when in; the deal step in the business's host flow; the four notices; the list's tag and filter; "Mark used" on the roster | D1, D2, D3, D4, "The Plans list", "Mark used" | 07, 08, 09, 10, 01 |
| 2 | B2, B4 | "Price a spot" on the business's form; paying for a spot with the group price; "Paid" and the receipt on the plan; leaving with its refund line | P1 | 11 |
| 3 | B5 | The check, the tip, pay; Paid; the business's guest list with "Send a check" and refund; the two switches on the business's form | C1, C2, C3 | 12, 13, 14 |
| 4 | B6 | The tip after a paid plan (the statement has no screen in this build) | C4 | |

Send `biz=1` as today. Paying uses the app's shipped payment sheet. Check for
real with the payment company's test mode on the rig: each worked example of
02-payments on the phone, as the guest and as the business, after a relaunch.
The other person's view is the business's guest list changing when the guest
pays.

## Brief 8: the extras (added November 16)

Six additions, each small, each behind its own switch: [08-extras.md](08-extras.md)
is their design, contract, screens and "Done when" in one file, with pictures
24 to 31. Its section 8 gives the order and who builds what. They come after
the people track and may be built beside the business track; the sixth (one
person paying for the group) needs the business track's B2 first. The founder
had not looked at boards 24 to 31 when this was written: build from the file,
and expect a change of words if the founder asks for one.

## Words for the founder to start them

A new session on Opus 5.5 at Extra High for each, with one line:

- Server and web: "Read `docs/product/plans-holidays/05-session-briefs.md` and
  do brief 1."
- iPhone: "Read `docs/product/plans-holidays/05-session-briefs.md` and do brief
  2."
- Android: "Read `docs/product/plans-holidays/05-session-briefs.md` and do
  brief 3."
