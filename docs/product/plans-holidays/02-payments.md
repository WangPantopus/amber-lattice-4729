# Paying a business through Pantopus, with tips

November 15, 2026. The founder asked that guests pay businesses through
Pantopus, with tips, and accepted the sixteen decisions in section 12 the same
day, all as recommended. Nothing is built.

## 1. Short answer

Guests pay a business inside Pantopus at two moments: a price to join a plan,
and the bill at the place. Either can carry a tip.

Pantopus charges the card, Apple Pay or Google Pay, holds the money until two
days after the plan, then sends the business its share. Most of this machinery
already runs gigs and business invoices in production. What is new is on the
Plans side: a price and a deal on a plan, a check a business sends a guest, tips
for a business, and a cut that depends on who brought the guest.

## 2. What Pantopus already has

Read on `dev` (`9c4062bdfb`) on November 15.

| Piece | Today | Where | What Plans needs |
| --- | --- | --- | --- |
| Cards, Apple Pay, Google Pay | The payment sheet in both apps, saved cards. Real payments since October 26 | `backend/routes/pays.js`, `stripeService.getPaymentSheetParams` | Reuse as is |
| Holding a card | A hold of up to 7 days; for later dates the card is saved and charged near the day | `createPaymentIntentForGig`, `createSetupIntent` | Reuse; a paid spot charges at once |
| The cut | 15% by default, 10% for founding businesses, less for verified nonprofits and community groups. Pantopus pays the card fee out of its cut | `getEffectiveFeeRate`, `calculateFees`, `utils/businessConstants.js` | A second rate for a business's own guests, and rates for bills |
| Paying a business | A business has its own payout account, set up by its primary owner. Invoice payments go to it | `routes/businesses.js` (the payout account routes), `StripeAccount` | Require it before any paid plan |
| Release | Money waits 48 hours after the charge, then goes out | `COOLING_OFF_MS` | Wait until 48 hours after the plan ends |
| Tips | Gig tips only: a separate charge, the worker gets all of it, Pantopus pays the card fee | `createTipPayment`, `stripe/gigTipProof.js` | Tips to a business, inside the same charge as the bill |
| Refunds | Full and partial, each recorded exactly once | `services/paymentRefundService.js` | Reuse, with rules for plans |
| Card disputes | Evidence is gathered and sent automatically; a lost dispute becomes a debt taken from later payments | `stripe/disputeService.js`, `walletService` | Reuse, adding what a plan knows |
| Invoices | A business bills a person, who pays in the app; the bill also arrives in Mail | `BusinessInvoice`, `routes/businesses.js`, `services/invoiceBills.js` | The check at the place is an invoice tied to a plan |
| Plans | No price and no payment | `services/plans/` | Everything in this document |

Pantopus charges as "separate charges and transfers": it makes the charge on its
own account and later transfers the payee's share. Section 4 keeps that.

## 3. What a guest pays

Two payments and a tip, built in this order.

1. **A price to join.** The business sets a price per person. The guest taps
   "Join · $18", pays, and is in at once. Classes, clinics, tastings, tickets,
   kids' activities. Board 11.
2. **The bill at the place.** For food, drinks, or anything whose amount is not
   known ahead. Board 12. It starts one of two ways:
   - Staff type the amount on the plan's guest list ("Dana's table, $48.00") and
     it appears on Dana's phone.
   - Dana taps Pay on the plan and types her own share. Staff see "Dana paid
     $24.00" on their list at once, and Dana's phone shows a large Paid screen
     (board 13).
3. **A tip.** Asked on the same screen as the bill. For a paid spot it is asked
   once, quietly, after the plan ends.

Three rules hold for all of them:

- **Paid plans are in person only.** Section 9.
- **Paying needs a Pantopus account.** On the web page that is one tap with
  Apple or Google, so a friend who gets the link can join and pay without
  installing the app.
- **Plans among friends never ask for a card.** Only a verified business can
  charge.

Later: one person paying for a whole group, with a deposit now and the rest at
the place. That is what a birthday at a venue or a team outing needs.

## 4. How the money moves

```
Guest pays ──► Pantopus holds it ──► The business's payout account ──► Its bank
(card, Apple    until 48 hours        (its share only)                  (usual
 Pay, Google    after the plan ends                                      schedule)
 Pay)                │
                     ├──► Pantopus keeps its cut (a percent, set by who brought the guest)
                     └──► The card fee (about 2.9% plus 30 cents a charge)

A refund goes back to the guest before the business is paid.
```

A refund before the business is paid never has to be pulled back from it. This
is the path business invoices already take.

**Who the seller is.** The business. Pantopus collects the payment for it, and
the card statement should name both, "PANTOPUS" followed by the business's name,
so a guest recognises the charge.

## 5. How Pantopus earns

Pantopus takes a finder's fee on guests it brought, and close to cost on guests
the business brought itself. A business pays for new customers, not for its
regulars.

| What is paid | A guest Pantopus brought | The business's own guest |
| --- | --- | --- |
| A price to join | 15% of the price, card fee included (founding businesses 10%) | 5% plus the card fee |
| The bill at the place | 5% of the bill plus the card fee | 1% plus the card fee |
| A tip | Nothing | Nothing |

The card fee is what the card company charges, about 2.9% plus 30 cents a
charge.

**Who brought the guest** is saved when they join. Pantopus brought them if they
came from the map, the list, Today, Ask Pantopus or a friend's share. They are
the business's own if they came from its invitation, its own link, its page, as
a follower, or back from last time. A tie goes to the business. (The table of
ways in is in the Plans with businesses contract, section 6.2.)

**Why the bill rate is low.** A restaurant keeps a few cents of each dollar, and
its deal already costs it 20%. Classes and tickets have room for 15%: the extra
seat costs the business almost nothing.

The lower rates that verified nonprofits and community groups have today stay.
Where a business's own rate is below a rate in the table, the lower one applies.

### Four worked examples

| | Guest pays | Card fee | Pantopus keeps | Business gets |
| --- | --- | --- | --- | --- |
| $18 clinic spot, guest Pantopus brought | $18.00 | $0.82, paid by Pantopus | $2.70 ($1.88 after the card fee) | $15.30 |
| $18 clinic spot, the business's own guest | $18.00 | $0.82 | $0.90 | $16.28 |
| $48 of food with a 20% deal, $8 tip, guest Pantopus brought | $46.40 | $1.65 | $1.92 | $42.83 |
| The same bill, the business's own guest | $46.40 | $1.65 | $0.38 | $44.37 |

In the bill rows the deal takes $9.60 off, the guest pays $38.40 plus the $8.00
tip, and Pantopus's percent is on the $38.40 only.

A bill earns Pantopus a dollar or two; a paid spot about two dollars. The larger
money is in group bookings (a birthday at a venue runs $300 to $800), which is
why paying for a group comes next.

## 6. Tips

A tip goes to the business, and Pantopus takes no cut of it.

- **When.** With the bill, on the same screen, so it is one charge. For a paid
  spot, once after the plan ends ("Thank the coach?"), open for 7 days.
- **How.** Three choices (18%, 20%, 25%), another amount, and "No tip", all the
  same size, none chosen ahead. The percent is of the amount before the deal.
- **Who switches it on.** The business, per plan. On by default for food and
  drink, off for classes and tickets.
- **Where it goes.** To the business's payout account, on its own line in the
  statement. Pantopus does not split tips between staff.
- **The card fee on a tip** comes out of the business's payout, shown beside the
  tip. For a tip inside a bill it is the tip's share of the charge's fee
  (fee × tip ÷ total), which is the formula Washington's labor department uses.
- **Refunds.** A full refund of a bill returns its tip. A partial refund leaves
  the tip alone.

Hosts who are people take no tips.

## 7. Deals, once money moves through Pantopus

Paying through Pantopus becomes the way a deal is claimed.

| Deal | How it works with payment |
| --- | --- |
| A deal for everyone, on a price to join | The plan shows the regular price struck through and the deal price. The guest pays the deal price |
| A group deal, on a price to join | The guest pays the regular price when joining. If enough people join in time, everyone gets the difference back on their card automatically, with a notice |
| A deal on the bill at the place | The discount comes off on the pay screen. Nothing to show; it cannot be shared or used twice |
| Something free ("a free appetizer for the table") | No money moves. The guest shows a pass and staff mark it used |

**Why a group deal charges first.** The other way is to hold the card and charge
the right price at the deadline. Charging first is one path for every paid plan,
each person counted has really paid, and no card fails at the deadline. The
card company keeps its fee on the part returned, about 12 cents on $4, which
Pantopus absorbs.

**If the group price is not reached,** the plan still happens at the regular
price, and a guest may leave with a full refund until it starts.

Limits: one deal a plan, from fixed kinds; no deals on alcohol; Pantopus's
percent is on what the guest pays after the deal.

## 8. Refunds, no-shows and card disputes

| What happens | Result |
| --- | --- |
| The guest leaves a paid plan 24 hours or more before it starts | Full refund |
| The guest leaves later, or does not come | No refund; the business may still give one |
| The business cancels, or the plan is removed | Full refund to everyone, tips included |
| The business moves the time by more than 30 minutes or changes the place, and the guest cannot come | Full refund |
| The business removes the guest | Full refund |
| A group price is not reached | The guest may leave with a full refund until the plan starts |
| A bill at the place was wrong | The business refunds all or part from its guest list until 48 hours after the plan. Later, through Pantopus support |
| The payment fails or is abandoned | Nothing is charged. The spot is kept 10 minutes, then offered to the next person waiting |
| A guest disputes the charge with their bank | Pantopus answers with the record: when they joined, when they paid, the chat. If the bank still sides with the guest, the amount and the bank's dispute fee come out of the business's next payouts |

Pantopus returns its whole cut on any refund. The card company keeps its own fee
on a refund; on a full refund Pantopus absorbs that.

## 9. Taxes, the law and the app stores

| Topic | What was found | Who settles it |
| --- | --- | --- |
| Sales tax | Washington makes a "marketplace facilitator" collect tax on taxable sales it takes payment for. Prepared food is taxable, and the state's own example is a food court operator that takes payment for its restaurants. [State guidance](https://dor.wa.gov/taxes-rates/retail-sales-tax/marketplace-fairness-leveling-playing-field/marketplace-facilitators) | An accountant, **before the bill at the place is built** |
| App stores | Apple's rule 3.1.3(e): things consumed outside the app must be paid by card or Apple Pay, not in-app purchase. A paid live class inside the app falls under in-app purchase. So paid plans are in person only. [Forum copy of the rule](https://developer.apple.com/forums/thread/687921) | Re-read both stores' current rules before the apps ship |
| Tips | Washington lets an employer take only the tip's own share of the card fee out of a staff tip. [Washington L&I](https://www.lni.wa.gov/workers-rights/wages/tips-and-service-charges) | A lawyer, for other states |
| Alcohol | No deals on alcohol. Paying a bar tab through Pantopus is payment only | A lawyer |
| Holding money | Pantopus holds a guest's money for the business until two days after the plan, as its agent. The payment company is the licensed party. Invoices already work this way | A lawyer, to confirm the terms |
| Year-end tax forms | The payment company issues them to each business's own payout account (founder decision, October 9) | Done |
| Plans for children by businesses | Behind their own switch, `plans_business_kids`, until a lawyer has read the rules | A lawyer |

Prices on a plan include tax, and the business is the seller. The terms need two
new sections: what a business agrees to (it is the seller, it honors its deals,
the refund rules) and what a guest agrees to.

## 10. What the business sees

1. **Gets set up to be paid.** Its primary owner creates the business's payout
   account, which exists today for invoices. Until it is enabled the business
   can post free plans only.
2. **Puts a price and a deal on a plan.** Two rows on the plan form: the price
   per person, and the deal form (board 9).
3. **Works from the guest list during the plan.** Board 14. Each guest shows as
   paid or not yet, with the amount, the tip and where they came from. Two
   actions: "Send a check" and "Refund".
4. **Sees a payment land.** The list updates the moment a guest pays, and the
   guest's phone shows the Paid screen.
5. **Gets paid.** Its share moves to its payout account 48 hours after the plan
   ends, and from there to its bank on the payment company's usual schedule.

Once a month it gets a statement: for each plan, the guests and where each came
from, sales, what the deal cost, tips with their card fee, Pantopus's cut and
what was paid out. The statement is the business graph's shared one (its
contract, section 5.4).

## 11. What gets built

The steps, their gates and the sessions are in
[04-build-plan.md](04-build-plan.md). The data and routes are in
[03-build-contract.md](03-build-contract.md), sections 8 to 10. No new table is
added for Plans.

## 12. The decisions, accepted November 15

| | Decision | Value |
| --- | --- | --- |
| P1 | Which payments exist | A price to join first, then the bill at the place, each with a tip |
| P2 | The cut on a price to join | 15% card fee included for a guest Pantopus brought (founding 10%); 5% plus the card fee for the business's own guest |
| P3 | The cut on a bill at the place | 5% plus the card fee for a guest Pantopus brought; 1% plus the card fee for the business's own |
| P4 | The card fee on a tip | Out of the business's payout, shown beside the tip. Pantopus never takes a cut of a tip |
| P5 | How a tip is asked | 18%, 20%, 25% of the amount before the deal, another amount, or none; nothing chosen ahead; the business switches tips on per plan |
| P6 | A group price | Charge the regular price at joining; return the difference to everyone automatically when it unlocks |
| P7 | Claiming a deal on a bill | Paying through Pantopus is the claim. The pass stays only for "something free" |
| P8 | Who may charge | Only a verified business whose own payout account is enabled |
| P9 | When the business is paid | 48 hours after the plan ends |
| P10 | Refunds | Full until 24 hours before, and whenever the business changes or cancels; none for a no-show |
| P11 | Who can pay | Anyone with a Pantopus account; the web page gets one-tap sign-in and payment |
| P12 | Online plans | Never paid. Paid plans are in person |
| P13 | Who the seller is | The business. The card statement reads "PANTOPUS" followed by the business's name. Prices include tax |
| P14 | Alcohol | No deals on alcohol |
| P15 | A lost card dispute | The business bears it, out of its next payouts |
| P16 | The order | The steps in the build plan, with the by-hand trial first and group payment later |

These replace decision D3 and section 6 of the Plans with businesses contract.
D5 (refunds) is unchanged and is P10.

## 13. Risks

| Risk | Why it matters | What limits it |
| --- | --- | --- |
| The cash register does not know | A place's own till has no record of a Pantopus payment; staff check the guest's Paid screen or the guest list | Start with classes, clinics and small venues. The by-hand trial shows whether staff will do it |
| Sales tax falls on Pantopus | If Washington treats Pantopus as the one who must collect, bills need tax lines and filings | The accountant's answer comes before the bill step; paying to join is built first |
| Little money per bill | A bill earns a dollar or two | Paid spots and, later, group bookings carry the revenue |
| A fake business collects money | Guests pay for a plan that never happens | Verified businesses only; the payment company checks identity and bank; money waits 48 hours after the plan |
| A dispute is lost after the business has left | Pantopus pays it | Small while amounts are small; a reserve can be added later |
| Money back on a group price confuses | A bank can take days to show the return | The notice and the receipt say the amount and the date |
| Nobody on the other side | Businesses need guests and guests need businesses | Free business plans and "something free" deals come first; they bring both |
