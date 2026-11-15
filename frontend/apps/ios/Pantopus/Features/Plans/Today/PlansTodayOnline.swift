//
//  PlansTodayOnline.swift
//  Pantopus
//
//  Plans step 3 on Today (board A1): an online plan you're going to today has
//  nowhere to go and nobody on their way, so its card offers "Open plan" and
//  "Join", which reads the link fresh when tapped (never kept) and opens it.
//

import SwiftUI

struct PlansTodayOnlineButtons: View {
    let card: PlanCardDTO
    let model: PlansTodayModel
    let onOpen: () -> Void

    @Environment(\.openURL) private var openURL
    @State private var isJoining = false

    var body: some View {
        HStack(spacing: 10) {
            Button("Open plan", action: onOpen)
                .planButton(.tonal, size: .small)
                .accessibilityIdentifier("plansTodayOpenOnline")
            Button {
                Task {
                    isJoining = true
                    let url = await model.joinLink(card)
                    isJoining = false
                    if let url { openURL(url) }
                }
            } label: {
                PlanButtonLabel(title: "Join", icon: .video, kind: .primary, isLoading: isJoining)
            }
            .planButton(.primary, size: .small)
            .disabled(isJoining)
            .accessibilityIdentifier("plansTodayJoinOnline")
        }
    }
}

extension PlansTodayModel {
    /// The online plan's link, read fresh (only the people who are in get it).
    func joinLink(_ card: PlanCardDTO) async -> URL? {
        let place = try? await PlansStoreReads.detail(id: card.id).place
        guard let url = PlanOnlineLink.joinURL(place?.link) else {
            error = "We couldn't load the link. Open the plan and try again."
            return nil
        }
        error = nil
        return url
    }
}
