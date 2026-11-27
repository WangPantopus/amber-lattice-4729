//
//  MomentPlan.swift
//  Pantopus
//
//  "Want to come?" ("Pulse, reinvented" phase 1, PHASE-1 §5 step 6; CONTRACT 6g). In Moment options on the author's
//  own live Moment (under their own name, while Plans is on), "Want to come? Start a plan" opens today's plan composer
//  (`PlanComposerRoot`) filled from the Moment: its words as the title, its place. It posts through
//  `POST /api/reinvented/moments/:id/plan`, Plans' own body and rules; the plan is the person's own, never a
//  business's. Over the Moment the viewer then shows its plan: "Your plan", "Want to come?" or "You're in", opening the
//  plan's own screen in Plans. Only while the switch is on: today's viewer and options are unchanged otherwise.
//

import SwiftUI

/// A Moment's plan, as a switch-on reader may see it in Plans (CONTRACT 6g); nil when none.
public struct MomentPlanDTO: Decodable, Sendable, Hashable {
    public let id: String
    public let kind: String?
    public let title: String
    public let startsAt: String?
    public let state: String?
    public let goingCount: Int?
    public let viewerRole: String?

    private enum CodingKeys: String, CodingKey {
        case id, kind, title, state
        case startsAt = "starts_at"
        case goingCount = "going_count"
        case viewerRole = "viewer_role"
    }

    /// `plan` on a Moment answer, read without throwing; nil when absent (the switch off, or no plan).
    static func read(from decoder: any Decoder) -> MomentPlanDTO? {
        enum Keys: String, CodingKey { case plan }
        return (try? decoder.container(keyedBy: Keys.self).decodeIfPresent(MomentPlanDTO.self, forKey: .plan))
    }
}

/// What today's plan composer is filled with: the Moment's words and, when it has one, the place everyone sees.
struct PlanMomentSeed: Hashable {
    let momentId: String
    let title: String
    let placeName: String?
    let latitude: Double?
    let longitude: Double?

    init(moment: MomentDTO) {
        momentId = moment.id
        let words = (moment.kind == .text ? moment.text : moment.caption) ?? ""
        title = String(words.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
        let placed = !moment.noLocation && !moment.placeLabel.isEmpty
        placeName = placed ? moment.placeLabel : nil
        latitude = placed ? moment.latitude : nil
        longitude = placed ? moment.longitude : nil
    }
}

/// `POST /api/reinvented/moments/:id/plan` answers `{ plan: <as POST /api/plans answers>, moment }`.
struct MomentPlanStartedResponse: Decodable {
    let plan: PlanCreatedResponse
}

enum MomentPlanEndpoints {
    /// The plan from the Moment: today's plan body and query (`PlansEndpoints.create`), on the Moment's route.
    static func start(momentId: String, _ body: CreatePlanBody) -> Endpoint {
        let id = momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId
        return Endpoint(method: .post, path: "/api/reinvented/moments/\(id)/plan", query: PlansEndpoints.create(body).query, body: body)
    }
}

extension PlanComposerModel {
    /// Filled from the Moment: its words as the title, and its place as the public place, which the person can change.
    func startFromMoment(_ seed: PlanMomentSeed) {
        fromMoment = seed.momentId
        if !seed.title.isEmpty {
            title = seed.title
            autoTitle = nil
        }
        if let name = seed.placeName, let latitude = seed.latitude, let longitude = seed.longitude {
            whereKind = .publicPlace
            place = PlanPlaceOptionDTO(placeId: nil, name: name, category: nil, address: nil, latitude: latitude, longitude: longitude)
        }
    }
}

/// "Want to come?" in Moment options.
@MainActor
enum MomentPlanStart {
    /// Offered on one's own live Moment with no plan yet, while the switch and Plans are on.
    static func offers(_ moment: MomentDTO?, mine: Bool) -> Bool {
        guard PulseReinventedFlags.shared.isOn, PlansFlags.shared.plans, mine, let moment, moment.plan == nil,
              moment.author.kind == .person, (moment.expiresAtDate ?? .distantPast) > Date() else { return false }
        return true
    }
}

/// Over the viewer's picture: the Moment's plan, opening it in Plans.
struct MomentPlanPill: View {
    let plan: MomentPlanDTO
    let mine: Bool
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: Spacing.s2) {
                Icon(.calendar, size: 16, strokeWidth: 2.2, color: .white)
                VStack(alignment: .leading, spacing: 1) {
                    Text(heading)
                        .font(.system(size: 14, weight: .bold))
                    Text(line)
                        .font(.system(size: 12.5))
                        .opacity(0.85)
                        .lineLimit(1)
                }
                .foregroundStyle(.white)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Capsule().fill(Theme.Color.primarySolid.opacity(0.92)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the plan in Plans")
        .accessibilityIdentifier("moments.viewer.plan")
    }

    private var heading: String {
        if mine { return "Your plan" }
        return plan.viewerRole == "guest" ? "You're in" : "Want to come?"
    }

    /// The plan's title, when it starts, and how many are going.
    private var line: String {
        var parts = [plan.title]
        if let at = MomentTime.parse(plan.startsAt) {
            parts.append(at.formatted(.dateTime.weekday(.abbreviated).hour().minute()))
        }
        if let going = plan.goingCount, going > 0 { parts.append("\(going) going") }
        return parts.joined(separator: " · ")
    }
}

extension MomentsViewerModel {
    /// The plan's own screen in Plans: the viewer closes, then Plans opens it.
    func openPlan(_ plan: MomentPlanDTO) {
        close()
        DeepLinkRouter.shared.handle(path: "/plans/\(plan.id)")
    }
}

/// Under the header while the switch is on: the Moment's plan, opening it in Plans.
struct MomentsViewerPlan: View {
    let model: MomentsViewerModel

    var body: some View {
        if PulseReinventedFlags.shared.isOn, let moment = model.moment, let plan = moment.plan {
            MomentPlanPill(plan: plan, mine: model.isMine) { model.openPlan(plan) }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 58)
                .padding(.top, Spacing.s1)
        }
    }
}

extension MomentsViewerModel {
    /// "Want to come?": the viewer closes and today's Plans tab opens its composer filled from the Moment, as Today's
    /// "Host again" hands it over (`PlansNavigator.pendingHost`). Presented there, outside the Pulse tab's stack, the
    /// composer keeps its own sheets (the place picker's map closed a composer presented over the viewer).
    func startPlan(from moment: MomentDTO) {
        close()
        PlansNavigator.shared.pendingHost = PlansHostRequest(start: PlansHostStart(
            kind: .watchParty,
            fromMoment: PlanMomentSeed(moment: moment)
        ))
        DeepLinkRouter.shared.handle(path: "/plans")
    }
}
