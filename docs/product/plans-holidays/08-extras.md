# Plans for the holidays: the extras

November 16, 2026. Six additions the founder agreed to on November 15 ("I
agree with your additions") and asked to have built on November 16 ("all the
things we discussed and in the designs and plans"): find a date, chip in, gift
exchange, photos afterwards, the same people again, and one person paying for
a group. This file is their design, contract and screens in one place. The
rules of the other documents all hold: [03-build-contract.md](03-build-contract.md)
section 3, [06-screens.md](06-screens.md)'s rules, "Keeping Plans clean" in
[01-design.md](01-design.md).

Boards 24 to 31 on the canvas; pictures `24-…` to `31-…` in [screens/](screens/).
They were checked by rendering them in light and dark, not in the canvas page
and not on a phone. The founder had not looked at them when this was written;
a change the founder asks for changes this file first.

## 1. What they share

- **Each is an extra the host switches on** in "Add to this plan" on the host
  form (board 3, expanded on board 26). Off, nothing of it shows anywhere.
- **Each has its own switch**, read for the plan's host, starting off:
  `plans_find_date`, `plans_chip_in`, `plans_gift_exchange`, `plans_photos`,
  `plans_same_people`, and for a business's plan `plans_group_pay`.
- **No new table.** Each keeps one JSON value on `Plan`, changed by revision
  number as the bring list is (contract 7.1, `plan_bring_swap`): a write
  carries the revision it read and is refused `409 changed` if another came
  first.
- **The app marker `extras=1`.** A build that does not send it never gets a
  plan whose date is still being picked, and reads every other plan without
  the extras' fields.
- **Private plans hosted by a person**, except paying for a group, which is a
  business's paid plan. Never a playdate.
- **Guests without an account take part through their own link** where this
  file says so, with the secrets and limits of contract 6.
- Every word a person reads is the server's where it names money or a date.

## 2. Find a date

Boards 24 (`DatePick`), 25 (`DateHost`), 26 (`ExtrasForm`).

**What it is.** The host offers two to five times. Everyone invited ticks the
ones that work. The host picks one; the people who ticked it are in.

**Data.** `Plan.date_options jsonb`, null on a plan with a set date:

```json
{ "rev": 4,
  "options": [{ "id": "a", "starts_at": "…", "ends_at": "…" }],
  "ticks": { "p:<user id>": ["a", "b"], "g:<invite id>": ["b"] },
  "picked": null }
```

While it is not null and `picked` is null, the plan is "picking":
`Post.event_date` holds the earliest option so lists can order it, and nothing
that runs on the plan's time runs (reminders, "Still coming?", the bring
list's reminder, repeats). A plan that repeats cannot use it.

**Routes.**

| Route | Who | What |
| --- | --- | --- |
| Creating and changing a plan take `date_options: [{ starts_at, ends_at }]` | The host | 2 to 5, each in the future and within the plan's limits. Changing them once anyone ticked clears the ticks for a removed time and tells nobody |
| `PUT /api/plans/:id/dates/mine` `{ "options": ["a","b"], "party_size", "kids_count" }` | An invited person | Their ticks and their numbers. An empty list is "none of these" |
| `PUT /api/public/plans/:id/dates/mine` | A guest, by a way in or their key | The same, with the name and email rules of contract 6.3. At a home the answer is `check_email` and the link in the email opens their ticks |
| `POST /api/plans/:id/dates/pick` `{ "option_id" }` | The host | Sets the plan's time and `date_options.picked` to that id, and settles everyone (below) |

**Picking settles everyone, once.**

- A person who ticked the picked time is in, with the numbers they gave, in
  the order they answered, while there is room; past the room they are on the
  waitlist as today. Where the host's yes is needed (contract 6.3, 6.9) they
  wait for it instead.
- Everyone else who was invited is asked: an invitation as today, with the
  time.
- Notices: to those now in, "{title} is {Sunday, Nov 22 at 4:00 PM}. You're
  in."; to the others, "{title} is {Sunday, Nov 22 at 4:00 PM}. Can you make
  it?"; a guest without an account gets the same by email with their link.
  These emails are outside a guest's three (contract 6.6).
- The host may change the time afterwards as any plan's time changes today.

**Settled while it was built** (November 16; the designer's calls after the
server session asked, told to the founder):

- **While the host is picking, ticking is answering.** A guest's ticks are
  kept on their invitation row as answered and not in. The host's lists do not
  show them as Maybe and do not count them under "no answer", and "Remind the
  {5} who haven't answered" skips everyone who saved their times, "none of
  these" included. In a browser the times card takes the place of W1's three
  buttons, with the name, the numbers and the email as W1 asks for them.
- **At a home, a browser guest's saved times answer `check_email`**, as an
  "I'm in" does (contract 6.3), so the guest can come back to their ticks only
  through their own link. That email: subject "Your times for {title}",
  heading "Your times are saved", the line "{Host} is picking a date. You'll
  hear when {Host} chooses one.", the button "Open your invitation", and "This
  link is yours; please don't forward it." It shows no address. It is outside
  the plan's three and goes at most once in 24 hours, as "their link again"
  does (contract 6.6); the day's five and "don't send me invitations" hold.
- **Past the room at the pick.** A person with an account who ticked the
  picked time and does not fit is on the waitlist, told "{title} is {Sunday,
  Nov 22 at 4:00 PM}. You're on the waitlist." A guest without an account has
  no waitlist: their answer becomes Maybe, so the host sees them under Maybe
  and is not asked to remind them, and they get one email in place of "Can
  you make it?": subject "{title} is {Sunday, Nov 22 at 4:00 PM}", heading
  "{title} is full right now", the line "It's {Sunday, Nov 22 at 4:00 PM}, a
  time you ticked, but it filled up with people who answered first. You're
  down as Maybe, so {Host} sees you'd still like to come. You can change that
  from your invitation.", and the button "Open your invitation". If room
  opens later, "I'm in" from their link works as on any plan.

**The card** (with `extras=1`): `"dates": { "state": "picking", "options":
[{ "id", "text": "Sat, Nov 21 · 6:00 PM", "can": 4, "mine": true }],
"answered": 9, "invited": 14 }`. The host also gets, for each option, `"who":
["Dana", "Sam"]` (first names) and `"most": true` on the favorite. After the
pick, `dates` is gone and the plan is an ordinary plan.

**Screens.**

- **The host form** (board 26): the row "Let guests pick the date" / "They
  tick what works; you choose". On, the "When" card is replaced by the list of
  times, each with "Remove", and "Add a time" with "Up to 5".
- **An invited person** (board 24): the banner "{Host} is picking a date" /
  "Tick every time that works for you. {Host} chooses one, and you'll hear.";
  the card "Which times work?" with "{9} have answered", a row a time with
  "{4} can make it" and a switch; "Who's coming" with their numbers and
  "Change" (A7's steppers); "Save my times"; under it "You're in when {Host}
  picks a time you ticked". In a browser the same card sits in W1 in place of
  the three answer buttons, with "Save my times".
- **The host** (board 25): "Pick a date" from the plan's page. "{9} of {14}
  have answered"; a row a time, the favorite first with "Most", "{6} can ·
  {names}", one chosen; a note saying what picking does, in numbers; "Remind
  the {5} who haven't answered" (the shipped Remind); "Pick {Sunday, Nov 22 ·
  4:00 PM}" and "You can still change the date afterwards".
- **Lists**: a plan that is picking shows "Picking a date" where its time
  shows.

## 3. Chip in

Boards 26 (`ExtrasForm`), 27 (`ChipIn`).

**What it is.** The host suggests an amount and gives their own payment link.
A guest pays the host there and marks it. **No money moves through Pantopus,
and Pantopus never holds or sees it.** Money between two people through
Pantopus would be a different business from paying a business; it is not
built.

**Data.** `Plan.chip_in jsonb`: `{ "rev", "amount_cents", "note", "link",
"paid": { "p:<user id>": "…", "g:<invite id>": "…" } }`.

- `amount_cents` 100 to 50000, each person. `note` 1 to 60 characters.
- `link` is `https` and its host is one of `venmo.com`, `account.venmo.com`,
  `paypal.me`, `www.paypal.com` (path `/paypalme/…`), `cash.app`. Anything
  else is refused with "Use a Venmo, PayPal or Cash App link." The server
  keeps the link as given and names the service from its host.
- Only the host and people who are in read `link`, as they read the address.

**Routes.** Creating and changing a plan take `chip_in`. `POST` and `DELETE
/api/plans/:id/chip-in/paid` mark and unmark the caller; with `{ "who" }` the
host marks someone who paid another way. Public equivalents for a guest with
their key.

**The card**: `"chip_in": { "text": "Chip in $12", "note": "For the turkey and
the drinks", "service": "Venmo", "link": "…", "paid_count": 7, "of": 12,
"mine": { "paid": false } }`, for the host and people who are in.

**Screens.** The host form's row "Chip in" / "Guests pay you, not Pantopus",
with "Each person", "What for", "Payment link" and the line "A Venmo, PayPal
or Cash App link. Only people who are in see it." On the plan's page for a
person who is in (board 27): a card with "Chip in {$12}", the note, "{7} of
{12} paid"; "Pay {Host} on {Venmo}", which opens the link outside the app;
"I've paid", which becomes "You chipped in" with "Undo"; and always "This goes
straight to {Host}. Pantopus doesn't handle this money." The host sees the same
card with the count and, in Who's coming, "paid" on a row and a row action
"Mark paid". No notice is sent for chipping in.

## 4. Gift exchange

Boards 26 (`ExtrasForm`), 28 (`GiftDraw`).

**What it is.** People who are in may join. On the draw, each one gets one
name. Nobody sees who drew whom, not the host and not Pantopus's screens.

**Data.** `Plan.gift jsonb`: `{ "rev", "budget_cents", "draw_at", "state":
"open" | "drawn", "people": [{ "who": "p:<id>", "wish": "…" }] }`, and
`Plan.gift_pairs jsonb`, written by the draw and **never selected into any
answer**: only the one read that tells a person their own name touches it.

**Rules.**

- Joining needs being in. A wish is 0 to 120 characters.
- The draw runs on the Plans tick at `draw_at` (between now and the plan's
  start), or when the host taps "Draw names now". It needs three people. With
  fewer it does not run and the host is told once: "Only {2} joined the gift
  exchange. Invite more, or call it off."
- Nobody draws themselves. People who answered together as one party (a guest
  row's adults) are one person in the draw.
- After the draw nobody can join. If someone who drew leaves the plan, the
  host is told "{Name} left after the names were drawn." with "Draw again",
  which draws for everyone and tells everyone "Names were drawn again."
- A guest without an account may join through their link. Their email after
  the draw says "Names are drawn for {title}. Open your invitation to see who
  you're giving to." It never carries the name.

**Routes.** Creating and changing a plan take `gift: { budget_cents, draw_at }`.
`POST /api/plans/:id/gift/join { "wish" }`, `PATCH …/gift/mine { "wish" }`,
`DELETE …/gift/mine` (before the draw), `POST …/gift/draw` (the host), and the
public equivalents with a guest's key.

**The card**: `"gift": { "budget_text": "Up to $25", "draw_text": "Names are
drawn Friday at noon", "state": "open", "joined": 8, "mine": { "in": true,
"wish": "…", "giving_to": { "name": "Sam K.", "wish": "…" } | null } }`.
`giving_to` is in the viewer's own card only.

**Screens.** The host form's row "Gift exchange" / "Everyone who joins draws
one name", with "Spend up to", "Draw names" and "Nobody sees who drew whom,
not even you." Before the draw, for a person who is in: a card "Gift exchange"
/ "{Up to $25}" / "{Names are drawn Friday at noon} · {8} joined", a field
"Your wish, if you like" and "Join"; joined, "You're in the exchange" with
"Change" and "Leave". After the draw (board 28): "You're giving to", the
person's picture or initial and name, "{Sam}'s wish: …", "Only you can see who
you drew. Bring it on {Saturday}.", and "Your wish" with "Change". The host
sees the count and "Draw names now"; never a name. Notices: "Names are drawn
for {title}. See who you're giving to.", once.

## 5. Photos afterwards

Board 29 (`Photos`).

**What it is.** After a plan ends, the people who came keep its photos in one
place: on the plan.

**Storage.** The private bucket Moments already use (`momentMedia`:
`MOMENTS_BUCKET` or `HOME_DOCUMENTS_BUCKET`, checked to be private, signed
links). Where no private bucket is set, the feature is off for that
environment whatever the switch says: a photo is never stored at a public
address. Every picture passes the check Moments' pictures pass.

**Data.** `Plan.photos jsonb`: `{ "rev", "items": [{ "id", "by": "p:<id>",
"key", "thumb_key", "w", "h", "at" }] }`, at most 200 a plan and 30 a person.

**Rules.** From the plan's end, for 60 days, a person with an account who was
in at the end, and the host, may add. They and guests who were in may look.
The person who added a picture, and the host, may remove it. A guest without
an account looks through their link and is told "Add yours in the app."
Photos are not shared outside the plan and are not a Moment.

**Routes.** `POST /api/plans/:id/photos` (the upload Moments use, one picture a
call), `DELETE /api/plans/:id/photos/:photoId`, and `GET /api/plans/:id/photos`
answering signed links that last minutes, for people allowed to look; the
public read with a guest's key.

**Screens.** On the page of a plan that is over (board 29): the banner "This
was {Saturday, Nov 21}" / "{12} people came"; the card "Photos" with "{23}
from {5} people", a grid of four across, "Add yours" (the shipped photo
picker, several at once), and "Only the people who came can see these. They
stay with the plan."; tapping a picture opens it full screen with "Remove" for
its owner and the host. "Plan the next one with the same people" starts the
host flow with section 6's invitations chosen. Notice, once, the day after:
"Photos from {title}" / "{Host} added {14}. Add yours and keep them together."
(to people who came, only if someone added any).

## 6. The same people again

Board 30 (`SameAgain`).

**What it is.** Inviting everyone who came to one of the host's past plans, in
one tap. This is how a family or a team stays together without a group to
manage. A named group kept between plans would need a new table and is not
built; it needs the founder's word.

**Routes.** `GET /api/plans/past-people` answers the host's last ten ended
plans that had anyone in: `{ "post_id", "title", "kind", "date_text", "count" }`
(a person's own plans, never a playdate, never a cancelled one; `count` is the
people who were in at the end, one a party).
`POST /api/plans/:id/invites/from-plan` with `{ "from_post_id", "skip":
["<key>"], "confirm_shares_address" }` invites each person who was in there
the way they were reached: a person with an account on Pantopus; a guest who
gave an email, by email. The host never sees that address; the list shows the
name. A guest reached only by a text invitation cannot be reached again and is
listed as such. The limits of invitations hold (emails a plan, the day's five,
"don't send me invitations", blocks), and at a home the first invitation needs
`confirm_shares_address` as inviting does.

**Settled while it was built** (server PR 4234, November 16; the designer's
yes to both, told to the founder):

- **The names before anything goes.** `GET /api/plans/past-people/:postId`
  answers one past plan's people for board 30's list with a check each:
  `{ "post_id", "title", "kind", "date_text", "count", "text_only", "people":
  [{ "key", "name", "avatar_url", "via", "can_invite" }] }`. `key` is
  `p:<user id>` or `g:<guest id>` and is what `skip` takes. `via` is
  `pantopus`, `email` or `text`; a `text` person has `can_invite` false and is
  drawn unchecked and greyed. No address and no account id is in it. It is
  `404` for anything but the caller's own ended plan.
- **What comes back.** `from-plan` answers the host's invitation list as
  `POST …/invites` does, with `results: [{ "key", "name", "outcome" }]`
  (`invited`, `already_invited`, `already_in`, `unavailable`, `text_only`),
  `invited`, `text_only` and `text` ("Invited 4. 1 can only be reached by
  text."), which the screen shows as it is.
- **The address stays hidden afterwards too.** One added column,
  `PlanInvite.known_name` (email invitations only, 1 to 100 characters; a
  column, not a table): an email invitation made this way keeps the name the
  guest gave on the earlier plan. Wherever the host would read that
  invitation's address (the invitation list, the ask's `opened_invite_to`, the
  "wants to come" notice) the host reads the name instead: the row has
  `"email": null` and `"name"`. The apps draw `name` where an email row draws
  its address.
- **Starting the next plan with the same people** (board 29's button) is
  creating the plan as usual and then calling `from-plan` with the past plan's
  id.

**Screens.** A row "People from a past plan" in the shipped invite sheet opens
board 30: "Invite everyone who came to one of your plans, in one tap."; a row
a plan with its date, "{12} people" and "Invite all", which opens the list of
names with a check each before it goes; and "Each person is invited the way
they were last time: on Pantopus or by email. You can take anyone out before
it goes." Afterwards "Invited {11}. {1} can only be reached by text."

## 7. One person pays for the group

Board 31 (`PaySeats`). After the business track's B2 (contract 10.2).

**What it is.** An organizer buys several spots on a business's paid plan and
sends one link. The first people to open it are in, paid for.

**Data.** `PlanRequest` gains `spots_bought integer` (the buyer's, 2 to the
plan's limit), `spots_token text` (kept as given, as the open link's is) and
`paid_by_request_id uuid` on a claimer's request.

**Rules.**

- On the payment sheet, with more than one spot: "Who are they for?" with
  "People with me" (today's party) and "I'll send a link".
- With a link, the buyer pays for all the spots in one payment and takes one
  themselves. `POST /api/plans/:id/requests/claim-spot { "token" }` puts a
  signed-in person in, free to them, while bought spots are left. A person
  who is already in, or on either side of a block with the business, is
  refused as any join is.
- A claimer who leaves gives the spot back to the buyer's link.
- At `refund_until` the spots nobody took are refunded to the buyer in one
  refund, and the link stops. The buyer may also give them back earlier.
- The fee, the payout and a group price work on what was paid in the end, as
  any partly refunded plan payment (contract 10.4).

**Screens.** Board 31: "How many spots?" with the stepper and "{12} × {$18.00}"
/ "{$216.00}" from the quote; "Who are they for?"; the note "After you pay you
get one link. The first {11} people who open it are in, paid by you. Spots
nobody takes come back to your card a day before."; the pay buttons. After
paying, on the plan: "Your {11} spots" with "{4} taken", "Copy link" and
"Share". A claimer sees "{Chris} got you a spot" and "I'm in".

## 8. Who builds what

The same three streams, after the people track and beside the business track.
Each row: the server and web first, then both apps.

| Order | Extra | Server and web | Apps |
| --- | --- | --- | --- |
| 1 | The same people again | The two routes | The invite sheet's row and board 30 |
| 2 | Chip in | `chip_in`, its routes, the web page's card in W3 | The host form's row, the card, "Mark paid" |
| 3 | Find a date | `date_options`, the three routes, the pick, W1's times | The host form's times, boards 24 and 25, lists |
| 4 | Gift exchange | `gift`, `gift_pairs`, the draw on the tick, the routes, W3's card | The host form's row, the card before and after the draw |
| 5 | Photos afterwards | `photos`, the upload through `momentMedia`, the routes, W3's grid | Board 29 |
| 6 | One person pays for the group | The three columns, claim, the refund of spots not taken | Board 31 and the two lines on the plan |

## 9. Done when

- With each switch off, every answer and screen is today's.
- A build without `extras=1` never gets a plan that is picking a date and
  opens every other plan as before.
- **Find a date**: three people tick, the host picks; those who ticked it are
  in with their numbers, the others are asked, each told once; past the room
  the later ones are on the waitlist; at a home a browser guest sees no
  address before the pick and the host's yes.
- **Chip in**: a link to any other site is refused; a person who is not in
  never reads the link; "I've paid" and the host's "Mark paid" show on the
  other's screen.
- **Gift exchange**: no answer to anyone but the person themselves carries who
  they drew, checked by reading every route as the host and as another guest;
  two people in one party never draw each other; a draw with two people does
  not run.
- **Photos**: a picture's address fetched without its signed link, and with an
  expired one, is refused; a person who was not in reads none; with no private
  bucket the card does not show.
- **The same people again**: the host's screen never shows a guest's email; an
  address that opted out gets nothing.
- **Paying for a group**: 12 spots bought, 4 claimed, 8 refunded at the
  time, to the cent; a claimer who leaves returns the spot.
