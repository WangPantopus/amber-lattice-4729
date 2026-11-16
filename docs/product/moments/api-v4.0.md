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
| `area: { label, latitude, longitude, radius_m } \| null` | The area this point floats over: the town's name (read at the area's own point, so the words depend on the area only), the area point and the disc's radius in metres. `null` with no point. |
| `place: { key, label } \| null` | The public place that names the spot and may take a pin (never a school or preschool): what "Pin it at a place" starts with. Its `key` is one of `places`' keys. |
| `can_pin: bool` | False at home and with no point. |

Unchanged: `place_label`, `area_label`, `places`, `at_home`, `can_show_height` (true for any point not at home while
heights are on), `pick_within_m`, `adult_confirmed`, `has_connections`.

## `POST /api/moments`

New optional field:

| Field | Meaning |
| --- | --- |
| `pin: "place"` | Pin at a public place: the one `venue_id` names (place picker), else the venue a `place_key` names, else the preview's `place`. With none of them and no place at the spot: `422 NO_PLACE_HERE`. |

Where the Moment goes, with the flag on for the author, in this order:

1. `location.source: "none"`: no place, as in v3.9.
2. **Floating**, when any of: the point is within 60 m of a home the author lives at; no place was picked; `show_area:
   true` was sent (older apps); the picked place isn't found near the point, is a school or preschool, or is itself
   within 60 m of the author's home. At home it floats whatever was asked, with no error.
3. **On the ground** otherwise: the pin is the place's own point, the label its name, `label_kind: "place"`.

"Picked a place" is `pin: "place"`, or a `venue_id`, or a `place_key` that names a venue (`v_…`): so a v3.9 app's
place-picker pick still counts, and its "Exact spot" with no pick floats.

A floating Moment stores only its area's point (`latitude`, `longitude` and the effective pair), `location_precision:
approx_area`, `post_metadata.moment.show_area: true`, and `post_metadata.area = { v: 1, step, radius_m }`. Its label
is the area's town and its `label_kind` `town`. The phone's or photo's point is not written anywhere.

`PLACE_NOT_NEARBY` is not returned with the flag on: a `venue_id` that isn't found floats instead.

## The Moment

Every Moment's JSON adds:

| Field | Meaning |
| --- | --- |
| `floating: bool` | A floating Moment (it carries `post_metadata.area`). |
| `area: { radius_m } \| null` | The disc around a floating Moment's point. |

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
