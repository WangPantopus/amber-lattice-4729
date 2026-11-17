//
//  PlansCheckEndpoints.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 and B6 (contract 11): the
//  bill at the place and the tip after a paid plan. 404 while the plan's
//  business doesn't have `plans_pay_here`. Every amount in the answers is the
//  server's; the app sends only what the person typed or chose.
//
//  Route backend/routes/plans.js:432-455, backend/services/plans/planChecks.js.
//

import Foundation

public extension PlansEndpoints {
    /// `GET /api/plans/:id/checks/mine` — the guest's open check (or the last one paid) and `can_start`.
    /// Route `backend/routes/plans.js:445`.
    static func myCheck(planId: String) -> Endpoint {
        Endpoint(method: .get, path: "\(base)/\(planId)/checks/mine", query: biz())
    }

    /// `POST /api/plans/:id/checks/mine` `{ amount_cents }` — the guest types the total on the bill (only with no deal
    /// on the bill; `409 staff_send_checks` otherwise). Route `backend/routes/plans.js:446`.
    static func startMyCheck(planId: String, _ body: PlanCheckAmountBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/checks/mine", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/checks/:checkId/quote` `{ tip_cents }` — the lines and total for a tip; nothing saved.
    /// Route `backend/routes/plans.js:448`.
    static func quoteCheck(planId: String, checkId: String, _ body: PlanCheckTipBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/checks/\(checkId)/quote", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/checks/:checkId/pay` `{ tip_cents }` — the shipped payment sheet's values for the
    /// server's total, and the check as it will be paid. Route `backend/routes/plans.js:449`.
    static func payCheck(planId: String, checkId: String, _ body: PlanCheckTipBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/checks/\(checkId)/pay", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/checks/:checkId/confirm` — after the sheet closes: the paid check (C2); `409
    /// payment_not_complete` while it settles. Route `backend/routes/plans.js:450`.
    static func confirmCheck(planId: String, checkId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/checks/\(checkId)/confirm", query: biz())
    }

    /// `GET /api/plans/:id/checks` (staff with plans.manage) — board 14's totals, rows and note. Ask again every 5
    /// seconds while open. Route `backend/routes/plans.js:443`.
    static func checks(planId: String) -> Endpoint {
        Endpoint(method: .get, path: "\(base)/\(planId)/checks", query: biz())
    }

    /// `POST /api/plans/:id/checks` (staff) `{ request_id, amount_cents, no_deal_cents }` — the guest gets
    /// `plan_check` at once. Route `backend/routes/plans.js:442`.
    static func sendCheck(planId: String, _ body: PlanCheckAmountBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/checks", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/checks/:checkId/refund` (staff) `{}` or `{ amount_cents }` — answers the staff list;
    /// `409 refund_closed` 48 hours after the plan ends. Route `backend/routes/plans.js:455`.
    static func refundCheck(planId: String, checkId: String, _ body: PlanCheckRefundBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/checks/\(checkId)/refund", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/tip` `{ amount_cents }` (B6) — the sheet's values for a tip after a paid plan, once, for 7
    /// days; `409 tip_closed` / `already_tipped`. Route `backend/routes/plans.js:452`.
    static func tipLater(planId: String, _ body: PlanTipLaterBody) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/tip", query: biz(), body: body)
    }

    /// `POST /api/plans/:id/tip/confirm` — "You tipped $5.00". Route `backend/routes/plans.js:453`.
    static func confirmTipLater(planId: String) -> Endpoint {
        Endpoint(method: .post, path: "\(base)/\(planId)/tip/confirm", query: biz())
    }
}
