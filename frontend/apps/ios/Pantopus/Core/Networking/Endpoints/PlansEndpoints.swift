//
//  PlansEndpoints.swift
//  Pantopus
//
//  Nearby Plans: every `/api/plans` route, the `plans` layer of the map
//  route and the two feature flags (Plans build brief, section 5; the
//  contract and its changes live in the Plans coordination folder's
//  CONTRACT.md). Every Plans route is signed in and answers 404 while the
//  `plans` flag is off for the viewer. Errors are
//  `{ error: <code>, message: <sentence for people> }`.
//
//  Route: backend/routes/plans.js (mounted at `/api/plans`), and the
//  `plans` layer of `GET /api/posts/map` in backend/routes/posts.js.
//

import Foundation

/// The time windows the map and the list filter by.
public enum PlansWindow: String, Sendable, CaseIterable {
    case now, today, week, weekend
}

/// A device fix under 5 minutes old: it counts as a location for asking
/// (`can_ask`); homes and saved places always count.
public struct PlansGPS: Sendable, Hashable {
    public let latitude: Double
    public let longitude: Double
    public let timestamp: Date

    public init(latitude: Double, longitude: Double, timestamp: Date) {
        self.latitude = latitude
        self.longitude = longitude
        self.timestamp = timestamp
    }

    /// Rounded to the minute so store keys stay stable between reads.
    var query: [String: String] {
        let minute = Date(timeIntervalSince1970: (timestamp.timeIntervalSince1970 / 60).rounded(.down) * 60)
        return [
            "gps_latitude": String(latitude),
            "gps_longitude": String(longitude),
            "gps_timestamp": PlanTime.string(minute)
        ]
    }
}

/// The map's visible box, for the pins read.
public struct PlansViewport: Sendable, Hashable {
    public let south: Double
    public let west: Double
    public let north: Double
    public let east: Double

    public init(south: Double, west: Double, north: Double, east: Double) {
        self.south = south
        self.west = west
        self.north = north
        self.east = east
    }
}

public enum PlansEndpoints {
    static let base = "/api/plans"

    /// Plans with businesses (contract section 5.1): every request under
    /// `/api/plans`, the map's plans layer and a business page's plans say this
    /// build can draw a business's plan. Without `biz=1` a business's plan does
    /// not exist, even for its own team. A person without `plans_business` gets
    /// today's answers either way.
    ///
    /// Plans steps 3 and 4 (CONTRACT-step3-4.md section 0): the same requests say
    /// with `more=1` that this build can draw an online plan and the four newer
    /// kinds; without it those plans don't exist. Always sent, flags or not.
    ///
    /// Plans for the holidays (contract section 4, K10): `guests=1` says this
    /// build draws guests without an account, Maybe, adults and kids, and room
    /// over 30. Without it the server answers as before H1.
    static func biz(_ query: [String: String] = [:]) -> [String: String] {
        query.merging(["biz": "1", "more": "1", "guests": "1"]) { _, marker in marker }
    }

    // MARK: - Flags

    /// `GET /api/feature-flags/:flagName` — `{ flagName, enabled }`. Honors
    /// `enabled_for_internal_team` and `beta_user_ids` for the viewer.
    /// Route `backend/routes/featureFlags.js:30`.
    public static func flag(_ name: String) -> Endpoint {
        Endpoint(method: .get, path: "/api/feature-flags/\(name)")
    }

    // MARK: - Reading

    /// `GET /api/posts/map?layers=plans` — the pins. The area point for
    /// everyone, the exact point for the host and people who are in;
    /// playdates only for verified viewers with `plans_playdates` on.
    /// Route `backend/routes/posts.js` (`/map`, `plans` layer).
    public static func pins(_ viewport: PlansViewport, kinds: [PlanKind] = [], window: PlansWindow = .week) -> Endpoint {
        var query: [String: String] = [
            "south": String(viewport.south),
            "west": String(viewport.west),
            "north": String(viewport.north),
            "east": String(viewport.east),
            "layers": "plans",
            "window": window.rawValue
        ]
        if !kinds.isEmpty { query["kinds"] = kinds.map(\.rawValue).joined(separator: ",") }
        return Endpoint(method: .get, path: "/api/posts/map", query: biz(query))
    }

    /// `GET /api/plans?latitude&longitude&window&kinds&cursor` — the list
    /// under the map, `{ items: [PlanCard], next_cursor }`, soonest first.
    /// Route `backend/routes/plans.js` (`GET /`).
    public static func list(
        latitude: Double,
        longitude: Double,
        window: PlansWindow = .week,
        kinds: [PlanKind] = [],
        gps: PlansGPS? = nil,
        cursor: String? = nil
    ) -> Endpoint {
        var query: [String: String] = [
            "latitude": String(latitude),
            "longitude": String(longitude),
            "window": window.rawValue
        ]
        if let gps { query.merge(gps.query) { $1 } }
        if !kinds.isEmpty { query["kinds"] = kinds.map(\.rawValue).joined(separator: ",") }
        if let cursor, !cursor.isEmpty { query["cursor"] = cursor }
        return Endpoint(method: .get, path: base, query: biz(query))
    }

    /// `GET /api/plans/mine` — `{ hosting, going, asked, waitlisted }` of
    /// PlanCards, for "Your plans" and Today. Route `backend/routes/plans.js`.
    public static func mine() -> Endpoint {
        Endpoint(method: .get, path: "\(base)/mine", query: biz())
    }

    /// `GET /api/plans/:id` — a PlanDetail for the host and people who are
    /// in, a PlanCard for everyone else allowed to see it, 404 otherwise.
    /// Read it with the `sensitive` store kind. Route `backend/routes/plans.js`.
    public static func detail(id: String, from center: UserCoordinate? = nil, gps: PlansGPS? = nil) -> Endpoint {
        var query: [String: String] = [:]
        if let center {
            query["latitude"] = String(center.latitude)
            query["longitude"] = String(center.longitude)
        }
        if let gps { query.merge(gps.query) { $1 } }
        return Endpoint(method: .get, path: "\(base)/\(id)", query: biz(query))
    }

    /// `GET /api/plans/:id/requests` (host only) — `{ pending, waitlisted }`.
    /// Never an address. Route `backend/routes/plans.js`.
    public static func requests(planId: String) -> Endpoint {
        Endpoint(method: .get, path: "\(base)/\(planId)/requests", query: biz())
    }

    /// `GET /api/plans/host-as` — the businesses this person may host a plan
    /// as, with their locations, kinds, labels and limits (Plans with
    /// businesses, board B1). Empty for nearly everyone. Route
    /// `backend/routes/plans.js` (`GET /host-as`).
    public static func hostAs() -> Endpoint {
        Endpoint(method: .get, path: "\(base)/host-as", query: biz())
    }

    /// `GET /api/plans/games` — games in the next 14 days from the checked
    /// list kept in the backend. Route `backend/routes/plans.js`.
    public static func games(from center: UserCoordinate? = nil, gps: PlansGPS? = nil, purpose: String = "sheet") -> Endpoint {
        var query = ["v": "2", "for": purpose]
        if let center {
            query["latitude"] = String(center.latitude)
            query["longitude"] = String(center.longitude)
        }
        if let gps { query.merge(gps.query) { $1 } }
        return Endpoint(method: .get, path: "\(base)/games", query: biz(query))
    }

    public static func teams(query text: String = "", from center: UserCoordinate? = nil) -> Endpoint {
        var query = ["q": text]
        if let center {
            query["latitude"] = String(center.latitude)
            query["longitude"] = String(center.longitude)
        }
        return Endpoint(method: .get, path: "\(base)/teams", query: biz(query))
    }

    /// `GET /api/plans/places/nearby` — public places for H6, cached per
    /// area for 24 hours on the server. With the plan (`for`), the places
    /// that suit it come first and each says whether it's open then.
    /// `wait: false` only starts gathering a new area (the host flow
    /// opening) and answers at once. Route `backend/routes/plans.js`.
    public static func nearbyPlaces(
        latitude: Double,
        longitude: Double,
        query text: String? = nil,
        for plan: PlanPlaceQuery? = nil,
        wait: Bool = true
    ) -> Endpoint {
        var query = ["latitude": String(latitude), "longitude": String(longitude)]
        // `q` filters the same public places by name (never a street address).
        if let text, !text.isEmpty { query["q"] = text }
        if let plan {
            query["kind"] = plan.kind.rawValue
            if let sport = plan.sport { query["sport"] = sport }
            query["starts_at"] = PlanTime.string(plan.startsAt)
            query["ends_at"] = PlanTime.string(plan.endsAt)
        }
        if !wait { query["wait"] = "0" }
        return Endpoint(method: .get, path: "\(base)/places/nearby", query: biz(query))
    }

    /// `POST /api/plans/places/suggest` — H6's "Suggest places": up to three
    /// public places from the same list that suit the draft, each with
    /// `why`; 202 while the area's places are still loading. Route
    /// `backend/routes/plans.js`.
    public static func suggestPlaces(_ body: PlanPlaceSuggestBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/places/suggest", query: biz(), body: body)
    }

    // MARK: - Hosting

    /// `POST /api/plans` — returns PlanDetail (201). Errors: `not_near`
    /// (403), `too_many_plans` (429), validation (422); a private plan
    /// (`audience: invited`) with the switch off: `private_unavailable` (422);
    /// a `repeat` with `plans_repeat` off: `repeat_unavailable` (422).
    /// Route `backend/routes/plans.js`.
    public static func create(_ body: CreatePlanBody) -> Endpoint {
        Endpoint(method: .post, path: base, query: biz(), body: body)
    }

    /// `PATCH /api/plans/:id` — host edits; `repeat` sets a new pattern from
    /// this date on, or `null` stops it (422 `validation` with a sentence, or
    /// `repeat_unavailable`). Route `backend/routes/plans.js`.
    public static func update(id: String, _ body: UpdatePlanBody) -> Endpoint {
        Endpoint(method: .patch, path: "\(base)/\(id)", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/cancel` — tells everyone in and waiting, closes
    /// the chat, removes the pin. On a repeating plan `keepRepeating` cancels
    /// this date only and posts the next one now; the answer then carries
    /// `next_plan_id` (`PlanCancelResponse`). Without it the series stops.
    /// Route `backend/routes/plans.js`, `cancelPlan` in planActions.js.
    public static func cancel(id: String, note: String?, keepRepeating: Bool = false) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(id)/cancel", query: biz(), body: CancelPlanBody(note: note, keepRepeating: keepRepeating))
    }

    /// `POST /api/plans/:id/requests/:requestId/accept` — idempotent; 409
    /// `full` when full. At home the first accept needs
    /// `confirm_shares_address: true`. Route `backend/routes/plans.js`.
    public static func accept(planId: String, requestId: String, confirmSharesAddress: Bool? = nil) -> Endpoint {
        Endpoint(
            method: .post,
            path: "\(base)/\(planId)/requests/\(requestId)/accept",
            query: biz(),
            body: AcceptPlanRequestBody(confirmSharesAddress: confirmSharesAddress)
        )
    }

    /// `POST /api/plans/:id/requests/:requestId/decline` — idempotent.
    /// Route `backend/routes/plans.js`.
    public static func decline(planId: String, requestId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/requests/\(requestId)/decline", query: biz())
    }

    /// `POST /api/plans/:id/requests/:requestId/remove` — the guest loses the
    /// plan, the note and the chat. Route `backend/routes/plans.js`.
    public static func remove(planId: String, requestId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/requests/\(requestId)/remove", query: biz())
    }

    // MARK: - Joining

    /// `POST /api/plans/:id/requests` — ask to join. A matching rule accepts
    /// at once. Idempotent per person per plan. Route `backend/routes/plans.js`.
    public static func ask(planId: String, _ body: AskToJoinBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/requests", query: biz(), body: body)
    }

    /// `DELETE /api/plans/:id/requests/mine` — withdraw (pending or
    /// waitlisted) or leave (accepted). Route `backend/routes/plans.js`.
    public static func withdraw(planId: String) -> Endpoint {
        Endpoint(method: .delete, path: "\(base)/\(planId)/requests/mine", query: biz())
    }

    /// `POST /api/plans/:id/on-my-way` — a line in the chat, no push.
    /// Route `backend/routes/plans.js`.
    public static func onMyWay(planId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/on-my-way", query: biz())
    }

    /// `POST /api/plans/:id/still-coming` — `false` leaves the plan.
    /// Route `backend/routes/plans.js`.
    public static func stillComing(planId: String, coming: Bool) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/still-coming", query: biz(), body: PlanStillComingBody(coming: coming))
    }

    /// `POST /api/plans/:id/report` — `{ reason, details? }` into the admin
    /// report queue (the generic post report can't see plan posts).
    /// Route `backend/routes/plans.js`.
    public static func report(planId: String, reason: String, details: String? = nil) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/report", query: biz(), body: PostReportRequest(reason: reason, details: details))
    }

    /// `POST /api/plans/:id/feedback` — `not_right` files a report in the
    /// admin queue. Route `backend/routes/plans.js`.
    public static func feedback(planId: String, _ body: PlanFeedbackBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/feedback", query: biz(), body: body)
    }

    // MARK: - Invitations

    /// `GET /api/plans/:id/invites` (host) — `{ invites, unopened_links,
    /// counts, emails_left, can_invite }`. Route `backend/routes/plans.js`
    /// (`GET /:id/invites`).
    public static func invites(planId: String) -> Endpoint {
        Endpoint(method: .get, path: "\(base)/\(planId)/invites", query: biz())
    }

    /// `GET /api/plans/:id/invites/people?q=` (host) — connections and people
    /// who came to their plans, with where each stands on this plan. Route
    /// `backend/routes/plans.js` (`GET /:id/invites/people`).
    public static func invitePeople(planId: String, query text: String = "") -> Endpoint {
        Endpoint(method: .get, path: "\(base)/\(planId)/invites/people", query: biz(text.isEmpty ? [:] : ["q": text]))
    }

    /// `GET /api/plans/invites/people?q=` — the same people as above before the plan exists (a private
    /// plan's preview, "Invite"), `{ people: [{ user_id, display_name, avatar_url, reason }] }`, no `state`.
    /// Needs `plans_invites`. Route `backend/routes/plans.js` (`GET /invites/people`).
    public static func peopleToInvite(query text: String = "") -> Endpoint {
        Endpoint(method: .get, path: "\(base)/invites/people", query: biz(text.isEmpty ? [:] : ["q": text]))
    }

    /// `POST /api/plans/:id/invites` (host) — people on Pantopus and addresses.
    /// 409 `confirm_shares_address` the first time at a home; 429
    /// `too_many_invites`; 422 `invalid_email`. Route `backend/routes/plans.js`.
    public static func invite(planId: String, _ body: PlanInviteBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/invites/link` (host) — a one-person link to text,
    /// `{ invite_id, url, message }`. On a private plan with `guests_can_invite`, a guest who is in may
    /// call it once ("Bring a friend"); again: 409 `friend_invite_used`. Route `backend/routes/plans.js`.
    public static func inviteLink(planId: String, confirmSharesAddress: Bool?) -> Endpoint {
        Endpoint(
            method: .post,
            path: "\(base)/\(planId)/invites/link",
            query: biz(),
            body: PlanInviteLinkBody(confirmSharesAddress: confirmSharesAddress)
        )
    }

    /// `DELETE /api/plans/:id/invites/:inviteId` (host) — take back an
    /// invitation nobody said yes to; with H1, also remove a guest without an
    /// account ("Not this time", "Remove"). Route `backend/routes/plans.js`.
    public static func cancelInvite(planId: String, inviteId: String) -> Endpoint {
        Endpoint(method: .delete, path: "\(base)/\(planId)/invites/\(inviteId)", query: biz())
    }

    /// `POST /api/plans/:id/invites/claim` — the person opened an email or
    /// text invitation (`?invite=` on the plan link). 409 `invite_used`, 404
    /// `invite_unavailable`. Route `backend/routes/plans.js`.
    public static func claimInvite(planId: String, token: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites/claim", query: biz(), body: PlanInviteClaimBody(token: token))
    }

    /// `POST /api/plans/:id/invites/claim` `{ open }` (Plans for the holidays, contract 6.9): the plan's one link for
    /// everyone, opened in the app, becomes an invitation for this account. `{ plan }`; every refusal is
    /// `404 invite_unavailable`.
    public static func claimOpenLink(planId: String, open: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites/claim", query: biz(), body: PlanOpenLinkClaimBody(open: open))
    }

    /// `POST /api/plans/:id/invites/decline` — "Can't make it". Saying "I'm
    /// in" is the ordinary ask. Route `backend/routes/plans.js`.
    public static func declineInvite(planId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites/decline", query: biz())
    }

    /// `GET /api/plans/invites/next` — right after signing in, the newest
    /// invitation not opened yet, `{ plan_id }`. Route `backend/routes/plans.js`.
    public static func nextInvite() -> Endpoint {
        Endpoint(method: .get, path: "\(base)/invites/next", query: biz())
    }

    // MARK: - Plans for the holidays, H1 (404 while `plans_guest_answers` is off for the host)

    /// `POST /api/plans/:id/invites/open-link` (host) — makes or returns the plan's one link for everyone,
    /// `{ url, message, host_says_yes_first }`; also saves "I say yes first". At a home the first one answers 409
    /// `confirm_shares_address`; 422 `validation` on a public plan, a playdate or a business's plan.
    /// Route `backend/routes/plans.js:419`.
    public static func openLink(planId: String, _ body: PlanOpenLinkBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites/open-link", query: biz(), body: body)
    }

    /// `DELETE /api/plans/:id/invites/open-link` (host) — turns the link off; answers already given stay.
    /// Route `backend/routes/plans.js:428`.
    public static func closeOpenLink(planId: String) -> Endpoint {
        Endpoint(method: .delete, path: "\(base)/\(planId)/invites/open-link", query: biz())
    }

    /// `POST /api/plans/:id/invites/remind` (host) — everyone who hasn't answered, the way each was invited,
    /// `{ reminded, skipped }`; again within a day: 429 `too_many`. Route `backend/routes/plans.js:437`.
    public static func remind(planId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites/remind", query: biz())
    }

    /// `POST /api/plans/:id/invites/maybe` — an invited account says Maybe, `{ plan }`. The ordinary ask or decline
    /// replaces it later. Route `backend/routes/plans.js:446`.
    public static func sayMaybe(planId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites/maybe", query: biz())
    }

    /// `POST /api/plans/:id/invites/:inviteId/ok` (host) — "Let in": a guest waiting from the open link is in and
    /// gets their email; answers the host's list. Route `backend/routes/plans.js:455`.
    public static func letIn(planId: String, inviteId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites/\(inviteId)/ok", query: biz())
    }

    // MARK: - Plans for the holidays, H3 (404 while `plans_occasions` is off)

    /// `GET /api/plans/occasions` — the occasions in season for this host's date, in the strip's order,
    /// `{ occasions: [{ key, text, kind, details, fills }] }`. Route `backend/routes/plans.js`
    /// (`GET /occasions`).
    public static func occasions() -> Endpoint {
        Endpoint(method: .get, path: "\(base)/occasions", query: biz())
    }

    // MARK: - Plans for the holidays, the business track B1 (404 while `plans_deals` is off for the business)

    /// `POST /api/plans/deal-preview` (staff with `plans.manage`) — the sentence guests will read, how it's claimed,
    /// and each field's error; nothing is saved. Route `backend/routes/plans.js:316`,
    /// `planDeals.preview`.
    public static func dealPreview(_ body: PlanDealPreviewBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/deal-preview", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/requests/:requestId/deal-used` (staff) — marks a guest's free thing used; no undo.
    /// Route `backend/routes/plans.js:426`, `planDeals.markUsed`.
    public static func dealUsed(planId: String, requestId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/requests/\(requestId)/deal-used", query: biz())
    }

    // MARK: - Plans for the holidays, H2 (404 while `plans_bring_list` is off for the host)

    /// `PUT /api/plans/:id/bring` (host) — the whole list, `{ bring }`. Kept ids keep their claims; `mine` claims or
    /// gives back for the host. 409 `bring_changed` after three tries. Route `backend/routes/plans.js:481`.
    public static func putBring(planId: String, _ body: PlanBringBody) -> Endpoint {
        Endpoint(method: .put, path: "\(base)/\(planId)/bring", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/bring/items` — someone in adds one thing, claimed by them, `{ bring }`; 403
    /// `not_allowed` when guests can't add. Route `backend/routes/plans.js:490`.
    public static func addBringItem(planId: String, _ body: PlanBringAddBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/bring/items", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/bring/:itemId/claim` — "I'll bring it", `{ bring }`; 409 `taken` with the name of whoever
    /// got there first. Route `backend/routes/plans.js:499`.
    public static func claimBring(planId: String, itemId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/bring/\(itemId)/claim", query: biz())
    }

    /// `DELETE /api/plans/:id/bring/:itemId/claim` — "Give back", `{ bring }`. Route `backend/routes/plans.js:506`.
    public static func giveBackBring(planId: String, itemId: String) -> Endpoint {
        Endpoint(method: .delete, path: "\(base)/\(planId)/bring/\(itemId)/claim", query: biz())
    }
}
