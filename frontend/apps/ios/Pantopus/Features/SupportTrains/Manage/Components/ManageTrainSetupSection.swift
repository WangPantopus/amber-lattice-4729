//
//  ManageTrainSetupSection.swift
//  Pantopus
//
//  Manage: where help goes, who can open the train, and who is invited (A1, A2). A train made on a phone before
//  2026-11-17 has no address; this is where it gets one.
//

import SwiftUI

struct ManageTrainSetupSection: View {
    let addressLabel: String?
    let sharingMode: String?
    let invites: [SupportTrainInviteDTO]
    let canEdit: Bool
    let isBusy: Bool
    let onEditAddress: () -> Void
    let onChooseAudience: (String) -> Void
    let onInvite: () -> Void

    private struct Audience {
        let wire: String
        let title: String
        let subtitle: String
    }

    private static let audiences: [Audience] = [
        Audience(
            wire: "direct_share_only",
            title: "Anyone with the link",
            subtitle: "Not listed anywhere. Share the link with people you trust."
        ),
        Audience(wire: "private_link", title: "People near you", subtitle: "Listed for people within about 25 mi, who can sign up."),
        Audience(wire: "invited_only", title: "My connections", subtitle: "Only your connections and people you invite can open it.")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            row(
                title: "Delivery address",
                value: addressLabel ?? "Not set. Helpers can't get the address until you add one.",
                warn: addressLabel == nil,
                action: canEdit ? (addressLabel == nil ? "Add" : "Change") : nil,
                identifier: "manageTrainAddress",
                onTap: onEditAddress
            )
            Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
            VStack(alignment: .leading, spacing: Spacing.s1) {
                HStack {
                    Text("Who can open it")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.appText)
                    Spacer()
                    if canEdit {
                        Menu {
                            ForEach(Self.audiences, id: \.wire) { option in
                                Button(option.title) { onChooseAudience(option.wire) }
                            }
                        } label: {
                            Text("Change")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.Color.primaryInk)
                                .frame(minHeight: 44)
                        }
                        .disabled(isBusy)
                        .accessibilityIdentifier("manageTrainAudienceMenu")
                    }
                }
                let current = Self.audiences.first { $0.wire == sharingMode }
                Text(current?.title ?? "Not set")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.Color.appText)
                Text(current?.subtitle ?? "")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                if sharingMode == "invited_only" {
                    Text("People who aren't your connections can't open the link. Invite them, or change who can open it.")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.Color.warmAmber)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityIdentifier("manageTrainAudience")
            Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
            row(
                title: "Invited",
                value: invites.isEmpty
                    ? "No one yet. Invited people can open the train even when it's for your connections only."
                    : invites.map { $0.user?.name ?? MadeUpUsername.chosen($0.user?.username) ?? "Someone" }.joined(separator: ", "),
                warn: false,
                action: canEdit ? "Invite" : nil,
                identifier: "manageTrainInvites",
                onTap: onInvite
            )
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurface)
        .overlay(
            RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                .stroke(Theme.Color.appBorder, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
    }

    // swiftlint:disable:next function_parameter_count
    private func row(
        title: String,
        value: String,
        warn: Bool,
        action: String?,
        identifier: String,
        onTap: @escaping () -> Void
    ) -> some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                Text(value)
                    .font(.system(size: 12.5))
                    .foregroundStyle(warn ? Theme.Color.warmAmber : Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: Spacing.s2)
            if let action {
                Button(action: onTap) {
                    Text(action)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.primaryInk)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .accessibilityIdentifier("\(identifier)Button")
            }
        }
        .accessibilityIdentifier(identifier)
    }
}

/// The sheet for setting where help goes.
struct ManageTrainAddressSheet: View {
    @State private var model = SupportTrainWhereModel()
    let isBusy: Bool
    let onSave: (SupportTrainDeliveryLocationBody) async -> Bool
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                SupportTrainWhereSection(model: model, identifier: "manageTrainWhere")
                    .padding(Spacing.s4)
            }
            .background(Theme.Color.appBg)
            .navigationTitle("Where help goes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onClose)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let body = model.body else { return }
                        Task { if await onSave(body) { onClose() } }
                    }
                    .disabled(model.body == nil || isBusy)
                    .accessibilityIdentifier("manageTrainWhereSave")
                }
            }
        }
    }
}
