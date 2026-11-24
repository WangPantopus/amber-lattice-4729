# Home record page: the contract (v1)

The page "This home's record" / "Your home's record" is drawn by the server as a list of blocks. The apps draw each
block and skip a kind they don't know, so later pieces reach the store apps with a server release.

- `GET /api/public/home-record?address=…` (`backend/routes/public.js`): the `lookup` state, for anyone who looked up
  an address, signed in or not. Same address parameter, limits and privacy rules as `GET /api/public/place`; a
  person's own repeat of an address within ten minutes costs no lookup.
- `GET /api/homes/:id/record` (`backend/routes/homeRecordPage.js`): signed in. `owner` for the Home's confirmed owner
  (the test Property details uses), `member` for anyone else its Place lets in (household, private setup, open claim),
  404 for everyone else.

The answers are built in `backend/services/homeRecord/`. The three sample answers in `fixtures/` have every block kind
the first pieces use; every value in them is made up.

## Shape

```jsonc
{ "v": 1, "state": "lookup" | "member" | "owner",
  "header": { "chip": { "tone", "text" } | null, "title", "subtitle" },
  "blocks": [ { "kind", "id", ... } ],
  "footer": "..." }
```

Strings are final words: the apps never build a sentence. `chip` is `{ tone: success | warning | neutral, text }` or
null. `action` and `button` are `{ label, url }`, an https page or an app link starting with `/`.

| kind | fields |
|---|---|
| `picture` | `above` `{ image_url, outline, chips: [{ at: bl \| br, text }] }` or null, `street` `{ lat, lng }` or null, `caption` |
| `facts` | `tiles: [{ label, value, unit }]` (up to 3), `line`, `source` |
| `meters` | `title`, `groups: [{ title, rows: [{ label, level 1-5, tone low \| mid \| high, word }] }]`, `note` |
| `intro` | `title`, `body` |
| `closed_group` | `title`, `chip`, `items: [{ icon, title, line }]` |
| `promise` | `title`, `body`, `steps: [{ title, line }]`, `button`, `alt: { lead, label, url }` or null |
| `note` | `icon`, `text` |
| `section_label` | `text` |
| `value` | `label`, `value`, `chip`, `bars: [{ year, amount }]`, `source`, `estimate: { label, text, low, high, mark, note }` or null |
| `photo_years` | `title`, `count`, `photos: [{ year, label, image_url, outline }]`, `note` |
| `timeline` | `title`, `items: [{ title, right, strong, line, mono }]`, `note` |
| `notice` | `eyebrow`, `title`, `line` |
| `rows` | `title`, `lead`, `rows: [{ label, value, mono, chip }]`, `note`, `action` |
| `tiles` | `title`, `tiles: [{ label, value, line }]`, `rows: [{ label, value }]`, `note` |
| `bars` | `title`, `items: [{ title, right, tone, fill 0-1, line }]`, `note` |
| `card` | the money card shape (`serializeMoneyCard`): `title`, `chip`, `lead`, `rows`, `notes`, `source`, `action` |

`icon` is one of `history`, `trend`, `tag`, `bank`, `bars`, `shield`, `image`, `wrench`, `bell`, `layers`, `home`,
`alert`, `file`, `mail`, `percent`, `eye_off`; an unknown icon draws the default.

## Rules the server keeps

- The open facts are a fixed list: home type, year built, living area, lot size, bedrooms, bathrooms, stories. Nothing
  marked `value` or `owner` in `backend/services/propertyRecords/facts.js` is in a `lookup` or `member` answer.
- A closed item shows only where the record holds that data for that home, with a name and one line, never a value.
- No owner names are read, kept or shown. Every block names the office its data came from; area ratings say they are
  for the area, not a test of the home.
- The lookup writes nothing about the address and keeps no trail of what was typed.
