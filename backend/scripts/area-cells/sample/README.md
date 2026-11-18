# Sample homes-per-cell tile for local rigs

One tile of the Sky's homes-per-cell file (`backend/utils/areaCells.js` reads it; `../build.cjs` makes it): the 1°
square from 45°N to 46°N and 123°W to 122°W, which holds Clark County, Washington (Vancouver, Camas, Washougal,
Battle Ground, Ridgefield, La Center, Yacolt). Built from Washington's 2020 Census block table only:

```bash
node backend/scripts/area-cells/build.cjs --states 53 --bbox 45.54,-122.80,45.98,-122.24 --out backend/scripts/area-cells/sample
```

The whole-US file now ships with the server (`backend/data/area-cells`), so a local backend needs nothing set. To
read this one tile instead, point a local backend at it:

```bash
AREA_CELLS_URL=file://$PWD/backend/scripts/area-cells/sample
```

What a rig sees with it:

- Downtown Vancouver and Camas: the smallest area (step 1, a disc about 0.4 mile across).
- Washougal, the edges of Battle Ground and the countryside: larger areas (steps 2 to 4).
- The Oregon side of the river (Portland) is in the tile but Oregon's homes aren't counted, so it reads the largest
  area (step 5). Larger, never smaller: that is what a missing count does.
- Anywhere outside the tile (Seattle, say): no tile, so the largest area.

The data is the US Census Bureau's (public domain). It holds counts per cell, nothing about a person or an address.
