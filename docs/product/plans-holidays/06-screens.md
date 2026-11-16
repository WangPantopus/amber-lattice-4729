# Plans for the holidays: the screens of the people track, one by one

November 15, 2026. What each screen of H1 (answers without an account), H2 (the
bring list) and H3 (occasions) holds, in order from top to bottom, with its
exact words, its states, and the route each action calls. Routes are in
[03-build-contract.md](03-build-contract.md).

**How to read a picture.** Each board is in [screens/](screens/), light. The
boards are drawn with the shipped Plans board styles, so spacing, type sizes,
corner radii and colors are the ones the apps already use for Plans. Where a
board and a shipped screen differ in something this document does not name, the
shipped screen wins: these boards add to screens, they do not redesign them.
The boards' HTML is on the founder's Mac at
`~/pantopus-plans/design-src/plans-holiday-canvas/project/` (one file a board,
named in the tables below) for exact sizes.

**Sample people.** Maya hosts Friendsgiving; "you" host Thanksgiving dinner;
Dana Lee is a guest with no account. Addresses read "[Street address], Camas".

**Rules for every screen.** No word "neighbor". One thing on the right of a list
row. Touch targets at least 44 points. Every state in light and dark and at the
largest text size. Every new control has a spoken name. Dates and times are in
the plan's time zone and read as the shipped Plans screens read them.

---

## Web (the server and web session)

All three are states of one page, `/plans/:id`, which exists. With
`plans_guest_answers` off, or for a plan that takes no answers, the page is
exactly today's.

### W1. The invitation, before answering

Picture `05-link-in-a-browser.png` (board `Web.dc.html`). Shown when the
answer's `answer.can` is true and `answer.mine` is null.

Top to bottom:

1. The bar: "Pantopus" and "Open app" (exists).
2. "{Host first name} invited you."
3. The card: a band in the plan's kind color with the kind's glyph; the title;
   the date and start time; the area ("Near Prune Hill, Camas"), never the
   address; the host's note to everyone (`about`) if there is one; the host's
   first name and last initial, and "{n} coming so far".
4. "Your name": a text field. Required. 1 to 100 characters.
5. "Who's coming": two steppers, "Adults" (1 to 10, starts at 1) and "Kids" (0
   to 10, starts at 0). The Kids row shows only when `answer.kids_welcome`.
6. "Email, for the address and one reminder": an email field. Shown when
   `answer.needs_email`; required then. That is the open link always, and a
   text invitation to a plan at a home. For a text invitation elsewhere it
   reads "Email, if you'd like a reminder" and is optional. Hidden for an email
   invitation, whose address the host already gave.
7. Three buttons: "I'm in" (primary, full width), then "Maybe" and "Can't make
   it" side by side.
8. A line with a lock: "No account needed. {Host} sees your name and your
   answer." followed by one of:
   - at a home, when `answer.host_says_yes_first`: "The address comes by email
     once {Host} lets you in."
   - at a home otherwise: "The address comes by email."
   - elsewhere: nothing more.

Each button posts `POST /api/public/plans/:id/answers` with the way in from the
URL (`open` or `invite`), the fields and `answer`.

States:

| State | What shows |
| --- | --- |
| A field is missing or wrong | The field's own line in the error color: "Add your name.", "That email doesn't look right." The form keeps what was typed |
| The plan is full (`409 full`) | Under the buttons: "This is full. You can say Maybe, and {Host} will see it." "I'm in" turns off |
| Too many tries (`too_many`) | "Try again in a little while." |
| The plan ended or was cancelled | The card, then "This plan is over." or "{Host} cancelled this plan." No form |
| The link is off or unknown | Today's private-plan page: "Only the people invited can see this plan." |
| While sending | The tapped button shows progress; all three are off |

### W2. After "I'm in", waiting

Picture `15-browser-waiting-for-yes.png` (board `WebWait.dc.html`). Shown when
`answer.mine.state` is `waiting_ok`, or right after an answer that returned
`check_email`. At a home every answer returns `check_email`, by every way in,
so this is the page every guest of a plan at a home sees after "I'm in".

1. The bar.
2. A quiet banner with a clock: "Your answer is with {Host}" and under it
   "{2 adults, 1 kid} · {Host} lets each person in". No pronoun for the host,
   here or anywhere. On the right, "Change", which returns to W1 with the
   fields filled.
3. The card: title, date, area.
4. A note with an envelope: "When {Host} says yes, the address and the bring
   list come to **{email}**. There is nothing else to do."
5. A line with a lock: "The address is shown only through the link in that
   email, so only you can open it."

When no yes is needed (`check_email` without `host_says_yes_first`), the banner
reads "Check your email" with "{2 adults, 1 kid}" under it, and the note reads
"The address and the bring list are on their way to **{email}**." For an email
invitation the page does not know the whole address; it shows the hint the page
already has ("d•••@example.com").

When the answer was for an address that already had an answer and this browser
does not hold its key, the banner reads "Check your email" and the note reads
"There is already an answer for this address. We sent its link there; open it
to see or change it." Nothing about the earlier answer is shown.

### W3. In: the guest's part

Picture `06-after-answering.png` (board `WebIn.dc.html`). Shown when the page
has a valid guest key and `for_guest` is not null. This is the page the emailed
link opens.

1. The bar.
2. A green banner with a check: "You're in, {first name}" and "{2 adults, 1
   kid} · {Host} knows". On the right, "Change".
3. A card: the title; the date; the place, "{Place name} · {address}"; two
   buttons, "Directions" (opens the device's maps with the address) and "Add to
   calendar" (an `.ics` file with the title, time, address and the page's own
   link).
4. The host's note for people who are in (`guest_note`), if any, in the shipped
   "From {Host}, only for people who are in" style.
5. The bring list, when the plan has one: "What will you bring?" and "{n} still
   open". Each item: its name, its note under it, and on the right the first
   name of who is bringing it, or "I'll bring it" (a button). An item this guest
   took reads "You're bringing it" with "Give back". Last row: "Bring something
   else", shown when guests may add; it opens a one-line field and "Add".
6. A quiet box: "The group chat is in the app" / "So are day-of updates, the
   photos afterwards and {Host}'s next plan." / "Get Pantopus" (the store link
   for the device, as the page's existing buttons choose it).

Claiming posts `POST /api/public/plans/:id/bring/:itemId/claim` with the key;
"Give back" is the `DELETE`; "Add" is `POST /api/public/plans/:id/bring/items`.

States:

| State | What shows |
| --- | --- |
| Someone took the item first (`409`) | The row updates to their name; a line under the list: "{Name} got to that one first." |
| Maybe | The banner is quiet, not green: "You said maybe" and "Change". The card shows the area, not the address. No bring list |
| Can't make it | "You said you can't make it" and "Change". The card shows the area only |
| Removed by the host | "This invitation is no longer open." Nothing else |
| The plan changed time or place | A line above the card: "{Host} changed the time." or "the place." The card shows the new one |

### The emails (the server session writes them; the words are fixed here)

All three use the existing invitation email's frame and unsubscribe links.

| Email | Subject | Body, in order |
| --- | --- | --- |
| You're in | "You're in: {title}" | "{Host} has you down for {2 adults and 1 kid}." The date. "Open your invitation" (the guest's link). "The address and the bring list are on that page. This link is yours; please don't forward it." |
| Reminder | "Tomorrow: {title}" (or "Today:") | The time. "Open your invitation." If items are open: "{n} things are still open on the bring list." |
| Changed or cancelled | "{Host} changed the time of {title}" / "the place of" / "{Host} cancelled {title}" | The new time or place, or the host's cancel note. The guest's link, except when cancelled |

---

## iPhone and Android (the two app sessions)

Every screen here is an existing screen with parts added, unless it says "new".

### A1. The Plans list

Picture `01-plans-tab.png` (board `Main.dc.html`). H1.

- The sheet's title stays as shipped. The board's "Plans / Yours, then this
  week near Camas" shows the two sections, not new words to add.
- A new first section, "Yours": the plans this person hosts, is in, is waiting
  on, or is invited to and has not answered, soonest first. Each row is the
  shipped row. Its second line ends in the person's part: "You're hosting",
  "You're in", "You said maybe", "Invited". On the right: "{n} coming" for a
  plan with a headcount, else the shipped count.
- Then "This week nearby", the shipped list, without the plans already in
  "Yours".
- "Yours" is hidden when it is empty; the shipped empty state is unchanged.
- The filter and the business rows on the board belong to the business track.
  Do not build them in H1.

Data: `GET /api/plans/mine` (exists) for "Yours"; the shipped list call for the
rest.

### A2. The kind picker with occasions

Picture `02-what-are-you-planning.png` (board `Type.dc.html`). H3.

- Above the kinds, a section "Coming up": a grid of three across, one tile for
  each occasion `GET /api/plans/occasions` answers, in the server's order. A
  tile: a small square in the occasion's kind color with its glyph, and the
  occasion's name, on the quiet surface color.
- Under the grid: "Each one starts a plan with the usual things filled in: a
  headcount with kids, a bring list, the right words."
- Then "Or any kind of plan" and the nine kinds. The board draws them as
  smaller cards to fit one picture; keep the shipped cards and their order.
- Tapping an occasion opens the host form (A3) with the occasion's values
  filled in and its name as the screen's title. Everything stays editable.
- No occasions in the answer, or the call fails: the section is not drawn.

Glyphs: Thanksgiving dinner uses the Food & drinks glyph; Friendsgiving, two
people; Holiday party, a tree; Gift exchange, a gift; New Year's Eve, a
four-point star; Birthday, a cake. Use each platform's own icon set
(SF Symbols; Material Symbols).

### A3. The host form

Picture `03-host-form.png` (board `Details.dc.html`). H1 for rows 1 and 2, H2
for row 3.

Added to the shipped form, for a private plan:

1. "Room for" replaces "Spots" as the row's name, with "Adults and kids,
   besides your household" under it. The stepper goes to 100 on a private plan
   and stays at 30 on a public one. Holding the plus steps by 5.
2. A card "Add to this plan" holding switch rows. Each row: a small tile with a
   glyph, a name, a line under it, a switch.
   - "Bring list" / "{n} things · guests pick what they'll bring", or "Guests
     pick what they'll bring" when empty. Switching it on opens A9. Tapping the
     row when on opens A9. (H2)
   - "Kids welcome" / "Guests say how many adults and kids". (H1)
   - Under the card: "Only what you switch on shows on the plan. Everything else
     stays out of the way."
3. The board also draws "Let guests pick the date", "Chip in" and "Gift
   exchange". **Do not build those rows**; they are later steps.

The "Who can see this" line for a private plan gains: "They can answer from the
link, with or without the app."

Saving sends `kids_welcome`, `spots` and (H2) `bring` with the plan, on the
shipped create and change calls.

### A4. Inviting: one link for everyone

Picture `16-share-a-link.png` (board `Share.dc.html`). H1. The shipped invite
sheet with one card added under its ways to invite. The board's three rows
above the card stand for the shipped ways; keep them as they are.

The card, for a private plan hosted by a person that is not a playdate:

1. A link glyph, "One link for everyone", and "For the family chat. People
   answer in a browser, no app needed".
2. Two buttons: "Copy link" and "Share" (the system share sheet with the link
   and the message the server returned).
3. A divider, then a switch: "I say yes first" / "People who answer wait for
   your OK before they get your address".
4. Under the card: "Turn this link off" in the danger color, shown once a link
   exists.

Behavior:

- The first tap on "Copy link" or "Share" makes the link:
  `POST /api/plans/:id/invites/open-link`. At a home it first shows the shipped
  "this shares your address with the people you invite" confirmation.
- The switch starts on for a plan at a home and off elsewhere, and saves with
  the same call.
- "Turn this link off" asks "Turn this link off? People who already answered
  stay." with "Turn off" and "Keep it"; then `DELETE`.
- After copying: "Link copied."

### A5. Who's coming

Picture `17-whos-coming.png` (board `Answers.dc.html`). H1. The host's list,
opened from the people line on the plan (A6). It replaces the shipped
invitation list's rows with sections; the shipped list's actions stay.

1. Bar: back, "Who's coming", and a plus that opens A4.
2. Three counts in one row: "{9} coming · {6 adults, 3 kids}", "{2} maybe",
   "{3} haven't answered". The adults and kids part shows only with kids
   welcome.
3. "Waiting for you": one card a waiting guest. The name; "{2 adults, 1 kid} ·
   answered from your link"; "Not this time" and "Let in". Hidden when nobody
   waits.
4. "Coming": a row a person or guest. The name (an account's shipped name and
   picture; a guest's typed name with its first letter); under it the count,
   and for a guest without an account "· answered in a browser".
5. "Maybe": the same rows.
6. "Haven't answered": an account ("Invited on Pantopus"), an email address
   ("Invited by email"), "A text invite" ("Not opened yet").
7. Footer: "Remind {n} people", and under it "A text invite that hasn't been
   opened has nobody to remind" when there is one. Off, reading "Reminded
   today", after a reminder today. Hidden when nobody can be reminded.

Actions: "Let in" is `POST …/invites/:inviteId/ok`; "Not this time" and a
swipe or long-press "Remove" on any guest row are `DELETE …/invites/:inviteId`
after "Remove {name}? They'll be told once."; "Remind" is
`POST …/invites/remind`, then "Reminded {n} people."

Data: `GET /api/plans/:id/invites` with `guests=1`.

### A6. The host's plan page

Picture `04-dinner-page.png` (board `Plan.dc.html`). H1 for the counts, H2 for
the bring list. The shipped page with:

1. The occasion's name on the plan's tag in place of the kind's name (H3).
2. The three counts of A5, and under them the shipped people line reading names
   with their numbers ("Dana + 2 kids, Sam, Priya + 1 and 2 more"). Tapping
   either opens A5.
3. A card "Bring list" with "{4} of {6} taken": a row an item with its note,
   and on the right who is bringing it or "Still open". Last row "Add
   something", which opens A9. (H2)
4. The three shipped buttons, with "Share link" first (opens A4).
5. Footer: "Remind the {3} who haven't answered" and "One reminder each, by the
   way they were invited", when anyone can be reminded; otherwise the shipped
   footer.

### A7. Answering in the app

Picture `18-answering-in-the-app.png` (board `ImIn.dc.html`). H1. The shipped
"I'm in" sheet for an invited person, on a private plan.

1. "Who's coming?" and, with kids welcome, "{Host} asked for adults and kids".
2. "Adults" stepper (1 to 10) and, with kids welcome, "Kids" (0 to 10). Without
   kids welcome it is the shipped party stepper, to 10 on a private plan.
3. "A note for {Host}, if you like" (the shipped note field).
4. "I'm in"; then "Maybe" and "Can't make it" side by side; "{Host} sees your
   answer".

"I'm in" is the shipped ask with `party_size` and `kids_count`. "Maybe" is
`POST /api/plans/:id/invites/maybe`. "Can't make it" is the shipped decline.

### A8. A guest's plan page

Picture `20-guest-plan-page.png` (board `GuestPlan.dc.html`). H1 for the
banner, H2 for the bring list. The shipped page for someone who is in, with:

1. The banner "You're in" reads "{2 adults, 1 kid}" under it, with "Change",
   which opens A7.
2. A card "Bring list" with "{n} still open". Rows as W3: a name on the right,
   or "I'll bring it"; this person's own item reads "You're bringing it" with
   "Give back". Last row "Bring something else" when guests may add.
3. The shipped buttons and people line; the line ends "· {3} kids" with kids
   welcome.

A person who said maybe sees a quiet banner "You said maybe" with "Change", and
no bring list.

Actions: `POST /api/plans/:id/bring/:itemId/claim`, its `DELETE`, and
`POST /api/plans/:id/bring/items`. On `409` the row shows who took it and a
line "{Name} got to that one first."

### A9. The bring list, for the host

Picture `19-bring-list-host.png` (board `Bring.dc.html`). H2. New screen,
pushed from A3 and from A6.

1. Bar: back, "Bring list".
2. "List what's needed. Guests pick what they'll bring, in the app or in a
   browser."
3. The items, one a row: the name; under it the note and who is bringing it
   ("Two, please · Sam is bringing it", "You're bringing it", "Still open"); an
   X that removes it. Removing an item someone took asks "Remove {item}?
   {Name} was bringing it."
4. "Add something": a field and a plus. Return adds too. 1 to 60 characters.
5. "Tap a name to change it or add a short note, like "Two, please"." Tapping a
   row opens its name and note (up to 80 characters) to edit, and a switch
   "I'm bringing this".
6. A switch: "Guests can add their own" / ""I'll bring something else"".
7. Footer: "Done", and "{6} things · up to 30".

Saving is `PUT /api/plans/:id/bring` with every item; an item kept sends its
`id`. On `409 bring_changed`: reload the list and say "Someone just changed the
list. Here's the latest."

An occasion with a starter list (A2) opens this screen already filled in.

---

## Notices the apps must handle (H1, H2)

Each opens the screen named. The words are the server's.

| Notice | Opens |
| --- | --- |
| "Dana Lee is in: 2 adults, 1 kid." | A5 |
| "Dana Lee wants to come. Let them in?" with the buttons "Let in" and "Not this time" | A5; the buttons act without opening the app, as "I'm in" does on an invitation today |
| "3 things are taken. 2 are still open." | A6 |
| "2 things are still open for Thanksgiving dinner." | A8 |

## What is drawn but not in this build

Boards 7 to 14 (deals and paying) and the three extra rows on board 3 belong to
later steps. Board 10 shows notices from every step; only the four above are in
this build.
