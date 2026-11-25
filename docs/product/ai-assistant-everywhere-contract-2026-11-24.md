# Pantopus AI everywhere: the contract between the server and the apps

November 24, 2026 · Status: the server side is built; the apps follow. Asked for by the founder on November 24: the assistant should reach every part of the app, find things anywhere in it, and take the typing out of making a post, a Moment, a plan, a letter, a Christmas card and a Support Train.

This file adds to the three earlier contracts ([phase 1](ai-assistant-phase1-contract-2026-10-20.md), [phase 2](ai-assistant-phase2-contract-2026-10-20.md), [phase 3](ai-assistant-phase3-contract-2026-10-22.md)). Nothing in them changes. An app build that sends nothing new gets exactly what it gets today, plus better answers from the new lookups.

## 1. Where each part of the app stands

| Part | Find and read | Make |
|---|---|---|
| Place | `get_place_facts`, `get_home_verification` | home tasks, systems, appliances (action cards, phase 1 and 2) |
| Today, At home | `get_today`, `get_schedule`, `get_place_alerts` | pickup days, reminders |
| Today, Around you | **new** `find_around_you` | a reply to a row (`draft_post_reply`) |
| Pulse | `find_posts`, `get_post`, `catch_up_nearby`, `find_recommendations` | a post (`post` draft, opens the composer), a reply, mark solved |
| Plans | `find_plans`, `get_plan`, `find_games` | host, change, cancel, ask, answer, message (action cards) |
| Moments | `find_moments` (**new**: words to look for), `get_moment` | **new** a Moment (`moment` draft, opens the composer) |
| Mail | `find_mail`, `get_mail_item` (behind the identity check) | **new** a letter (`letter` draft, opens the letter wizard) |
| Christmas cards | **new** `find_cards` | **new** a card (`christmas_card` draft, opens the card screen); older apps get the `christmas_card` button |
| Support Trains | `list_user_support_trains` (**now** every role and invitations), **new** `find_support_trains_nearby`, `get_support_train_summary` (**now** open dates) | start one (`support_train` draft, opens the wizard) |
| Messages, Wallet | `find_chats`, `read_chat`, `get_wallet`, `find_payments` | a message to a plan's chat |

Other kinds of card (birthday and so on) do not exist in the app yet. When one is added to `services/holidayCards.js` or a sibling, `find_cards` and `draft_christmas_card` are where it joins.

## 2. One rule for the three new things the assistant makes

A Moment, a letter and a Christmas card are **drafts the app's own composer opens**, the way a Pulse post already is. The assistant writes everything; the person looks at it on the real screen and sends it there with that screen's own button.

Why not a one-tap card that sends from the chat: each of these screens does something a bare request would skip. The Moments composer pins the Moment where the person is and asks once that they are 18 or older. The letter wizard confirms the address and seals the letter. The card screen shows the card, takes a signature, spends a stamp or opens the stamp books, and "Seal and send" can be taken back until the morning pickup. On the phones, Mail opens only after the phone's own identity check, and a draft that opens inside Mail goes through it like any other visit.

So the server never writes for these, the apps add no request to the action-card allowlist, and nothing about who may send what changes.

## 3. Request

`POST /api/ai/chat`, `cards` (and the `cards` query of `GET /api/ai/conversations/:id/messages`): three new names, each meaning "this build opens that draft in its composer".

| Name | The build can |
|---|---|
| `"moment"` | open the Moments composer with a text card or a caption filled in |
| `"letter"` | open the letter wizard with who it is to, the kind of letter and the letter filled in |
| `"christmas_card"` | open the Christmas card screen with the picture, who it is to, the note and the arrival filled in |

A build lists a name only when it does all of that for the draft in section 4. The server offers each draft tool only to a build that lists its name, while the feature is on (`moments` for the person; launch keys `mailbox` + `mail_extras` for letters; `mailbox` + `holiday_cards` for cards).

## 4. Drafts

Each arrives as the existing `draft` event and in history as the existing draft item, with `valid: true`. A draft ends the assistant's turn; the line under it arrives as `text_delta`, as today.

### 4.1 `moment`

```json
{ "type": "moment", "valid": true,
  "draft": { "kind": "text", "text": "The farmers market is packed today! Come on down!",
             "background": "green", "hours": 6, "audience": "nearby" } }
```

| Field | Values |
|---|---|
| `kind` | `"text"` (a text card) or `"photo"` (the person takes or picks the photo or video in the composer) |
| `text` | kind text: the card's words, 1 to 200 characters |
| `background` | kind text: `teal`, `sky`, `green`, `amber`, `rose`, `slate` |
| `caption` | kind photo: up to 100 characters, may be absent |
| `hours` | `1`, `6`, `24`, `48` |
| `audience` | `"nearby"` or `"connections"` |

The card shows the words, how long it stays up and who sees it, with one button, **Open in Moments**. It opens the composer on its text card step (kind text) or its camera (kind photo) with these values set. Location, "Show the area instead", the 18+ confirmation and Post are the composer's, unchanged.

### 4.2 `letter`

```json
{ "type": "letter", "valid": true,
  "draft": { "recipient": { "userId": "…", "name": "Alex Moreno", "username": "alex", "homeId": null,
                            "homeAddress": null, "isVerified": true, "homeMediaUrl": null, "isOnPantopus": true },
             "intent": "business_note",
             "body": "Hi Alex,\n\nThank you for sending over the quote…\n\nSam" } }
```

`recipient` is one row of `GET /api/mailbox/compose/recipients`, unchanged, so the wizard's own recipient type decodes it. `intent` is one of the wizard's five: `say_hello`, `congratulations`, `condolences`, `business_note`, `just_because`. `body` is up to 4,000 characters with line breaks.

The card shows who it is to and the letter, with one button, **Open in Mail**. It opens the letter wizard with the recipient chosen, the intent set and the letter in "Write It". The address step, paper, ink, seal and "Seal and send" are the wizard's, unchanged. The server has already checked that the person has a verified home (the send's own first rule) and that the wizard's own search would show them this recipient.

### 4.3 `christmas_card`

```json
{ "type": "christmas_card", "valid": true,
  "draft": { "design": { "id": "christmas-2026-16", "caption": "Saved you the good cookies.", "collection": "as-a-kid" },
             "to": { "user_id": "…", "name": "Priya Kumar" },
             "message": "Merry Christmas, Priya! …",
             "arrival": "christmas_morning", "arrival_label": "On Christmas morning" } }
```

`to` is `{ user_id, name }` or `{ email }`. `arrival` is `next_morning`, `sealed_christmas`, `christmas_morning` or, by email, `now`. `message` is up to 300 characters. `arrival_changed`, when present, is a sentence saying the arrival asked for has closed and the card is set to the next morning.

The card shows the picture (the app has every design by its id), the words under it, who it is to, the note and when it arrives, with one button, **Open the card**. It opens the Christmas card screen with all four set, on the step where the person looks the card over. Signing, a photo or voice, stamps and "Seal and send" are that screen's, unchanged. The server has already asked the card's own look (`POST /api/mailbox/cards/preview`'s checks) so the screen will not refuse what the draft holds.

## 5. New lookups (every build)

These answer in words, so every build gets them, store builds included.

| Tool | Reads | Offered while |
|---|---|---|
| `find_around_you` | Today's Around you for the place Today shows: sections, each row's headline, outlet, summary, when it was first seen, reactions, replies and `post_id` | the backend's `AROUND_YOU` switch is on |
| `find_support_trains_nearby` | `GET /api/activities/support-trains/nearby` from the place Today shows | always |
| `list_user_support_trains` | `GET /api/activities/support-trains/me/support-trains`: organizer, co-organizer, recipient, helper, invited | always |
| `get_support_train_summary` | one train: title, kinds of help, household needs, open dates. Someone who is not part of it reads it only when it is listed near them or they were invited. Never the address | always |
| `find_cards` | the Christmas card collections and designs (id and the words under the picture), stamps left, arrivals, the day sending closes | `mailbox` + `holiday_cards` |
| `find_recipients` | `GET /api/mailbox/compose/recipients`, the same list | the build lists `"letter"` or `"christmas_card"` |
| `find_moments` `query` | words in a Moment's caption, card text, place or poster's first name | the person has Moments |

## 6. New link buttons

Two keys join the catalog in `backend/services/ai/appGuide.js`, both already opened by the iPhone and Android routers:

| Screen | URL |
|---|---|
| `christmas_cards` | `pantopus://mailbox/cards` |
| `christmas_card` | `pantopus://mailbox/cards?design=<design id>` |

A build that lists `"link"` but not `"christmas_card"` gets these under an answer that picks a card and suggests a note: the store builds can use them today.

## 7. What each app builds

1. Add the three names to the `cards` list the chat and the history requests send.
2. Draw the three drafts in the app's existing draft-card style (section 4), each with its one button.
3. Let the Moments composer, the letter wizard and the Christmas card screen take the draft's values when they open, with no other change to those screens.
4. The web assistant also needs link buttons (phase 1 section 5) and action cards (phase 1 section 4), which it never got: today it shows only `post`, `support_train` and `pickup_schedule` drafts and `mail_summary`.

## 8. Verification

On the web, the iOS simulator and the Android emulator, against a local backend and database with the live model:

1. "Post a Moment saying the farmers market is packed" gives a `moment` draft; **Open in Moments** opens the text card with the words; Post puts it on the Moments map, and a second account near it sees it.
2. "Write Alex a letter thanking him for the fence quote" gives a `letter` draft; **Open in Mail** opens the wizard at Alex with the letter written; "Seal and send" delivers it, and Alex has it after his next morning round.
3. "Send Priya a Christmas card about cookies for Christmas morning" gives a `christmas_card` draft; **Open the card** shows that picture, Priya, the note and Christmas morning; "Seal and send" puts it in Sent with one stamp used.
4. "What's happening around here?" answers from Around you and names the outlets; the post button opens the row.
5. "Is there a Support Train near me that needs help?" lists what the Support Trains list shows near them.
6. A build without the new names behaves as before: no new draft arrives, and the assistant says where in the app the person does it.

The live question set has these as the `everywhere` group: `node scripts/ai/run-assistant-questions.js --group everywhere`.
