//
//  PlanComposerMore.swift
//  Pantopus
//
//  Plans steps 3 and 4 in the host's draft (CONTRACT-step3-4.md; boards Type
//  and Details): the four newer kinds' choices, and an online plan's link.
//  The newer kinds show with `plans_kinds` on, "Online" in Where with
//  `plans_online` on, for the kinds that can be online and never for a
//  business's plan. An online plan sends `{ kind: "online", link, timezone }`;
//  where it "is" (the host's home, or a fresh fix sent as `gps`) is the
//  server's to work out. The server checks everything again.
//

import Foundation
import Observation

@Observable
@MainActor
final class PlanMoreDraft {
    /// The link people join with, as typed (an online plan).
    var onlineLink = ""
    /// Food & drinks: dinner, potluck, drinks, brunch, bbq or other.
    var foodKind = "dinner"
    /// Game night: board games, cards, trivia, video games or other.
    var gameKind = "board_games"
    /// Outdoors: a hike, a bike ride, a run or other (its pace is the draft's `pace`, as a walk's).
    var outdoorKind = "hike"

    /// The newer kinds' details (`food_kind`, `game_kind`, `outdoor_kind` and an outing's pace).
    func apply(to details: inout PlanDetailsDTO, kind: PlanKind, pace: String) {
        switch kind {
        case .foodDrinks: details.foodKind = foodKind
        case .gameNight: details.gameKind = gameKind
        case .outdoors:
            details.outdoorKind = outdoorKind
            details.pace = pace
        default: break
        }
    }

    /// "Host again": the earlier plan's choices.
    func restore(from details: PlanDetailsDTO) {
        foodKind = details.foodKind ?? foodKind
        gameKind = details.gameKind ?? gameKind
        outdoorKind = details.outdoorKind ?? outdoorKind
    }
}

extension PlanComposerModel {
    /// "Online" in Where: the switch is on, the kind can be online, and it's the host's own plan.
    var offersOnline: Bool {
        PlansFlags.shared.online && kind.canBeOnline && !isBusiness
    }

    /// An online plan is being drafted.
    var isOnline: Bool {
        whereKind == .online && !isBusiness
    }

    /// Where's choices for this kind (board Details): a public place, the host's place where it may be
    /// there, and online. A draft already online keeps the choice so the host can move off it.
    var whereChoices: [Where] {
        var choices: [Where] = [.publicPlace]
        if canHostAtHome { choices.append(.home) }
        if offersOnline || whereKind == .online { choices.append(.online) }
        return choices
    }

    /// The link, checked as the server checks it; nil when it would be refused.
    var onlineLink: (link: String, host: String)? {
        PlanOnlineLink.parse(more.onlineLink)
    }

    /// The refusal under the form for a link the server wouldn't take (its sentence).
    var onlineProblem: String? {
        isOnline && onlineLink == nil ? PlanOnlineCopy.linkProblem : nil
    }

    /// `place` for an online plan, with the phone's own time zone.
    var onlinePlaceBody: PlanPlaceBody? {
        onlineLink.map { PlanPlaceBody.online(link: $0.link) }
    }

    /// The newer kinds' starting draft: a few people, the host approves each, a sensible time.
    func applyNewerDefaults() {
        spots = kind == .somethingElse ? 8 : 6
        approval = .approveEach
        start = Self.sensibleStart(for: kind)
        end = start.addingTimeInterval(kind == .gameNight ? 3 * 3600 : 2 * 3600)
        if whereKind == .online, !kind.canBeOnline { whereKind = .publicPlace }
    }

    /// "Host again" of an online plan: online again with the same link while online plans can be posted;
    /// otherwise the host chooses a place.
    func repeatOnline(_ place: PlanPlaceDTO?) {
        guard offersOnline else {
            whereKind = .publicPlace
            return
        }
        whereKind = .online
        more.onlineLink = place?.link ?? ""
    }
}
