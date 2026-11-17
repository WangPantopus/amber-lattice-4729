//
//  PlansExtrasEndpoints.swift
//  Pantopus
//
//  Plans for the holidays, the six extras (docs/product/plans-holidays/08-extras.md). Each route answers 404
//  while its own switch is off for the plan's host, and every one carries the `extras=1` marker through `biz()`.
//  Routes: backend/routes/plans.js; services backend/services/plans/planSamePeople.js and the other extras' files.
//

import Foundation

public extension PlansEndpoints {
    // MARK: - The same people again (`plans_same_people`, with `plans_invites`)

    /// `GET /api/plans/past-people` — the host's last ten ended plans that had anyone in, newest first,
    /// `{ plans: [{ post_id, title, kind, date_text, count }] }`. Route `backend/routes/plans.js:268`.
    static func pastPlans() -> Endpoint {
        Endpoint(method: .get, path: "\(base)/past-people", query: biz())
    }

    /// `GET /api/plans/past-people/:postId` — one past plan's people with a check each, a name each and never an
    /// address; 404 for anything but the caller's own ended plan. Route `backend/routes/plans.js:275`.
    static func pastPlanPeople(postId: String) -> Endpoint {
        Endpoint(method: .get, path: "\(base)/past-people/\(postId)", query: biz())
    }

    /// `POST /api/plans/:id/invites/from-plan` (host) — invites each person who was in on `from_post_id` the way they
    /// were reached, but the keys in `skip`; answers the invitation list with `results`, `invited`, `text_only` and
    /// `text`. At a home the first invitation needs `confirm_shares_address` (409 otherwise).
    /// Route `backend/routes/plans.js:545`.
    static func inviteFromPlan(planId: String, _ body: PlanFromPlanBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites/from-plan", query: biz(), body: body)
    }

    // MARK: - Chip in (`plans_chip_in`)

    /// `POST /api/plans/:id/chip-in/paid` — "I've paid" for the caller, or the host's "Mark paid" with `who`
    /// (`p:<user id>` / `g:<guest id>`); answers `{ chip_in }`. 403 `not_in` / `not_host`, 409 `ended`.
    /// Route `backend/routes/plans.js` (`/:id/chip-in/paid`), `planChipIn.mark`.
    static func markChipIn(planId: String, who: String? = nil) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/chip-in/paid", query: biz(), body: PlanChipInMarkBody(who: who))
    }

    /// `DELETE /api/plans/:id/chip-in/paid` — "Undo", or the host unmarking `who` (`?who=`); answers `{ chip_in }`.
    /// Route `backend/routes/plans.js` (`/:id/chip-in/paid`), `planChipIn.unmark`.
    static func unmarkChipIn(planId: String, who: String? = nil) -> Endpoint {
        var query: [String: String] = [:]
        if let who { query["who"] = who }
        return Endpoint(method: .delete, path: "\(base)/\(planId)/chip-in/paid", query: biz(query))
    }
}
