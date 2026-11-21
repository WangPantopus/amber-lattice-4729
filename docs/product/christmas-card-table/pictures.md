# Pictures: one size to give, four made from it

## What the founder gives for a new card

One picture file, plus two lines of words:

| Give | What |
|---|---|
| **The picture** | 1500 × 1600 pixels (15:16), PNG or high-quality JPEG, in normal sRGB colour |
| **The caption** | The handwritten line under the picture, for example "Come finish our snowman." |
| **The collection** | Which of the six it belongs to, or the name of a new one |

Inside the picture:

- No border, caption, postmark, date or other text. The app prints those.
- The picture fills the whole 1500 × 1600, edge to edge.
- Keep faces and anything important away from the outer edge, about 5% (75 pixels).

## What gets made from it

Nobody makes these by hand. Everything below comes from that one file:

| Made from it | Size | How |
|---|---|---|
| The card in the apps | Whole card 5:6 (the picture, plus a cream border and printed strip) | The app prints the border, caption, "CHRISTMAS, 2026" and postmark around the picture |
| Website copy the apps load | 1320 wide, and a 360-wide thumbnail | Scripted when the picture is added |
| Story picture | 1080 × 1920 | Drawn on the person's phone when they share |
| Post picture | 1080 × 1350 | Drawn on the person's phone when they share |
| Link preview | 1200 × 630 | Rendered once when the picture is added, kept on the website |

Adding a picture takes a server and website update only, with no new store builds. Number new pictures on from 50 and never reuse a number, because the card's stamp comes from its number (`["fir","peak","river"][(n-1)%3]`).

## Why phone sizes aren't a problem

The card has one fixed shape and scales to the phone's width. What changes from phone to phone is how much of the envelope flap and table shows. The sample was checked at 375×667 (iPhone SE), 360×780 and 412×915 (Android sizes), and 440×956 (iPhone Pro Max); see [reference/phone-sizes.jpg](reference/phone-sizes.jpg). A full-screen photo would have needed a different crop for each phone shape, and Android screens range from about 16:9 to 21:9.

## The 49 existing pictures

They don't need redoing. They're all about 1122 pixels wide, but heights run from 1131 to 1246, and each has a cream border baked in (about 12–25 pixels). Inside the border, their shapes run from 0.897 to 0.988 wide-to-high.

| Shape to trim to | Most cut from one side | Typical cut |
|---|---|---|
| **15:16 (chosen)** | **5.1%** | **2.4%** |
| 19:20 | 5.6% | 2.6% |
| 10:11 | 8.0% | 3.3% |
| 1:1 | 10.3% | 6.0% |
| 4:5 | 19.0% | 14.9% |

[designs-table.json](designs-table.json) has each picture's crop box (in its full-size file), table colour and web name. The crop is centred. The pictures that lose most are 24 and 31 (5.1%), 26 (4.4%), 13 (4.3%), 29 (4.2%), 9 (4.1%) and 19 (4.0%). Check those by eye and move the crop if a face gets close to an edge.

The border finder can be fooled by snow at the picture's edge. It read 0 or too much on pictures 2, 4, 9, 11, 29 and 48, so `all_pictures.py` limits each edge to between about 10 and 26 pixels. Check those six as well.

**Sharpness:** a card on an iPhone 17 Pro needs about 1110 pixels across the picture, so the existing crops (about 1085 wide) are close to one-to-one, where the apps' current 960-wide copies are visibly softer. The largest phones need about 1330, so existing pictures run slightly soft there. It's acceptable. New pictures at 1500 cover every phone and leave room to zoom.

Old apps keep using today's files, so those stay. The new copies go in a new folder (see [build-plan.md](build-plan.md)).

## Table colours

Each picture's table is one of four cloth colours. A simple rule picks it from the picture, and the founder can change any of them:

| Name | Colour | When |
|---|---|---|
| slate | `#3b4c6e` | Bright snow scenes |
| dusk | `#2c4071` | Dark, blue evenings |
| umber | `#6e4b30` | Warm rooms |
| wine | `#704b51` | In between |

[reference/all-49-pictures-with-table-colours.jpg](reference/all-49-pictures-with-table-colours.jpg) shows them all. The apps don't need 49 table images. They tint one shared grey cloth image with the colour, and only the sample's three tables are baked.

## Remaking the art

Everything in `sample/a/` comes from `sample/art/`. Run from that folder, with Pillow, numpy and scipy installed. The `.cjs` scripts need Playwright and Chrome; set `PLAYWRIGHT_TEST` to the path of `@playwright/test` if this worktree has no `node_modules`.

1. `measure_pictures.py`: measures the full-size crops in `~/Downloads`, writing `out/pictures.json`.
2. `node raster.cjs mark.html out/mark.png 512 512 1`, then `node raster.cjs postmark.html out/postmark.png 540 270 2`, then for each of `peak`, `fir` and `river`: `node raster.cjs "stamps.html#peak" out/stamp-peak.png 288 372 2`.
3. `wax.py`, `envelope.py`, `front.py`, `paper_tile.py`: the seal, envelope layers, front, stamps, postmark, paper and grain.
4. `pictures.py`: the three sample pictures, their tables and the window light.
5. `all_pictures.py ../../../../../backend/services/holidayCards.js`: `designs-table.json` and the sheet of all 49.
6. With `sample/` served on port 18990: `make_share.cjs` renders the share pictures.

`shot.cjs` and `flow.cjs` take screenshots of the page. `drag.py` drives a finger on a simulator (`SIM_UDID` in the environment).

## Remaking the videos (November 14, 2026)

"Share this card" can share a 12-second video of the card arriving (launch key `card_share_video`), one per picture. The videos never hold a note or a name: the envelope says "For you" from "Pantopus", with the December 25 postmark the public pages print, and the back says "This is how a Christmas card arrives on Pantopus. It opens like real mail. Send one at pantopus.com/cards", signed FROM Pantopus.

They are filmed from the real web card table, so a video looks exactly like the app (the picture's cloth, stamp and mood, and its three paper sounds):

1. From `frontend/apps/web`, with Google Chrome and ffmpeg installed: `node scripts/film-card-videos.cjs`. It starts the web dev server, opens `/dev/card-film` (404 in production builds) for each picture, steps the table frame by frame on its own clock and encodes `test-results/card-videos/<id>.mp4` (1080 × 1920, 30 frames a second, about 8 MB) with a sheet of its frames. About 30 seconds a picture. `--only 8,53` films only those numbers; `--skip-existing` resumes a run.
2. Look over the sheets: no person's name or note, the card turns as it should.
3. From `backend`, with that server's storage settings in the environment: `node scripts/upload-card-videos.js ../test-results/card-videos` puts them at `card-videos/v1/<id>.mp4` in its public storage (`--dry-run` first prints where).

A new picture needs its video filmed and uploaded before `card_share_video` is on, or its Video choice plays nothing. The files are cached for a year, so a changed video goes to a new folder (`v2`, with the route changed to match), never over an old one.

## Pictures 50–58: Christmas with Santa (November 7, 2026)

The founder's own Santa pictures, made with ChatGPT. The originals are 1214 × 1295, already 15:16, with no border or text, so nothing is trimmed: each `crop` in `designs-table.json` is the whole picture. The founder's 1500 × 1600 copies are plain enlargements of the same files, so the cards are made from the originals. From each original:

| File | How |
|---|---|
| `card/<id>.jpg` | The original as it is, JPEG quality 85 (these paintings come out heavier than the 49 at 88) |
| `<id>.jpg`, `<id>-thumb.jpg` (older apps) | 960 and 360 wide: the picture inside a 16-pixel border of the card's paper colour (`#f7f0e2`, the same for all nine), standing in for the baked border the 49 have, so the card is 960 × 1022 |
| `share/<id>-link.jpg` | Rendered from the same layout as the 49's link previews |

Table colours: the rule above gives umber to seven of the nine, because Santa's red reads as warm. Two are picked by hand: the toy shop (54), a snowy evening street, gets dusk, and the sleeping Santa (58), in soft morning light, gets wine.

The scripts are in the launch kit, `streams/SANTA/tools`: `make_art.py` writes the card, older and thumbnail files, and `render.cjs link <number>` writes the link previews.

## Pictures 59–67: Christmas with Jesus Christ (November 8, 2026)

The collection was first called The First Christmas and came last. The same day the founder renamed it Christmas with Jesus Christ and moved it to the front, before Christmas as a Kid, so "Pick a card" opens on it. Only the server's list changed (`COLLECTIONS` in `backend/services/holidayCards.js`; its id is still `first-christmas`), so the website, iPhone and Android apps show it without an update.

The founder's own nativity pictures, made with ChatGPT, each with its whole Bible verse printed under the painting. The founder asked for whole verses ("full scripts"). The apps print the caption on one line that shrinks to fit, so a whole verse there would print about 3 points tall on a small phone. Instead each verse is printed inside the picture, where it can take three lines, and the caption is its reference, such as "John 3:16 (KJV)". The book and its numbers are joined by a no-break space, so a reference never splits across two lines.

The verses are the King James Version, which is public domain in the US. The text is Project Gutenberg's KJV (ebook 10), word for word, except one change: Matthew 2:14 ends with a colon in the KJV because its sentence runs on into 2:15, so on the card it ends with a full stop. The founder asked for the English Standard Version. Crossway's rules (crossway.org/permissions, Artwork/Stationery) list greeting cards among the uses that need their written permission, so these use the KJV until that permission comes. ESV cards would be new numbers, so cards already sent keep their pictures.

The originals are 1214 × 1295, like the Santa ones. Each picture is typeset in Chrome from the original:

- **The painting** keeps the full width and gives up 200 pixels of height (15%). The share taken from the top is set picture by picture so the star, the moon and the angels stay in.
- **The verse** goes under the painting, on the card's paper (`#f7f0e2`), in EB Garamond (SIL Open Font License) at 34 pixels, centred in balanced lines.
- **The band** holds three lines on every card, so all nine paintings are the same size. 34 pixels is the largest size at which the longest verse (Matthew 2:11) still fits in three lines. It prints about 9.7 points on an iPhone SE.

From each typeset picture:

| File | How |
|---|---|
| `card/<id>.jpg` | The typeset picture as it is, JPEG quality 88 so the verse stays crisp |
| `<id>.jpg`, `<id>-thumb.jpg` (older apps) | 960 and 360 wide: the picture inside a 16-pixel border of the paper, as for the Santa pictures (quality 88 and 85) |
| `share/<id>-link.jpg` | Rendered from the same layout as the 49's link previews |

Each `crop` in `designs-table.json` is the whole typeset picture. The painting's own trim is its `top` in the kit's `nativity.json`. Each row also has its `verse`.

Table colours: the rule above gives umber to eight of the nine, because the paintings are warm, and dusk to the night journey (66). Four are picked by hand: dusk for the angel and the shepherds (62) and for the Magi under the star (64), and wine for Mary holding the baby (61) and for the Magi's gifts (65).

Screen readers read the caption, so they say the reference, not the verse.

The scripts are in the launch kit, `streams/NATIVITY/tools`. `compose.cjs` typesets the pictures (from `art/render/verse.html`), `make_art.py` writes the card, older and thumbnail files, and `render.cjs link <number>` writes the link previews. `nativity.json` has the order, verses, captions, cloths and trims.

## Pictures 68–89: Christmas with Jesus Christ, from the manger to Galilee (November 21, 2026)

The founder asked for more of their pictures in the collection, "each with its verse", and set two rules: "please make sure to preserve their quality do not reduce image quality" and "for every single verse you put on, please make sure to have the Book name, chapter and verse number on, and the whole verse content, do not cut any content off". They come after 59–67, in the order of the story: Luke 2:11, Matthew 3:17, Matthew 4:10–11, John 3:16 (with Nicodemus), John 4:14, Matthew 5:44, Mark 1:41, Mark 2:10–12, John 6:11, Matthew 14:30–31, Luke 15:20, Mark 10:14–16, John 11:25–26, John 13:14–15, Luke 22:19–20, Luke 22:42, 1 Peter 2:24, John 19:30, Matthew 28:6, John 20:18, John 21:17 and Matthew 28:18–20. The founder's folder held 26 pictures for 20 stories: one picture per story, except the cross and the resurrection, which keep two. Four files were left out.

The originals are 1214 × 1295 like 59–67 (three are 1215 wide and lose their last column). Each is made the way 59–67 were, and the typesetting was rebuilt because the NATIVITY scripts are gone: it was matched to 59–67 by measuring their files and re-rendering card 59's band in Chrome, which broke into the same three lines within 4 pixels of the same widths. EB Garamond 400 at 34 pixels, line height 1.3, 90-pixel side margins, balanced lines, ink `#30281e` on the card's paper (`#f7f0e2`), with Chrome's default text smoothing on macOS.

- **The verses** are Project Gutenberg's KJV, ebook 10 (taken on November 21 from Gutenberg's own mirror, aleph.pglaf.org, while gutenberg.org was down), word for word, with two changes. Matthew 5:44 ends with a full stop, as Matthew 2:14 does. John 20:18 reads "the Lord", as the founder gave it: Gutenberg prints "LORD" there, a difference of capitals between printings, and capitals would read as a mistake in "Read the verse" (design review). In a passage of two or three verses, each verse's number is printed small before it on the picture. In the server's text, which the apps print in "Read the verse", the numbers are plain digits tied to their first word ("10 Then saith …"): the iPhone's serif (New York) has only ¹ ² ³ of the superscript digits, so the others would print in another font.
- **The band grows with the verse.** 200 pixels for up to three lines (16 cards, as on 59–67); 244 for four lines at 34 pixels (77, 82, 88); 259, a fifth of the picture, for five lines at 31 pixels (75, 79, 89), the largest size whose five lines fit. 71's two-line verse has a 156-pixel band, so the oil lamp in the painting stays in.
- **The painting is cropped, never resampled.** The band's height comes off the painting's height; how much from the top is chosen picture by picture (`painting_top` in `designs-table.json`, with `band`) to keep heads, hands, the dove, the moon, the tops of the crosses and the people at their feet. Several lose feet at the bottom, as 66 does. Two hands are out of frame because no trim keeps them with the heads above: the paralysed man's right hand on his mat (75) and Peter's free hand on the water (77).

| File | How |
|---|---|
| `card/<id>.jpg` | The typeset picture as it is, JPEG quality 92 with no chroma subsampling (the founder's "do not reduce image quality"). About 624 KB on average, against 386 KB for 59–67 at quality 88 |
| `<id>.jpg`, `<id>-thumb.jpg` (older apps) | 960 and 360 wide: the picture inside a 16-pixel border of the paper, quality 88 and 85, as for 59–67 |
| `share/<id>-link.jpg` | Rendered from CTBSRV's `share49.html`, the layout of all the earlier link previews: card 59's preview made again with it is pixel-identical to the one on the website |

Each `crop` in `designs-table.json` is the whole typeset picture.

Table colours: the rule above, on the painting (which gives 59–67's recorded colours, 66 dusk), gives umber to 18 and dusk to the storm at sea (77), Gethsemane (83) and the two crosses (84, 85). By eye: dusk for the night with Nicodemus (71), and wine for five bright daylight scenes (the baptism 69, the teaching by the lake 73, the loaves and fishes 76, the garden on Easter morning 87 and the Great Commission 89).

**"Pick a card".** It prints a verse card's whole verse under the card, and the Android app makes every card of a collection small enough to leave room for the longest verse in it. So the list "Pick a card" reads carries that verse only for a verse no longer than Matthew 2:11, the longest of 59–67 (`pickACardDesign` in `holidayCards.js`). The six longer passages (75, 77, 79, 82, 88 and 89) show their reference there and are read on the picture. An opened card's "Read the verse", Sent, and the public card pages still carry every verse whole.

**The table's mood** comes from the picture's number in each app. The website treats 59–89 as Christmas with Jesus Christ (candlelight, the star stamp); the iPhone and Android apps know 59–67.

Card 71 is John 3:16, which card 61 already carries, so its public page is `/cards/john-3-16-nicodemus`.

The scripts are in the launch kit, `streams/JESUSCARDS/tools` (and the work folder `/Volumes/Studio-Extended/jesus-cards-work/tools`): `band.cjs` sets a verse band in Chrome, `jobs.py` builds the bands from the checked text, `compose.py` joins painting and band and checks the painting's pixels are copied unchanged, `make_art.py` writes the card, older and thumbnail files, `render-links.cjs` writes the link previews, `designs_table.py` writes the rows here, and `check_server_verses.cjs` checks the server's text against the checked verses word for word.
