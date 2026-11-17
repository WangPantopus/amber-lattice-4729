# Moments API v4.0: the Sky's places (2026-11-16)

Additions to the Moments API for the Sky, phase A (approximate places), which the founder accepted on November 14.
The Moments API contract this extends (v3.9) lived at `~/pantopus-moments/coord/CONTRACT.md`, which is no longer on
the Mac; this page lists only what v4.0 adds, read from the server code (`backend/routes/moments.js`,
`backend/services/moments/`). Nothing is removed or renamed.

Everything here applies only while the server flag `sky_places` is on for the person: the caller on the preview, the
author when a Moment is made. With it off, every answer and rule is v3.9's. No app build carries a key for it: an app
draws the new Post sheet when the preview answers `sky: true`.

## `POST /api/moments/place-preview`

Adds, with the flag on for the caller:

| Field | Meaning |
| --- | --- |
| `sky: true` | Draw the new Post sheet. |
| `area: { label, latitude, longitude, radius_m } \| null` | The area this point is in, which a Moment at home shows: the town's name (read at the area's own spot, so the words depend on the area only), the spot (a street close to the middle of the point's quarter-mile cell) and the disc's radius in metres. `null` with no point. |
| `place: { key, label } \| null` | The public place that names the spot and may take a pin (never a school or preschool): what "Pin it at a place" starts with. Its `key` is one of `places`' keys. |
| `can_pin: bool` | False at home and with no point. |
| `share_later: [{ key, label, at }]` | The "Share later" choices on offer now: `1h` ("In 1 hour"), `3h` ("In 3 hours"), and `tonight` ("Tonight at 8") only before 7 pm in the author's time zone (the point's; with no point, a home's; else Pacific). `at` is when each would share. Given with no point too. |

Unchanged: `area_label`, `at_home`, `can_show_height` (true for any point not at home while heights are on),
`adult_confirmed`, `has_connections`. `place_label` and `places` leave out schools and preschools, and
`pick_within_m` follows how built-up the spot is (below).

## `POST /api/moments`

New optional field:

| Field | Meaning |
| --- | --- |
| `pin: "place"` | Pin at a public place: the one `venue_id` names (place picker), else the venue a `place_key` names, else the preview's `place`. With none of them and no place at the spot: `422 NO_PLACE_HERE`. |
| `share_later: "1h" \| "3h" \| "tonight"` | Hold the Moment until then (below). `tonight` at or after 7 pm local: `422 SHARE_TIME_PASSED`. Any Moment, a Moment with no place included. |

Where the Moment goes, with the flag on for the author, in this order (changed 2026-11-17 on the founder's word:
a Moment is where it was taken, not at the middle of an area):

1. `location.source: "none"`: no place, as in v3.9.
2. **Only its area**, when the point is within 60 m of a home the author lives at, whatever was asked and with no
   error; and when `show_area: true` was sent (the "Show the area instead" of a v3.9 app, and a Post sheet built
   between November 16 and 17, which showed the area unless a place was picked). It floats over a public street
   close to the middle of the quarter-mile (0.005°) cell the point is in, or over that middle when no street is
   found within 200 m of it: at most about a third of a mile from the point, the same spot for every point in the
   cell.
3. **At a public place close by**, when one was picked: the pin is the place's own point, the label its name,
   `label_kind: "place"`. A place whose own point is farther from the Moment's than `pick_within_m` (the middle of a
   big park the photo was taken in) gives its name and the pin stays at the Moment's own point.
4. **Where it was taken** otherwise: the exact point, with the label a v3.9 Moment gets (a named place, else the
   street's name, else the town; a `place_key` of `street` or `town` picks one), except that a school or a preschool
   never names it.

"Picked a place" is `pin: "place"`, or a `venue_id`, or a `place_key` that names a venue (`v_…`). A picked place
that is a school or preschool, or is itself within 60 m of the author's home, takes no pin: the Moment is where it
was taken (rule 4).

`pick_within_m` (on the preview) is how far from the Moment's point a picked place may be, by how built-up the spot
is: 400 m (a quarter mile) where a quarter-mile cell holds 100 homes, then 800, 1600 (a mile), 2400 and 3200 (two
miles, open country); 1600 where the homes file can't say (abroad). A place whose outline holds the point is 0 m
away. With the flag off it is 1500, as in v3.9.

A Moment over its area stores only that spot (`latitude`, `longitude` and the effective pair),
`location_precision: approx_area`, `post_metadata.moment.show_area: true`, and `post_metadata.area = { v: 1, step: 1,
radius_m }`. Its label is the town at the spot and its `label_kind` `town`. The phone's or photo's point is not
written anywhere.

`PLACE_NOT_NEARBY` is returned with the flag on too: a `venue_id` farther than `pick_within_m`, or one nobody finds.

## Share later

- The Moment is made at once; a photo or video uploads and is checked at once.
- Until its time it is `state: "scheduled"` for its author (`GET /api/moments/mine`, `GET /:id`; once its file is in
  and checked: before that it is `uploading` or `checking` as usual). Nobody else can open it, it is on no map, in no
  ring and in no tab dot, and nobody is told.
- At its time it goes live by itself: every read works it out from the stored time (`post_metadata.moment.share_at`),
  so it does even with the scheduled jobs off. Its hours (`expires_at`) count from then. A job ticking every minute
  sends the push to connections then (`jobs/momentsShareLater.js`), with every rule of the usual Moment push (one per
  author in 6 hours, quiet hours, the daily cap); a time missed by more than 30 minutes sends none.
- Its author may delete it before its time (`DELETE /api/moments/:id`). There is no edit.
- The day's limit of 20 counts it on the day it was made.
- The stored upload state is unchanged ('uploading', 'checking', 'live'); "scheduled" is worked out from `share_at`.

## `GET /api/moments/map`

Every ring adds `floating: bool`: its newest Moment shows only its area, so apps draw its pin floating over its spot
with no pointer (added 2026-11-17).

Adds, with the flag on for the caller, `scheduled`: the caller's own Moments waiting to share later (each a Moment
with `state: "scheduled"` and `share_at`), soonest first, for their own row ("Shares at 6:40 pm", with Delete). Never
anyone else's, never in `rings` or `unplaced`, and left out with the flag off. (Added 2026-11-16, contract 10.1.)

## The Moment

Every Moment's JSON adds:

| Field | Meaning |
| --- | --- |
| `floating: bool` | A floating Moment (it carries `post_metadata.area`). |
| `area: { radius_m } \| null` | The disc around a floating Moment's point. |
| `earlier: bool` | It was shared later: new apps say "Earlier today" (or "Yesterday") in place of "12 min ago". |
| `share_at: string \| null` | For its author only: when it shares (or shared). |

For a Moment shared later, `created_at` (and each ring's `newest_at` and brief `created_at`) is when it went live, not
when it was made: a v3.9 app prints the time it went live, and nobody reads when its author was there. `state` may be
`"scheduled"` for the author (a v3.9 iPhone app reads an unknown state as live, in the author's own list only).

`show_area` stays and is true for every floating Moment, so v3.9 apps draw it as an area Moment. `latitude` and
`longitude` are the stored area point, unmoved, for everyone, the author included. An area Moment made before the flag
(`show_area` with no `area`) keeps v3.9's read until it ends.

`altitude_ft`: a pin's is rounded to 10 ft, as in v3.9; a floating Moment's (away from home) to 100 ft; at home or with
no place, none. Apps print "About 4,400 ft" for a floating Moment.

Ring ids don't change: a floating Moment's ring is keyed on its shown point, as an area Moment's is.

## Errors

| Code | When |
| --- | --- |
| `422 NO_PLACE_HERE` | `pin: "place"` with no `venue_id` or venue `place_key`, away from home, and no public place at the spot. |
| `422 SHARE_TIME_PASSED` | `share_later: "tonight"` at or after 7 pm in the author's time zone. |
