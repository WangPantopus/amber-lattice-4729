# Fix briefs for next week

Written November 23, 2026 against `origin/dev`. Each brief says where the problem is, the likely
cause, the smallest fix and how to prove it, so a build session can start without searching.
Re-check `origin/dev` before starting; code moves.

## 1. iPhone: the Moments map sometimes opens bare

**What people see.** Moments stays on the globe with no chips, no location button and no card. Two
groups can hit it:
- someone with no home who hasn't allowed location (the founder's staging app, every launch);
- someone with a home who hasn't allowed location. This is likely, but it wasn't run on a store
  build.

**Workaround people have today:** tap the area pill, then "Near you", then allow location.

**Where**
- `frontend/apps/ios/Pantopus/Features/Moments/Map/MomentsMapViewModel.swift`:
  - an `@Observable @MainActor` class;
  - `phase` at line 98;
  - `start()` at line 195.
- `MomentsMapView.swift:116` calls `.task { await viewModel.start() }`.
- The "See Moments near you / Use my location" card is drawn for `.needsLocation` in
  `MomentsMapChrome.swift:128` and `MomentsMapChromeOpen.swift:49`.

**Likely cause** (diagnosed Nov 22, not yet proven by a fix)
- When the home list is already in the store and location isn't allowed, `start()` never really
  waits.
- So `phase` changes from `.locating` to `.needsLocation` in the same pass in which the screen
  first appears, and SwiftUI sometimes drops that redraw.
- **The model is right; the view is stale.** Switching the simulator to dark mode makes the card
  appear at once.
- In an optimized (Release) build this happens in about 1 launch in 10. The Debug build showed the
  card every time.
- The map code is unchanged since 2.1.4, so this isn't a recent regression.

**Smallest fix**
- Let the first pass finish before `start()` changes `phase`: move the phase change to the next
  turn of the main run loop on the paths that don't wait. That's the two `phase = .needsLocation`
  branches and the immediate `use(homeCenter, source: .home)` branch.
- A bare `await Task.yield()` may not be enough; prove whichever you choose.
- Don't change the flow, the copy or when the app asks for location: it still never asks by
  itself.

**How to prove it**
1. Build a Release build: `build-ios-e2eall.sh <worktree> <port> <SID> --release`, launched with
   `SIMCTL_CHILD_PANTOPUS_API_ENV=local`.
2. Use an account with no home and location not allowed.
3. Do 40 or more launches with 0 bare maps (the baseline is about 4 in 40).
4. Repeat with an account that has a home and location not allowed: the map should open on the
   home with its chips.
5. A bare-looking screen that fixes itself on a dark-mode switch is still the bug.

## 2. Web: plan chat shows app notices as the host's messages

**What people see.** In a plan's chat on the web, lines the app writes appear as chat bubbles under
the host's name, with a time, as if the host typed them. The host's next real message then has no
name above it. iPhone and Android already draw these as centered lines.

**Where**
- **Server.** `backend/services/plans/planChat.js:114` inserts these lines with `type: 'system'`
  and the host's `user_id`. That's correct and can stay.
- **Web list.** `frontend/apps/web/src/components/chat/ChatMessageList.tsx`, about lines 330–352:
  - every row becomes a `ChatMessageBubble`;
  - `showSender` compares `senderId !== previousSenderId`, so a system row counts as the host's.
- `ChatMessageBubble.tsx` has no handling for system rows. Four changes to the chat folder since
  Nov 6 didn't touch this.

**Intended look and rule** (copy these)
- **iPhone:** `.systemLine` in
  `frontend/apps/ios/Pantopus/Features/Chat/Conversation/ChatConversationContent.swift:695`, drawn
  like a day divider.
- **Android:** `GROUP_BREAKING_TYPES = setOf("system", "broadcast_reference")` in
  `.../inbox/conversation/ChatConversationViewModel.kt:4918`. A row of those types breaks sender
  grouping.

**Smallest fix (web only)**
- In the row render, draw `type === 'system'` rows as a centered line (reuse `ChatDateSeparator`'s
  look or the existing `renderTopicDivider` slot). They get no sender name, no bubble and no
  hover menu: no react, reply, edit or delete.
- Treat `system` and `broadcast_reference` rows as group breaks, so the message after one shows
  its sender's name.

**How to prove it**
1. Set up a local backend and a plan with a host and a guest. Create the app's lines by joining
   and answering the plan.
2. Open the plan chat on the web as both the guest and the host:
   - the lines are centered and have no host name;
   - the host's next message shows the host's name;
   - the lines have no hover menu.
3. Reload and check again.
4. Open one ordinary group chat that has system rows and check it reads the same way.
5. Keep the kit screenshot `streams/SYSGROUP/shots/50-...png` out of PRs: it shows a test
   account's email.

## 3. Plans: the sports card's × should follow the account

Added Nov 23 at the founder's request.

**What people see.** Tapping × on the Plans card "Watch games with people nearby?" hides the card
only on that phone. It comes back after a delete and reinstall, and it still shows on the person's
other phone, for anyone who never chose teams or tapped "Not into sports". The × also applies to
the phone, not the account: anyone else who signs in on that phone won't see the card.

**Where**
- **iPhone.** `frontend/apps/ios/Pantopus/Features/Plans/Map/PlansEmptyAndLocation.swift`:
  - line 21: `@AppStorage("plans.sports.askDismissed")`;
  - line 91: the card shows when `viewModel.sports?.state == "unset"` and the card hasn't been
    dismissed;
  - line 114: the × button.
- **Android.** `.../ui/screens/plans/teams/PlanSportsControls.kt:78–79`: SharedPreferences
  `plans.sports` / `askDismissed`. Android backup is off (`allowBackup="false"`).
- **Web.** `frontend/apps/web/src/components/plans/PlanSports.tsx` has no ×, so there's nothing to
  change unless the build finds a card that asks.
- **Server.**
  - The choices live in `UserFeedPreference.sports`, a jsonb column (migration
    `20261025170000`), so a new field needs no migration.
  - They're read and saved by `GET`/`PUT /api/posts/feed-preferences` (`backend/routes/posts.js`,
    around lines 2899 and 2927).
  - `backend/services/plans/planGames.js:135` turns them into `state` (`off` / `on` / `unset`).

**Smallest fix**
- **Server:** store the × on the account as one more field in `sports`, such as
  `ask_dismissed_at`. Make the `PUT` handler accept and keep it, and return it with the
  preferences.
  - Dismissing is not "Not into sports". `state` stays `unset`, and games stay hidden in the sheet
    as they are today. The card just stops asking.
- **Apps:** read the server field first. On ×, save it through the same save the teams sheet uses.
  Keep the local flag as a fallback when the save fails.
- **Old store apps** keep their local behavior, which is harmless.
- Don't change the card's wording, its buttons, or when it shows in any other case.

**How to prove it** (local backend, an account with no sports choice)
1. **Dismiss, then reinstall.** On iPhone, tap ×, delete the app, reinstall and sign in: the card
   stays gone. Do the same on Android.
2. **Per account.** A second account on the same phone still sees the card.
3. **Nothing else changes.** "Choose teams" and "Not into sports" behave as before, and every
   change survives a relaunch.

## 4. Christmas cards: a reply from someone with no name says "From Pantopus"

Added Nov 23 from a real reply the founder saw.

**What people see.** Someone joins from a card and writes back. The sender's card table shows the
note signed "FROM Pantopus". The sender's mail shows the reply as from "Pantopus member".

**Who has no name.** People who join from a card link have no name on their account. The founder
saw every one of them with only an email and a server-made `user_…` username.

**Why it says Pantopus**
1. The reply route stores the replier's name as `sender_display` (`backend/routes/mailbox.js`,
   about line 3304):
   - it takes `loadChatPeople` → `displayNameFromUser` (`backend/utils/identityProfiles.js:146`);
   - for a person with no name and a made-up username, that returns `'Pantopus member'`.
2. The card table builds `from_name` the same way (`mailbox.js:3837`), so past replies read the same
   on every open.
3. The iPhone prints the first word: `CardTableJoinedPage.swift:104` →
   `HolidayCardWords.firstName("Pantopus member")` = "Pantopus". Android and web likely do the same;
   not checked.

**What we already know.** The replier is the card's recipient, and the card keeps the name the
sender typed for them: `to_name` (`backend/services/holidayCards.js:632`, `:739`). That name is
shown only back to the person who typed it.

**Fix 1 (server only; reaches the store apps at once, no flow change)**
- **Where it applies:** card replies and the card table, for a replier with no name of their own
  (no display name, name, first name or chosen username).
- **What changes:** use the original card's `to_name` for `from_name` and `sender_display`, and in
  the "wrote back" notices. Read-time `from_name` fixes past replies too.
- **No `to_name`:** keep "Someone".
- **Never** show "Pantopus member" or "Pantopus" as a person on a card.

**Fix 2 (asks the person; approved by the founder on Nov 23: "Yes, ask them")**

Build it together with Fix 1. Keep the step short: one field, prefilled, easy to accept.
- **New accounts:** when an account is made from a card link, prefill a "Your name" field with the
  card's `to_name` and save what they confirm.
- **Existing accounts:** give people with no name a one-time prompt, such as "Add your name so
  people know it's you". It could reuse the guidance cards.

**How to prove it** (local backend)
1. Send a card to an email address, join from it with no name, and write back.
2. On the sender's iPhone, Android and web, the card table and the mail show the name the sender
   typed. Check again after a reload or relaunch.
3. A replier who has a name still shows their own name.
4. The reply's notices name them too.

## 5. Support Train: already done, no brief needed

The review's findings were fixed: 12 PRs merged into dev by Nov 18, 5:05 AM PT, plus the side-menu
rows on both phones. They reached production with the Nov 22 promotion. My earlier
"diagnosed but not started" was wrong.

## Other small problems already on your list (from Nov 6–7, not re-checked)

These are from NEXT_STEPS section 0. Each is a small change. Check that it's still open before
building.

- **Android: a create can happen twice.** The HTTP client re-sends a POST when a pooled connection
  drops after sending it, so a create without a client request id can be made twice. Access codes
  have been handled since #3328. This one has the most impact: duplicate posts, plans or requests.
- **Notification settings lose a change.** Leaving Notifications within 600 ms of changing a row
  other than Push loses the change. Reproduced on Android; iOS has the same timer.
- **Business hours shows a raw error.** Adding a day to a week that already has 7 rows shows the
  raw message "hours must contain less than or equal to 7 items". Nothing is lost.
- **Notification wording, recipients and delivery.** There are several small items, such as a home
  invite always saying "as a household member" and business landlords never hearing about tenant
  requests. The full list is under "Smaller problems found and not fixed" in section 0.
