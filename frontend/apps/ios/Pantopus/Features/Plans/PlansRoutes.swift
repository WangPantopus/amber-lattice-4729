//
//  PlansRoutes.swift
//  Pantopus
//
//  The Plans screens pushed on the Plans tab's stack (`PlansTabRoot`), and
//  the composer it presents. Only `Hashable` payloads.
//

import SwiftUI

enum PlansRoute: Hashable {
    /// A plan: J1 to J9 for a guest, H9 for its host.
    case plan(id: String, intent: PlanOpenIntent)
    /// The host's requests (H10).
    case requests(planId: String)
    /// Plans for the holidays (board 17): the host's "Who's coming".
    case whosComing(planId: String)
    /// Change the time or place (H11).
    case change(planId: String)
    /// A host's public profile (J1's host card).
    case profile(userId: String)
    /// A post opened from a profile's Posts tab.
    case post(postId: String)
    /// One of your own posts, edited from its page.
    case editPost(postId: String)
    /// A DM opened from a profile's Message button.
    case chat(InboxConversationDestination)
}

/// Hand-off into the Plans tab's stack from outside it: a deep link, a push,
/// a Today card. `PlansTabRoot` consumes it.
@Observable
@MainActor
final class PlansNavigator {
    static let shared = PlansNavigator()

    /// A route to push once the Plans tab shows.
    var pending: PlansRoute?
    /// Open the composer.
    var pendingHost: PlansHostRequest?
    /// A sentence for the next Plans screen that opens (a push button that didn't go through).
    var notice: String?
    /// A confirmation for the next plan screen that opens, as its toast (a skipped date's next one, Plans step 2).
    var toast: String?

    private init() {}
}

/// "Host a plan", optionally at a kind (and a game), or a private plan (Plans step 1).
struct PlansHostRequest: Identifiable, Hashable {
    let id = UUID()
    let start: PlansHostStart?
    /// Opens on "Only people I invite" (the empty state's "Plan with people you know").
    var isPrivate = false
}
