# Plans for the holidays: the build plan

November 15, 2026. What is built so far is in the [README](README.md), under
Status. The founder starts each part of the build; this plan says what starts
when, what waits, who builds what and how each step is checked.
The steps are named in [03-build-contract.md](03-build-contract.md), section 1.

## 1. Two tracks

| Track | Steps | Waits on |
| --- | --- | --- |
| People | H1 answers without an account, H2 the bring list, H3 occasions | Nothing. It starts when the founder says go |
| Businesses | B0 the shared pieces, B1 deals without money, B2 to B4 paying to join, B5 and B6 the bill and tips | See section 3 |

The people track is what serves the holidays, and it has no money, law or tax in
it.

## 2. The people track

Three build sessions on Opus 5.5 at Extra High, each in its own worktree and
branch from `origin/dev`, each owning one area. Briefs:
[05-session-briefs.md](05-session-briefs.md).

| Session | Area | Builds |
| --- | --- | --- |
| Server and web | `backend/`, `supabase/migrations/`, `frontend/apps/web/` | H1, then H2, then H3: the migrations, routes, emails, notices, and the plan's web page |
| iPhone | `frontend/apps/ios/` | H1, H2, H3 on the phone, each after its server part is on `dev` |
| Android | `frontend/apps/android/` | The same |

Order:

1. **H1 server and web.** One PR for the data and the routes, one for the web
   page. When they are on `dev`, staging has them.
2. **H1 on iPhone and Android**, in parallel, against the server on `dev`.
3. **H2**, server and web first, then both apps.
4. **H3**, the same way.

The app sessions start once H1's server PR is merged, so they build against real
answers. While they wait they read the contract and the boards and set up their
rigs.

**What reaches people without a store release.** H1's server and web. The
shipped apps already send email and text invitations; once the web page takes
answers, a guest can answer one in a browser with no account. The open link, the
counts, Kids welcome, the bring list and occasions need new store builds.

## 3. The business track and its gates

**Changed on November 16.** The founder said to keep every session working
until everything discussed and designed is built and verified, without asking
before each piece. The business track is therefore being built now, in the
order B0 to B6 ([briefs 5 to 7](05-session-briefs.md)). The gates in the table
below no longer hold the build: they hold switching a step on. Every step is
built behind a switch that stays off, and turning one on for real people or
real money stays the founder's, after the gate beside it.

One risk is accepted with this: the accountant's answer on Washington sales
tax, or the lawyer's read, may change the bill at the place after it is built.

### The gates

| Step | Gate | Who clears it |
| --- | --- | --- |
| B0 the shared pieces | The business graph's contract (docs PR 3965) is the plan of record for them; it is approved and unbuilt | The founder says go; its own session builds them as that contract's phase A |
| B1 deals without money | `plans_business` plans exist only behind a switch that is off; a deal needs a business plan to sit on | The founder turns `plans_business` on for testers |
| B2 to B4 paying to join | The by-hand trial (decision P16): two or three local businesses each run one paid plan and take the money their usual way. The lawyer's read of the new terms. A re-read of both stores' payment rules | The founder |
| B5, B6 the bill and tips | The accountant's answer on Washington sales tax | The founder |
| Any paid step in production | A real payment end to end with a real business, on staging first | The founder |

B1 has no money in it and can follow the people track with the same three
sessions, or run beside it with three more. B2 onward gets its own briefs when
its gate opens; the contract's sections 10 and 11 and
[02-payments.md](02-payments.md) are what those briefs will rest on.

## 4. Rules every session follows

From `AGENTS.md`, restated because a build session reads this first.

- Branch from `origin/dev`. Open every PR with `--base dev`. Never merge or push
  to master. Only the founder promotes staging to production.
- Small PRs. Merge your own PR after green CI and a real-app check.
- Change what exists. Before adding a file, screen, service or column, find the
  existing one. No new table.
- Migrations are additive. Never edit an applied migration. Check the newest
  migration version on `origin/dev` right before the last CI run; another
  session may have taken yours.
- Verify in the real apps: the web in a browser, iPhone in a simulator, Android
  in an emulator, against a local stack and backend. Check after a relaunch, and
  check the other person's view. Name what you could not verify.
- No new unit tests. Update or remove a test an intended change breaks.
- Stay in your area. Ask the owning session, through the founder, for a change
  in another.
- No credentials, env files or real people's data in Git, PRs, screenshots or
  chat. Test people are `@example.com`.
- No word "neighbor" in new Plans copy. Keep the side menu button on the Plans
  tab. Keep the tab bar as it is.
- Every switch starts off. A staging app build that carries a feature also gets
  its staging switch on.
- Before starting, look for a session or an open PR already doing the same work.

## 5. How each step is checked

The "Done when" lists in the contract, section 16, are the bar. In short:

| Step | The check that matters most |
| --- | --- |
| H1 | A browser with no account answers a private dinner at a home; the address shows only after the host's yes and only through the guest's own emailed link; an old app build still works |
| H2 | Two people claim one item at once and one wins; a browser guest claims |
| H3 | The strip follows the season; an older build opens an occasion's plan as its kind |
| B1 | A group deal unlocks, and falls short, on the tick, each notice once |
| B2 to B6 | The four worked examples come out to the cent |

## 6. The founder's steps

- [ ] Say go for the people track.
- [ ] Look at H1 on staging: invite your own email address from a plan, answer
      in a browser, and check the email arrives and shows the address only
      after you let yourself in.
- [ ] Turn `plans_guest_answers` on in production when staging looks right
      (then `plans_bring_list`, `plans_occasions` as each lands).
- [ ] Cut store builds when the app parts are on master.
- [ ] For the business track: say go for the shared pieces; turn
      `plans_business` on for testers; run the by-hand trial; send the terms to
      a lawyer and the sales-tax question to an accountant.

## 7. The extras

Find a date, chip in, gift exchange, photos afterwards, the same people again,
and one person paying for a group were drawn and written up on November 16 and
are being built: [08-extras.md](08-extras.md) holds their design, contract,
screens and "Done when", and its section 8 the order and who builds what
([brief 8](05-session-briefs.md)). None adds a table.

Still later, and needing the founder's word: a named group kept between plans,
which would need a new table.
