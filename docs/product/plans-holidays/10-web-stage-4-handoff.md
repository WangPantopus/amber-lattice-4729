# Web Plans handoff for stage 4

November 21, 2026, Pacific. Stages 1–3 are merged into `dev`. Stage 4 stopped after comparing source on [`161988a569`](https://github.com/WangPantopus/skinny-pantopus/commit/161988a5696c68e1c3beff87cc12183e24e7c7d5). This handoff is the only stage 4 change. The four hosted staging journeys below are open. Fetch the current `origin/dev` before resuming.

## Original Plans documents

| Start here | What to use it for |
| --- | --- |
| [Founder's original Nearby Plans design](https://claude.ai/artifact/4jx9jf3JARyLTWWaaW84NG) and [decisions recorded in the repo](../../../NEXT_STEPS.md#nearby-plans-added-october-13) | The core host, request, approval, map, meeting-details and chat experience. |
| [Design](01-design.md), [people's screens](06-screens.md), [business screens](07-screens-business.md) and [all 31 screen boards](screens/) | Original copy, screen states and layouts. The boards are in Git and travel with a clone. |
| [Payments](02-payments.md) and [build contract](03-build-contract.md) | Booking and bill are separate payments. Use the server's eligibility, quotes, tips, refund rules and receipt amounts. |
| [Extras](08-extras.md), [original build plan](04-build-plan.md), [session briefs](05-session-briefs.md) and [November 16 handoff](09-handoff.md) | Design and acceptance criteria for the original mobile, server and public-share work. |
| [Earlier business proposal, PR #3964](https://github.com/WangPantopus/skinny-pantopus/pull/3964/files) | Historical design on a separate docs branch. The later payments document contains the founder's payment decisions. |

## What shipped and what was tested

| Stage on `dev` | Delivered | Verification recorded in the PR |
| --- | --- | --- |
| [1 · Free Plans and Pulse maps · #4597](https://github.com/WangPantopus/skinny-pantopus/pull/4597) · `211e4a504` | Flagged signed-in Plans tab, nearby and personal lists, free hosting, requests, approval, meeting details, leave and chat. Discovery and meeting-point selection use Pulse's Mapbox Standard renderer with the shared Streets tile fallback. | Chrome and the native iPhone simulator against local services. Both directions passed, including pending privacy, approval, two-way chat, reload and relaunch. Flag-off navigation and map fallbacks were exercised. |
| [2 · Free types, invitations and date polls · #4599](https://github.com/WangPantopus/skinny-pantopus/pull/4599) · `f0e1edc06` | All nine personal kinds, eligible public/home/online locations, invitations and links, RSVPs, headcounts, editing, cancellation, repeat rules and date polls. | Local web and iPhone hosts each completed a private poll with the other client. The PR also records approval, reconfirmation, cancellation and chat. **Hosted staging** was used for the separate signed-in map comparison. Both Plans and Pulse loaded Mapbox Standard styles and tiles successfully. |
| [3 · Business Plans and payments · #4603](https://github.com/WangPantopus/skinny-pantopus/pull/4603) · `014afef23` | Business hosting and scheduling, admission, deals, paid spots and group bookings, shareable prepaid spots, checks, tips, receipts and partial/full refunds. iPhone hosts can open guest checks from the roster. | Chrome and a native iPhone simulator, an isolated local backend/database, synthetic accounts and **Stripe test mode**. The web-hosted $18 booking was refunded on leave. The iPhone guest paid $28.80 on a $24 check and saw a $7 partial refund. In reverse, the web guest paid a $15 booking and a $20 check with a $3 tip. Web saw the $23 check refund and cancellation returned the $15 booking. Decline/retry, unused spots and an after-plan tip were also exercised. |

## Where to resume the iPhone comparison

The signed-in tab lives at `/app/plans`. The public invitation and booking page lives at `/plans/:id` and already implements several guest interactions. Test each from its normal entry point. The shared client already requests `biz=1`, `guests=1`, `more=1` and `extras=1`. Feature flags and the server's viewer-specific response determine what a person can see. [Signed-in screens](<../../../frontend/apps/web/src/app/(site)/(app)/app/plans>) · [Web Plans components](../../../frontend/apps/web/src/components/plans) · [Public guest page](<../../../frontend/apps/web/src/app/(site)/plans/[id]/GuestAnswer.tsx>) · [Shared API client](../../../frontend/packages/api/src/endpoints/plans.ts)

| Area | iPhone behavior to carry over or check | Existing implementation to start from |
| --- | --- | --- |
| Private bring lists | The host sets up and edits the list. People who are in can claim and give back items and, when allowed, add their own. Preserve item IDs and existing claims on edit. | `PlanComposerPrivate`, `PlanBringCards`, `PlanBringEditor`, public web `BringList`, and `planBring.js`. |
| Chip in and gift exchanges | Add host setup and editing. Show the host's external payment link and the self/host “paid” marks. Let participants join the gift exchange, change a wish and see their own draw. Support the host's draw controls. | Public web `ChipInCard` and `GiftCard`, iPhone `PlanChipInCard` and `PlanGiftCard`, and the authenticated chip-in and gift routes. Chip-in involves an external payment service. Business checkout is a separate flow. |
| Photos after a private plan | Show the album to eligible past participants. Add and remove photos according to server permissions and refresh expiring private image URLs. The server supplies the album when configured. | `PlanPhotosCard`, public web `PhotosCard`, and `planPhotos.js`. Public guests already have a viewing experience. |
| Hosting again and occasions | Surface seasonal occasion presets with their defaults. From an eligible ended plan, prefill a new plan and open its past-people picker after posting. The host chooses when to send. | `PlanOccasions`, `PlanSamePeopleFooter`, `/api/plans/occasions`, and web `PlanInvitations`. Web already lists past people in the invite flow. |
| Discovery and host preview | Compare upcoming watch-party games, team preferences, public place suggestions and the preview before publishing. Web currently accepts a manual game label and offers nearby places and a map picker. The signed-in detail request sends a device fix when available. The nearby list sends the browse point. Check location eligibility when browsing away from the device. | iPhone `Map`, `Teams`, `PlanPlaceSuggestions` and `PlanPreviewAndPosted`. Reuse the games, teams and places endpoints and the existing Pulse map components. |
| Plan details and business follow-through | Compare calendar export, “On my way” and the roster, post-plan feedback, report/block actions, business deal preview and the payment-help action. Match the roles and timing on iPhone. Follow the linked Today and chat entry points where they affect the Plans journey. | `PlanGoingAndHosting`, `PlansTodayCards`, `PlanAfterCard`, `PlanScreenViewModel`, `PlanCheckPaidView`, and the existing public web calendar download. Check each action on current `dev` before adding it. |

Use the running iPhone app to finish the inventory. The table records a source comparison. The server already owns these flows. [iPhone Plans](../../../frontend/apps/ios/Pantopus/Features/Plans) · [Native endpoints](../../../frontend/apps/ios/Pantopus/Core/Networking/Endpoints) · [Server routes](../../../backend/routes/plans.js) · [Plans services](../../../backend/services/plans)

## Hosted staging checks to run

Use two confirmed synthetic staging identities. One can manage an eligible verified business with a location and test payments enabled. The other is an independent guest. They can swap devices for the reverse direction. The new Mac will need its own staging sign-ins. Have the founder sign in or provide access privately if needed. Use only synthetic recipients. The founder handles hosted account, flag and payout configuration.

Start at [staging web Plans](https://staging.pantopus.com/app/plans). On the new Mac, generate the iPhone project with `xcodegen generate` in `frontend/apps/ios`, select the **Pantopus (Staging)** scheme and run it on an iPhone simulator. Its checked-in configuration points at `staging-api.pantopus.com`. Verify that the changes under test have deployed to staging. Confirm Stripe test mode for each paid run before submitting a test card. Record the tested builds, roles, pass or failure, and redacted amounts. [iOS project](../../../frontend/apps/ios/project.yml) · [Staging configuration](../../../frontend/apps/ios/Config/Pantopus.Staging.xcconfig)

### Free plan hosted on web, joined on iPhone

Host an approval-required personal plan on web. Request it on iPhone. Check the guest's pending view, approve on web, then check the guest's meeting details and chat. Exchange a message each way. Reload web and relaunch iPhone to verify the same roster and conversation.

### Free plan hosted on iPhone, joined on web

Reverse the roles. Verify private details stay hidden while the web request is pending, then appear after iPhone approval. Exercise an invitation or date poll, reconfirm after an edit, and verify leave or cancellation on both clients. Include a private extra changed in stage 4.

### Paid plan hosted on web, booked on iPhone

Schedule the business plan on web. Book it in iPhone checkout with a Stripe test card. Compare the quoted and captured amounts and the host's roster. Send a check from web, tip on iPhone, issue a partial refund and verify the guest receipt. Leave an eligible booking within the refund window and verify the separate booking refund.

### Paid plan hosted on iPhone, booked on web

Schedule on iPhone, book on web and send the check from iPhone. Use a custom test tip on web, refund the check on iPhone and cancel the booking. Reopen both clients and reconcile the guest receipt, booking refund and host totals. If staging lacks an eligible host, flag or test payment configuration, record exactly which check is blocked.

## Prompt for the next Mac

```text
Resume Pantopus web Plans stage 4 in WangPantopus/skinny-pantopus. Fetch the latest origin/dev, check the worktree and open PRs, and branch from current dev. Read AGENTS.md, NEXT_STEPS.md and docs/product/plans-holidays/10-web-stage-4-handoff.md. It links the original specs and 31 boards, the three merged PRs, the code and the outstanding checks.

Compare the signed-in /app/plans tab with the running native iPhone Plans tab. Confirm the listed gaps on current dev and implement the missing behavior using the existing components, endpoints, permissions, flags and Pulse map. Preserve the public share and booking flows. Run the affected apps locally and the relevant existing checks.

Test free and paid Plans on hosted staging with two synthetic identities. For each, host on web and join or book on iPhone, then host on iPhone and join or book on web. Check approval, meeting privacy, chat and persistence. Check scheduling, tips, receipts and refunds with Stripe test payments only. If staging access or test-mode setup is missing, continue independent work and identify the specific prerequisite. Report each of the four journeys separately, including anything still unverified. Commit and push the work, open PRs against dev and follow the repository's staging-first merge rules.
```
