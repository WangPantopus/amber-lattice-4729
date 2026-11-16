//
//  PlanBringFriend.swift
//  Pantopus
//
//  "Bring a friend" (Plans step 1): on a private plan whose host lets guests
//  bring a friend, a guest who is in makes one one-person link
//  (`POST /api/plans/:id/invites/link`) and sends it from the share sheet.
//  After that, or once the server says it's used, the row reads "You
//  invited a friend". A second link answers 409 `friend_invite_used`.
//

import SwiftUI

struct PlanBringFriendRow: View {
    let viewModel: PlanScreenViewModel
    let card: PlanCardDTO

    @State private var invite: PlanTextInvite?
    @State private var isMaking = false
    /// The link was made here (the card says `used` after the next read).
    @State private var made = false
    @State private var error: String?

    var body: some View {
        if let friend = card.friendInvite, friend.canInvite || friend.used || made {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                if friend.used || made { usedRow } else { bringRow }
                if let error {
                    Text(error)
                        .planFont(.footnote)
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("planBringFriendError")
                }
            }
            .sheet(item: $invite, onDismiss: { Task { await viewModel.load() } }, content: { invite in
                SystemShareSheet(items: invite.items)
                    .presentationDetents([.medium, .large])
            })
        }
    }

    private var bringRow: some View {
        Button { Task { await makeLink() } } label: {
            HStack(spacing: Spacing.s3) {
                tile(.userPlus)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Bring a friend").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Text("\(PlanCardLines.hostName(card)) lets each guest invite one more. Your link works for one person.")
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if isMaking { ProgressView() } else { Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted) }
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous).fill(Theme.Color.appSurface))
            .overlay(RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isMaking)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("planBringFriend")
    }

    private var usedRow: some View {
        HStack(spacing: Spacing.s3) {
            tile(.check)
            VStack(alignment: .leading, spacing: 0) {
                Text("You invited a friend").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                Text("Each guest can bring one friend to this plan.")
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous).fill(Theme.Color.appSurfaceSunken))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planBringFriend")
    }

    private func tile(_ icon: PantopusIcon) -> some View {
        RoundedRectangle(cornerRadius: 13, style: .continuous)
            .fill(Theme.Color.primary100)
            .frame(width: 44, height: 44)
            .overlay(Icon(icon, size: 22, color: Theme.Color.primary700))
            .accessibilityHidden(true)
    }

    /// One link for the share sheet. Already used elsewhere (409 `friend_invite_used`): the row says so.
    private func makeLink() async {
        guard !isMaking else { return }
        isMaking = true
        error = nil
        defer { isMaking = false }
        do {
            let link: PlanInviteLinkResponse = try await APIClient.shared.request(
                PlansEndpoints.inviteLink(planId: card.id, confirmSharesAddress: nil)
            )
            guard let url = URL(string: link.url) else {
                error = "Couldn't make the link. Please try again."
                return
            }
            made = true
            PlansStoreReads.changed(planId: card.id)
            invite = PlanTextInvite(message: link.message, url: url)
        } catch {
            if case let .clientError(status, body) = error as? APIError, status == 409,
               PlanErrors.code(in: body) == "friend_invite_used" {
                made = true
                await viewModel.load()
            }
            self.error = PlanErrors.sentence(for: error)
        }
    }
}
