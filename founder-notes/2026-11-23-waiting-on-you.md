# Everything waiting on you

Checked November 23, 2026 against NEXT_STEPS, the production checklist
(`docs/release/prod-config-checklist.md`), git and my notes. "Not recorded" means neither file
marks it done, and I couldn't check the hosted setting myself.

## Do first

1. **Make adding a home work on staging and production.**
   - **The problem:** your checklist has had the production address keys (Lob, Smarty, Google
     Address Validation) open since October 9. Without them a new address can't be checked, so a
     new person can't add a home unless their address is already cached. The Smarty key also
     answers "Active subscription required".
   - **The cheap way out is already in the code:** `ADDRESS_POSTAL_PROVIDER=google` uses the
     Google key alone.
   - **Staging needs it before the ten-person test.**
   - Not checked: whether either server already has it.
2. **Promote dev → master** after the 10-minute staging check in the promotion brief.
3. **Release 2.1.5.** The iPhone App Store still showed 2.1.4 (released Nov 18) on Nov 23. Both
   the iPhone and Android 2.1.5 builds carry Today
   first, pickup day, the two journeys, the house on Today, card shelves and the travelling card
   (checked against the release tags). That covers every "store builds" step for those features.

## Production switches (try each on staging first)

None of these is recorded as on in production. Around you is (since Nov 14).

- **The house on Today:** `TODAY_HOUSE=1`, after the ten-person test.
- **The dinner journey:** turn the bring list (`plans_bring_list`) on in staging, where it was off
  when last recorded on Nov 17. Then turn on both dinner switches in production.
- **Travelling card:** add `card_travel` to production's `LAUNCH_FEATURES` and redeploy.
- **Card shelves:** add `card_shelves` to `LAUNCH_FEATURES` and redeploy.
- **Card films:** upload the 16 share films and the 67 card videos to each server's storage, then
  turn on `card_share_video`. The upload script is `scripts/deploy/upload-card-videos.sh`.

## The ten-person test

Five first-time people per journey, on staging. Request 7 decides whether the parked "three doors"
come back. The requests are in `~/pantopus-journeys/SPEC.md`, section 5. Adding a home has to work
on staging first (item 1).

## Money

- **Real money check (open since Oct 26).** Verify one real card payment, a refund, a delayed crew
  transfer and a bank payout. No real money has moved yet.
- **Stripe fee, a one-minute look.** In the live Stripe dashboard, open a recent card payment: does
  "Fee" show about 2.9% + 30¢, or $0?
- **Stripe Identity for claims, live.** Not recorded as done. You need:
  - the Identity application and branding
  - a live restricted key in `STRIPE_IDENTITY_SECRET_KEY` on production
  - a live webhook in `STRIPE_IDENTITY_WEBHOOK_SECRET` on production

  Until then, the admin "I confirmed this person's identity" switch works.
- **Before any paid Plans step for real people:** the by-hand trial with 2–3 local businesses and
  the lawyer review (Plans holidays build plan, section 3).
- **Creator codes:** give each creator a code on pantopus.com/app/admin/creators. Your admin
  account needs the admin role.

## Security and privacy

- **ARTEX 3.1, sign-in codes:** set length 8 and life 600 s in Supabase, but only after the apps'
  code boxes accept 8 digits.
- **ARTEX 3.2, 3.9 and 3.10:** 3.2 is the AWS second sign-in step. The report is
  `~/pantopus-security/ARTEX-ASSESSMENT-2026-11-17.md`. The code fixes (3.3–3.8) reached production
  with the Nov 22 promotion.
- **Card photos and videos are in a public bucket.** Production keeps them in a public storage
  bucket; they need a private one. That takes a build plus your storage change.
- **Before AI phase 1 ships:** the privacy policy and data inventory should name AI processing and
  Anthropic as a processor. Also confirm the Anthropic account's data-retention setting.
- **Faster home verification:**
  - Twilio (Verify + Lookup) keys on staging and production.
  - Apple App Attest and Google Play Integrity, before the location check goes live.

## Production upkeep

- **Deploy the seeder** so [#3554](https://github.com/WangPantopus/skinny-pantopus/pull/3554) runs:
  `sam deploy --config-env prod` from `pantopus-seeder/deploy`. Open since early November.
- **Speed.** Production's server calls with the secret key are served one at a time: 34 ms each,
  about 40 per second for the whole backend. Direct database calls take 2 ms. The plan is written
  and waits on you.

## Decisions, with my pick

| Waiting | My pick |
|---|---|
| Home record free for the confirmed owner (plan + canvas, no build) | Build it next: it's the strongest reason to verify a home. |
| The production speed plan above | Yes: the biggest measured speed win, with no flow changes. |
| Private bucket for card photos and videos | Yes, before more family photos go in. |
| Value estimate visible to household members (left from the county-record fix) | Owners only. |
| Three Pulse repost choices made while building (e.g. reposts reach only the reposter's connections) | Keep as built: they're the privacy-safe choices. |
| Plans: find a time together and keep a group between plans (needs a new table) | Not now; wait for the ten-person test. |
| The Sky (16 decisions in its design doc) | After the ten-person test: it changes what Pantopus is. |
| Moments ad + how-to treatment | OK it, using real-app footage like the other films. |
| Today films: 7 findings on the final check sheet | Review the sheet and fix all 7 in one pass. |
| Three doors (parked) | Let request 7 of the ten-person test decide, as planned. |
| Profile About line "Neighbors marked … helpful" (Helpful is gone) | Reword without "Neighbors", e.g. "People reacted to Rowan's posts 12 times". |
| Creator network and Places order | NEXT_STEPS says decide in late November with the pilot's week-four number. I don't have that number. |

## Probably stale: check these off

- **"Vercel's build rate limit fails most master deploys":** the latest master and dev deploys both
  succeeded.
- **"Promote dev to master" for the travelling card, card shelves and the two journeys:** done
  Nov 22 ([#4655](https://github.com/WangPantopus/skinny-pantopus/pull/4655)).
- **"Store builds" for those same features and Today first:** 2.1.5 carries them. Check these off
  once 2.1.5 is out; the App Store still showed 2.1.4 on Nov 23.
- **Phone checks written for TestFlight 2.0.12 (early November):** redo them on 2.1.5, or drop them.
