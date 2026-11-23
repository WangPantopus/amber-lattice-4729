# The Sky, phase A: who reads a post's stored point (audit, 2026-11-16)

The phase A build contract (the Sky design documents, section 11) asks the first server pull request for this list:
every place that reads a post's `latitude`, `longitude`, `effective_latitude` or `effective_longitude` after the
post is made, with what each does once a floating post stores only its area's point (contract call C1). Read from
`dev` at `1e5e0c30a` on November 16. Anything that needs the exact point after creation is a finding for the founder,
not a reason to store it; there are no such needs below. Two findings are at the end.

"Area point" means `areaPoint(...)` in `backend/utils/areaCells.js`: the centre of a square that holds at least 100
homes, from 0.35 × 0.25 mile in a town to 7 × 5 miles in the country. "Old rows" are posts made before the switch;
they keep their stored points (C8).

## The database

| Where | What it does with the point | With an area point |
| --- | --- | --- |
| Trigger `trg_post_set_location` (`post_set_location`) | Copies `latitude`/`longitude` into the PostGIS column `Post.location` on every insert or move. | `location` holds the area point too. Nothing else writes it for posts. |
| `pulse_feed_area_candidates` (`20261015043600`) | A Pulse area's posts: by `area_id` when set (every Pulse post since October), else the stored point within the town's outline plus 2 km. | `area_id` is set from the real point at posting and is unchanged, so new posts land in the same town. Only rows with no `area_id` (old) use the point. |
| `pulse_area_contains_displayed_points` | Tests points the server already moved for display. | Gets the area point (see `distanceText.displayedPoint` below). |
| `find_nearest_activity_center` | Read posts until October 13 (`20261013052405` took them out). | Doesn't read posts. |

## Moments (`backend/services/moments/`)

| Where | What it does | With an area point |
| --- | --- | --- |
| `momentStore.displayedPoint` | The point everyone sees: the stored point, moved onto the old grid with its offset when `show_area`. | PR 2: returns the stored point untouched when `post_metadata.area` is there. An area Moment from before the switch keeps today's read until it ends (48 hours at most). |
| `momentStore.shownInBox` (map, tab dot) | Reads stored points in the box widened by `MAX_DISPLAY_OFFSET_DEGREES`, then keeps displayed points in view. | Correct as is: a stored area point is its displayed point. |
| `momentStore.ringKey` | One ring per person per spot: an area Moment's ring is keyed on its displayed point. | Floating Moments key on the area point, as area Moments do today. |
| `momentStore.peopleRings`, `ringsOf`, `serializeMoment` | Hand out `displayedPoint`. | The area point. |
| `momentStore.shownHeight` | No height for a Moment at home, shown as an area or with no place. | PR 2: a floating Moment away from home shows feet rounded to 100 (contract section 7). |
| `momentNotify` (`timezoneFromCoordinates(row.latitude, row.longitude)`) | The push's local time when the author's own zone isn't known. | The area point's zone: the same zone except, rarely, within a few miles of a zone line. |
| `services/ai/readToolsMoments.js` | The assistant lists Moments around a point through `momentStore`. | Sees only displayed points, as the map does. |

## Pulse and other posts

| Where | What it does | With an area point |
| --- | --- | --- |
| `feedService` `FEED_POST_SELECT` → `applyPostLocationPrivacy` | Author gets the stored point; everyone else gets `postPrecisionForOthers` (exact only for a photo-placed `exact_place` row, else the old grid and its offset), on both point pairs. | PR 4: a row with `post_metadata.area` passes through unmoved for everyone, the author included, and carries `area: { radius_m }`; `locationUnlocked` only for a ground pin. Old rows follow the venue-only read (contract 8.2). |
| `feedService.displayedPoint`, `getListFeed`, `fetchSportsCandidates`, `loadMapPosts`, `findNearestMapPost`, `getUnplacedConnectionPosts` | Read stored points in a box widened by `MAX_DISPLAY_OFFSET_DEGREES` on whole cells, then sort, filter and measure by the displayed point. | Unchanged and correct: the stored area point is the displayed point; the widening stays right for old rows. |
| `routes/posts.js` `GET /map` (`postMarker`) | Markers from rows already through `applyPostLocationPrivacy`. | Area point. |
| `routes/posts.js` `PATCH /:id` | Reads the stored point only to tell whether an edit moved the post, then checks the new place (home, trust). | PR 4 applies the new-post rules to a moved post. An edit that doesn't move it never needs the old exact spot. |
| `routes/localProfiles.js` | Copies points from a row already through the privacy read. | Area point. |
| `services/pulse/distanceText.js` `displayedPoint` (Pulse distance text, follows, the Pulse feed's area test) | Always moves the stored point onto the old grid with its offset, the author's included, then measures "x mi" from the reader's verified home. | PR 4: pass a stored area point through unmoved, so it isn't moved twice. |
| `services/pulse/follows.js` | Asks `distanceText.displayedPoint` for the "you're viewing" reason. | As above. |
| `services/pulse/readAccess.js` `canReadPost` | For a row with neither `read_scope` nor distribution targets (posts from before those existed) and `neighborhood` / `city` / `radius` visibility: reader within the post's radius of the stored point. | Never meets an area point: every post made now has a read scope or targets. |
| `jobs/organicMatch.js` | Matches a service request to businesses within 5 miles of the stored point. | Measured from the area point, as the contract says. The match list others see was already shown without distances. |
| `utils/feedRanking.js` (`recomputeUtilityScores` job) | Half a point of utility for having a point at all. | Unchanged. |
| `services/ai/nudges/nearby.js` | Pairs a lost and a found post within 3 miles; local time for the nudge. | Measured between area points (finding 3). |
| `services/context/localUpdateProvider.js` | Morning briefing: the curator account's local updates near the person. | Curator posts only; phase A doesn't touch them. |
| `services/plans/planService.js`, `planViewer.js`, `planActions.js` | A Plan's own post: its public place, or its host's area, written by Plans. | Plans have their own location rules; phase A doesn't change them. |
| `routes/broadcastChannels.js` | A public page's broadcast with a place tag stores that point. | Public pages (behind their own switch, off) aren't personal place posts; phase A leaves them. |
| `serializers/identitySerializers.js` | A list of fields stripped from persona posts. | Unchanged. |
| `scripts/seed-moments.js`, `scripts/geocode-provenance-backfill.js` | Local seeding and a one-time backfill. | Not request paths. |

Not post points, though they matched the search: `SavedPlace`, `Home`, `User`, `BusinessLocation`, `Listing` and
`Gig` points in `routes/posts.js` (saved places, homes and businesses layers), `routes/location.js`,
`routes/listings.js`, `routes/businessDiscovery.js`, the assistant's place tools and the Around you headlines.

## Findings for the founder

1. **How the 100 homes are counted.** The contract says a place gets the smallest area "whose cell holds at least 100
   homes". Built literally, a post shown over a medium area next to a dense block says it did *not* come from the
   dense block (that block would have shown its own small area), so the homes that could have posted it are only
   the ones around it, sometimes a handful. The build script counts only the places that share an area at that size,
   so every area a post can show stands for at least 100 homes. In Clark County this gives 5.9% of homes a larger
   area than the literal rule (mostly at the edges of towns); none gets a smaller one. Nothing to decide unless the
   founder prefers the literal rule.
2. **Lost and found pairing.** The assistant's "is this the pet you lost?" nudge pairs posts within 3 miles. Between
   two floating posts in the country (the largest area is 7 by 5 miles) a real pair can be missed or a far one paired.
   In towns the areas are under a mile, so little changes. (The planned lost pet alerts, paused since October 21,
   keep their own sighting points and aren't affected.)
