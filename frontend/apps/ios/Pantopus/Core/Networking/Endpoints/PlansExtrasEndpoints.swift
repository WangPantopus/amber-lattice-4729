//
//  PlansExtrasEndpoints.swift
//  Pantopus
//
//  Plans for the holidays, the six extras (docs/product/plans-holidays/08-extras.md). Each route answers 404
//  while its own switch is off for the plan's host, and every one carries the `extras=1` marker through `biz()`.
//  Routes: backend/routes/plans.js; services backend/services/plans/planSamePeople.js and the other extras' files.
//

import Foundation

extension PlansEndpoints {
    // MARK: - The same people again (`plans_same_people`, with `plans_invites`)

    /// `GET /api/plans/past-people` — the host's last ten ended plans that had anyone in, newest first,
    /// `{ plans: [{ post_id, title, kind, date_text, count }] }`. Route `backend/routes/plans.js:268`.
    public static func pastPlans() -> Endpoint {
        Endpoint(method: .get, path: "\(base)/past-people", query: biz())
    }

    /// `GET /api/plans/past-people/:postId` — one past plan's people with a check each, a name each and never an
    /// address; 404 for anything but the caller's own ended plan. Route `backend/routes/plans.js:275`.
    public static func pastPlanPeople(postId: String) -> Endpoint {
        Endpoint(method: .get, path: "\(base)/past-people/\(postId)", query: biz())
    }

    /// `POST /api/plans/:id/invites/from-plan` (host) — invites each person who was in on `from_post_id` the way they
    /// were reached, but the keys in `skip`; answers the invitation list with `results`, `invited`, `text_only` and
    /// `text`. At a home the first invitation needs `confirm_shares_address` (409 otherwise).
    /// Route `backend/routes/plans.js:545`.
    public static func inviteFromPlan(planId: String, _ body: PlanFromPlanBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/invites/from-plan", query: biz(), body: body)
    }
}
