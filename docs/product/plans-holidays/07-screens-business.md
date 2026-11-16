# Plans for the holidays: the business screens, element by element

November 16, 2026. What the business track's build sessions draw: deals, paying
to join, the bill at the place and tips. It goes with the contract
([03-build-contract.md](03-build-contract.md), sections 9 to 11), the payments
design ([02-payments.md](02-payments.md)) and the people track's screens
([06-screens.md](06-screens.md)), whose rules all hold here.

Each screen names its picture in [screens/](screens/) and its board on the
canvas. The boards' own HTML, for exact sizes, is in
`~/pantopus-plans/design-src/plans-holiday-canvas/project/` on this Mac.

## Rules for every business screen

1. **Start from what is shipped.** A business already hosts a plan behind
   `plans_business` (off): the "Host as" step, the business's details form, the
   posted page and the roster, on the server and both apps
   (`planBusiness.js`; iPhone `Host/PlanComposerBusiness.swift` and
   `PlanBusinessComposerParts.swift`; Android `host/BusinessPlanParts.kt`). The
   earlier design for them is in docs PR 3964 (`git fetch origin
   claude/plans-feature-eval-c3208d`, then
   `docs/product/plans-with-businesses/`). Add to those screens; do not redraw
   them.
2. **Money words are the server's.** Every amount, the deal's line, the tip
   choices and the total come from the server as text and cents. An app never
   computes a discount, a fee or a total, and never sends one.
3. **One deal a plan, from the fixed kinds.** The deal's sentence is written by
   the server. A row in a list shows one tag.
4. **A business is never "he" or "she", and a guest's last name is an
   initial** on anything staff see.
5. **Paying uses the shipped payment sheet** (card, Apple Pay, Google Pay) as a
   gig or an invoice does today. No new payment screen is invented.
6. **Every step sits behind its switch** and behind `biz=1`. With the switch
   off the screens are today's, checked by comparing.
7. **No word "neighbor". Light and dark on iPhone and the web; large text;
   names for every new control.**

| Step | Switch | Screens here |
| --- | --- | --- |
| B1 deals without money | `plans_deals` | D1, D2 for "something free", D3 with one kind, D4, the list's tag and filter, "Mark used" |
| B2 paying to join | `plans_paid` | P1, the price row on the business's form, the receipt, leaving |
| B3 paying on the web | `plans_paid` | P2 |
| B4 deals with money | `plans_deals` and `plans_paid` | D1 and D3 with the money kinds, P1's group price |
| B5 the bill at the place | `plans_pay_here` | C1, C2, C3 |
| B6 tips later, the statement | `plans_pay_here` | C4 |

---

## Deals

### D1. A business's plan with a deal (a guest, before joining)

Picture `07-business-plan-group-deal.png` (board `BizPlan.dc.html`). The shipped
page of a business's plan, with one card added under the business's name.

1. As shipped: the map, the kind tag, the title, the time, the place and how
   far, the business's name with "Verified business".
2. The deal card, from the card's `deal`:
   - A tag, "Deal" or "Group deal", and on the right, for a group deal that is
     open, the time left ("2 days left", "3 hours left", "Closes at 5:00 PM"
     on the last day).
   - The deal's sentence in large type (`deal.text`): "20% off food for
     everyone", "A free appetizer for the table".
   - For a group deal: "if {12} people are in by {Friday at 5:00 PM}", then a
     bar filled to `group.in ÷ group.size`, "{8} in" and "· {4} more to
     unlock".
   - Faces of people the viewer knows who are in, and one line: "{Maya and
     Sam} are in. If it doesn't get to {12}, the night still happens, without
     the deal." Without known people: only the second sentence. When
     `if_short` is a smaller deal: "If it doesn't get to {12}, everyone still
     gets {10% off food}."
3. "Share: every friend who joins counts": the system share sheet with the
   plan's link. Shown for an open group deal.
4. "I'm in": the shipped join. On a paid plan it opens P1.
5. One line under it, by what the plan asks:
   - a free plan with a deal on the bill: "Free to join. Pay your bill there in
     Pantopus and the deal comes off."
   - a free plan with something free: "Free to join. Show your deal there."
   - a paid plan: the price line of P1.

States: `deal.state` `on` (no bar, no time), `open`, `unlocked` (the bar full
in the ok color, "Unlocked: {14} are in"), `short` ("It didn't get to {12}.
The night still happens." or the smaller deal's sentence). A plan that is full,
over or cancelled is the shipped state; the deal card stays as it was last.

### D2. In, with a deal

Picture `08-unlocked.png` (board `Unlocked.dc.html`). The shipped page of
a plan the person is in, with:

1. For a group deal that unlocked, a banner in the ok color: "Unlocked: {14}
   are in" / "Everyone who joined by {5:00 PM} gets the deal". Before the
   unlock it is D1's card.
2. "Your deal", a card from `deal.mine`:
   - "Ready" in the ok color, the deal's short text, the business and the time.
   - For a deal on the bill: "It comes off by itself when you pay your bill
     here in Pantopus. Nothing to show, nothing to type." and, once
     `plans_pay_here` is on for the plan, the button "Pay at {business}" (C1).
   - For something free (B1): "Show this to your server." and no button. When
     staff mark it used: "Used {8:40 PM}" in the secondary color in place of
     "Ready". There is no code and no QR (K8).
   - `mine.state` is `waiting` before a group deal settles ("Not unlocked
     yet"), `ready`, `used`, or `none` after a deal fell short with nothing in
     its place.
3. As shipped: Directions, Calendar, Group chat, who is in.
4. A quiet card when the business has this plan in a series: "{Trivia} is
   every {Friday} here" / "Follow {business} to hear about the next one first"
   with "Follow" (the shipped follow of a business).
5. "Can't make it" with, where the deal is ready, "Leaving gives up your
   deal".

### D3. The business adds a deal

Picture `09-business-adds-a-deal.png` (board `BizHost.dc.html`). One more step
in the business's shipped host flow, after the details ("3 of 4"); also opened
from the plan's "Change" while nobody is in.

1. The bar: back, "A deal for this plan", the step count.
2. The plan in one line: title, business, time.
3. "Deal", three choices, one picked: "No deal" (the start); "For everyone who
   joins" / "Each guest gets it when they pay"; "A group deal" / "Unlocks for
   all when enough people join in time". With something free the second line of
   "For everyone" reads "Each guest gets it there".
4. "What they get": "Percent off", "Dollars off", "Something free", "Two for
   one". In B1 only "Something free" is offered; the money kinds arrive with B4
   (on a price) and B5 (on the bill). A kind not yet offered is not drawn.
5. "How much": for percent, a number from 5 to 50 and "%"; for dollars, an
   amount; for something free, "What is it?" with a field, 1 to 40 characters
   ("appetizer for the table"). "On": "Food" (`food`), "Everything but
   alcohol" (`no_alcohol`), or, on a plan with a price, "The spot" (`spot`).
   Nothing may be offered on alcohol (P14); the choice does not exist.
6. For a group deal, "Unlocks when": "People who join" with a stepper from 2
   to the plan's spots; "By" with a date and time between now and the plan's
   start. Under it: "Guests see the count and the time left, and can share the
   plan to get there."
7. "If it doesn't unlock": "The plan still happens" / "Without the deal" (the
   start), or "Give a smaller deal anyway" / "You choose it next", which opens
   the same "What they get" and "How much" for the smaller deal.
8. "Guests will read": the server's sentence for what is chosen, from
   `POST /api/plans/deal-preview` (contract 9.2), and one line on how it is
   claimed: "It comes off by itself when a guest pays their bill through
   Pantopus that night. Once a guest." or, for something free, "Your staff mark
   it used on the guest list. Once a guest."
9. "Preview", the shipped next step. Under it: "Afterwards you see who joined,
   who paid and what the deal cost you".

Errors are the server's words under the field they belong to. A deal cannot be
changed once anyone is in; "Remove the deal" is offered then, after "Remove the
deal? Everyone who is in is told."

### D4. The deal's notices

Picture `10-notices.png` (board `Notices.dc.html`), its first two. The words
are the server's (contract 12). Each opens the plan.

| Notice | When | To |
| --- | --- | --- |
| "{2} more and {trivia} is {20% off}" / "{10} are in at {business}. It closes at {5:00 PM}. Bring a friend?" | Once, in the deal's last day, while it is short | People who are in, and people who opened the plan and did not join |
| "Unlocked: {20% off food tonight}" / "{14} are in. It comes off when you pay there in Pantopus." | At the unlock | People who are in |
| "{Trivia} didn't get to {12}" / what happens now, in one line | When it falls short | People who are in |
| "{business} took the deal off {title}" | The business removed it | People who are in |

### The Plans list

Picture `01-plans-tab.png`. With `plans_deals` on for the viewer: a business's
plan with a deal shows the one tag a row may carry, "Deal" (or "20% off" for a
percent), in place of the count. The list's filter "All | People | Businesses"
shows once the list holds at least one business's plan. Nothing else on the tab
changes.

### Mark used (staff, B1)

On the business's shipped roster, a guest who is in and holds a "something
free" deal that is ready has "Mark used" on their row; after "Mark {Dana}'s
{free appetizer} used? This can't be undone." it reads "Used {8:40 PM}".
`POST /api/plans/:id/requests/:requestId/deal-used`.

---

## Paying to join

### P1. Paying for a spot

Picture `11-paying-to-join.png` (board `PayJoin.dc.html`). A sheet over the
plan, opened by "I'm in" on a plan with a price.

1. The kind tag and the title; the time and the place in one line.
2. A row: "{1} spot" and the price. With more than one person, the shipped
   party stepper above it and "{3} spots".
3. "You pay today" and the amount, large.
4. For a group price that is open, a card: "Group price", "{7} of {10} in",
   and "If {10} are in by {Thursday at 6:00 PM}, everyone pays {$14} and
   **{$4.00} comes back to your card**." Unlocked: "Group price: {$14}" and the
   amount above is the group price. Short: no card.
5. "Full refund until {Friday at 10:00 AM}" (`refund_until`), or "No refund
   now; the plan starts in less than a day" after it.
6. The payment buttons of the shipped sheet: "Pay with Apple Pay" (or Google
   Pay), "Use a card".

After paying: the plan as D2 shows it, with "Paid {$18.00}" and "Receipt"
under the title; the receipt is the shipped paid-invoice receipt in Mail, under
Receipts. "Can't make it" before `refund_until` says "You'll get {$18.00}
back." and after it "There is no refund now." before the person confirms.
While the payment is being made the place is held for 10 minutes; a sheet left
open past that says "That took a while. Start again."

On the business's form (the shipped details step): a row "Price a spot", off at
the start; on, an amount from $1 to $500 and "Guests pay when they join. Full
refund until a day before." A business that may not charge yet sees the row
with "Set up payouts to charge for spots" and a link to its shipped payout
setup; the server answers `409 payout_account_needed`. An online plan has no
price row (P12).

### P2. Paying from the web page

No board. The plan's web page for a business's plan with a price, in place of
"Open app" as the only way: "Join for {$18}" opens the web's shipped sign-in
(Apple, Google, email), then P1's content as a page section and the payment
company's web payment form with Apple Pay and Google Pay. After paying: the
page shows "You're in" with the place, "Paid {$18.00}", "Add to calendar", and
"Get the app for the chat and your receipt". No payment without an account.

---

## The bill at the place

### C1. The check

Picture `12-the-bill.png` (board `PayBill.dc.html`). Opened by "Pay at
{business}" on D2, or by the notice "Your check from {business}: {$48.00}".

1. The bar: back, "Pay {business}".
2. "Your check, sent by {business}" and the amount, large. When the guest
   starts it (only on a plan with no deal on the bill, K7): "What's your
   total?" with an amount field, and "Type the total on your bill".
3. The lines, from the server: "Food and drinks" and the amount; the deal's
   name, its short text and the amount off in the ok color; "Tip, {18%}" and
   its amount once one is chosen; "You pay" and the total.
4. "Add a tip", shown when the plan has tips on: "Percent of {$48.00}, before
   the deal"; three choices each with its amount ("18%" "$8.64", "20%"
   "$9.60", "25%" "$12.00"); "Another amount"; "No tip". None is chosen at the
   start, and the pay button is off until one is (No tip counts).
5. One quiet line: "The deal came off because you're paying here. The tip goes
   to {business}; Pantopus takes none of it." Without a deal, only the second
   sentence.
6. "Pay {$47.04} with Apple Pay" (or Google Pay) and "Use a card".

The total, the discount and the tip amounts are read again from
`POST …/checks/:checkId/pay` before the sheet opens; the app shows what that
call answered.

### C2. Paid

Picture `13-paid.png` (board `Paid.dc.html`). Shown when the payment succeeds.

1. A large check mark in the ok color, "Paid {$47.04}", the business, and
   "{Dana L.} · {Fri, Nov 20 · 8:52 PM}".
2. "Show this to your server".
3. The lines as paid, and "Paid with {Apple Pay}" with the total.
4. "The receipt is in Mail, under Receipts. {business} sees the payment on its
   guest list now."
5. "Done", and "Something's wrong with this payment", which opens the shipped
   payment-problem flow for that payment.

### C3. The business's guest list

Picture `14-business-guest-list.png` (board `BizList.dc.html`). The business's
shipped roster with money added, for staff with `plans.manage`.

1. Three totals: "{14} guests in", "{$126.24} paid so far", "{$22.64} tips".
2. A filter: "All", "Not paid", "Paid".
3. A row a guest: first name and last initial; "Pantopus" or "Yours" (who
   brought them, 02-payments section 4); then by state:
   - not paid: "Here since {7:05 PM}" once they are marked here, and "Send a
     check";
   - a check sent: "Check sent · {$52.00}" and "Waiting";
   - paid: "{$38.40} · tip {$8.64}" and "Paid".
4. A note: "'Pantopus' marks a guest Pantopus brought; 'Yours' is your own.
   Type the full amount on a check and the {20%} deal comes off for the guest.
   You're paid 48 hours after {trivia} ends."
5. "Send a check", for a guest picked from the list.
6. Tapping a paid guest: the payment's lines and "Refund", all or an amount,
   until 48 hours after the plan ends.

"Send a check" is a sheet: the guest's name; "Amount on the bill"; with a deal
on the bill, "Part the deal doesn't cover (alcohol)" with an amount, 0 at the
start (`no_deal_cents`); "Send". The guest gets the check's notice at once.

On the business's form: "Guests can pay their bill here" (`pay_here`) and,
under it when on, "Take tips" (`tips_on`), both off at the start, both needing
payouts set up as a price does.

### C4. A tip after a paid plan, and the statement (B6)

No board. On the page of a paid plan that is over, for a guest who paid, for 7
days and once: a quiet card "Leave a tip for {business}?" with the three
choices as percents of what they paid, "Another amount", and the pay button.
The business's shipped statement gains the lines the contract names (11.5):
plans' bills and tips by feature, and totals for tips, the tips' share of card
fees, and what deals took off.

---

## Notices the apps must handle (business track)

| Notice | Opens | Step |
| --- | --- | --- |
| The four deal notices of D4 | The plan | B1 |
| "You're in: {title}. Paid {$18.00}." | The plan | B2 |
| "{$4.00} is on its way back to your card" / "{title} reached its group price. A bank can take a few days." | The plan | B4 |
| "Your check from {business}: {$48.00}" | C1 | B5 |
| "{business} refunded {$12.00}" | The plan | B5 |
