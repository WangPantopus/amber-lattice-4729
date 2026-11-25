# Made-up names: the build contract

A person may write a Pulse post or a reply under one made-up name, so the people around them can't see who wrote it.
Pantopus always knows. The founder approved the design on November 25, 2026 ("yes, right, let's go, and users can
come up with a name themselves otherwise we assign them something"); the design, with its reasons, is the Claude Doc
"Made-up names: posting without your name". This page is what the server does today and what each app builds on it.

In the apps the words are **made-up name**. In code it is a **pen name** (`pen_name`, `penName`), to keep it apart
from the server's "made-up username" (`utils/personalUsername.js`) and the Mail aliases.

## What is built, and what is not

| Piece | State |
|---|---|
| Server: names, the gate, posts and replies, notices, mute and block, holds, strikes, the staff look, the brake | Built (`backend/services/penName`, `backend/routes/penNames.js`, migration `20261125083000_pen_names.sql`) |
| Web, iPhone, Android: "Post as", the name screen, the card, the small card, My posts | **Not built.** "What each app builds" below |
| Moments under a made-up name | **Not built.** The server refuses it (`PEN_NAME_NOT_FOR_THIS`) |
| Photos and videos on a made-up-name post or reply | **Not built: words only.** Nothing reads a picture on a post before it shows; pictures come with Moments, which has the picture check |
| Reporting a reply | **Not built, under any name.** The apps report posts only. A reply under a made-up name can be muted or blocked, and its words were checked before it showed |

An app from before made-up names already draws a made-up-name post and reply correctly (the name and the drawn
picture, where it reads `author` / `creator`), and its Mute, Block, Report, Edit and Delete work on one. It can't write
one, except that a reply in a conversation the person is already in under their made-up name carries it (below).

## The promise (show these three sentences where the name is chosen)

1. Others see a made-up name and that you have a verified home nearby. They don't see your name, photo, profile,
   home or how far away you are.
2. Pantopus knows it's you. We step in when the rules are broken, and the law can require us to say who wrote
   something.
3. A photo, a detail only you would know, or the way you write can still give you away.

`GET /api/pen-names/me` sends them as `promise`, so the apps and the server never disagree.

## How it is stored (why a missed reader can't leak)

- A made-up-name row is saved under **one system account** (`5ea1ed00-0000-4000-8000-000000000001`,
  `account_type = 'system'`, shown name "Someone nearby"), with `identity_context_type = 'pen_name'` and
  `identity_context_id` = the pen name's id. `Post.post_as` stays `personal`. Nothing on the row is the writer's.
- A pen name is an `AudienceIdentity` row with `kind = 'pen_name'` and **no `user_id`**.
- Who owns a pen name, and who wrote a post or reply under one, is kept only in `PenNameOwner`. No role holds any
  privilege on that table, the server's own included. It is reached through the `pen_name_*` database functions, and
  `backend/services/penName/owner.js` is the only file that may call them
  (`backend/scripts/ci/check-pen-name-owner.js`, part of `pnpm run test:privacy`).
- The database refuses a made-up-name row whose writer isn't recorded first, and refuses to put a pen name on, or take
  it off, a row afterwards (`pen_name_content_guard`). Deleting an account deletes its made-up-name posts, empties its
  made-up-name replies and retires its name, in the same transaction.

So a feed, a profile, a search, a notice or a job that has never heard of made-up names reads the system account and
shows "Someone nearby". It loses a feature; it never shows the person. **Any new code that needs the writer goes
through `penName.present.asWriter`, `penName.present.writerId` or the notice redirect below, never around them.**

## What the server sends

On a made-up-name post (feeds, the post page, My posts) and reply:

```json
{
  "user_id": "<the pen name's id; the viewer's own id when the viewer wrote it>",
  "author": {
    "type": "pen_name", "id": "<pen name id>", "displayName": "Night Gardener", "avatarUrl": "https://…/pen-names/….png",
    "handle": null, "href": null, "madeUp": true, "badges": ["made_up_name", "verified_home"],
    "isYou": true
  },
  "creator": { "type": "pen_name", "id": "<pen name id>", "handle": null, "displayName": "Night Gardener", "avatarUrl": "…" },
  "made_up_name": true,
  "viewer_is_author": true
}
```

- `isYou` and `viewer_is_author: true` reach only the person who wrote it. They are how an app says "(you)".
- `user_id` is the writer's own id for the writer, so "is this mine" checks (`user_id == me`) keep working, and the pen
  name's id for everyone else, so Mute and Block act on the name.
- A post floats over an area of at least 100 homes (`area`, `location_precision: approx_area`); the pin is the area's
  point and `location_name` a town or a place, never an address. `distance_meters` is the distance to that area.
- Never sent: the account's id, name, photo, handle, profile link, home, or the system account's id.

## The routes

Every route needs a signed-in person. Refusals are `{ "error": "<a sentence to show as it is>", "code": "…" }`.

### Your made-up name

| Route | What it does |
|---|---|
| `GET /api/pen-names/me` | `pen_name` (`id`, `name`, `avatar_url`, `taken_at`, `change_after`) or null; `allowed` and `refusal` (why this account can't use one); `limits`; `name_rules` (`min` 3, `max` 24); `post_types`; `promise`; `suggestions` (four names Pantopus could give, when the person has none and may have one) |
| `POST /api/pen-names` `{ "name": "…" }` | Takes the typed name. An empty or missing `name` lets Pantopus give one. `{ "replace": true }` gives up the name in use: free while nothing was written under it, else once every 30 days (`PEN_NAME_TOO_SOON`). 201 `{ pen_name }` |
| `GET /api/pen-names/suggestions` | Four more names Pantopus could give (for a Shuffle button: show one, post it as `name` when the person keeps it) |
| `GET /api/pen-names/check?latitude=&longitude=` | Whether a post made here may carry a made-up name: `allowed`, `refusal`, and `warning` (a sentence to show above the Post button when few verified homes are near) |
| `GET /api/pen-names/me/posts?before=&limit=` | The person's own made-up-name posts, newest first (`posts`, `next_before`). Only they can read it |

A typed name is 3 to 24 characters (letters, numbers, spaces, hyphens, periods, apostrophes; at most three words), not
taken, not a person's or business's name or handle on Pantopus, not Pantopus or an official, and passes an automatic
check (not a real person's full name, not abusive). The picture is drawn by the server; nobody uploads one.

### Writing

| Route | Under a made-up name |
|---|---|
| `POST /api/posts` | Send `"postAs": "pen_name"`. `postType` is one of `ask_local`, `recommendation`, `local_update`, `neighborhood_win`; `audience` is `nearby`; a place (`latitude`, `longitude`) is required; no media, no `homeId`, no `businessId`, no `quotedPostId`. Everything else is the ordinary post. The answer is the ordinary one, with the fields above |
| `POST /api/posts/:id/comments` | Send `"postAs": "pen_name"`. Words only |
| `PATCH /api/posts/:id`, `PATCH …/comments/:commentId` | The writer may change the words (`content`, `title`, `tags`); other fields sent are ignored. The new words are checked again |
| `DELETE`, archive, resolve, solve | As for any post of one's own |

**One voice per conversation**, kept by the server:

- In a conversation the person is already in under their made-up name (they wrote the post, or a reply), every reply
  of theirs carries it, whatever `postAs` says. This is what keeps an app from before made-up names from answering
  under the person's own name.
- In a conversation they are in under their own name, `postAs: "pen_name"` is refused (`PEN_NAME_ONE_VOICE`).
- An app can tell which applies from the thread it has loaded: a row with `viewer_is_author: true` (and
  `made_up_name`) is the made-up voice; a row whose `user_id` is the viewer's with no `made_up_name` is the named one.

### The small card, mute and block

| Route | What it does |
|---|---|
| `GET /api/pen-names/:id` | `pen_name`: `name`, `avatar_url`, `badges`, `note` ("A made-up name. Pantopus knows who this is and holds them to the same rules as everyone."), `is_yours`, `muted`, `blocked` |
| `POST` / `DELETE /api/pen-names/:id/mute` | Hide, or show again, everything that account writes under any made-up name |
| `POST` / `DELETE /api/pen-names/:id/block` | The same, and that account can't reply to this person under any name |
| `GET /api/pen-names/hidden` | The made-up names this person muted or blocked |

Today's routes do the same when handed a pen name's id, which is what older apps send:
`POST /api/posts/mute` `{ entityType: "user", entityId }`, `DELETE /api/posts/mute`, `POST` / `DELETE
/api/users/:id/block`. `GET /api/posts/mute` and `GET /api/users/blocked` list them (`made_up_name: true`,
`reason: "pen_name"`).

**The two block rules** (they are why a block of a made-up name is never a `UserBlock` row):

1. *What you see.* Blocking a person hides what they post under their own name. Blocking a made-up name hides what
   that account posts under any made-up name. Neither touches the other kind, so nothing disappears that could say
   who is who.
2. *Who can reach you.* If you blocked a person or their made-up name, that account can't reply to what you wrote
   under your own name, under any name. On a made-up-name post or reply nothing is ever refused because of a block,
   or the refusal would say who is behind the name.

### Refusal codes

| Code | When |
|---|---|
| `PEN_NAME_NEEDED` (409) | No made-up name yet: open the name screen, then send again |
| `PEN_NAME_NEEDS_VERIFIED_HOME`, `PEN_NAME_ACCOUNT_TOO_NEW`, `PEN_NAME_NOT_FOR_ACCOUNT`, `PEN_NAME_SUSPENDED` (403) | The account may not use one (also in `/me`'s `refusal`) |
| `PEN_NAME_PAUSED` (503) | The brake is on |
| `PEN_NAME_POST_TYPE`, `PEN_NAME_AUDIENCE`, `PEN_NAME_WORDS_ONLY`, `PEN_NAME_NOT_FOR_THIS`, `PEN_NAME_NEEDS_PLACE` (400) | Not this kind of post, audience, attachment or place |
| `PEN_NAME_TOO_FEW_NEARBY` (403) | Fewer than 10 verified homes could have written it |
| `PEN_NAME_DAILY_LIMIT` (429) | 3 posts or 20 replies a day under a made-up name |
| `PEN_NAME_WORDS_REFUSED` (422) | The automatic check read the words and they can't go out under a made-up name; the sentence says why |
| `PEN_NAME_CHECK_UNAVAILABLE` (503) | The check can't run. Nothing is posted under a made-up name meanwhile; a post under the person's own name is untouched |
| `PEN_NAME_ONE_VOICE` (409) | Already in this conversation under their own name |
| `PEN_NAME_VOICE_UNAVAILABLE` (503) | The server couldn't tell which name the person has in a made-up-name conversation: nothing is posted; try again |
| `PEN_NAME_LENGTH`, `PEN_NAME_CHARACTERS`, `PEN_NAME_RESERVED`, `PEN_NAME_REFUSED` (400), `PEN_NAME_TAKEN`, `PEN_NAME_EXISTS`, `PEN_NAME_TOO_SOON` (409), `PEN_NAME_RATE_LIMIT` (429) | Taking a name |
| `PEN_NAME_IS_YOURS` (400), `PEN_NAME_NOT_FOUND` (404) | Muting or blocking |

## Notices

A notice about a made-up-name post or reply ("Maria replied to your post", a reaction, a repost, "Your post was
removed") is addressed to the system account by code that knows nothing about made-up names.
`notificationService.createNotification` hands it to `penName/notices.js`, which sends it to the writer, or to nobody
when the writer did the thing themself or blocked whoever did. A notice's words never name the writer's made-up
name. When someone acts under a made-up name, the notice names it and its data carries `pen_name_id`, never `user_id`.

Nobody is told "someone you know posted" about a made-up-name post: no connection notice, no follow alert.

## Safety

- **Who:** a verified home that is still current, an individual account at least 7 days old, no penalty in force.
- **The words** of every made-up-name post, reply and edit are read by an automatic check before they show (Claude,
  `ANTHROPIC_PEN_NAME_CHECK_MODEL` or the chat model). It refuses text that names or points to a private person,
  shares an address, a phone number or a plate, accuses a recognizable person or business of wrongdoing, threatens,
  abuses or is sexually explicit. A refused post isn't saved and the person is told why. If the check can't run,
  nothing is posted under a made-up name.
- **Two reports** by different people hide a made-up-name post until someone has looked (`moderation_state: held`).
- **A removal** by a moderator (`POST /api/admin/reports/post/:reportId/remove`) is a strike on the account: a warning
  first, no made-up name for 30 days on a second within 90 days, and for good with `{ "severe": true }`. The notice
  of the removal reaches the writer.
- **Staff** see the made-up name on a reported post, not its writer. `POST /api/admin/reports/post/:reportId/writer`
  `{ "reason": "…" }` answers who wrote it and writes the look to `IdentityAuditLog` first.
- **The brake:** a `FeatureFlag` row named `pen_names_paused` with `enabled_globally = true` stops new made-up-name
  posts and replies everywhere within a minute; `pen_names_hidden` also takes every one already written out of what
  people read. Neither row exists by default. They are for a bad day, not for launching.

## What each app builds

The same seven things on the web, the iPhone and Android. Words in quotes are the screen's own.

1. **"Post as"** in the Pulse composer and in the reply box: the person's own name ("your name and profile") and
   their made-up name ("others can't see it's you"). Every new post starts on the person's own name. When
   `/me` says `allowed: false`, the row shows `refusal.message` and can't be chosen (for a home that isn't verified,
   that sentence is the nudge to verify).
2. **The first time**, one screen: a field for the name they want; left empty, Pantopus gives one (show a suggestion
   with **Shuffle**); the picture, always drawn; the promise; **"Use this name"**.
3. **While it is chosen**, the top of the composer takes the made-up name's look and reads "Posting as Night
   Gardener", and the button reads **"Post as Night Gardener"** (or "Post as Maria Lopez"): the button always names
   the one it will carry. Only the four kinds above are offered, the audience is people nearby, and the photo button
   says the post is words only. Show `/check`'s `warning` above the button.
4. **The card:** the drawn picture, the name, a small **"Made-up name"** mark and **"Verified home nearby"**. No
   distance from the author, no profile.
5. **A tap on the name** opens the small card (`GET /api/pen-names/:id`): the name, the picture, the note, and
   **Mute**, **Block** and **Report** (Report is the post's own). Never a profile, Message or Connect.
6. **Your own:** "Night Gardener (you)" and the line "Only you can see this is you". Edit changes the words only.
   **My posts** gains a part only its owner can open, from `/me/posts`.
7. **In the reply box** the choice is fixed once the person is in the conversation (one voice, above).

Not in the apps: any switch that turns a made-up name on for good; the name in a push or a lock-screen line about
the person's own post; a made-up name on Offers, Events, Lost and found, alerts, deals, business or Home posts, or
posts to Connections.

## Checking it

- A local backend needs a stand-in for the Claude checks (rigs have no key): see the PENNAME rig's
  `fake-check-penname.cjs`. The real check has run on no machine yet: check it on staging.
- Check the other person's view every time: the writer sees "(you)" and Edit; a second account sees only the name;
  nothing either app receives for the second account holds the writer's id.
- A made-up name needs a verified home, an account 7 days old, and at least 10 verified homes counted near the post
  (`NeighborhoodPreview`, every cell sharing the post's geohash-5).
