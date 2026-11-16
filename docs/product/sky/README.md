# The Sky

Every Moment and Pulse post gets a place that is only as exact as is safe, and a height on the map that shows how
far it reaches. Most posts stay near the ground, together; a few rise over the town, the city, the country and the
world.

**Status on November 16, 2026: phase A (approximate places) is built in `dev` behind the switch `sky_places`,
which is off everywhere. Nothing else is built.** The founder accepted the design's sixteen decisions, the ten
screens and the phase A contract's nine calls on November 14, and gave the go for phase A on November 16. The
contract's section 15 says what was built and what waits for the founder.

**November 16:** the founder accepted one rule for lift (close in, height is real; zoomed out, height is reach) and
gave ideas for later, which the design records. Claiming the airspace over a home is not to be built as described.
The hand-off's section 0 has what changed since it was written. Screens 1, 2, 6 and 7 were redrawn the same day for
that rule; the founder approved screen 1 first, with the disc shown only for the post you tap.

## What is here

| File | What it is |
| --- | --- |
| [HANDOFF.md](HANDOFF.md) | **Start here.** Everything discussed, every decision, what to redraw, next steps, and the prompt for a new session. |
| [01-design.md](01-design.md) | The design: where a post is, levels, what it looks like, safety, architecture, build order, the decisions, and what exists today. |
| [02-phase-a-contract.md](02-phase-a-contract.md) | The build contract for phase A: approximate places, built fully. |
| [screens/](screens/) | The ten screens as fourteen pictures, and two overview sheets. |
| [diagrams/](diagrams/) | The two diagrams from the design. |

## The screens

[All the map screens on one sheet](screens/sky-screens-maps.jpg) ·
[posting, rising, the viewer and Pulse on one sheet](screens/sky-screens-flows.jpg)

| # | Screen | Picture |
| --- | --- | --- |
| 1 | Close in: posts on the ground, one in the air | [day](screens/01-close-in.jpg) · [night](screens/01-close-in-night.jpg) |
| 2 | Zoomed out to the city | [day](screens/02-city.jpg) · [night](screens/02-city-night.jpg) |
| 3 | Country view and World view | [country](screens/03-country.jpg) · [world](screens/03-world.jpg) |
| 4 | Posting: floating (the default) | [picture](screens/04-posting-floating.jpg) |
| 5 | Posting: pinned at a place, and at home | [at a place](screens/05-posting-at-a-place.jpg) · [at home](screens/05-posting-at-home.jpg) |
| 6 | Your Moment is rising | [picture](screens/06-rising.jpg) |
| 7 | Opening a post | [picture](screens/07-opening-a-post.jpg) |
| 8 | Pulse list: How far | [picture](screens/08-pulse-list-how-far.jpg) |
| 9 | Pulse composer | [picture](screens/09-pulse-composer.jpg) |
| 10 | The Elevation chip on, as built | [picture](screens/10-elevation-chip-on.jpg) |

**How they were made, and where they are approximate:**

- Screens 1, 6 and 10 sit on real screenshots of the iPhone Moments map; 4, 5, 8 and 9 on the real Post sheet,
  Pulse list and composer. Screen 7 is redrawn to match the real viewer.
- The wider maps in 2 and 3 were drawn by the web app's map engine. On iPhone they will be Apple's maps.
- The night version of screen 1 is the day capture recoloured from a dark capture of the same view.
- The tab bar is the 2.1.2 store app's, not the newer bar with Mail third.
- **Discs.** On screen 1 the disc is at its real size (call C2 of the phase A contract: about 0.4 mile across, about
  124 points at that zoom) and shows only for the post you tap. At real size neighbouring discs overlap, because area
  centres form a regular grid about 70 points apart side to side and 100 up and down there. The map previews on the
  Post sheet in 4 and 5 still draw the disc at about three quarters of its real size.
- **Screens 1, 2, 6 and 7 were redrawn on November 16** for the rule "close in, lift is real height". A post from an
  area sits on the map at its area's centre, with no tail; a tail still means exactly here. Only a post really in the
  air is lifted (a paraglider on screen 1, a plane on screen 2), drawn as the built Elevation view draws it: no tail,
  a little bigger, its shadow cast by the sun, and its height tag with the number above sea level. Reach shows as
  size and the level's name; glow is only a night extra. On screen 6 the Moment grows where it is, with a soft ring
  around it, instead of rising. Screen 7 keeps the built height scale, now measured from the ground, and shows the
  level beside the name instead of a ladder of levels.
- **Still approximate in the redraw:** where the grid of area centres falls on the screen 1 map is a guess (its
  spacing is not); the map scale is the hand-off's arithmetic, not re-measured; the paraglider and plane photos are
  new drawings in the style of the others; the night boards keep the day's shadow for a post in the air, though the
  built view draws no shadow after sunset, so how height shows at night is still open; the flying posts show their
  height tags while the Elevation chip is off, and what that chip does now is open (screen 10); "Floating over …" is
  kept until the founder decides the wording.
- **Screen 3 is right as drawn.** Under the November 16 rule, lift is reach once the map is zoomed out to a state or
  wider.
- Phase A builds only screens 4, 5 and 9. The others belong to phases B and C.

The editable boards are a private design canvas, and the design is a private Claude Doc; both belong to the
founder's account. The canvas holds every board's source and picture. The folder that first held
them is gone; a small tool that renders a board locally was rebuilt on November 16 on the founder's Mac at
`~/.pantopus-review/handoffs/sky-redraw-tools/`.

## What is decided, and what is open

**Decided by the founder on November 14** (the design's decisions table has all sixteen): area by default; exact
pins only at public places picked by name; home is always an area; 100 homes at least; lift is a post's real height
above the ground (reversed that day from "lift means reach"); rising by rank with the author's yes past Town; a
person reviews before Country or World; columns on posts and no new table through phase C; the names.

**Decided by the founder on November 16** (the design's "Changed on November 16" section): close in, from a street
to a town, lift is real height; zoomed out, from a state to the globe, lift is reach; a view of busy places is
separate. Claiming the airspace over a home is not to be built as described.

**Added by the founder with the yes to the screens**, as directions for later phases (the design's "Added on
November 14" section): most posts stay near the ground; someone with many followers may choose to start higher;
and a view where the ground rises where it is busy.

**Open:**

- For phase A to reach people: the homes-per-area file published, its address set on the servers, and the switch
  turned on (the contract's section 15). All three are the founder's.
- The first of the four questions from the November 15 review (the hand-off's section 0): the word "Floating",
  which touches phase A's words on the app screens. The redraw settled the second (the founder accepted screen 1
  with the disc only for the tapped post) and follows the third and fourth (a paraglider, not a balcony in a tower;
  size and the level's name carry reach by day).
- How a post in the air shows its height after sunset, and what the Elevation chip does now.
- The founder's ideas of November 16 (the design's "Added on November 16" section): directions only.
- Details and drawings for the higher starting level and the terrain.
- Contracts for phases B to E.

## Build order

| Phase | What people see | State |
| --- | --- | --- |
| A | Approximate places, built fully | Built in `dev` on November 16, switch off |
| B | The floating look on a flat map | Drawn |
| C | Levels: rising, sinking, Overhead, How far | Drawn |
| D | The living sky: night, motion, then tilt | In words |
| E | The world: other countries, scale, a public sky page | In words |
