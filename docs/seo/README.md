# Search: how people find Pantopus

The founder's direction, November 23, 2026: people should reach Pantopus wherever they search, for every part of the
app (Place, Today, Pulse, Moments, Mail, Christmas cards, chat, Plans, Support Train and whatever comes next). When a
feature is switched on, its search work is part of switching it on: Gigs, the Marketplace and every later one.

This page says what is set up, what each part of the app has, and the checklist for a feature being switched on.
Change it in the same pull request that changes what search engines can read.

## What is set up

Read from `dev` and from the live site on November 23, 2026; kept up to date by the search build since.

| Piece | Where | What it does |
|---|---|---|
| robots.txt | `frontend/apps/web/src/app/robots.ts` | Only production's primary deployment may be read; staging, previews and local builds answer `Disallow: /`. Production keeps signed-in pages and link-token pages out (`PRIVATE_PATHS`), allows the share pictures under `/api/og/` (the longer rule wins over `Disallow: /api/`) and names the sitemap. |
| Sitemap | `frontend/apps/web/src/app/sitemap.ts` | The pages in `PUBLIC_PAGES`, the pillar pages (`src/lib/site/pillarPages.ts`) and guide pages (`src/lib/site/guidePages.ts`), every card and collection page (from the one cached answer `/cards` reads), and every state and county page from the backend's list (`GET /api/public/county-guide`, `backend/services/countyGuide`). A switched-off feature's paths (`isLaunchCutPath`) are left out. |
| Page tags | Each page's `metadata` or `generateMetadata`; `publicPageMetadata` in `src/lib/site/pageMetadata.ts` for the public pages | Title, description, canonical link at `https://pantopus.com`, share card. `publicPageMetadata({ path, title, description })` writes "<title> \| Pantopus", `index, follow`, Open Graph and a large Twitter card. A page reached by a private link says `robots: { index: false }`. |
| Shared links | `buildShareMetadata` in `frontend/apps/web/src/lib/publicShare.ts` | The tags for a shared post, profile, plan, booking page, task or listing, with Safari's app banner. |
| The default | `src/app/layout.tsx`, `src/lib/siteTitle.ts` | The title and description a page inherits when it names none. There is no title template: signed-in pages already end their titles "· Pantopus". |
| Share pictures | `/api/og/home`, `/api/og/place`, `/api/og/page?path=<path>`; `opengraph-image.tsx` and `twitter-image.tsx` beside each page in `(public)/` | The drawn share cards for the homepage, an address preview, each pillar, topic and guide page (the file convention: `/<page>/opengraph-image…`), and the other public pages (its heading and line from `src/lib/site/shareCards.ts` or a `share` on a pillar or guide entry; any other path is a 404). A query, not a path segment: `next.config.js` rewrites `/api/:path*` to the backend before any dynamic route under `/api`. |
| Structured data | `src/lib/site/jsonLd.ts`; `(public)/**`; `(site)/cards/**`; `(site)/property-records/**` | The homepage: `Organization`, `WebSite` and the iOS and Android `MobileApplication`s (no `sameAs`, no ratings). `/about`: a breadcrumb. Pillar and topic pages: breadcrumb and `FAQPage` from the questions they show. `/guides`: `ItemList`; each guide: `Article` and its questions. Card pages: `ItemList` on `/cards` and each collection, `CreativeWork` on each card. County pages: breadcrumb and questions. |
| App links | `public/.well-known/apple-app-site-association`, `assetlinks.json` | A shared link opens the app when it is installed. |
| For AI assistants | `src/app/llms.txt/route.ts` | `/llms.txt`: what Pantopus is in the homepage's words and every public page, with the pillar and guide pages from `src/lib/site`. |
| Launch cuts | `src/middleware.ts`, `isLaunchCutPath` in `src/lib/featureFlags.ts` | A switched-off feature's public addresses redirect to `/`, so search engines hold nothing for it. |

## What each part of the app has

| Part | Pages a search engine can read |
|---|---|
| Place | `/place`, `/start` (the address lookup), `/tax-check`, `/property-records` with its state and county pages |
| Today, Pulse, Moments, Plans, Support Train, chat | `/today`, `/pulse`, `/moments`, `/plans`, `/support-train`, `/chat` |
| Mail and Christmas cards | `/mail`, `/cards`, `/cards/<card>`, `/cards/collection/<name>` (while Christmas cards are on) |
| Topics and guides | `/social-network`, `/home-buying`, `/home-management`, `/home-safety`; `/guides` and ten `/guides/<slug>` |
| The company | `/about`, `/about/data-sources`, `/contact`, `/privacy`, `/terms`, `/child-safety`, `/llms.txt` |
| People's own content | A shared post (`/posts/<id>`) or profile (`/<username>`) can be read when a link leads to it; none is listed in the sitemap. Plans, cards in the mail, Support Trains and every link-token page are closed. |
| Gigs, Marketplace, business pages, booking pages, personas | Nothing while their keys are off: their addresses redirect to `/`. |

## When a feature is switched on

For a launch-cut key going on ([launch-scope flags](../launch-scope-flags-2026-10-01.md)) and for any new feature
people can reach. Do it in the pull requests that switch the feature on, so it goes to staging with the feature and
reaches search engines when the founder promotes.

1. **Its own page.** A public page at its own address that says what the feature is in the words people type into a
   search box, with its own title, description, canonical link, share picture, the questions people ask (with their
   structured data) and the app buttons. Add the address to `PERSONAL_RESERVED_USERNAMES`
   (`backend/utils/personalUsername.js`) so nobody can take it as a username, after checking nobody has.
2. **Its public content.** Decide which of its pages are for search engines (a public listing, an open task) and
   which never are (anything reached by a private link, anything that shows a home). The first kind says
   `robots: { index: true }`, has a canonical link and structured data of its kind; the second says `index: false`,
   and a link-token path also goes in `PRIVATE_PATHS`.
3. **The sitemap.** Add its pages to `PUBLIC_PAGES`. A list of content comes from one cached backend answer, the way
   the county pages do, never from a call per item.
4. **The middleware.** With the key on, its public addresses answer; with the key off, they still redirect.
5. **Links in.** The homepage (its top bar, a section, the footer) and the pages of related parts link to it. A page
   nothing links to is rarely found.
6. **The words elsewhere.** The homepage and `/about` name it.
7. **The stores.** New App Store and Play text that names it: description, subtitle or short description, keywords,
   screenshots. Draft the text in the pull request; the consoles are the founder's.
8. **This page.** Update the two tables above and the row below.

What each switched-off feature will need:

| Key | Its search work |
|---|---|
| `open_gigs` | `/gigs` and `/gigs/<id>` exist with share tags. A page for what Gigs is; whether open tasks are listed for search engines (a task shows a place name, never an address); structured data; a page per kind of help and city only once real tasks fill it. |
| `marketplace` | `/listing/<id>` exists with share tags; there is no public browse page (browsing is signed in). Product structured data (name, price, picture, whether it is still for sale); a sold or removed listing answers "gone"; a page per category and city only once real listings fill it. |
| `business_directory` | Business pages at `/b/<username>`: local business structured data from what the business chose to show; pages by city and category once filled. |
| `public_scheduling` | Booking pages at `/book/<slug>`: readable for a business that wants a public page; one-off and token links stay closed. |
| `beacon`, `personas` | Public pages at `/persona/<handle>`: profile structured data. |
| `household_extras`, `mail_extras`, `gift_funds`, the card keys | Inside the app: the Today, Mail, Christmas cards and Support Train pages and the store text name what was added. |

## Rules that hold

- No page per address and no address in any link. Search engines index states, counties and cities, never a home.
- Staging, previews and local builds are never readable by search engines.
- A page per city, county or category exists only when something real fills it. No padded pages.
- Every figure on a public page names its source and its date.
- New public words use neither "neighbor" nor "Neighborhood" (the founder, November 7 and 16).
- Nothing switched off is made public to win a search.
- Never redirect `www.pantopus.com`. The apps share links there (`https://www.pantopus.com/posts/<id>`) and both
  claim it for app links, which a redirect on `/.well-known/` breaks (`next.config.js`, the `headers()` note). Both
  hosts answer every page; each page's canonical link names `https://pantopus.com`, which is what search engines index.

## The founder's steps

- Google Search Console: add `pantopus.com` as a Domain property (a DNS record), then submit
  `https://pantopus.com/sitemap.xml`. Bing Webmaster Tools: the same; it can import the site from Search Console.
  These two are the only place to see which pages are indexed and what people searched.
- Promote `dev` to production. Nothing in `dev` reaches a search engine before that.
- The App Store and Play listing text.

## How to check a page

- The page's source in production: its `<title>`, description, `rel="canonical"`, `robots` and any
  `application/ld+json` block.
- `https://pantopus.com/robots.txt` and `https://pantopus.com/sitemap.xml`.
- Search Console's URL inspection for whether Google holds the page, and its Rich Results Test for structured data.

## Gaps found on November 23, 2026

Facts from the review, for whoever builds next. Remove a line when it is fixed.

- Production has no sitemap: it is in `dev` and waits for a promotion.
- `/start` and `/tax-check` hold about 120 words each before the lookup starts.
- The Play listing describes posting tasks and paid services. The App Store text names neither Mail, Christmas
  cards, Moments nor property records. New text for both is in #4732, which waits for the founder.
- No company social account is known, so the homepage's `Organization` has no `sameAs` (a founder question).
- Not known from here: whether the site is in Search Console, how many pages are indexed, how fast the pages load
  on a phone (Google's public speed test was over its daily limit).
