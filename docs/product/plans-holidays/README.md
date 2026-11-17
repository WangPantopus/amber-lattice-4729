# Plans for the holidays, and paying businesses

Written November 15, 2026. Design, architecture and build plan. The build
started the same day and is under way in separate sessions
([session briefs](05-session-briefs.md)); what is built is under Status below
and, item by item, in `NEXT_STEPS.md`, section "Plans for the holidays".

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
| [08-extras.md](08-extras.md) | The six extras, each with its design, contract and screens: find a date, chip in, gift exchange, photos afterwards, the same people again, one person paying for a group |
| [09-handoff.md](09-handoff.md) | **Start here when picking the build up**: what is built, what is left, when it is done, and the briefs for the next sessions (November 16) |
| [screens/](screens/) | The thirty-one boards as pictures (light) |

## Where the design lives outside the repository

- The canvas "Plans for the holidays", thirty-one boards, each with a Dark
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
| Boards 24 to 31, the extras | Drawn November 16 after the founder said to build everything discussed; checked by rendering them in light and dark only. The founder had not looked at them when [08-extras.md](08-extras.md) was written |
| Payment decisions P1 to P16 | Accepted by the founder November 15, all as recommended ([02-payments.md](02-payments.md), section 12) |
| Calls these documents make | H1 to H11 and K1 to K10, accepted by the founder November 15, all as recommended ([01-design.md](01-design.md), section 7, and [03-build-contract.md](03-build-contract.md), section 2) |
| Build | The founder said "yes, let's start" on November 15 for the people track, and on November 16 to keep every session working until everything discussed and designed is built and checked, without being asked before each piece. The build sessions run on Opus 5.5 at Extra High; one session designs and coordinates and writes no product code |
| The people track | On `dev` on the server, the web, the iPhone and Android (November 15 and 16, with the Change screen's "Room for" and "Kids welcome" on both phones), and checked with the two phones together both ways round. Its server and web halves are on staging, with guests answering in a browser turned on there at the founder's word. Production has none of it |
| The business track | On `dev` on the server and the web (every switch off, checked in the payment company's test mode on a session's own setup). On the phones: all of it is on `dev` on Android (merged on its session's emulator checks, and the merged build smoke-checked on an emulator in test mode the evening of November 16), and all of it is on `dev` on the iPhone too since November 16 (the bill with tips 4289, the tip afterwards 4307). The two phones were checked together on it on November 17, both ways round, in test mode, with the payout after ([09-handoff.md](09-handoff.md), section 3) |
| The six extras | On `dev` on the server and the web, each behind its own switch, off. Being built on both phones since the evening of November 16 ([09-handoff.md](09-handoff.md), section 4). All six are on `dev` on the iPhone since November 17 (the same people again 4284, chip in 4294, find a date 4300 and 4312, the gift exchange 4317, photos afterwards 4321 and 4323, one person pays for the group 4327); on Android: the same people again (4297) and chip in (4314) |
| Staging | The server and the web there have the people track, the whole business track and all six extras since 7:22 PM Pacific on November 16 (`dev` 2d7e0857d9), every switch off except guests answering in a browser. Nobody has tried the business track or the extras there |
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
