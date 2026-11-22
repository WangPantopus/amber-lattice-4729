# Card shelves: what to build (CARDSHELF)

Approved by the founder on November 21, 2026 (Pacific). The founder's words: "yeah this is good, we can do it". After
the new cards, the order and the opening row were added, the founder said to build it with one change, the new
collection's name, which became "Christmas in the City" (its first name named a real city, so it isn't kept here). And
a few minutes later: "Please also make sure all the new cards are big enough in the screen. we want big".

This file is the design. For looks, the mock-up wins over these words. For rules, numbers, names and words on screen,
this file wins.

## Where things are

- Screenshots of each state of the mock-up: [screens/](screens/) (`phone-1-shelves`, `phone-2-shelves-scrolled`,
  `phone-3-card-chosen`, `phone-4-collection-with-parts`, `phone-5-collection-plain`, `phone-6-card-rack`,
  `phone-0-today`, `web-1-top`, `web-2-scrolled`). The working mock-up is a private page the founder has
  (https://claude.ai/artifact/SmTMt4SwzbiL5Mwk7aXpoD); its phone has two modes, "Shelves" (built) and "Today".
- The 16 new pictures (90 to 105) as the website serves them, and how they were made:
  [pictures.md](../christmas-card-table/pictures.md), "Pictures 90–105".
- The build's own notes (the shapes, choices and reviews) stay outside the repository with the founder.

## Why

"Pick a card" was laid out for 17 cards. There are 89, soon 105, in 8 collections, soon 9. Today the screen shows one
collection at a time behind a row of names: 2 cards fit on an iPhone's first screen, 2 of the names are in view, and
pantopus.com/cards is 11 phone screens long. The founder wants people to see the cards, starting with the best ones,
with Christmas with Jesus Christ first.

## Part A: the cards and the list (server and website pictures)

### A1. Sixteen new cards, numbers 90 to 105

Borderless paintings, like Christmas with Santa's 50 to 58: follow exactly what was done for those (paper, the picture
sizes, the thumb, the large card picture, the share link picture, the cloth colour rule, the public page). Keep the
founder's rule from the last batch: do not reduce the pictures' quality (the large card picture stays 1214 x 1295, JPEG
quality 92 or higher, cropped never resampled).

| No. | Collection | What the picture shows | Caption (printed and shown, exactly) |
|---|---|---|---|
| 90 | Christmas with Santa | Mrs. Claus fixes his scarf at the stable door | Bundle up. It’s a long night. |
| 91 | Christmas with Santa | A reindeer takes the carrot from his pocket | Save some for the reindeer. |
| 92 | Christmas with Santa | Santa tests a toy train through his hat | One more lap, then it’s yours. |
| 93 | Christmas with Santa | Santa pours coffee at an all-night diner | For everyone working tonight. |
| 94 | Christmas with Santa | Santa offers the dog a biscuit | He won’t tell if you don’t. |
| 95 | Christmas with Santa | The sleigh lifts off over the village | And away he goes. |
| 96 | Christmas in the City | A hotel doorway and a yellow taxi in the snow | Christmas Eve in the city. |
| 97 | Christmas in the City | Angels with trumpets on the walk to the great tree | The whole city’s lit up. |
| 98 | Christmas in the City | A child at a department store window | Remember the windows downtown? |
| 99 | Christmas in the City | Skaters under the great tree | Meet me under the tree. |
| 100 | Christmas in the City | The park rink at dusk | Skate with me till the lights come on. |
| 101 | Christmas Memories | A street of decorated houses in the snow | The whole street’s lit up for you. |
| 102 | Christmas Memories | A brick house, a mailbox and a station wagon | The porch light’s on. |
| 103 | Christmas Memories | A family walks to the church, the child in their footprints | Follow our footprints home. |
| 104 | Christmas Memories | The cat sits on the wrapping paper | I had help with the wrapping. |
| 105 | Christmas as a Kid | Two children watch the first snow from the window | Come to the window. It’s starting. |

Rules for these:

- Apostrophes are the curly ’ the other captions use. Each card's public name (its slug) comes from its caption the way
  the others' do.
- **No shop, hotel, rink or city name anywhere public**: not in a caption, a slug, a file name, alt text, a link
  preview, a doc in the repository or a commit message. The founder renamed the collection so that it does not say
  which city it is. The founder's own file names for these pictures are not in this folder for that reason; the
  pictures here are named by number.
- A number is never reused. The seventeenth picture the founder gave (a second painting of the toy-train scene) stays
  out.

### A2. The collections, in this order

Christmas with Jesus Christ stays first (the founder's wish). After it they run from cards anyone can send to anyone,
to family, to one particular person.

| # | id | Name | Line | Cards, in shelf order | Opening card |
|---|---|---|---|---|---|
| 1 | `first-christmas` | Christmas with Jesus Christ | (as today) | 59 to 89, as today | 65 |
| 2 | `with-santa` | Christmas with Santa | (as today) | 50 to 58, then 90 to 95 | 95 |
| 3 | `in-the-city` (new) | Christmas in the City | For anyone who dreams of the city at Christmas. | 96, 97, 98, 99, 100 | 99 |
| 4 | `as-a-kid` | Christmas as a Kid | (as today) | 1 to 17, then 105 | 105 |
| 5 | `grandmas-house` | Christmas at Grandma’s House | (as today) | 44 to 49 | 47 |
| 6 | `memories` | Christmas Memories | (as today) | 38 to 43, then 101, 102, 103, 104 | 101 |
| 7 | `with-friends` | Christmas with Friends | (as today) | as today | 22 |
| 8 | `love-stories` | Christmas Love Stories | (as today) | as today | 27 |
| 9 | `in-your-twenties` | Christmas in Your Twenties | (as today) | as today | 37 |

That is 105 cards: 31, 15, 5, 18, 6, 10, 7, 7, 6.

The new cards, the new collection and the new order are not behind any switch: they are the list. Apps in the stores
today read the list from the server, so they show nine names in the new order and the new cards as soon as the server
has them. The website must serve a picture before the server lists it (ship the pictures first, as the last two
batches did).

### A3. New facts on each collection (added to the server's answers; old apps ignore them)

Both list answers carry them (the signed-in list "Pick a card" reads, and the public list pantopus.com/cards reads):

- `short`: the short name for the website's row: Jesus Christ, Santa, The City, As a Kid, Grandma’s House, Memories,
  Friends, Love Stories, Your Twenties.
- `slug`: the collection's public name in a link: `jesus-christ`, `santa`, `the-city`, `as-a-kid`, `grandmas-house`,
  `memories`, `friends`, `love-stories`, `your-twenties`.
- `pick`: the design id of its opening card (the table above).
- `parts`: only on Christmas with Jesus Christ, its three parts in story order, each a name and its design ids:
  "The first Christmas" (59 to 68, 10 cards), "His life and teaching" (69 to 80, 12), "The cross and the empty tomb"
  (81 to 89, 9).
- The public list also carries each collection's `line` if it doesn't today.

A rule the server keeps: a collection's opening card is never one of the first three cards of its own shelf (so the
same picture never shows twice on one phone screen). The table above keeps it.

### A4. The table each card opens on, named by the server

Today each app decides a card's table (candlelit for Christmas with Jesus Christ, Santa's for Christmas with Santa,
snowy for the rest) from the card's number, in its own code (`CardTableMood.swift`, `CardMood.kt`, the web's
`cardArt.ts`, and the verse numbers in `HolidayCardArt.kt`). So store apps will open 90 to 95 on the snowy table, not
Santa's, until new builds ship. Fix this for good:

- The server names it on every design it sends, in every answer that carries a design or an opened card: `mood`, one of
  `reverence`, `santa`, `nostalgia`.
- Each app uses the server's `mood` when it is there and falls back to its number ranges when it is not. Also add 90 to
  95 to the Santa range in each app, for answers cached before the field existed.

### A5. One new switch

The new layout (Parts B, C and D) is behind one new launch key, `card_shelves`, read the way `card_table` is, on top of
`mailbox` and `holiday_cards`. It must be switchable on the server alone: the apps and the website learn it from the
server's answers (a field in both list answers), never from a build-time value. On in staging once the server part is
merged (the founder's standing word of November 14: a staging build means the feature is on there). Off in production
until the founder turns it on.

With the switch off, every screen is exactly as it is on `dev` today (with the new cards and order in it). With it on
and `card_table` off, a tap on a card chooses it as it does today, since there is no card rack to open.

## Part B: "Pick a card" on iPhone and Android (switch on)

See [screens/](screens/) `phone-1` to `phone-6`. Everything is drawn with the flow's own paper, type, wax red, tiles and tick.
Nothing here changes step 1, step 3 or the card rack.

**Big cards (the founder's rule).** Cards are the page: on every app and at every width, no card is drawn smaller than
a tile of today's two-across grid on that screen, and the sizes below are the least they may be. If a choice is
between a bigger card and more cards in view, the bigger card wins. The 16 new cards are full-size cards like the
rest, in the grid, on the rack and when opened.

### B1. The top

- The title row stays as it is today: back, "Pick a card", the step dots.
- The stamp box goes. In its place, on the "To <name>" line, at the trailing edge: a small chip with the same facts the
  box gives (the web's stamp chip is the model for its words). A tap on it opens what "Buy stamps" opens today. Without
  stamps there is no chip and the line is as today.

### B2. The opening row: "One from each collection"

- A small label, "One from each collection", then one row that scrolls sideways: one large card per collection, in the
  collections' order, each the collection's `pick`.
- A large card is about 76% of the screen's width (no wider than 340), drawn as the grid's tiles are: one large card
  fills the row and the next one peeks in. Under it: its caption, then one line in wax red, "<Collection name> · <N> cards ›".
- A tap on the card opens the card rack at that card, among the cards of its collection (as a tap in a grid does today).
  A tap on the line under it scrolls the page to that collection's shelf.
- The row settles on a card's leading edge. The next card always peeks in, so it reads as a row.
- A server that sends no `pick` for a collection: that collection has no large card. No picks at all: no opening row
  and no label.

### B3. The shelves

- Under the opening row, one shelf per collection, in order, each with a hairline above it.
- A shelf's head: the collection's name; under it its line (two lines at most); at the trailing edge "All <N> ›" in wax
  red, which opens the collection's page (B4).
- A shelf's row scrolls sideways and settles on a card's leading edge. A card is about 56% of the screen's width (no
  narrower than 190, no wider than 240), a third wider than a tile of today's grid, so one whole card and a good part
  of the next show; its caption is under it (two lines at most).
- A row shows the collection's first 10 cards. If the collection has more, an eleventh tile of the same size reads
  "See all <N>" and opens the collection's page.
- A tap on a card opens the card rack at that card, with all the cards of its collection in order (not only the 10).
- The chosen card carries the tick wherever it shows: the opening row, a shelf, a collection's page.
- The names row (the pills) is gone while the switch is on.

### B4. A collection's page

- Opens inside step 2. Its title row reads "All collections" beside the back arrow, and back returns to the shelves at
  the place they were scrolled to (not to step 1). The step dots stay.
- The collection's name as a heading in the card serif, its line, then its cards two across in today's grid, each tile
  as large as today's. A wider screen adds a column only when every tile stays at least as wide as a shelf card.
- With `parts`: a row of pills (today's pill) with the parts' names, which stays under the title row while the page
  scrolls; a tap scrolls to that part; the part in view is the wax-red one. Each part starts with its name and
  "· <n> cards". Without `parts`: the grid alone.

### B5. The bottom bar

- Hidden until a card is chosen. No disabled button and no "Tap a picture to choose it." while nothing is chosen.
- Once a card is chosen (after ✕ on the rack, or coming back from step 3, or a flow that opens with a card already
  chosen): the bar comes up from the bottom with the card's small picture, its caption, "See it larger" where today's
  bar has it, and "Write on this card". The page's bottom edge moves up with it so the last shelf is never covered.
- The bar shows on the shelves and on a collection's page alike.

### B6. Coming back

- From step 3, or opening with a card already chosen: the shelves open scrolled to the shelf that holds it, the card
  ticked, the bar up.
- ✕ on the rack returns to exactly where the rack was opened from.

### B7. What must hold

- **Speed.** Opening step 2 must not be slower than today. Rows and the page load their pictures as they come near, not
  all at once (Android's grid loads every picture of a collection at once today; the shelves must not). Measure the time
  to the first pictures against `dev` on the same device and write both numbers in the pull request.
- Largest text sizes: captions wrap, rows grow, nothing is cut off. Dark mode uses the flow's own colours.
- VoiceOver and TalkBack: the label is read; a shelf's name is a heading; a card says its caption and its place
  ("3 of 15"); "All 15" says the collection's name; the chosen card says it is chosen.
- Reduce Motion: no sliding bar, no zoom.
- The iPhone Duo open and closed, and an iPad-width window if the app runs there: wider screens show more cards per
  row at the caps above, never smaller cards.
- A server without collections, without the new facts, or with the switch off: today's screen.

### B8. Last, and only if they cost nothing else

Do these after everything above is merged, each as its own small pull request, and drop any that risks the rack:

- The card grows out of its place into the rack and shrinks back (iOS 18's zoom transition, Android's shared-element
  transition with the back gesture). Today's opening everywhere else.
- Press and hold a card for a large preview.

## Part C: "Pick a card" on the web (switch on)

The same page as Part B inside the web flow's step 2: the opening row, the shelves, the collection page, the bar that
shows only once a card is chosen. The stamp chip is already in the header there.

- Phone width: the shares of Part B (76% and 56% of the width). Wide screens: a shelf card is about 220 px, an opening
  card about 320 px, both larger than today's tiles there. Rows keep the sideways scroll with snap;
  where there is a mouse, arrows at a row's two ends move it by most of its width.
- The browser's Back returns from a collection's page to the shelves.
- Keyboard: every card, "All <N>", the arrows and the line under an opening card can be reached and used; focus is
  visible; the rack keeps its keys.
- With the switch off: today's step 2.

## Part D: pantopus.com/cards (switch on)

See [screens/](screens/) `web-1-top` and `web-2-scrolled`. It stays on the dark table it has.

- The head stays (title, the one line, what sending costs, the phone's store button, the shared goal when it shows), as
  compact as the mock-up.
- A row of the collections' short names, each with a small round picture of its opening card. It stays at the top of
  the window while the page scrolls; a tap goes to that shelf; the shelf in view is the marked one.
- Sizes as in Part C: at phone width 76% and 56% of the width; on wide screens an opening card about 320 px and a shelf
  card about 220 px (today's tiles there are about 184 px).
- "One from each collection": the large cards. A card opens its own page as tiles do today; the line under it,
  "<Collection name> · <N> cards", goes to its shelf.
- One shelf per collection: its name, its line, "See all <N>", and its first 12 cards in a row that scrolls sideways
  (arrows where there is a mouse). A card opens its own page, as today.
- Each collection gets its own page, `/cards/collection/<slug>`: the name, the line, the parts where it has them, and
  all its cards in today's grid; "All the cards" goes back. It can be found by search engines, has its own title and
  description (the collection's name and line), and its link preview is its opening card's share picture. It keeps
  `?ref=` the way the other card pages do, and answers "not found" when cards are off or the name is unknown.
- Shelves below the screen are not drawn until they are near; pictures keep their shape while they load.
- With the switch off: today's page.

## What "done" means

- Every part merged into `dev` and released to staging, the switch on there.
- Checked in the real apps against a local server with made-up people: Chrome at desktop and phone width, an iPhone and
  the iPhone Duo, an Android phone. For each: the opening row, a shelf, "See all", a collection's page with parts and
  one without, choosing from each place, the bar, coming back from step 3, a relaunch or reload, the largest text size,
  the screen reader, dark mode.
- A card from each of the four collections that got new cards, sent from one app and opened in another: the right
  picture, caption, cloth and table.
- With the switch off: today's screens, unchanged.
- The apps as they are in the stores today (build the store tags) still list, send and open cards against the new
  server answers, new cards included.
- What nobody could check (hosted services, real phones, store builds, production) is said plainly in each pull request.

## The founder's own steps at the end (write them into NEXT_STEPS.md)

- Try it on staging.
- Promote `dev` to production.
- Turn the new layout on in production.
- Ship new iPhone and Android builds (the shelves and Santa's table for 90 to 95 need them).
- Upload the 16 new cards' share films, if the builders make them as the last batch did.
