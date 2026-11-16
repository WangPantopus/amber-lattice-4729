# The Sky, and the session that designed it: hand-off

Written 2026-11-14 (about 11:00 UTC) by the session that did the work, at 88% of its context, for a new session on
the same Mac. Everything a new session needs is in this file or at a path it names. No passwords, keys or tokens.

## 0. Since this hand-off was written (November 16)

A new session picked the Sky up on November 15, read everything here and reviewed the fourteen boards. Read this
section first; sections 1 to 10 are as the design session left them, and this section wins where they differ.

**Started on November 16, on the founder's word, each in its own session** ("keep working until everything is
done. no need to ask me for anything"):

- **Phase A is being built.** The four server pull requests are #4202, #4207 and #4208 (merged into `dev`) and
  #4213. The five app pull requests and the documents follow. Everything is behind the switch `sky_places`, off on
  every hosted database. The builder's notes are in `~/.pantopus-review/handoffs/sky-phase-a.md`, with the
  decisions it made in the founder's place and the steps only the founder can take (publishing the homes-per-area
  file, turning the switch on). The app screens use the contract's accepted words ("Floating over ...").
- **Screens 1, 2, 6 and 7 are redrawn** and on the canvas (section 6 is done). The founder approved screen 1 first,
  with the disc shown only for the post that is tapped. The report and the rebuilt drawing tool are in
  `~/.pantopus-review/handoffs/sky-redraw.md` and `~/.pantopus-review/handoffs/sky-redraw-tools/`.
- **The Moments map** is getting a time filter on both phones (pull request #4206) and, on iPhone, a globe when
  zoomed out past about 300 miles (the drawn map close in, satellite with labels beyond).

**Decided by the founder on November 16.**

- **One rule for lift:** close in, from a street to a town, lift is real height above the ground; zoomed out, from a
  state to the globe, lift is reach. A view of busy places is separate. The design's "Changed on November 16"
  section has it. Read line 3 of section 1 and decision 5 in section 4 with it. Screen 3 is right as drawn and
  needs no note in the README about visibility (section 6).
- **Claiming the airspace over a home is not to be built as described.** The reasons and a safe version are in the
  design's "Added on November 16" section.

**The founder's ideas for later** are recorded in that same section: a Moment that does not expire, filters, Plans
with Moments, a globe to turn, browsing from the top down, top posts by place, county, state and country, and busy
places. The founder's own note: all of them depend on having users, and there are almost none yet.

**Not started:** levels, posts on the globe, busy places, Plans with Moments. The session's advice was to keep
them as design until there are users.

**Four questions the review raised.** The redraw settled the second (the founder accepted the disc only for the
tapped post) and follows the third and fourth. The first is set aside: phase A is built with the accepted words,
kept in one place per app so they are easy to change.

1. **"Floating" now means two things.** Since the reversal an area post sits on the ground on its disc, and only a
   post truly in the air is lifted. The Post sheet, the composer and the viewer still say "Floating over
   Washougal". Something like "Somewhere in Washougal, WA" would keep "floating" for posts in the air. This
   touches the words in the phase A contract's section 10, not the server work.
2. **Screen 1 is prettier than what would be built.** Every post from one area shows at that area's centre, and the
   centres form a regular grid. By the session's arithmetic, at the zoom drawn they are about 70 points apart side
   to side, a ring is 64 points wide, and discs at real size (about 124 points across) overlap their neighbours.
   The redraw should place posts on the true grid, and may need the disc shown only for the post that is tapped.
3. **Real height can give away a home.** A post from high in the only tower in an area points at that building, and
   apartment buildings are kept off the list of places on purpose. Proposal for the height contract (section 7,
   step 4): lift an area post only when it is clearly flying. Don't use "a balcony high in a tower" as the
   redraw's example (section 6).
4. **Brightness is a weak signal by day.** A photo can't look much brighter on a light map, and a dimmed ring reads
   as seen or ended. Size and the level's name should carry reach, with glow as a night extra.

Smaller: on screen 8, "Nearby" is both the tab's name and the smallest level.

**Paths in section 5 that are gone.** On November 15 neither `~/pantopus-moments/` (the board sources, the drawing
tools and the Moments API contract) nor `~/.config/pantopus/launch-kit/streams/` (the real screenshots) was on the
Mac. The design canvas is intact: a session on the founder's account can read its fourteen boards and their style
sheet and publish to it, and the founder can download the boards as pictures from it. A redraw needs the small
preview tool rebuilt first. Phase A needs the Moments contract found, or its additions written from the code.

**Pull requests.** #4076 and #4058 are still open and not to be merged until the founder says so. #4058 waits on
the founder's steps in section 9.

## 1. Where things stand, in ten lines

1. The session began with a question: can celebrities and influencers use Pantopus? It ended with a design, **the
   Sky**, for where a post is and how far it reaches on the map.
2. The founder accepted the design's sixteen decisions ("Yes, all sixteen"), the ten screens ("yes, these are
   good"), and the phase A contract's nine calls ("Yes, all nine"). All on November 14.
3. Then the founder **reversed decision 5**: height on the map is a post's real height above the ground under it,
   not its popularity. Popularity (reach) shows as brightness, size and how far out a post stays visible.
4. **Nothing is built.** No server, app or migration change exists for the Sky.
5. **Phase A (approximate places) is ready to build and unaffected by the reversal.** The go has not been given. A
   session card for its server work was proposed in the design session; it may have expired.
6. **Screens 1, 2, 6 and 7 are partly out of date** and need redrawing (section 6). The founder was asked whether to
   redraw them and answered by asking for this hand-off, so: not approved yet. Ask.
7. Two pull requests are open, green and **not to be merged until the founder says so**:
   [#4076](https://github.com/WangPantopus/skinny-pantopus/pull/4076) (this folder) and
   [#4058](https://github.com/WangPantopus/skinny-pantopus/pull/4058) (a growth landing page, section 9).
8. Later ideas recorded, not designed in detail: a higher starting level by choice, a view of busy places, real 3D
   terrain.
9. The founder's standing rules apply: confirm before starting any work, drawings included; plain words; no
   subagents in builds; pull requests into `dev`; only the founder merges to `master`, changes hosted systems or
   spends money.
10. The living design is a private Claude Doc; the repo copy is [01-design.md](01-design.md). Where they differ,
    the Claude Doc is newer only if the founder edited it by hand.

## 2. What the founder said, in order

| Founder | What it led to |
| --- | --- |
| Can celebrities, athletes, politicians and super users use this app? Location privacy is a worry. Research deeply. | An assessment (section 8.1). |
| "Not yet" (to planning safety rules for public pages). Can the app make money at 100K, 1M, 50M, 200M, 1B, 3B users? | A money model by stage (section 8.2). |
| "Yes, list them" | The steps to switch on the three lines that can earn today (section 8.3). |
| What is the $29 appeal packet? | An explanation. |
| Help with distribution and marketing: get as many people on Pantopus as possible. | Seven channels, ranked (section 8.4). |
| "yes, 1 and 2 together", then "Yes, start" | The `/tax-check` landing page and kit, PR #4058. The Christmas card half was paused: other sessions already cover it. |
| If Moments becomes popular, what does that mean? Is Moments a bad idea, or should it be a separate app? | Keep it, inside Pantopus; measure whether Moments users add a home (section 8.5). |
| Are Pulse and Moments still good ideas given location risk? What about approximate location, a 3D map with sky, posts floating? | Yes; approximate by default; floating on a flat map first. |
| "lift up in the sky… a base level height… popularity… Cristiano Ronaldo's post probably will be floating in the universe" | Levels: height as reach (later reversed, line 3 above). |
| "It never was meant to be just for local… write a good design doc" | The design. |
| "Yes, all sixteen" | Decisions recorded. |
| "Draw all ten" | Fourteen boards on a design canvas. |
| "Yes, write phase A", and with it: "yes, these are good", most people should be near the ground, people with more followers may choose to start higher, a heat map where busy places rise like hills (by business in built-up areas; "higher may not necessarily mean good") | The phase A contract; the three ideas recorded as later directions. |
| "Yes, all nine" | The contract's calls recorded. |
| Elevation must be shown, at real height; how can it coexist with popularity? Then: a person on Mount Rainier at 10,000 ft is on the ground; Death Valley is on the ground; a paraglider at 1,000 ft over ground at 500 ft shows 500 ft up. 3D terrain can be future work. "yes, please go ahead work into the design." | Decision 5 reversed and written in. |
| Give a comprehensive hand-off, commit and push, open a PR, don't merge, and a prompt for a new session. | This file. |

## 3. The design in one page

Full text: [01-design.md](01-design.md). Its section "Changed on November 14: height is real, reach is brightness"
wins over any older sentence in it that says lift means reach.

**Where a post is (three states).**
- *In the air (the default):* the post belongs to an area that holds at least 100 homes. Others see the area and the
  town's name. Always the case at home.
- *On the ground:* only when the author picks a public place by name (a park, a café, a stadium). The pin is the
  place's own point.
- *No place:* "Don't show where"; connections only.

**How high a post sits.** Its real height above the ground under it: the phone's elevation minus the ground's
elevation at that point, worked out when the post is made. On the ground unless clearly above it (a margin of about
150 ft, or flying speed). The sea-level number stays as the tag ("10,000 ft"). At home no height is shown. The map
stays flat for now.

**How far a post reaches (levels).** Nearby (everyone starts here), Town, City, Region, Country, World. A post
rises by rank with a floor (about ten per town, per metro area and per state, twenty per country, thirty for the
world), from different real people reacting; views count as one twentieth of a reaction. It sinks with age. Rising
past Town needs the author's yes. A person reviews before Country or World. As a floating post rises, the place it
belongs to widens (town, metro area, state, country). Reach is drawn as brightness and size, and as how far out you
can zoom and still see the post. Zoomed out to the world, the posts left are the ones with reach, over the globe.

**How an area is marked.** By its disc: a disc and no tail means somewhere in this area; a tail means exactly here.

**Safety.** Every rule runs on the server, so store builds are protected too. A floating post stores only its area
point; the exact spot is never kept.

## 4. Every decision

**The sixteen (accepted November 14):**

1. A Moment is an area by default, not an exact pin.
2. Exact pins only at public places picked by name. Reverses the November 5 choice (an exact pin wherever a photo
   was taken, the author's home included). Applies to Pulse posts already made.
3. A post made at home is always an area, with no choice.
4. The smallest area holds 100 homes (tune after measuring).
5. ~~Lift means reach; real elevation is a mode.~~ **Reversed the same day:** lift is height above the ground; reach
   is brightness, size and zoom range.
6. Rising by rank with a floor, at the numbers above (starting points).
7. Views count as one twentieth of a reaction, at most half a score.
8. Rising past Town needs the author's yes; public pages rise without asking.
9. ~~Public pages start at City level.~~ **Replaced:** someone with many followers may choose to start higher
   (direction only; steps and which followers count are open).
10. A person reviews every post before Country or World (the founder at first).
11. From Town up, reports send a post to review without hiding it.
12. Columns on posts and new kinds of area; no new table in phases A to C.
13. A floating post shows its elevation rounded to 100 ft.
14. Sponsored lift: later, from Town up only.
15. A public sky page on the web for people with no account: yes, in phase E.
16. The names: the Sky, Overhead, How far; Nearby, Town, City, Region, Country, World.

**The phase A contract's nine calls (accepted November 14):** [02-phase-a-contract.md](02-phase-a-contract.md),
section 2. The three that changed the design: C1 a floating post stores only its area point; C2 the area's point is
the centre of its cell with no secret offset, and the disc is the circle around the cell (about 0.4 mile across at
its smallest; today's offset hides a spot within about half a mile each way); C3 home counts come from the 2020
Census housing counts by block. The rest: C4 the largest area is about 7 by 5 miles; C5 "Share later" for Moments
only; C6 one server switch, `sky_places`, which also covers store builds; C7 a Pulse photo post is exact only at a
tagged venue; C8 old exact points stay in the database, no longer shown, until the founder orders a clean-up; C9
schools and preschools can't take a pin.

**Directions the founder gave, not yet designed in detail:**

- Most posts stay near the ground; that is what makes the map useful and fun.
- A higher starting level as a choice for people with many followers. Proposed by the design session, not confirmed:
  1,000 followers for Town, 10,000 for City, 100,000 for Region, 1,000,000 for Country. Blocked on this: following
  a person delivers nothing in the apps today.
- A view of busy places: the ground rises where more is posted, by public place in built-up areas. Height means
  busy, never good. Proposed, not confirmed: it counts different people who posted; a home or quiet street never
  becomes a hill; a business can't pay to be taller; it is its own view so its hills aren't taken for real ones.
- Real 3D terrain (mountains rise, posts stand on slopes): future work.

**The design session's own additions that the founder has not confirmed:** the 150 ft margin; the disc as the mark
of an area; the busy-places view as its own screen; Overhead as a scrolling row of chips beside the Elevation chip;
grouped lower levels as count bubbles; the "+7 over Portland" tag for several posts over one area; the floating
row's icon (a dashed circle with a dot); "How far" opening as a menu from the pill that replaces "100 mi".

## 5. What is where

| Thing | Where |
| --- | --- |
| This folder | Branch `claude/sky-design-docs`, PR [#4076](https://github.com/WangPantopus/skinny-pantopus/pull/4076) into `dev`. |
| The living design | Claude Doc https://claude.ai/artifact/Np3qx1x5tT6C9EdS9CJFcV (private to the founder's account; another session may not be able to read it). |
| The editable boards | Design canvas https://claude.ai/artifact/GLbywiBEni2Grr69Jj1YQo (private; 14 boards; a session other than its maker may not be able to open or update it). |
| Board sources and tools | `~/pantopus-moments/sky-design-src/`: `project/` (one `.dc.html` per board, `sky.css`, `canvas.json`), `assets/` (the pictures), `blobs.json` (canvas picture id to file), `preview.sh <board>` (renders a board to `shots/` in headless Chrome), `render-maps.cjs` (draws real maps and a globe with the repo's map library and the local public map key; usage in its header), two overview sheets. |
| The kit copy of an earlier, shorter hand-off | `~/.config/pantopus/launch-kit/streams/SKY/HANDOFF.md`. This file replaces it. |
| Real screenshots the boards sit on | `~/.config/pantopus/launch-kit/streams/HEIGHTS2/shots/` (`d-clean.png`, `d-on.png`, `b-ios-on-dark.png`, `b-ios-chip-off.png`, `c-ios-on-cora.png`, `ios-on-photoA-2-area-on.png`), `…/PULSETAB/shots/ios-pulse-list.png`, `…/PCONN/shots/ios-compose-3.png`; ring cut-outs in `~/pantopus-moments/photo-details-design-src/partD/sprites-ios/`. |
| The Moments API contract | `~/pantopus-moments/coord/CONTRACT.md` (v3.9). |
| The elevation work already built | `docs/product/moment-heights/HANDOFF.md`; switches `moment_heights` and `moment_float`, both off, code on `dev`. |

## 6. What to redraw, and how

Four screens draw lift as popularity. They need to show **height as real height above the ground, and reach as
brightness and size**. Not approved yet: ask the founder first, say what will change, and show one before the rest.

| Screen | Board file | What is wrong now | What it should show |
| --- | --- | --- | --- |
| 1 · Close in (day and night) | `Main.dc.html`, `M1-night.dc.html` | Every area post is lifted above its disc; the Town-level post floats higher. | Area posts sit **on** their discs (ring, no tail, centred on the disc). Place posts keep their tails. Only a post truly above the ground is lifted, by its height, with its shadow: add one, such as a paraglider or a balcony high in a tower. The risen post is brighter and a little larger, with its "Town" tag, at ground height. |
| 2 · Zoomed out to the city (day and night) | `M2-city.dc.html`, `M2-city-night.dc.html` | City posts are larger **and** lifted higher than Town posts. | All on the map at their real heights (nearly all on the ground). City posts are brighter and larger; Town posts smaller; lower levels stay as count bubbles. One post in the air, such as a plane, lifted and marked as flying. |
| 6 · Your Moment is rising | `R6-rising.dc.html` | The post is drawn lifted from Nearby height to Town height, with a ghost below. | The post stays where it is and **brightens and grows**; the ghost is its dimmer, smaller self. The ladder, the words and the two buttons stay. |
| 7 · Opening a post | `V7-viewer.dc.html` | A vertical ladder of levels stands where the built elevation scale is. | Keep the built elevation scale for height (now feet above the ground, with the sea-level number as the tag). Show the level as words in the header ("Floating over Vancouver · Town") and a small level mark, not as a second vertical scale. |

Also to settle when redrawing:

- **Screen 3 (country and world)** needs no geometry change: at that zoom height can't be seen, and the posts shown
  are the ones with reach. Say in the README that their lift there is for visibility.
- **Screen 10 (the Elevation chip on)** is the built view, by sea level. Decide with the founder what the chip does
  once lift is height above the ground: the likely answer is that it shows or hides the sea-level tags.
- **Discs** were drawn at about three quarters of their real size (C2). Draw them at real size: about 124 points
  across on the close-in map.
- **The night close-in map** is the day capture recoloured; it is softer than a real dark capture.
- The tab bar on the boards is the 2.1.2 one, not the newer bar with Mail third.

How the boards were made, so the redraw matches: real captures as full-bleed backgrounds; rings and pins as picture
cut-outs placed by hand (a ring cut-out is 64 by 72 points; its ring's centre is 32, 30 from its top-left, and a
pin's tail tip is at 32, 70); discs, shadows, chips and tags as HTML in `sky.css`; each board checked with
`preview.sh`, then published. A new picture has to be uploaded to the canvas first, and its address added to
`blobs.json` for the preview.

## 7. Next steps, in order

1. **Ask the founder** which comes first: redrawing the four screens, or starting phase A. They are independent.
2. **Redraw** (if yes): one screen first, the founder's OK, then the rest; update `screens/` and the README here.
3. **Phase A** (on the founder's go): [02-phase-a-contract.md](02-phase-a-contract.md). Server pull requests 1 to 4
   first; the apps need the Moments one on `dev`. The first server PR owes the audit in the contract's section 11.
   The homes-per-cell file is published in the property index's bucket, which the property-data sessions own: give
   the founder the request to pass on. Building it needs the 2020 Census block files: say what and how big before
   downloading.
4. **Height above the ground** needs its own short contract before phase B: which ground-elevation source (the
   US Geological Survey's national data, or the map provider's per-point answer), whether each phone reports height
   above sea level or above the ellipsoid, the margin, and how the built float code takes the new number. Not
   checked by the design session.
5. **Contracts for phases B to E**, each with the founder's OK: the look on the flat map (discs, brightness, real
   height), levels, the living sky, the world.
6. **Details and drawings** for the higher starting level and the busy-places view.
7. **Before any well-known person is invited:** the safety rules for public pages and a checked "really them"
   mark (section 8.1). The founder said "Not yet" to planning these.

## 8. The rest of what was discussed

### 8.1 Celebrities and influencers

- **Verdict:** yes for people famous in a place (a mayor, a coach, a local chef, a forecaster, a Blazers player);
  no for Instagram-style global celebrities yet.
- **What a well-known person gets today:** Nearby reaches at most 100 miles; Connections are two-way; following a
  person raises a count and delivers nothing; a Moment is an exact pin by default; Beacon (public page, followers,
  broadcasts, paid tiers at $5 and $15 with 10% to Pantopus) is built on all three apps and switched off, and its
  posts are kept out of Pulse and the map on purpose.
- **Risks found in the code:** exact, live pins; two reports hide a Moment; replies go to the author's messages;
  "Public figure" is a Beacon type anyone can pick, with no proof.
- **Proposed order:** safety rules for public pages; a "really them" mark; Beacon on for 10 to 20 local people;
  let a public page reach a place; "lives in your district" for officials; recognition for regular super users.
- **Legal caution:** never sell political promotion in Washington (the state Supreme Court upheld a $35 million
  fine against Meta in June 2026).
- The Sky's levels are the later answer to "where do famous people go": the top of the sky, by reach.

### 8.2 Money by stage (a scenario on the design session's assumptions)

| Users | Revenue a year | Per user | Mostly from |
| --- | --- | --- | --- |
| 100K | $2.4M | $24 | Service fees, subscriptions, stamps, packets |
| 1M | $24M | $24 | The same, plus local sponsors and paid Plans |
| 50M | $2B | $40 | Plus national advertisers, commercial mail, home insurance and mortgage partners |
| 200M | $7B | $35 | The US at full strength; first countries abroad |
| 1B | $22B | $22 | Ads largest; payments by country |
| 3B | $120B or more | $40+ | Ads, payments, commerce |

The first two rows use the investor deck's $61 a home at 2.5 users a home. The stage rule: charge for work before
attention; sell local reach to local businesses; then national money; then abroad.

### 8.3 What can earn today

- **Business invoices and Crew Day:** live since October 26; 15% (10% sole proprietors and founding businesses).
- **The $29 property tax appeal packet:** built; sells when a county is switched on (after a lawyer's read and a
  check of the stores' rules on linking to a web purchase).
- **Stamps:** built; waits on store approval and the server setting `MAIL_STAMPS_ENABLED`; sales end December 26.

### 8.4 Getting people onto Pantopus

Ranked: Christmas cards (other sessions already run this: PR #4056 opened the public card pages, another session
reviews Facebook post text); "is your home taxed above your neighbors'?" (PR #4058); organizers before
individuals; businesses and crews as distributors; address pages for search; local press and communities; paid ads
last. Unanswered offer: the card email to current users and the organizer note.

### 8.5 If Moments takes off

It gives a reason to open the app daily and works without density. What breaks first: the map (300 rings), who gets
seen, picture review, media cost, replies. Advice given: keep Moments, inside Pantopus; decide the safety defaults
before promoting it; measure, of people who use Moments, how many add a home.

## 9. The other open pull request: #4058

[#4058](https://github.com/WangPantopus/skinny-pantopus/pull/4058), branch `claude/tax-check-landing`, into `dev`.

- `pantopus.com/tax-check`: the `/start` address lookup with a property-tax headline, sentence and button; the same
  funnel and `?r=` codes; a visit with no code counts as `tax-check`.
- `docs/marketing/tax-check-kit-2026-11-13.md` (postcard and three ads as text, what can and can't be said, how to
  count sign-ups per code) and `tax-check-zips-clark-2026-11-13.md` (Clark County ZIPs ranked; 156,087 houses,
  100,383 compared, 19% above similar homes).
- Checked in a real browser against a local backend: the page, the code kept, an address's preview from a link.
  **Not checked:** typing an address end to end (the rig has no suggestions), sign-up and add-home after the
  preview.
- Known gap: the preview after typing an address says nothing about the tax comparison.
- The founder's steps before any card or ad: switch `similar_homes` on in production for the county; the lawyer's
  read of the wording.

## 10. Prompt to start the next session

```
You are picking up the Sky, a design for where a Moment or Pulse post is and how far it reaches on the map, from a
session that ran out of context. Nothing is built.

Read first, in this order: AGENTS.md; NEXT_STEPS.md (section 0 "November 14 (the Sky)" and the section "The Sky");
then on branch origin/claude/sky-design-docs (PR #4076): docs/product/sky/HANDOFF.md (the full hand-off, start
here), README.md, 01-design.md and 02-phase-a-contract.md, and the pictures in docs/product/sky/screens/.

Where it stands: the founder accepted the design's sixteen decisions, the ten screens and the phase A contract's
nine calls on November 14, then reversed one decision: height on the map is a post's real height above the ground
under it, and popularity shows as brightness, size and how far out a post stays visible. Screens 1, 2, 6 and 7 are
partly out of date because of that. Phase A (approximate places) is ready to build and unaffected. Neither the
redraw nor the build has the founder's go.

Your first job is to ask me which to do first, in plain words, and wait:
(a) redraw the four screens (hand-off section 6 says exactly what changes and how the boards were made; sources
are in ~/pantopus-moments/sky-design-src/; tell me what you will draw and show me one screen before the rest), or
(b) start phase A's server work from the contract (hand-off section 7, step 3).

Rules: confirm with me before starting any piece of work, drawings included. Do the work yourself, with no
subagents. Pull requests go into dev; never merge to master; do not merge PR #4076 or PR #4058 until I say so. You
own both from now on. Do not write new unit tests; check changes in the real apps against a local backend. Only I
change hosted systems, turn switches on or spend money. Write to me in plain words, without internal names.
```
