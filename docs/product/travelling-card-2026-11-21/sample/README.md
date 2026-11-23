# The sample's sources

`page.html` is the sample: six phone screens drawn from one list of stops, and a "Pass it on" button that adds the next
one. `gen.cjs` writes `../site/index.html` from it, adding the states' outlines and each town's place on the map.

To build it again, in a folder outside the repository:

1. Copy `page.html` and `gen.cjs` into `build/`, and make `site/a/`.
2. In `build/`: `npm install us-atlas@3.0.1 topojson-client@3.1.0 d3-geo@3.1.1`, then `node gen.cjs`.
3. Copy the art into `site/a/` from `frontend/apps/web/public/holiday-cards/`: `table/env-front.webp`,
   `table/env-flap-in.webp`, `table/stamp-fir.webp`, `table/table-cloth.webp`, `table/light.webp`, `table/paper.webp`,
   `christmas-2026-13.jpg` and `christmas-2026-03.jpg`.

The people in it are made up. The towns are real places, and the miles are worked out from their map positions.
