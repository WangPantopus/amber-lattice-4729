# Plans for the holidays, and paying businesses

Written November 15, 2026. Design, architecture and build plan. **Nothing here is
built.** The founder asked for design only in this round; the build starts when
the founder says so, in separate sessions
([session briefs](05-session-briefs.md)).

Plans today is good for small get-togethers among people who have the app. This
set of documents makes it carry holiday plans (Thanksgiving, Christmas, New
Year's, birthdays, team outings) and lets a business charge a guest through
Pantopus, with tips.

## Read in this order

| Document | What it holds |
| --- | --- |
| [01-design.md](01-design.md) | What people and businesses get, the screens, the rules that keep Plans clean, and the founder's decisions |
| [02-payments.md](02-payments.md) | Paying a business through Pantopus: the two payments, tips, the cut, deals, refunds, tax and law |
| [03-build-contract.md](03-build-contract.md) | The contract between the server, the web and the apps: data, routes, rules |
| [04-build-plan.md](04-build-plan.md) | The steps, what gates each one, who builds what, how each is checked |
| [05-session-briefs.md](05-session-briefs.md) | The briefs for the build sessions |
| [06-screens.md](06-screens.md) | Every screen of the people track, element by element, with its words, states and routes |
| [07-screens-business.md](07-screens-business.md) | The business track's screens, element by element: deals, paying to join, the bill and tips |
| [screens/](screens/) | The twenty-three boards as pictures (light) |

## Where the design lives outside the repository

- The canvas "Plans for the holidays", twenty-three boards, each with a Dark
  switch: <https://claude.ai/artifact/8FbzKc3ZQMCH8HRBzVzcNe> (private; a
  session other than the one that drew it cannot open it, which is why the
  pictures are in `screens/`).
- The boards' sources on the founder's Mac:
  `~/pantopus-plans/design-src/plans-holiday-canvas/project/`. They reuse the
  shipped Plans styles (`plans.css`, `more.css`, `biz.css`) plus `hol.css`.
- The payments document the founder read and answered:
  <https://claude.ai/artifact/8XAGMPij1mN1WP6Z1uhmbq>. Its content is
  [02-payments.md](02-payments.md).

## What it builds on

| Earlier work | State | How this set uses it |
| --- | --- | --- |
| Plans (nine kinds, private, repeating, online, invitations) | Live on `dev` | Extended in place |
| Plans with businesses, `docs/product/plans-with-businesses/` | Docs PR 3964, open and unmerged. Steps 1 and 2 (a verified business hosts a free plan) are built behind `plans_business`, off | The business track continues from its step 3. This set replaces its money section (6) |
| The business graph's four shared pieces, `docs/product/business-graph/` | Docs PR 3965, open and unmerged. Approved by the founder November 11. The place key and "acting for a business" are built; the customer record and the sale columns on `Payment` are not | The payments track needs the two unbuilt pieces first ([build plan](04-build-plan.md), step B0) |
| Payments (cards, Apple Pay, Google Pay, holds, refunds, disputes, business payout accounts, invoices, gig tips) | Live in production since October 26 | Reused; Plans has no payment today |

## Status

| | |
| --- | --- |
| The research and the first report | Done November 15 |
| The twenty boards | Drawn November 15. The founder's only change to the first fourteen was to move payment into Pantopus, which boards 7 to 14 show. Boards 15 to 20 were added the same day so every screen of the first build has a picture; the founder has not looked at those six yet |
| Boards 21 to 23, a shared link for someone who has the app | Drawn November 15 and accepted by the founder the same day ("Yes, go ahead"); contract 6.9. Checked by rendering them in light and dark, not in the canvas page or on a phone |
| Payment decisions P1 to P16 | Accepted by the founder November 15, all as recommended ([02-payments.md](02-payments.md), section 12) |
| Calls these documents make | H1 to H11 and K1 to K10, accepted by the founder November 15, all as recommended ([01-design.md](01-design.md), section 7, and [03-build-contract.md](03-build-contract.md), section 2) |
| Build | The founder said "yes, let's start" on November 15 for the people track; the build sessions run on Opus 5.5 at Extra High |
| On `dev` and staging, every switch off | H1, H2 and H3 on the server and the web, the guest email rules and the move-to-a-home rule (PRs 4183 to 4187 and 4192, November 15). Production has none of it. The iPhone and Android halves are being built |
| Made precise during the build | Several keys a guest, and the key only by email at a home (contract 6.1, 6.3). Which emails count against a guest's three, and that a cancellation always goes (contract 6.6). Both were the designer's calls after the server session asked, reported to the founder, not separately approved |

## Not checked

- The canvas page itself. The boards were checked by rendering them on the
  founder's Mac in light and dark.
- Whether the payment company lets a card statement name the business under the
  way Pantopus charges today.
- Google Play's current payment rule; Apple's rule 3.1.3(e) was read from a
  forum copy.
- Tip and sales-tax rules outside Washington.
- Real money end to end with a real business.
