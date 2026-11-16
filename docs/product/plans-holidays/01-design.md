# Plans for the holidays: the design

November 15, 2026. What people and businesses get, the screens, and the rules.
The money is in [02-payments.md](02-payments.md).

## 1. Why

Thanksgiving, Christmas and New Year's are when people plan the most with other
people. Plans as shipped falls short on three points:

1. **Most guests are not on Pantopus.** Every guest needs an account and the
   app; the web has only a preview page.
2. **The groups are bigger and mixed.** A plan holds 30 at most and one answer
   covers four people. Kids are counted only on playdates.
3. **The work of a holiday is not there.** Who brings what, who is coming, which
   date, who pays.

What the research found (sources in the founder's report of November 15):
hosts expect about nine guests; nearly two-thirds make Thanksgiving a potluck;
72% spend New Year's Eve at home; every invitation app lets a guest answer from
a link without installing anything; 82% of parents did not hear back from every
guest of a child's party; 53% plan to order all or part of Thanksgiving dinner
from a restaurant.

## 2. The founder's direction (November 15)

In the founder's words:

- "This Pantopus Plans have to be very special that people would want to use it."
- "I agree with your additions."
- "Maybe get businesses on Pantopus app as well and they can post plans they
  host on Pantopus, and they can also give out coupons, deals, promotions, and
  sometimes things like if by certain datetime there are this many users sign up
  for the plan then all the signed up users get certain type of deals."
- "We do not want our Plans screen to be dirty looking, we want the screen to be
  as clean as possible. User retention is extremely important."
- "When needs to pay, I am thinking users should pay through Pantopus to
  businesses ... payment plus tips, please design this carefully."

Earlier directions that still hold: no word "neighbor" in Plans copy (November
14); a plan among friends is free and never asks for a card; playdates keep
their rules; businesses must be verified.

## 3. The additions

For people, in the order they are built:

| | Addition | What it is |
| --- | --- | --- |
| 1 | Answer from the link | One link for the group chat. A guest gives a name, adults and kids, and says I'm in, Maybe or Can't make it, in a browser, with no app and no account |
| 2 | Bigger, mixed groups | A private plan has room for up to 100. An answer counts adults and kids |
| 3 | Bring list | The host lists what is needed; guests claim items, in the app or the browser |
| 4 | Occasions | Thanksgiving dinner, Friendsgiving, Holiday party, Gift exchange, New Year's Eve, Birthday: a plan started with the usual things filled in |
| 5 | Find a date | Guests pick among two or three dates. Not drawn yet |
| 6 | Chip in | The host suggests an amount and gives their own payment link. Not drawn yet |
| 7 | Gift exchange | Draw names, set a budget, wish lists. Not drawn yet |
| 8 | Photos afterwards | Into a shared Moment. Not drawn yet |
| 9 | Groups | A saved family, team or class to invite in one tap, with a co-host. Not drawn yet |

For businesses:

| | Addition | What it is |
| --- | --- | --- |
| 10 | A business hosts a plan | Built already (free plans), switched off |
| 11 | Deals | A deal for everyone who joins, or a group deal that unlocks for all when enough people join by a time |
| 12 | Paying through Pantopus | A price to join; the bill at the place; a tip ([02-payments.md](02-payments.md)) |

Trips are left out: itineraries and bookings are a different product.

## 4. The screens

The pictures are in [screens/](screens/). Each board has a dark version on the
canvas.

| Board | Picture | What it shows |
| --- | --- | --- |
| 1 | `01-plans-tab.png` | The Plans tab: your plans first, then this week nearby. A row carries one thing on the right |
| 2 | `02-what-are-you-planning.png` | The kind picker: six occasions on top, then the nine kinds |
| 3 | `03-host-form.png` | The host form: one "Add to this plan" card of switches, all but what the occasion needs starting off |
| 4 | `04-dinner-page.png` | A dinner's page for its host: who is coming (adults and kids), maybe, no answer, the bring list, "Remind" |
| 5 | `05-link-in-a-browser.png` | The link in a browser: name, adults, kids, email, three answers |
| 6 | `06-after-answering.png` | After answering: the address, directions, calendar, the bring list to claim from, a quiet "Get Pantopus" |
| 7 | `07-business-plan-group-deal.png` | A business's plan with a group deal: what unlocks, how many are in, the time left |
| 8 | `08-unlocked.png` | Unlocked: the deal comes off when the guest pays there |
| 9 | `09-business-adds-a-deal.png` | The business's deal form |
| 10 | `10-notices.png` | The notices that bring people back |
| 11 | `11-paying-to-join.png` | Paying to join, with a group price |
| 12 | `12-the-bill.png` | The bill at the place: the deal off, a tip, pay |
| 13 | `13-paid.png` | Paid: the screen to show, and the receipt |
| 14 | `14-business-guest-list.png` | The business's guest list: who paid, tips, "Send a check" |
| 15 | `15-browser-waiting-for-yes.png` | In a browser, after "I'm in": waiting for the host's yes |
| 16 | `16-share-a-link.png` | Inviting: one link for everyone, with "I say yes first" |
| 17 | `17-whos-coming.png` | The host's list: waiting, coming, maybe, no answer; Let in, Remind |
| 18 | `18-answering-in-the-app.png` | Answering in the app: adults, kids, Maybe |
| 19 | `19-bring-list-host.png` | The bring list, for the host |
| 20 | `20-guest-plan-page.png` | A guest's plan page in the app, with the bring list |

Boards 1 to 6 and 15 to 20 are additions 1 to 4, the people track; each is
specified element by element in [06-screens.md](06-screens.md). Boards 7 to 9
are addition 11. Boards 11 to 14 are addition 12.

## 5. Keeping Plans clean

The founder's rule. These hold on every screen, on every platform.

1. **One thing on the right of a row.** A plan's row in the list ends in a count
   ("9 coming", "2 spots") or one tag ("Deal", "20% off"), never both.
2. **No banners, no strips, no cards that sell.** A business's plan is a row
   among rows. Nothing a business pays or offers changes a plan's place in the
   list.
3. **Extras live inside a plan, behind switches.** Bring list, kids welcome,
   find a date, chip in and gift exchange are rows in one "Add to this plan"
   card. A switch that is off leaves nothing on the plan's page.
4. **One deal a plan, from fixed kinds.** Percent off, dollars off, something
   free, two for one. No free text, so a deal cannot become an ad.
5. **The tab keeps its shape.** The map, the sheet, the list and the tab bar are
   as shipped. The list gains one section, "Yours", above "This week nearby".
6. **The colors do not grow.** A deal is the Pantopus sky; unlocked and paid are
   the existing green. A plan keeps its kind's color.

## 6. What brings people back

Each notice is about something the person already cares about. Board 10 shows
them.

| Loop | The notice |
| --- | --- |
| Your own plan filling | "Dana is bringing the potatoes. 2 things are still open for Thanksgiving dinner." |
| A deal counting down | "2 more and trivia is 20% off. It closes at 5:00 PM. Bring a friend?" |
| A deal landing | "Unlocked: 20% off food tonight." |
| The photos afterwards | "Photos from Friendsgiving. Maya added 14." |
| The same people again | "Game night was a month ago. Same people again? One tap sets it up." |
| A business you follow | "Trivia is every Friday here." (Follow, on board 8) |
| A guest who answered in a browser | The page after answering says the chat, day-of updates and photos are in the app (board 6) |

Limits: notices keep to the existing quiet hours; a claim on a bring list is
bundled, never one push a claim; a guest without an account gets at most three
emails a plan (the address, one reminder, a change or cancellation).

## 7. Calls the design makes

The founder accepted all eleven on November 15, as recommended.

| | Call | Value |
| --- | --- | --- |
| H1 | Occasions are starts, not kinds | An occasion fills in an existing kind (a Thanksgiving dinner is a Food & drinks plan). No new kind, so old app builds still read the plan |
| H2 | The list filter | All, People, Businesses (the earlier design said "Neighbors") |
| H3 | A guest without an account | Gives a name, adults, kids and an email. The host sees the name and the answer, never the email |
| H4 | A home address and a guest without an account | It reaches them only by email, to the address they gave, and only after the host's yes when they came by the open link. The board's line "The address comes once you answer" becomes "once Maya lets you in" for that case. The host can switch the yes off for a plan |
| H5 | Who can use the open link | Private plans hosted by a person. Never a playdate, never a business's plan |
| H6 | Room | A private plan has room for up to 100; a public plan stays at 30 |
| H7 | A guest without an account and the chat | Not in the chat. They get the address, the bring list and one reminder. The chat is a reason to get the app |
| H8 | A full plan | Takes no more "I'm in" from a browser; the guest can say Maybe and the host sees it |
| H9 | Which occasions show | The server sends the list by date, so the strip changes with the season with no app release |
| H10 | A group deal that falls short | The plan still happens; the business may offer a smaller deal instead |
| H11 | Follow | Following a business from a plan makes later joins that business's own guest, at its lower rate, as the November 11 design chose |

## 8. Words

- No "neighbor" in Plans. A person is a friend, a guest or people nearby.
- A business's plan says "Verified business".
- A guest is "in", "maybe" or "can't make it". A host "lets someone in".
- Money: "price", "the bill", "a check" (what a business sends a guest), "tip",
  "deal", "group deal", "group price", "money back". Never "coupon code",
  "voucher" or "promo".
- The payment company is named only where the law needs it.
