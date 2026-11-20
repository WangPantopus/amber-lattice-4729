# Moments API v4.1: the Live mark and the weather stamp (2026-11-20)

Additions to the Moments API for part 3 of the plan the founder approved on November 20 ("Moments: Text and Draw, on
photos and video, and the Live mark with weather"): a photo or video taken with the app's own camera at the spot reads
"Live from here" for 15 minutes, then "Taken here", and may carry the weather when it was posted ("31°F · Snow"). This
page lists only what v4.1 adds to [v4.0](api-v4.0.md), read from the server code (`backend/routes/moments.js`,
`backend/services/moments/momentStore.js`, `backend/services/moments/momentWeather.js`). Nothing is removed or renamed.

There is no flag. Every new request field is optional, and the server drops request fields it doesn't know
(`parseBody` uses `stripUnknown`), so an app from before v4.1 sends none of them and gets every answer it got before;
the new answer fields are only added, so it ignores them. All of it applies with the Sky (`sky_places`) on or off.

## When a Moment carries the mark

The app sends `taken_here: true` when its own camera made the photo or video for this post. The server keeps the mark
only when all of these hold, and otherwise drops it without an error:

1. `kind` is `photo` or `video` (never a text card).
2. `location.source` is `gps`: a fix of where the author is, at most 5 minutes old (as today). A `capture` location
   (an album item pinned where its file says) and `none` never keep it.
3. The request has no top-level `taken_at`, however recent: the apps send it only for an album item, so its presence
   means the library. (An album item that says "Taken Oct 3" never reads "Taken here".)
4. The Moment is shown at its exact pin: not shown as an area (`show_area`), not floating (the Sky: at home, or sent
   with `show_area`), not with no location. A pin at a public place picked by name keeps it; that pin is the place's
   own point, no farther than `pick_within_m` from the author.
5. The author is known not to be at home: the spot they post from is not within 60 m of a home they live at. With the
   Sky off a picked place moves the pin, so the server also asks at the point the phone sent, before the pin moves.
   When the author's homes can't be read, the mark is dropped (it fails closed): nothing is stored, so no read shows
   it and no ring carries its `live_until`. Where the Moment goes is decided as in v4.0.

These are the places a height is never kept (`store.shownAltitude`), plus rules 2, 3 and 5's failure case. Every read
checks the stored Moment again (`store.takenHere`), so a Moment at home, shown as an area, floating or with no location
never reads as taken here, whatever was stored.

## `POST /api/moments/place-preview`

New optional request field:

| Field | Meaning |
| --- | --- |
| `weather: bool` | Default `false`. Ask for the weather the Post sheet's "Show the weather" row shows. Send it on a preview made at the author's own fix (the one the composer makes when it opens, and any later one at the fix), never on a preview at a library item's capture point. The app shows the row only for a camera draft. |

Adds, only when the request sent `weather: true`:

| Field | Meaning |
| --- | --- |
| `weather: { temp_f, kind, label } \| null` | The stamp a Moment taken here would keep now ([below](#the-weather-stamp)). `null` at home, with no point, when the author's homes can't be read, and when no fresh reading came within 2 seconds: then the app leaves the row out. |

The weather is looked up after the home check and only away from home, alongside the other lookups; it adds at most
2 seconds to the answer and usually nothing (the place lookups take longer). A request without `weather: true` looks
nothing up and its answer has no `weather` key, so apps from before add no weather reads. Unchanged: every other field,
`at_home` included (the app hides the Live line at home).

## `POST /api/moments`

New optional fields:

| Field | Meaning |
| --- | --- |
| `taken_here: bool` | Default `false`. The app's own camera made this photo or video just now. Kept only under the rules [above](#when-a-moment-carries-the-mark). |
| `show_weather: bool` | Default `false`. "Show the weather" was on. When the mark is kept, the server reads the weather at the Moment's pin itself (usually from the cache the preview filled) and keeps it on the Moment. |

- The weather is never taken from the phone: a `weather` field in the request is dropped like any unknown field, and
  the stamp the preview showed is read again here. No fresh reading within 2 seconds: no stamp, and the post succeeds
  as usual (201). The read adds at most 2 seconds to the post, and only to a post that keeps the mark with
  `show_weather`.
- `show_weather` without a kept mark does nothing and looks nothing up.
- Each part of a long video sent with `taken_here` is marked on its own, under the same rules.
- A retry with the same `client_request_id` returns the Moment the first attempt made, mark and stamp as they were.
- A non-boolean `taken_here` or `show_weather` is `400 MOMENT_INVALID`, as for any field of the wrong type. There is no
  new error code.

Stored in `post_metadata.moment` (no new table or column): `taken_here: true` only when kept, and `weather: { temp_f,
kind, label }` only with it.

## The weather stamp

`{ temp_f, kind, label }` (`momentWeather.weatherAt`):

| Field | Meaning |
| --- | --- |
| `temp_f` | Whole degrees Fahrenheit at the pin. An app that shows Celsius converts it. |
| `kind` | One of nine: `clear`, `partly_cloudy`, `cloudy`, `fog`, `rain`, `snow`, `sleet`, `thunderstorm`, `wind`. The pill's icon comes from it. |
| `label` | The words the pill shows, which always agree with `kind`: `Clear`, `Partly cloudy`, `Cloudy`, `Fog`, `Rain`, `Snow`, `Sleet`, `Thunderstorm` or `Windy`, or `Wind 38 mph` (below). |

**Strong wind.** When the sky's own kind is `clear`, `partly_cloudy`, `cloudy` or `wind` and the wind is 25 mph or
more, `kind` is `wind` and `label` is `Wind N mph` (the speed rounded). With `rain`, `snow`, `sleet`, `fog` or
`thunderstorm`, `kind` and `label` stay the sky's own, whatever the wind (snow in a gale reads `Snow`). Below 25 mph a
windy sky reads `Windy`.

The pill reads `${temp_f}°F · ${label}` ("31°F · Snow").

- Its source is the backend's one weather entry point (`context/weatherProvider.fetchWeather`: WeatherKit, then
  Open-Meteo), cached per ~5 km for 10 minutes. The two sources name finer conditions differently, so the server folds
  them into the nine kinds with `placeIntelligenceService.mapConditionCode`, the folding Today's sky uses.
- Only a fresh reading counts: served live or from that 10-minute cache, and no more than 30 minutes old. Never the
  expired copy Open-Meteo falls back on when it is down (up to 6 hours old), a failure, or a reading with no
  temperature or sky.
- 2 seconds at most. The read keeps going after that and fills the cache, so the next preview or post usually has it.
- It never throws: anything wrong means no stamp.

## The Moment

Every Moment's JSON adds (`GET /:id`, `GET /batch`, `GET /mine`, the map's `scheduled`, the answers of `POST /` and
`POST /:id/media`), the same for every viewer, the author included:

| Field | Meaning |
| --- | --- |
| `taken_here: bool` | It carries the mark. False for every Moment from before v4.1. |
| `live_until: string \| null` | Until when it reads "Live from here": the time everyone reads it was posted (`created_at`) plus 15 minutes. `null` when `taken_here` is false and for a Moment shared later (`earlier: true`), which reads "Taken here" and never "Live". |
| `weather: { temp_f, kind, label } \| null` | Its weather stamp; only on a Moment with `taken_here`. |

- The viewer's pill: "Live from here" while now is before `live_until`, then "Taken here" (flip it on a timer, without
  reading the Moment again); none when `taken_here` is false. `taken_here` and `taken_at` are never both set, so a
  library photo keeps "Taken Oct 3".
- The 15 minutes are counted from `created_at`, which for a photo or video is when `POST /` made it, before its upload
  finished. A Moment whose upload took longer may already read "Taken here" when it goes live.
- `live_until` is an ISO 8601 UTC time with milliseconds (`2026-11-20T11:32:45.911Z`); `created_at` comes from the
  database (`2026-11-20T11:17:45.911+00:00`). Parse both forms.
- The 15 minutes are `LIVE_FOR_MS` in `momentStore.js`, so changing them needs no app build: apps read only
  `live_until`. To check the flip locally, shorten it in a local checkout and restart the backend.

## `GET /api/moments/map` and `GET /api/moments/people`

Every ring adds `live_until: string | null`, for the "Live now" chip and the live dot:

- When the ring's newest Moment (the one its point and place are) is itself an exact pin away from home, it is the
  latest `live_until` among the ring's Moments that keep the mark and weren't shared later, or `null` when none does.
- Otherwise it is `null`, whatever the ring's other Moments say: the dot never sits on a pin at home or on an area.
  Every ring in `unplaced` is `null`.

A ring is live while now is before its `live_until`. The briefs in a ring's `moments[]` don't change.

## Privacy

The mark tells viewers its author is at that spot now, so it follows the location rules in
[docs/location-privacy-matrix.md](../../location-privacy-matrix.md#moments): never at home, on an area, floating or
with no location, on the Moment or on its ring, whatever the phone sends.
