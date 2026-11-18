# Homepage media (`/home/*`)

Public marketing files for pantopus.com's homepage (`src/app/page.tsx`). Nothing here is private.

| File | What it is | Source |
|---|---|---|
| `earth-night.jpg` | The Earth at night, 4096×2048, equirectangular | NASA Black Marble, as shipped in the `three-globe` npm package's examples (`three-globe@2.31.0/example/img/earth-night.jpg`) |
| `earth-day.jpg` | The Earth by day, 4096×2048, equirectangular | NASA Blue Marble, from the same package (`three-globe@2.31.0/example/img/earth-blue-marble.jpg`) |
| `earth-night-8k.jpg` | The Earth at night, 8192×4096: the second, sharper tier, loaded on wide screens after the first | `earth-night.jpg` enlarged (its colours, relief and glow unchanged), with the city lights of NASA's Black Marble 2016 (`BlackMarble_2016_3km.jpg`, NASA Earth Observatory, assets.science.nasa.gov) laid over it in the same light colour, and the land's fine relief from NASA's Blue Marble Next Generation, April 2004 (`world.topo.bathy.200404.3x21600x10800.jpg`) as a brightness ratio |
| `earth-day-8k.jpg` | The Earth by day, 8192×4096: the second tier | NASA Blue Marble Next Generation with topography and bathymetry, April 2004 (`world.topo.bathy.200404.3x21600x10800.jpg`, NASA Earth Observatory), reduced to 8192 and tone-matched channel by channel to `earth-day.jpg` |
| `og-earth.jpg` | The share card's background (`/api/og/home`), 1200×630 | A still of this page's own sky at the hero, words hidden: captured at 2400×1260 from the page after both Earth tiers had faded in, then reduced |
| `clip-place.mp4`, `poster-place.jpg` | Place tab, 0–10 s of the film | Pantopus launch film (`Pantopus-launch-v2-16x9.mp4`), cut with `crop=1020:1080:850:0,scale=816:864`, no sound |
| `clip-today.mp4`, `poster-today.jpg` | Today tab, 18.75–23.75 s | the same film and cut |
| `clip-mail.mp4`, `poster-mail.jpg` | Mail tab, 23.75–33.75 s | the same film and cut |
| `clip-plans.mp4`, `poster-plans.jpg` | Plans tab, 33.75–38.75 s | the same film and cut |
| `clip-pulse.mp4`, `poster-pulse.jpg` | Pulse tab, 38.75–41.7 s | the same film and cut |
| `clip-moments.mp4`, `poster-moments.jpg` | Moments tab, 43.75–50 s | the same film and cut |
| `film.mp4`, `film-poster.jpg` | The whole launch film with its sound, re-encoded smaller (1920×1080, 70 s) | Pantopus launch film |
| `cards.mp4`, `cards-poster.jpg` | The 33-second Christmas cards ad, 1280×720, no sound (its music is a stand-in) | Pantopus Christmas cards ad (`cards-ad-33s-wide.mp4`) |

The page credits the Earth pictures in its footer ("Earth imagery: NASA").

All videos are H.264 with the index at the front of the file, so they start playing before they finish downloading.
The page loads them with `preload="none"` and starts each one only while it is on screen.
