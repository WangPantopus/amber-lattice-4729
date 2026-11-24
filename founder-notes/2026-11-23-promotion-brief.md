# Promotion brief: staging → production

Checked November 23, 2026 against `origin/dev`, `origin/master` and the 2.1.5 release tags.

## The short version

- **Only two changes are on staging and not in production**, both home verification work:
  [#4660](https://github.com/WangPantopus/skinny-pantopus/pull/4660) and
  [#4668](https://github.com/WangPantopus/skinny-pantopus/pull/4668). Earlier I said 18 PRs. That
  count was wrong: 11 of them were property and address work that already reached production
  through master, and 5 were master → dev syncs.
- **Total change:** 117 files (web 28, iPhone 31, Android 28, server 30) and **2 database changes**,
  both additive.
- **No new production switches or keys.**
- **The store apps people have (2.1.5) won't crash** from what I read. Three intended behavior
  changes are listed below.
- The last promotion was Nov 22, 10:37 AM PT ([#4655](https://github.com/WangPantopus/skinny-pantopus/pull/4655)).
  CI on dev is green, and staging runs dev's head.

## What it brings, in plain words

1. **Home verification journeys** ([#4660](https://github.com/WangPantopus/skinny-pantopus/pull/4660))
   - Someone with an open home claim can follow it and send the proof you asked for.
   - **Claims leave the account once decided.** When a claim is approved, rejected, expired or
     merged, it leaves the person's account and its documents stop opening in the apps. The
     private record and the original upload stay with the claim.
   - **Rental management.** Verified owners can turn it on and approve a manager, including a
     business. Tenants whose landlord isn't on Pantopus can use a document instead.
   - **Vouched co-owners** now go into the reviewer queue.
   - **Database:** a new column and functions for rental authority, and closing evidence access
     after a decision. Both migrations say "backwards compatible" and only extend existing tables
     and functions.
2. **Offer only verification steps that can work** ([#4668](https://github.com/WangPantopus/skinny-pantopus/pull/4668))
   - The claim checklist offers a postcard only when postcards can actually be sent. Otherwise
     it offers documents.
   - During a manual identity review, it shows the remaining document step instead of asking the
     person to confirm their identity again.

The web and server parts go live when you promote. Phones get the new screens with the next store
builds.

## Will it hurt the 2.1.5 store apps?

I read every changed server file against what the 2.1.5 iPhone and Android apps call. No endpoint
was removed and no reply field was removed. The changes only add a field (`mail_available`) and two
new rental-setup endpoints. Things 2.1.5 users will notice:

1. **A decided claim disappears** from their claims and from that home's screen. A rejected
   claimant no longer sees the "rejected" message on the home's screen: 2.1.5 reads that state,
   and the server stops sending it. Make sure a rejected person still hears about it another way,
   such as a notice or email. I didn't check that.
2. **Documents and lease files of a decided claim stop opening.** The migration does this on
   purpose, "including on old app versions".
3. **The postcard option disappears where postcards can't be sent.** The server's own explanation
   shows instead, and 2.1.5 displays the server's message.
   - Your checklist still lists the mail vendor key in production as open since October 9. If
     that's still true, production stops offering postcards entirely after this promotion.
   - That's the fix: today it offers postcards that can't be sent.
   - I haven't checked production's settings.

One more removal has no effect: the server drops the "name on the bill" field from bill uploads,
and 2.1.5 never sends it.

## Before you promote: about 10 minutes on staging

Use two test accounts on the staging website. Phones would need staging builds made from dev.

1. **Claim and upload.** Start a claim on a home. Check that the verification screen offers
   methods. Upload a document, reload, and check the claim still shows as open.
2. **Decide it.** In admin, reject (or approve) that claim. It should disappear from the claimant's
   homes and from the home's screen, and its document should no longer open.
3. **Rental management.** As a verified owner, open rental management and approve a manager.
4. **Tenant without a landlord.** As a tenant on a home with no verified landlord, check that
   you're offered document verification.

## Steps that go with it

- **Promote** as usual: one dev → master PR, merged as a merge commit. The two database changes go
  with it.
- **Production settings:** nothing new.
- **Afterward:** store builds bring the new verification screens to phones.

## Not checked

- **Running 2.1.5 against staging.** I didn't run the 2.1.5 apps against staging's server; the
  old-app check above comes from reading code. The OLDAPP214 kit can do a real run in a session.
- **Hosted settings.** I didn't read staging's or production's settings, including the postcard
  vendor and the address keys.
