# Plans for the holidays: the contract between the server, the web and the apps

November 15, 2026. Written against `dev` at `9c4062bdfb`. Nothing here is built.
Every route, field and column below is new unless it says "exists".

It has two tracks. **People** (sections 5 to 8) is a person's own plan: answers
without an account, bigger groups, the bring list, occasions. **Businesses**
(sections 9 to 11) is deals and money. The people track has no gate and is
specified in full. The business track is specified to the level its first
session needs; its money rests on [02-payments.md](02-payments.md) and on two
contracts in open docs PRs: Plans with businesses (PR 3964,
`docs/product/plans-with-businesses/03-build-contract.md`) and the business
graph's shared pieces (PR 3965,
`docs/product/business-graph/02-shared-pieces-contract.md`).

## 1. Steps

| Step | What | Section |
| --- | --- | --- |
| H1 | Answers without an account, the open link, adults and kids, Maybe, room for 100 | 5, 6 |
| H2 | The bring list | 7 |
| H3 | Occasions | 8 |
| B0 | The two shared pieces not yet built: the sale columns on `Payment` with `priceSale`, and the customer record | 10.1 |
| B1 | Deals without money: "something free", for everyone or for a group | 9 |
| B2 | Paying to join | 10.2 |
| B3 | Paying from the web page | 10.3 |
| B4 | Deals with money: the deal price, the group price | 10.4 |
| B5 | The bill at the place, with tips | 11 |
| B6 | Tips after a paid plan; the statement page | 11.5 |

The order, the gates and who builds what are in
[04-build-plan.md](04-build-plan.md).

## 2. Calls this contract makes

The founder accepted all ten on November 15, as recommended, with H1 to H11 of
[01-design.md](01-design.md), section 7.

| | Call | Value |
| --- | --- | --- |
| K1 | Where a guest without an account is saved | On their `PlanInvite` row. No row in `PlanRequest`, no account, no new table |
| K2 | The open link's token | Saved as given on `Plan`, not hashed, so the host can share the link again. It lets someone answer; it never reads anything private |
| K3 | A guest's keys | A secret made when a guest answers, and one more for each email that carries their link. A guest may hold several and none replaces another. Private parts of a plan are read with one of them, never with the link alone. (Made precise on November 15 after the server session asked; see 6.1) |
| K4 | The bring list | One JSON value on `Plan`, changed by compare-and-set on its revision number |
| K5 | A guest without an account and seats | Their adults and kids count as seats from the moment they say they are in, also while waiting for the host's yes |
| K6 | Reminders | One "Remind" a plan a day; a person is reminded once |
| K7 | A check and a deal | When a plan has a deal on the bill, only staff start a check, and the check says which part the deal does not cover (alcohol). Without a deal a guest may start one |
| K8 | A pass for "something free" | No code. The guest's screen shows the item and their first name; staff mark it used on the guest list |
| K9 | When the business's share is fixed | When the charge succeeds and the card company has reported its fee. The release waits for that report |
| K10 | Old app builds | Send `guests=1` to read guest rows, Maybe and plans with room over 30. Without it the server answers as it does today |

## 3. Rules that hold everywhere

1. **Off means today.** With a step's switch off, every Plans response is
   byte-for-byte today's, and its routes answer "not found".
2. **A person's plan never takes money.** A price, a deal, a tip or a check
   needs `business_user_id`. A database check refuses them on any other plan.
3. **A home address reaches three kinds of people only:** the host, an account
   that is in, and a guest who is in and holds their own key. A link alone
   never shows it.
4. **A business's staff learn nothing private.** No address, distance, phone,
   email or last name of a guest, from any route. (Rule 7 of the Plans with
   businesses contract.)
5. **One order.** Lists sort as today. No deal, price or payment changes a
   plan's position.
6. **Money moves on the server's word.** A guest is in, a check is paid, a deal
   is unlocked when the server says so, never on the app's say-so.
7. **The fee is fixed when the guest pays.** The way in, the rate and the
   refund deadline are saved then.
8. **Additive data only.** Added columns and widened checks. No new table for
   Plans. No applied migration is edited.
9. **Playdates and business plans take no answers without an account.**
10. **No "neighbor" in any new words** a person reads.

## 4. Switches and the app marker

`FeatureFlag` rows in the shape of `20261025160000_plans_sports_flag.sql`, all
starting off:

| Key | Step | Needs |
| --- | --- | --- |
| `plans_guest_answers` | H1 | `plans_private`, `plans_invites` |
| `plans_bring_list` | H2 | |
| `plans_occasions` | H3 | `plans_kinds` |
| `plans_deals` | B1 | `plans_business` |
| `plans_paid` | B2 to B4 | `plans_business`, the shared pieces |
| `plans_pay_here` | B5, B6 | `plans_paid` |

A switch is read for the plan's host, as `plans` is today, so a tester's guests
see what the tester's plan uses.

**The marker `guests=1`** rides on every `/api/plans` request from an app that
can draw this contract, as `more=1` and `biz=1` do. Without it: a plan with room
over 30 reports 30; rows made by the open link are left out of the host's
invitation list and counted in `counts.in`; "maybe" reads as `invited`. Bring
lists, occasions and deals are added fields that an old build ignores, and need
no marker.

**The shipped apps gain from H1's server and web alone.** They already send
email and text invitations. Once the web page takes answers, such an invitation
can be answered in a browser with no account. To a build without the marker,
that row reads `in` under the address the host typed (or "A guest" for a text
invitation), and its seats count.

## 5. Data for the people track

### 5.1 `Plan` (added columns)

| Column | Type | Meaning |
| --- | --- | --- |
| `kids_welcome` | `boolean`, default `false` | Guests say how many adults and how many kids |
| `open_invite_token` | `text`, unique | The open link's token. Null: no open link |
| `open_invite_ok_first` | `boolean`, default `false` | The host says yes to each answer from the open link before it sees anything private |
| `occasion` | `text` | The occasion's key (section 8). Null on an ordinary plan |
| `bring_list` | `jsonb` | The bring list (section 7). Null: none |

Checks:

- The spots check is widened: `spots BETWEEN 1 AND 30 OR (audience = 'invited'
  AND business_user_id IS NULL AND spots BETWEEN 1 AND 100)`.
- `plan_open_invite_private`: an open link only where `audience = 'invited'`,
  `business_user_id IS NULL` and `kind <> 'playdate'`.
- `plan_occasion_form`: a short lowercase key, as `plan_label_form`.

### 5.2 `PlanInvite` (added columns)

| Column | Type | Meaning |
| --- | --- | --- |
| `guest_name` | `text`, 1 to 100 | The name a guest without an account typed |
| `guest_adults` | `integer`, 1 to 10 | |
| `guest_kids` | `integer`, 0 to 10 | |
| `guest_key_hashes` | `text[]`, default empty, at most 6 | The hashes of the guest's keys (K3). A GIN index serves the lookup by one hash |
| `address_sent_at` | `timestamptz` | When the email with the guest's link went |
| `reminded_at` | `timestamptz` | The one reminder |
| `email_sent_times` | `timestamptz[]`, default empty, at most 20 | The time of each email to the row after the invitation's first, newest last. The day's limit counts by these (6.6). Added November 15 by the server session |
| `host_ok_at` | `timestamptz` | When the host let this guest in by hand (6.8). Null: the host has not. Added with 6.8; rows from before it are not filled in |
| `guest_emails` | `integer`, default 0 | How many of the plan's three emails the guest has had (6.6). Added by the server session |
| `changed_at`, `changed_reason` | `timestamptz`, `text` (`time`, `place`, `both`) | The plan's time or place changed since the guest answered: their page says so, and the one change email goes once. Added by the server session |

Checks widened:

- `channel` gains `open`: a row made when someone answers from the open link.
- `status` gains `maybe`.
- `plan_invite_channel_fields` gains: `channel = 'open' AND email IS NOT NULL
  AND guest_name IS NOT NULL AND token_hash IS NULL AND invitee_user_id IS NULL`.

`needs_host_ok` (exists) is reused: an `open` row that is in and still needs the
host's yes.

The unique index on `(post_id, email)` (exists) keeps one answer an address a
plan.

### 5.3 `PlanRequest` (widened checks)

- `party_size BETWEEN 1 AND 10`. The server keeps 4 for a public plan.
- `kids_count BETWEEN 1 AND 10`.

On a plan with `kids_welcome`, `party_size` is the adults and `kids_count` the
kids. Seats: `party_size + kids_count`. A playdate still counts one seat a
family.

### 5.4 Counting

`seatsTaken(plan, requests, guests)` adds, for each invitation row with
`status = 'accepted'` and no `invitee_user_id`, `guest_adults + guest_kids`.
`rules.seatsFor` takes the plan, not only its kind.

## 6. Answers without an account (H1)

### 6.1 The two secrets

- **A way in** lets someone answer: an email invitation's token (exists), a
  text invitation's token (exists), or the plan's open link.
- **A guest's key** reads the private parts. One is made when a guest answers;
  the web app keeps it in an HttpOnly cookie for that plan and sends it as
  `guest`. One more is made for each email to the guest (You're in, the
  reminder, a change, their link sent again, the cancellation). Only hashes are
  saved, so an old key cannot be put into a new email.
- **The cancellation email carries no link to the invitation.** Its "Don't send
  me invitations" link still needs a key to say whose address it is, so it
  carries one of its own, which joins the guest's keys like any other.
- **On a plan that is cancelled or over, no key reads the place, the host's
  note, who is going or the bring list.** It reads the card and the guest's own
  answer, so the page can say what happened. The bring list's guest routes
  refuse there.
- **The emailed link is `/plan-invitation/<id>?key=…`**, a web route that
  keeps the key in the cookie and opens `/plans/<id>` without it. It is not
  under `/plans/` because the iPhone app claims that path; the Android app
  claims every path and hands a page it has no screen for to the browser.
- **A guest may hold several keys, and none replaces another.** The link in the
  first email still works after the reminder goes out, and the browser's cookie
  does not stop working because an email was sent. On the day, people look for
  the first email.
- **All of a guest's keys stop working together** when the host removes the
  guest, the invitation is cancelled, or the plan is deleted. Nothing else ends
  one. At most 6 a guest; a seventh drops the oldest.

### 6.2 Reading

`GET /api/public/plans/:id` (exists) takes `invite` (exists), and now `open` and
`guest`. With `plans_guest_answers` on for the host it adds:

```json
{
  "answer": {
    "can": true,
    "via": "open",
    "needs_email": true,
    "kids_welcome": true,
    "room_left": 6,
    "host_says_yes_first": true,
    "mine": { "state": "in", "name": "Dana Lee", "adults": 2, "kids": 1 }
  },
  "for_guest": {
    "place": { "name": "Maya's place", "address": "…", "latitude": 0, "longitude": 0 },
    "guest_note": "Park in the driveway.",
    "going": ["Sam", "Priya"],
    "bring": { }
  }
}
```

- `answer` is null when there is no live way in or the plan takes no answers.
- `answer.mine` needs a valid `guest`. `state` is `in`, `waiting_ok`, `maybe` or
  `cant`.
- `for_guest` is null unless `guest` is valid and the row is in and not
  waiting. `going` is first names only. `bring` is section 7's shape.
- Nothing else in today's answer changes. A private plan with no live way in
  still answers `{ "private": true }`.

### 6.3 Answering

`POST /api/public/plans/:id/answers`

```json
{ "open": "…", "name": "Dana Lee", "adults": 2, "kids": 1,
  "email": "dana@example.com", "answer": "in" }
```

One of `open`, `invite` or `guest`. `answer` is `in`, `maybe` or `cant`.

| Came by | The row | Email | The answer says |
| --- | --- | --- | --- |
| The open link | Made now, `channel = 'open'` | Required | See "At a home" below |
| An email invitation | The host's row, filled in | Known: the address the host typed, which is the host's yes | See "At a home" below |
| A text invitation | The host's row, filled in. The first answer takes it, as the first account does today | Required at a home, optional elsewhere | See "At a home" below |

**At a home, by every way in,** the answer is `{ "state": "check_email" }` and
the key travels only in the email: to the address the guest gave, or for an
email invitation to the address the host typed. Someone holding a forwarded
invitation can answer but never sees the address. **Away from a home** the key
is returned in the answer, by every way in.

**An address that already has a row.** An answer for an address that already
has a row on this plan, arriving without a valid key of that row, changes
nothing on the row and returns no key. It answers `check_email` and sends that
address its link, at a home or not. Otherwise anyone who knows a guest's email
could take over their answer from the open link. With a valid key, the answer
changes the row.

- **Maybe and Can't make it at a home** answer `maybe` and `cant` with no key
  and no email. Only "I'm in" answers `check_email`.
- **An address that said "don't send me invitations"** gets no email, so at a
  home it could never see the address and "Check your email" would not be
  true. Wherever the form asks for an email, an answer with such an address is
  refused: `409 email_opted_out`, "This address asked Pantopus not to email it.
  Use another one." Nothing is saved. A guest changing their own answer, with
  the address already on their row, is not checked again.
- `in` when the room is full: refused `409 full`, with `can_maybe: true`.
- `in` from the open link with `open_invite_ok_first`: saved with
  `needs_host_ok = true`. The seats are held (K5). The host is told. The guest's
  email with the address goes when the host says yes.
- A guest who is in gets one email: the plan, their answer, and their own link.
  For a plan at a home, that link is the only way the address is shown.
- `PATCH /api/public/plans/:id/answers/mine` with `guest`: change the answer or
  the numbers.

Errors use the Plans shape `{ "error": "<code>", "message": "…" }`:
`not_found`, `full`, `ended`, `validation`, `too_many`.

### 6.4 What the host sees and does

- `POST /api/plans/:id/invites/open-link` with
  `{ "host_says_yes_first": true, "rotate": false }` makes or returns the link:
  `{ "url": "…/plan-link/<id>?open=<token>", "message": "…", "host_says_yes_first":
  true }`. At a home `host_says_yes_first` starts true, and the call needs the
  address confirmation that inviting already needs
  (`assertSharesAddressConfirmed`, exists). `rotate` replaces the token; answers
  already given stay.
- `DELETE /api/plans/:id/invites/open-link` turns it off.
- `GET /api/plans/:id/invites` (exists), with `guests=1`, adds to each row
  `"guest": { "name": "Dana Lee", "adults": 2, "kids": 1 }` where there is no
  account, the states `maybe` and `waiting_ok`, `can_ok`, and beside `counts`:
  `"headcount": { "adults": 6, "kids": 3 }`, `counts.maybe`,
  `counts.waiting_ok`, `counts.no_answer`, and `"open_link": { "on": true,
  "url": "…", "host_says_yes_first": true }`. A guest's email is never in it.
- `POST /api/plans/:id/invites/:inviteId/ok` lets a waiting guest in and sends
  their email. `DELETE /api/plans/:id/invites/:inviteId` (exists) removes a
  guest; their keys stop working and their page says "This invitation is no
  longer open." No email goes, as none goes today to a person with an account
  the host removes. (Corrected November 15: this line said "told once", with
  no words fixed anywhere.)
- `POST /api/plans/:id/invites/remind` reminds everyone who has not answered,
  the way each was invited: a push to an account, an email to an address.
  Unopened text invitations have nobody to remind. Once a plan a day, once a
  person (K6). Answers `{ "reminded": 3, "skipped": 1 }`.
- `POST /api/plans/:id/invites/maybe`: an invited account says Maybe. The
  ordinary ask or decline replaces it later.
- A person who is in can change their numbers with the ordinary ask: the new
  `party_size` and `kids_count` are saved when the plan has room for the
  difference, with no new approval; with no room for a larger party it is
  refused `409 full`, "There's no room for more people. Your answer stays as
  it was.", and the old numbers stay. Fewer always save and free their seats.
  No notice goes to the host. (Added November 15: the first build kept the
  first numbers. Built in #4198.)
- The "wants to come" notice carries its two buttons on iPhone as well: its
  category, `PLAN_GUEST_OK`, is one the push sender passes on.
- Creating and changing a plan take `kids_welcome` and, for a private plan,
  `spots` up to 100. The ask takes `party_size` up to 10 on a private plan and
  `kids_count` where kids are welcome.

### 6.5 The plan card

With `guests=1` a card adds `kids_welcome`, and for the host and people who are
in: `"headcount": { "adults": 6, "kids": 3 }`. For the host only:
`"answers": { "in": 9, "maybe": 2, "no_answer": 3 }`, counted in people.
`going_count` and `spots_left` count seats, guests without accounts included.

### 6.6 Emails to a guest without an account

Every one carries the unsubscribe link invitation emails already carry.

**The plan's three.** At most three a plan count against a guest:

1. "You're in" with their link (and, at a home, after the host's yes).
2. One reminder, at the time people who are in are reminded today
   (`rules.reminderAt`).
3. The first change of time or place.

**Outside the three** (made precise on November 15, after the server session's
build showed a cancellation could be held back):

- **The cancellation.** One a plan, to each guest who is in. A guest still
  waiting for the host's yes gets none, as with a change. It is never held by
  the plan's three: it is the one email a guest must not miss.
- **Their link again**, sent when an answer comes for an address that already
  has a row without that row's key (6.3). It does not use one of the guest's
  three, so answering again from a second device costs the guest nothing, and
  nobody holding the open link can use up another guest's emails. It goes only
  if no email went to that guest for that plan in the last 24 hours; otherwise
  nothing is sent and the answer is the same `check_email`.

- **A move to a home** (6.8): the one email to a guest it makes wait.
- **"You're in" after the host's own yes.** It counts as one of the three when
  it is the guest's first, and it is never held by them: a guest the host lets
  in after a move gets it even with three emails behind them.

**The limits that exist hold for all of them**, the cancellation included: 5
emails an address a day from every host together, each counted by its own time
(`email_sent_times`), and an address that said "don't send me invitations" gets
none.

### 6.7 Limits

| | |
| --- | --- |
| Answers from one address an hour | 10 |
| Rows made by a plan's open link | The room plus 20 |
| Invitations a plan (exists: 60) | 160 for a private plan with room over 30 |
| A guest's name | 1 to 100 characters, cleaned as plan text is |

### 6.8 A plan that moves to a home

Decided by the founder on November 15 ("Yes, they wait"). Away from a home, a
guest from the open link is in without the host's yes. When an edit changes
the place of a plan that takes answers from anywhere else to a home:

1. `open_invite_ok_first` turns on. The host can turn it off again.
2. Each guest without an account who came by the open link (`channel =
   'open'`), is in, and never had the host's own yes goes back to waiting:
   `needs_host_ok = true`. Their seats stay held (K5) and their bring-list
   claims stay. While they wait, none of their keys reads the place, the note,
   who is going or the bring list, as for any waiting guest.
3. The host's own yes is recorded when the host lets a guest in
   (`host_ok_at`). A guest the host already let in by hand is not asked again.
   "Let in before" means this and nothing else: a guest made to wait by the
   move does not get back in by changing to Maybe and back, by answering
   again, or because a "You're in" email once went to them.
4. Guests the host invited by email or by a text invitation stay in. So does
   everyone with an account; they are asked "Still coming?" as today.
5. Each guest made to wait gets one email, outside the plan's three (6.6), so
   nobody goes to the old place: "{Host} changed the place of {title}", and in
   the body "{title} is now at {Host}'s home. {Host} lets each guest in. When
   {Host} says yes, the address comes to this email.", with their link, which
   opens the waiting page. Guests who stay in get the ordinary change email.
6. The host gets one notice: "You moved {title} to your home. {n} guests from
   your link are waiting for your yes." It opens Who's coming, where each has
   "Let in" and "Not this time".
7. "Let in" sends "You're in" with the guest's link (6.6). "Not this time"
   removes the guest; no email goes (6.4).
8. `answer.mine` carries `changed` (`time`, `place`, `both`) for a waiting
   guest too, so their page can say the place changed.

A move between two places away from a home, between two homes, or from a home
to somewhere else makes nobody wait.

### 6.9 The open link, for a person who has the app

Decided by the founder on November 15 ("Yes, go ahead"). Boards 21 to 23. The
open link was built for a guest without an account, in a browser. A person who
has the app must be able to answer it as themselves, and no build of either
app may land on a plan it cannot show.

**Why the address changes.** The iPhone opens a web address in the app when
the site's `apple-app-site-association` lists its path, for every build of the
app at once; it lists `/plans/*`. The store builds do not know an open link,
so `…/plans/<id>?open=<token>` would open them on a private plan the person
was not invited to by name. The Android app claims every path and hands a page
it has no screen for to the browser (`WebLinkFallback`, in store builds since
October 20).

1. **The open link's address is `…/plan-link/<id>?open=<token>`.**
   `POST /api/plans/:id/invites/open-link` answers that `url`. `/plan-link/`
   is never added to `apple-app-site-association`.
2. **The web serves the guest's page at `/plan-link/<id>`** (W1, W2, W3): the
   same page the plan's page draws today for `open` and for a guest's cookie.
   It does not redirect to `/plans/`. `/plan-invitation/<id>?key=…` (the
   emailed link) now keeps the key in the cookie and opens `/plan-link/<id>`,
   for the same reason: on Android a browser may pass a `/plans/` address
   back to the app. `/plans/<id>?open=…` keeps working in a browser.
3. **"Open app" carries the link.** On a page opened with a live `open` token,
   the bar's "Open app" (exists) opens `pantopus://plans/<id>?open=<token>`,
   with the store fallback and the copied link it has today. Nothing is added
   to the page.
4. **The apps read `open`.** `pantopus://plans/<id>?open=<token>` and
   `https://…/plans/<id>?open=<token>` on both; `https://…/plan-link/<id>?open=<token>`
   on Android, which is how a new Android build opens the link straight in
   the app. Signed in: the app claims it (5) and shows the plan the claim
   answers. Signed out: an `https` arrival on Android goes on to the browser;
   a `pantopus://` arrival, where the person chose the app, is kept through
   sign-in or sign-up as plan links are today, then claimed. `/plan-link/`
   without `open` goes on to the browser. While Plans is off for the person,
   as any plan link.
5. **Claiming.** `POST /api/plans/:id/invites/claim` (exists, takes `token`)
   also takes `{ "open": "<token>" }`, while the host has
   `plans_guest_answers` and the plan has a live open link with that token.
   It answers the plan as the person now sees it, as it does for `token`.

   | The person | What happens |
   | --- | --- |
   | Runs the plan | Nothing is made |
   | Already has a live invitation or an ask on this plan | Nothing is made |
   | Was removed or turned down by the host on this plan | `404 invite_unavailable` |
   | Is on either side of a block with the host, or could not be invited on Pantopus for any reason `assertInvitable` gives | `404 invite_unavailable` |
   | The link is off, rotated or wrong; the plan is over or cancelled | `404 invite_unavailable` |
   | The open link's rows are at their limit (6.7; accounts count) | `404 invite_unavailable` |
   | Has a verified email that answered this plan in a browser | That answer becomes theirs (8) |
   | Anyone else | An invitation row is made: `channel = 'open'`, `invitee_user_id`, `status = 'pending'`, `needs_host_ok = open_invite_ok_first`, `claimed_at`, `opened_at` |

   From there it is an invitation like any other. "I'm in" is the shipped ask:
   in at once, or, with `needs_host_ok`, an ask the host accepts, exactly as an
   email invitation opened by another account waits today. Maybe is
   `…/invites/maybe`. Can't make it is the shipped decline. `my_invite` gains
   `via: "open"` so the app can say why the host says yes first.
6. **What the host sees.** In the host's list a row from the open link with an
   account carries `via: "open"`, the person's shipped name and picture, and
   the id of their ask. Waiting for the host's yes (`asked`) it sits with the
   guests who wait; "Let in" is the shipped accept of that ask, with its
   address confirmation the first time at a home, and "Not this time" the
   shipped decline. The shipped notices for an ask tell the host.
7. **A move to a home (6.8) covers them.** A person with an account whose
   invitation came by the open link, who is in, and whose ask the host never
   accepted by hand goes back to waiting when the plan moves to a home: the
   ask returns to pending, `needs_host_ok` turns on, they leave the plan's
   chat as anyone who is no longer in does, and they read no address. They get
   one notice: "{Host} moved {title} to a home. {Host} lets each guest in, and
   you'll hear when {Host} says yes." They count in the host's one notice.
8. **A browser answer follows the person into the app.** A row answered in a
   browser whose email is a verified email of an account becomes that
   account's, with the answer: when that account claims the open link, when it
   claims an email invitation's token (this replaces "answers anew", which is
   how it was built), and where signing in already attaches email invitations
   (`attachEmailInvites`). In becomes an accepted ask with `party_size` the
   adults and `kids_count` the kids, so the seats do not change; waiting
   becomes a pending ask with `needs_host_ok`; Maybe and Can't make it stay
   what they are. `host_ok_at` is kept as the host's yes. Their bring-list
   claims become the account's. The guest's keys end; their old links then
   read what a signed-out stranger reads. Only a verified email does this:
   an address someone typed is not proof.

**Made precise by the build** (the server session's choices on #4196,
confirmed by the designer):

- "I say yes first" also governs a link row whose person has not asked yet:
  the row follows the host's switch, and turns on at a move to a home, so
  nobody who claimed a link at a cafe is in at the home without the yes.
- A person the host let in by hand is not asked again after a Maybe and back.
- The account's verified email is kept on its open-link row and never shown
  to the host. An answer from that address in a browser is told to answer in
  the app, and a person the host removed cannot come back through a browser
  with it.
- Nothing moves into an account that already has its own answer, invitation
  or refusal on the plan.
- The notice to a person the move makes wait has the type
  `plan_moved_home_wait`.
- "Open app" opens `pantopus:///plans/<id>?open=<token>`, the form the share
  page already uses.
- Every refusal of a claim answers the same `404 invite_unavailable`.
- `accessTokenVerifier` treated an address Supabase had not confirmed as
  confirmed on one path (it read a missing `email_confirmed_at` as present).
  It is fixed. Its only readers are `verifyToken` and Plans' own check of
  whose an email invitation is, so nothing outside Plans changes; inside
  Plans an unconfirmed address no longer counts as the invited person's.

**Data.** No new column. `plan_invite_channel_fields` is widened so an `open`
row may carry an account and no email. One additive migration
(`20261116020000_plans_open_link_accounts`).

## 7. The bring list (H2)

### 7.1 The value

`Plan.bring_list`:

```json
{ "rev": 7, "guests_can_add": true,
  "items": [ { "id": "a1b2c3d4", "label": "Rolls", "note": "Two dozen",
               "by": "host",
               "claim": { "kind": "guest", "id": "<invite id>", "name": "Dana", "at": "…" } } ] }
```

- Up to 30 items. `label` 1 to 60 characters, `note` up to 80.
- `claim.kind` is `host`, `user` (an account that is in; `id` is its request)
  or `guest` (`id` is its invitation). `name` is a first name, saved so the list
  reads without a lookup. One claim an item.
- Every change writes the whole value with `rev + 1`, only if `rev` is still
  the one read: `plan_bring_swap(post_id, expected_rev, list)`, a small SQL
  function that returns whether it wrote. The server re-reads and tries again up
  to three times, then answers `409 bring_changed`.
- When someone leaves or is removed, their claims are cleared.

### 7.2 Routes

| Route | Who | What |
| --- | --- | --- |
| `PUT /api/plans/:id/bring` | The host | Replace the items (`label`, `note`, `id` for ones kept) and `guests_can_add`. Claims on kept items stay |
| `POST /api/plans/:id/bring/:itemId/claim`, `DELETE` the same | An account that is in, or the host | Claim or give back |
| `POST /api/plans/:id/bring/items` | An account that is in, when `guests_can_add` | Add one item, claimed by them |
| `POST /api/public/plans/:id/bring/:itemId/claim`, `DELETE`, and `POST /api/public/plans/:id/bring/items` | A guest with their key | The same three |

The list is sent in a card as `bring` to the host and to people who are in, and
in `for_guest` (6.2): the same shape, with `claim` reduced to
`{ "name": "Dana", "mine": false }` and `open_count`.

A plan among friends only. A business's plan has no bring list.

## 8. Occasions (H3)

`backend/services/plans/planOccasions.js`, a fixed list on the server:

| Key | Reads | Starts as | Fills in |
| --- | --- | --- | --- |
| `thanksgiving` | Thanksgiving dinner | Food & drinks, dinner | Private, my place, kids welcome, a bring list of seven usual things, 3:00 to 8:00 PM on Thanksgiving Day |
| `friendsgiving` | Friendsgiving | Food & drinks, potluck | Private, kids welcome, a bring list |
| `holiday_party` | Holiday party | Food & drinks | Private |
| `gift_exchange` | Gift exchange | Something else | Private. The gift exchange extra is not built yet |
| `new_years_eve` | New Year's Eve | Food & drinks, drinks | Private, 8:00 PM to 1:00 AM on December 31 |
| `birthday` | Birthday | Something else | Private, kids welcome |

- `GET /api/plans/occasions` answers the ones in season, each with `key`,
  `text`, `kind`, `details` and the values it fills in. Seasons:
  Thanksgiving and Friendsgiving from November 1 to Thanksgiving Day; Holiday
  party and Gift exchange from November 15 to December 31; New Year's Eve from
  December 10 to December 31; Birthday always.
- The app draws the "Coming up" strip from that answer and opens the host form
  with the values filled in. Everything stays editable.
- A plan saves `occasion`. A card adds `"occasion": { "key": "thanksgiving",
  "text": "Thanksgiving dinner" }`, which the plan's tag reads in place of its
  kind's name. The kind, its color and its pin are unchanged.

## 9. Deals without money (B1)

### 9.1 Data

`Plan.deal`, `jsonb`, null on a plan with none. Allowed only where
`business_user_id IS NOT NULL` (`plan_deal_needs_business`).

```json
{ "scope": "group", "kind": "free_item", "item": "appetizer for the table",
  "group_size": 12, "group_by": "2026-11-20T01:00:00Z",
  "if_short": null, "state": "open", "settled_at": null }
```

| Field | Values |
| --- | --- |
| `scope` | `everyone`, `group` |
| `kind` | `free_item` in this step. `percent`, `amount`, `two_for_one` come with money (10.4, 11) |
| `item` | 1 to 40 characters, for `free_item` |
| `value` | The percent (5 to 50) or cents, for the money kinds |
| `applies_to` | For the money kinds: `spot`, `food`, `no_alcohol` |
| `group_size` | 2 to the plan's spots |
| `group_by` | Between now and the plan's start |
| `if_short` | `null`, or a smaller deal of the same shape with `scope: "everyone"`. Always an object or null, never a word |
| `state` | `on` (a deal for everyone), `open`, `unlocked`, `short` |

`PlanRequest` gains `deal_used_at timestamptz` and `deal_cents integer`.

### 9.2 Behavior

- The Plans tick (exists, every 5 minutes) settles a group deal at `group_by`:
  seats in at that moment against `group_size`. It writes `state` and
  `settled_at` once, then sends the notices.
- People who join after an unlock get the deal too. People who joined before a
  deal fell short keep their place.
- A card adds, with `biz=1`:

```json
"deal": { "scope": "group", "text": "A free appetizer for the table",
          "state": "open", "group": { "size": 12, "in": 8, "left": 4, "by": "…" },
          "mine": { "state": "ready", "used_at": null } }
```

  `text` is written by the server from the fixed kinds. `mine` is there for a
  guest who is in; `ready` once the deal is on or unlocked.
- **Every word of a deal is the server's** (settled November 16 with the
  Android session: an app never composes "20% off"). The card's `deal` also
  carries:

  | Field | Example | Where it shows |
  | --- | --- | --- |
  | `tag` | "Deal", "20% off" | The one tag on a list row |
  | `short` | "A free appetizer", "20% off food" | "Your deal" |
  | `condition_text` | "if 12 people are in by Friday at 5:00 PM" | Under the sentence, for a group deal |
  | `group.left_text` | "2 days left", "3 hours left", "Closes at 5:00 PM" | The time left |
  | `if_short_text` | "If it doesn't get to 12, the night still happens, without the deal." | Under the count, while open |
  | `state_text` | "Unlocked: 14 are in", "It didn't get to 12. The night still happens." | The banner or the card, once settled |
  | `join_text` | "Free to join. Show your deal there." | Under the join button |
  | `mine.text` | "Show this to your server." | "Your deal" |
  | `mine.name` | "Dana" | "Your deal" for something free, so staff can match the person (K8) |
  | `known_going` | first names of people the viewer knows who are in | The faces line; as the Plans with businesses contract, 5.4 |

- `POST /api/plans/deal-preview` takes `{ "business_user_id", "deal", "spots",
  "starts_at" }` and answers `{ "text", "condition_text", "if_short_text",
  "claim_text", "errors": { "<field>": "<words>" } }`.
- The answer that lists who a person may host as carries, for each business,
  `"can": { "deals": true, "price": false, "pay_here": false }` and
  `"payouts_ready": false`, so the form knows which rows to draw and when to
  offer the payout setup.
- Posting and changing a business's plan take `deal`. A deal cannot change once
  anyone is in, except to be removed, which tells everyone.
- `POST /api/plans/deal-preview` (staff with `plans.manage` for the business)
  takes a `deal` and the plan's spots and start, and answers the sentence a
  guest will read, the line on how it is claimed, and any field's error. The
  form shows it; nothing is saved.
- `POST /api/plans/:id/requests/:requestId/deal-used` (staff with
  `plans.manage`) marks a "something free" pass used. It cannot be undone by
  staff.
- A row in the list shows one tag (design rule 1): the deal's short text
  ("Deal", or "20% off" for a percent).

## 10. Paying to join (B0, B2, B3, B4)

### 10.1 The shared pieces first (B0)

Built as the business graph's contract says (its sections 4 and 5), with these
changes for the decisions of November 15:

- `Payment.sold_type` also takes `plan_bill` and `plan_tip`.
- `Payment` gains `tip_cents integer`: the part of the amount that is a tip.
- `priceSale` takes what was sold:

```
priceSale({ businessUserId, soldType, amountCents, basis })
  → { feePct, feeBasis, platformFeeCents, cardFeeBorneBy }
```

| `soldType` | `basis` | Pantopus keeps | The card fee |
| --- | --- | --- | --- |
| `plan_spot` | `pantopus` | `getEffectiveFeeRate(business)`: 15%, the founding 10%, a verified type's rate, or an override | Paid by Pantopus |
| `plan_spot` | `own` | 5%, or the business's own rate if lower; nothing for a founding business in its founding year | Paid by the business |
| `plan_bill` | `pantopus` | 5%, or the business's own rate if lower | Paid by the business |
| `plan_bill` | `own` | 1%, or the business's own rate if lower; nothing for a founding business in its founding year | Paid by the business |
| `plan_tip` | | Nothing | Paid by the business |
| anything else | `pantopus` | As today | As today |

  `platformFeeCents = floor(amountCents × feePct ÷ 100)`. `amountCents` never
  includes a tip.
- Where the business pays the card fee, its share is fixed when the charge has
  succeeded and the card company has reported the charge's fee (K9):
  `amount_to_payee = amount_total − platform fee − card fee`.
- **When the card company reports no fee** (found November 16: the test
  platform reports 0 on every charge, which is what an account billed its fees
  separately does): the card fee is the payments design's standard rate, 2.9%
  of the amount, rounded, plus 30 cents. The payment records which was used,
  `card_fee_source`: `reported` or `standard_rate`. Whether production reports
  a fee is the founder's to look at in the payment company's dashboard.
- A payout waits for `payout_after`. A plan sets it to 48 hours after the plan
  ends.

### 10.2 Joining a paid plan (B2)

As the Plans with businesses contract, section 5.6: `Plan.price_cents` (100 to
50000), `PlanRequest` status `paying` with a 10-minute hold, the payment
captured at once with `payment_type = 'plan_payment'`, the request made
`accepted` by the payment's webhook or by `confirm`. Its columns on
`PlanRequest` (4.2 there) are added as written. Changed here:

- Only a business with `document_verified` or `government_verified` **and its
  own payout account with payouts enabled** may set a price (P8). Otherwise
  `409 payout_account_needed`.
- The payment carries `sold_type = 'plan_spot'`, `sold_id` (the request),
  `fee_basis`, `fee_pct` and `payout_after`.
- `place_kind = 'online'` with a price is refused (P12), by the server and by a
  database check.
- Refunds follow [02-payments.md](02-payments.md), section 8, through
  `paymentRefundService`. `PlanRequest.refund_until` is the plan's start less 24
  hours.
- A card adds `"price": { "cents": 1800, "text": "$18", "line": "$18 a person",
  "join_text": "$18 a person. Full refund until Friday at 10:00 AM." }` and,
  for a guest who paid, `"paid": { "cents": 1800, "text": "Paid $18.00",
  "refund_until": "…", "leave_back_cents": 1800, "leave_text": "You'll get
  $18.00 back.", "receipt": { "link": "…" } }`. `leave_text` is what the
  person gets back if they leave now, worked out by the server (it differs
  from `refund_until` after a group price fell short or a part was refunded).
  `receipt.link` is a link the apps already open, to the receipt in Mail.
- **A quote before joining.** `POST /api/plans/:id/requests/quote` with
  `{ "party_size", "kids_count" }` answers what the sheet shows, with no side
  effect: `{ "spots", "each_text", "total_cents", "total_text", "group":
  { "in", "size", "text": "If 10 are in by Thursday at 6:00 PM, everyone pays
  $14 and $4.00 comes back to your card." } | null, "refund_text" }`. An app
  never multiplies a price.
- **A charge that succeeds after the 10-minute hold ended.** If the plan still
  has room for the party, the person is in. If it filled meanwhile, the whole
  payment is refunded at once and `confirm` answers `409 full`, "This filled
  while you were paying. Your {$18.00} is on its way back."
- **What may change after posting.** `pay_here` and `tips_on` at any time. A
  price only while nobody is in or paying.
- One error code for a business that may not charge: `409
  payout_account_needed`.

### 10.3 Paying from the web page (B3)

The plan's web page (`frontend/apps/web/src/app/(site)/plans/[id]`) gains, for a
business's plan: sign-in with Apple or Google (the web's existing sign-in), the
join call, and the payment company's web payment form with Apple Pay and Google
Pay. It calls the same routes as the apps. No account-less payment.

### 10.4 Deals with money (B4)

- `deal.kind` `percent` or `amount` with `applies_to: "spot"`, scope
  `everyone`: a card's `price` adds `"was_cents": 1800` and the guest is
  charged the deal price.
- Scope `group`: the guest is charged `price_cents`. When the deal unlocks, the
  tick refunds each paid request the difference, once, through
  `paymentRefundService` with reason `group_price` and the key
  `plan-group:<request id>`. The fee is re-priced on what the guest paid in the
  end; Pantopus absorbs the card fee on the part returned. A request paid after
  the unlock is charged the group price.
- A group price that falls short: every guest may leave with a full refund
  until the plan starts, whatever `refund_until` says.
- **Paying out a payment that was refunded in part** (settled November 16 with
  the server session). Today the payout job and its database functions release
  only a payment with nothing refunded, and a partial refund of an invoice is
  refused. A group price coming back, and a staff refund of part of a bill
  (11.2), are partial refunds of a payment not yet paid out. For `plan_spot`
  and `plan_bill` only, the business's share is re-priced at the refund on what
  the guest paid in the end, and such a payment is released with that amount.
  It is done with a new function that only these payments reach where that is
  possible; the functions that pay gigs and invoices are replaced only if it is
  not, and then with every existing branch as it is, shown by comparing the
  same payments before and after. Every other payment kind keeps today's rule.
- **Two worked examples for a group price** (added November 16; a $18 spot,
  group price $14, the card company's reported fee on the $18 charge $0.82).
  The business bears the card fee in proportion to what the guest paid in the
  end; Pantopus absorbs the rest. (02-payments' "about 12 cents" was an
  estimate; this is the rule.)

  | | A guest Pantopus brought | The business's own guest |
  | --- | --- | --- |
  | Charged, then returned | $18.00, $4.00 back | $18.00, $4.00 back |
  | Paid in the end | $14.00 | $14.00 |
  | Pantopus's cut | 15% of $14.00 = $2.10 | 5% of $14.00 = $0.70 |
  | Card fee borne by the business | none | round($0.82 × 14 ÷ 18) = $0.64 |
  | The business gets | $11.90 | $12.66 |
  | Pantopus, after the card fee it pays | $2.10 − $0.82 = $1.28 | $0.70 − $0.18 = $0.52 |

- A card's `deal` adds `"price_cents": 1400` and, for a guest,
  `"mine": { "back_cents": 400, "back_at": "…" }`.

## 11. The bill at the place, with tips (B5, B6)

Gate: the accountant's answer on sales tax ([02-payments.md](02-payments.md),
section 9).

### 11.1 Data

A check is a `BusinessInvoice` (exists) tied to a plan. Added columns:

| Column | Type | Meaning |
| --- | --- | --- |
| `plan_post_id` | `uuid` | The plan |
| `plan_request_id` | `uuid` | The guest's place in it |
| `no_deal_cents` | `integer`, default 0 | The part of the amount the deal does not cover (K7) |
| `discount_cents` | `integer`, default 0 | What the deal took off |
| `tip_cents` | `integer`, default 0 | |
| `started_by` | `text`: `business`, `guest` | |

`Plan` gains `pay_here boolean` and `tips_on boolean`, both needing a business.
`total_cents = subtotal_cents − discount_cents + tip_cents`.

A check sends no bill letter to Mail. Once paid, its receipt is filed in the
guest's Receipts as a paid invoice is today.

### 11.2 Routes

| Route | Who | What |
| --- | --- | --- |
| `POST /api/plans/:id/checks` | Staff with `plans.manage` | `{ "request_id", "amount_cents", "no_deal_cents" }`. Makes the check and tells the guest |
| `POST /api/plans/:id/checks/mine` | A guest who is in | `{ "amount_cents" }`. Only on a plan with no deal on the bill (K7) |
| `GET /api/plans/:id/checks/mine` | A guest | Their open check: the amount, the deal line, the tip choices |
| `POST /api/plans/:id/checks/:checkId/pay` | The guest | `{ "tip_cents" }`. Answers the payment sheet's values. The server computes the discount and the total; the app never sends them |
| `GET /api/plans/:id/checks` | Staff | The guest list of board 14: each guest's first name, where they came from, their check's state, amount and tip |
| `POST /api/plans/:id/checks/:checkId/refund` | Staff | All or `{ "amount_cents" }`, until 48 hours after the plan ends |

- The discount: the plan's deal, if it is on or unlocked and the guest has not
  used it, on `amount_cents − no_deal_cents`. Paying sets
  `PlanRequest.deal_used_at` and `deal_cents`.
- The tip choices: 18%, 20% and 25% of `amount_cents`, before the deal, each
  sent as cents, plus another amount and none. Sent only when `tips_on`.
- The payment: `sold_type = 'plan_bill'`, `amountCents` to `priceSale` is the
  subtotal less the discount, `tip_cents` beside it, `payout_after` as a paid
  spot's.
- A payment that succeeds reaches the staff's list within a few seconds (the
  socket the plan's guests use, or the list asked again every 5 seconds while
  it is open), and the guest's app shows board 13.
- **Totals are the server's** (settled November 16). `GET …/checks/mine`
  carries the lines as text and cents and, when tips are on, `"tip_choices":
  [{ "label": "18%", "tip_cents", "tip_text": "$8.64", "total_cents",
  "total_text": "$47.04" }, …]` and `"no_tip": { "total_cents", "total_text" }`.
  For another amount, `POST …/checks/:checkId/quote` with `{ "tip_cents" }`
  answers the lines and the total, with no side effect.
- **Learning that it is paid.** `POST …/checks/:checkId/confirm`, as a paid
  spot has: it answers the paid check, `{ "state": "paid", "paid_text": "Fri,
  Nov 20 · 8:52 PM", "payer": "Dana L.", "method_text": "Apple Pay", the
  lines, "total_text", "receipt": { "link" } }`, and is safe to call twice.
  `GET …/checks/mine` answers the same after a relaunch.
- **A check is never an ordinary invoice to the guest.** It does not list in
  Wallet's received invoices or in Mail as a bill, and the invoice pay route
  refuses it; it is paid only through its own route, with its deal and tip.
- The check's notice links to the plan with `metadata.opens: "check"`.
- A second check to a guest who used their deal carries no discount.

### 11.3 The tip's share of the card fee

For the statement: `round(card fee × tip_cents ÷ amount_total)`. It is shown
beside the tip and is already inside the card fee the business pays; it is not
charged twice.

### 11.4 Disputes

`disputeService` gains a plan's evidence: the request (when the guest joined and
by which way in), the check and who started it, the payment time, and the
plan's chat.

### 11.5 Tips after a paid plan, and the statement (B6)

- `POST /api/plans/:id/tip` with `{ "amount_cents" }`: a guest who paid for a
  spot, on a plan with `tips_on`, once, until 7 days after the plan ends. A
  separate charge with `sold_type = 'plan_tip'`. The card carries, while it may
  be given, `"tip_later": { "until": "…", "choices": [{ "label": "18%",
  "tip_cents", "tip_text" }, …] }`; the route answers the payment sheet's
  values, and its `confirm` answers `{ "state": "paid", "text": "You tipped
  $5.00" }`.
- The statement is the shared one (`GET /api/businesses/:businessId/statement`,
  the business graph's shared contract 5.4). It is not built yet: this step
  builds the route, behind `business_statement` (off), for staff with
  `finance.view`. Its `by_feature` carries `plan_spot`, `plan_bill` and
  `plan_tip`, and `totals` carries `tips_cents`, `tip_card_fee_cents` and
  `deal_cents`. No screen is built here: the statement's screens are the
  business graph's own phase D.

## 12. Notices

Sent through `planNotifications.js`, held for quiet hours as Plans notices are.

| When | To | Words |
| --- | --- | --- |
| A guest without an account answers | The host | "Dana Lee is in: 2 adults, 1 kid." Several in an hour become one |
| An answer waits for the host's yes | The host | "Dana Lee wants to come. Let them in?" with Let in and Not this time |
| The host moved a plan to a home and guests from the link now wait (6.8) | The host | "You moved Friendsgiving to your home. 3 guests from your link are waiting for your yes." For one: "1 guest from your link is waiting for your yes." Once a move. Type `plan_moved_home`, no buttons |
| Bring-list items are claimed | The host | At most one in 30 minutes: "3 things are taken. 2 are still open." |
| Items are still open two days before | People in who claimed nothing | "2 things are still open for Thanksgiving dinner." Once |
| A group deal is close | People in, and people who opened the plan and did not join | "2 more and trivia is 20% off. It closes at 5:00 PM." Once, in the last day |
| A group deal unlocks | People in | "Unlocked: 20% off food tonight." |
| A group deal falls short | People in | What happens now, in one line |
| Money comes back on a group price | The guest | The amount and that a bank can take a few days |
| A check arrives | The guest | "Your check from Example Taproom: $48.00." |
| A check is paid | Staff with `plans.manage` | On the guest list, no push |

## 13. Web

- The plan's page (exists) draws boards 5 and 6 when the answer has `answer`:
  the form, the three answers, and after answering the guest's part. It keeps
  the guest's key in an HttpOnly cookie and never puts it in a link the page
  shows.
- The same guest's page is served at `/plan-link/<id>`, which is where the
  open link and the emailed link now lead (6.9). "Open app" on it carries the
  open link into the app.
- With the switch off, or for a plan that takes no answers, it is today's page.
- B3 adds sign-in and payment for a business's plan.
- Every state in light and dark, at phone width first.

## 14. Apps (iPhone and Android)

Both send `guests=1` once they draw H1.

| Step | The host | A guest with the app |
| --- | --- | --- |
| H1 | "Share a link" beside the invitation ways, with "I say yes first"; the answers and the counts on the plan (board 4); Let in, Remove, Remind; room up to 100 and "Kids welcome" on the form (board 3) | Adults and kids on "I'm in"; Maybe |
| H2 | The bring list on the form and on the plan; add, rename, remove | The list on the plan; claim, give back, add one |
| H3 | The "Coming up" strip above the kinds (board 2); the form filled in | The occasion's name on the plan's tag |
| B1 | The deal form (board 9); "Mark used" on the guest list | The deal card (board 7); the pass for something free |
| B2, B4 | The price row; who paid, on the guest list | Join and pay (board 11); the receipt; leaving with a refund; money back |
| B5, B6 | "Send a check", refund (board 14) | The check, the tip, pay (board 12); Paid (board 13) |

With H1 both apps also read an open link (6.9, boards 21 to 23): the person
claims it and answers as an invited person; the host sees them in Who's coming.

The Plans tab gains the "Yours" section above "This week nearby" (board 1) with
H1. Its map, sheet, rows and tab bar are otherwise as shipped. The side menu
button stays.

## 15. Funnel

`FunnelEvent` types, widened as `20261031190000_plan_invites.sql` did:
`plan_open_link_made`, `plan_guest_answered` (with `via` and `answer`),
`plan_guest_let_in`, `plan_bring_claimed`, `plan_occasion_started`,
`plan_deal_set`, `plan_deal_unlocked`, `plan_deal_short`, `plan_paid`,
`plan_check_sent`, `plan_check_paid`, `plan_tip_paid`.

## 16. Done when

Each step is checked in the real apps against a local stack and backend, as
`AGENTS.md` asks; an API answer alone does not count.

**H1**

- A host on an iPhone simulator makes a private dinner at home and shares the
  link. In a browser with no account, a guest answers "I'm in" with 2 adults and
  1 kid. The host gets the notice, lets them in, and the guest's email arrives
  (Mailpit) with a link that shows the address. Before the yes, nothing shows
  it: not the page, not the API with the open token alone.
- The same on an Android emulator as host.
- The counts on the host's plan read 2 adults and 1 kid more, and survive a
  relaunch.
- A second browser holding only the open link reads no address, no guest's
  name and no bring list.
- A removed guest's link stops showing the address.
- The link in the "You're in" email still shows the address after the reminder
  has been sent, and so does the browser that answered.
- An answer from the open link with an address that already answered, from a
  browser without that guest's key, changes nothing and returns no key; the
  address gets an email with its link.
- At a home, an email invitation and a text invitation answered in a browser
  return `check_email` and no key.
- A guest who already got "You're in", the reminder and a change still gets
  the cancellation. A guest waiting for the host's yes gets none.
- The cancellation email has no link to the invitation, and its "Don't send me
  invitations" link works. With any of the guest's keys, a cancelled plan's
  page shows no address, note, names or bring list.
- A second answer for the same address inside a day, without its key, sends
  nothing and answers the same. A guest's reminder still goes after their link
  was sent again.
- An address that asked not to be emailed is refused at the form with its own
  words, and nothing is saved.
- A plan at a cafe with three guests from the open link, one of them let in by
  hand while "I say yes first" was on, and one guest invited by email, moves
  to a home: the two never let in wait and every link of theirs shows no
  address; the other two stay in; "I say yes first" is on; the host gets the
  one notice.
- A guest made to wait by the move changes to Maybe and back to I'm in, and
  answers again from the open link: still waiting.
- Each guest made to wait got the one email, a guest with three emails behind
  them included. After "Let in", "You're in" arrives and that link and their
  older links show the address.
- A move from one cafe to another, and from a home to a cafe, makes nobody
  wait.
- With `plans_guest_answers` off, the page and every Plans answer are today's.
- An app build without `guests=1` still opens the plan and its invitation list.

**H1, the open link with the app (6.9)**:

- The host's "Share a link" gives a `/plan-link/` address.
- On an iPhone with the store build and with the new build, and on an Android
  phone with the store build, tapping the open link in Messages ends on the
  browser page with the form. So does the emailed "You're in" link, with the
  address. Neither ends on the app's page for a private plan.
- On Android with the new build, signed in, the open link opens the plan in
  the app. Signed out, it opens the browser page.
- "Open app" on the browser page opens the new build on that plan, with
  "{Host} invited you".
- Without "I say yes first", "I'm in" puts the person in and the place shows.
  With it, they wait; the host sees them under "Waiting for you" with their
  name and picture; after "Let in" the address shows.
- A person the host removed, and a person on either side of a block, get
  "This invitation isn't available anymore."
- A guest who answered in a browser with the email their account has verified
  signs in to the app: the plan is under "Yours" with the same answer and
  numbers and their bring-list claim; the host's list has one row for them,
  and the seats did not change. With an email the account has not verified,
  nothing moves.
- After a move to a home, a person with an account from the open link who
  never had the host's yes waits, reads no address and is out of the chat;
  one the host accepted by hand stays in.
- A store build on either phone still opens its plans and invitations as
  before.

**H2**: two guests claim the same item within a second; one gets it and the
other sees it taken. A guest in a browser claims and gives back. Leaving clears
claims.

**H3**: the strip shows the occasions in season for the server's date; a plan
started from one posts, and an app build from before H3 opens it as its kind.

**B1**: a group deal with a deadline five minutes ahead unlocks on the tick with
enough people in and falls short without; each notice arrives once; "Mark used"
shows on the guest's phone. Also:

- A person's own plan, and a business without `plans.manage`, cannot carry a
  deal. A deal cannot be changed once anyone is in; removing it tells them.
- Someone who joins after an unlock has the deal; someone who was in when it
  fell short keeps their place.
- A row in the list carries one tag; the filter shows only once the list holds
  a business's plan.
- With `plans_deals` off, every Plans answer and screen is today's, with and
  without `biz=1`.

**B2 to B6**: in the payment company's test mode, with a business whose test
payout account is enabled: the four worked examples of
[02-payments.md](02-payments.md) come out to the cent in `Payment`, in the
refund, and in the statement; a refund before the plan returns everything; the
payout is not sent before `payout_after`. Also:

- B0: a $160 invoice paid in test mode pays the crew exactly what it does
  today, on the web, iPhone and Android; every existing payment kind prices as
  it did (compare before and after on the same payments).
- B2: a business without verification or without its own enabled payout
  account cannot set a price; an online plan cannot have one; a place is held
  for 10 minutes while paying and freed after; leaving before `refund_until`
  returns everything and after it nothing.
- B3: a person with no account joins and pays from the web page after signing
  in, with Apple Pay or Google Pay in test mode.
- B4: a group price that unlocks returns the difference once to each guest who
  paid more; one that falls short lets every guest leave with a full refund
  until the plan starts.
- B5: with a deal on the bill only staff start a check; the part marked as not
  covered gets no discount; the guest's app never sends a discount or a total;
  the staff's list shows the payment within a few seconds; a refund by staff
  works until 48 hours after the plan ends and not after.
- B6: one tip after a paid plan, within 7 days, once.
- Every paid step with its switch off: every answer and screen is today's.

## 17. Open questions

1. Whether a card statement can read "PANTOPUS" and the business's name under
   separate charges and transfers. If not, P13 needs another way.
2. Whether the web's sign-in with Apple and Google returns to a plan's page
   with the join kept.
3. Whether `BusinessInvoice` payments by hold and capture suit a check, or a
   check should capture at once as a paid spot does.
4. Whether a guest's key should also live in the browser beyond a cookie, for a
   guest who clears cookies and has no email on file (a text invitation).
5. The date the Gift exchange, Find a date and Chip in extras are drawn; each
   needs its own boards before a contract.
6. Decided November 15: a plan that moves to a home makes guests from the open
   link wait for the host's yes (6.8).
7. A guest held by the day's five gets "Check your email" and no email until
   they answer again a day later. Nothing tells them. Left as it is.
8. Decided November 15: a person who has the app answers the open link as
   themselves (6.9).
9. Whether a browser on Android hands a `/plans/` address reached by a
   redirect back to the app. 6.9 keeps guests off `/plans/` so it cannot
   matter; the Android session checks it on a phone with the store build.
10. On iPhone the open link opens the browser first, also for a new build. It
    can open the app directly once `/plan-link/*` is added to
    `apple-app-site-association`, which sends every build there: only after
    the store builds that do not know it are rare.
