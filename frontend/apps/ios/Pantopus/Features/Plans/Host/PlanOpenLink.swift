//
//  PlanOpenLink.swift
//  Pantopus
//
//  Plans for the holidays, board 16 (Share): "One link for everyone" in the
//  host's invite sheet, under the ways to invite. One link for the family chat;
//  people answer it in a browser, no app needed. "I say yes first" makes the
//  people who answer wait for the host's OK before they get the address. For a
//  private plan hosted by a person that is not a playdate, while its host has
//  `plans_guest_answers`. The server decides everything again (planGuests.js).
//

import SwiftUI
import UIKit

@Observable
@MainActor
final class PlanOpenLinkModel {
    let planId: String
    let atHome: Bool
    /// The link as the server last said it (nil until the host's list is read).
    private(set) var link: PlanOpenLinkDTO?
    /// "I say yes first": on for a plan at a home, off elsewhere, until the host changes it.
    private(set) var yesFirst: Bool
    private(set) var isWorking = false
    var error: String?
    /// At a home the first link asks the host to agree that people who are in see the address.
    var asksAboutAddress = false
    var confirmsTurnOff = false
    /// The link and the server's words, ready for the share sheet.
    var share: PlanTextInvite?

    private var pending: (() async -> Void)?
    private var addressAgreed = false
    private let api: APIClient

    init(planId: String, atHome: Bool, api: APIClient = .shared) {
        self.planId = planId
        self.atHome = atHome
        self.api = api
        yesFirst = atHome
    }

    var isOn: Bool {
        link?.isOn == true && link?.url != nil
    }

    /// The host's list was read: the link as it stands.
    func seed(_ state: PlanOpenLinkDTO?) {
        guard let state else { return }
        link = state
        if state.isOn { yesFirst = state.hostSaysYesFirst }
    }

    /// "Copy link": makes the link the first time, then copies it.
    func copy(onDone: @escaping (String) -> Void) async {
        guard let made = await ensure(retry: { [weak self] in await self?.copy(onDone: onDone) }),
              let url = made.url else { return }
        UIPasteboard.general.string = url
        onDone("Link copied.")
    }

    /// "Share": makes the link the first time, then the system share sheet with the server's words.
    func shareLink() async {
        guard let made = await ensure(retry: { [weak self] in await self?.shareLink() }), let url = made.url.flatMap(URL.init) else {
            return
        }
        share = PlanTextInvite(message: lastMessage ?? "", url: url)
    }

    /// The switch saves with the same call once the link exists; before, it goes with the first one.
    func setYesFirst(_ value: Bool) async {
        yesFirst = value
        guard isOn else { return }
        await post(confirm: nil)
    }

    /// "Turn off": the link stops letting anyone answer. People who already answered stay.
    func turnOff(onDone: @escaping (String) -> Void) async {
        guard !isWorking else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            _ = try await api.request(PlansEndpoints.closeOpenLink(planId: planId), as: EmptyResponse.self)
            link = PlanOpenLinkDTO(isOn: false, url: nil, hostSaysYesFirst: yesFirst)
            PlansStoreReads.changed(planId: planId)
            onDone("Link turned off.")
        } catch {
            self.error = PlanErrors.sentence(for: error)
        }
    }

    /// "Share your address?" answered yes: do what was asked.
    func agreeToShareAddress() async {
        addressAgreed = true
        let action = pending
        pending = nil
        await action?()
    }

    // MARK: - Private

    private var lastMessage: String?

    /// The link, made now when there is none.
    private func ensure(retry: @escaping () async -> Void) async -> PlanOpenLinkDTO? {
        if isOn, lastMessage != nil { return link }
        pending = retry
        guard await post(confirm: addressAgreed ? true : nil) else { return nil }
        pending = nil
        return link
    }

    @discardableResult
    private func post(confirm: Bool?) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            let made: PlanOpenLinkResponse = try await api.request(
                PlansEndpoints.openLink(planId: planId, PlanOpenLinkBody(hostSaysYesFirst: yesFirst, confirmSharesAddress: confirm))
            )
            link = PlanOpenLinkDTO(isOn: true, url: made.url, hostSaysYesFirst: made.hostSaysYesFirst)
            yesFirst = made.hostSaysYesFirst
            lastMessage = made.message
            PlansStoreReads.changed(planId: planId)
            return true
        } catch {
            if case let .clientError(status, body) = error as? APIError, status == 409,
               PlanErrors.code(in: body) == "confirm_shares_address" {
                asksAboutAddress = true
            } else {
                self.error = PlanErrors.sentence(for: error)
            }
            return false
        }
    }
}

/// Board 16's card, and "Turn this link off" under it once a link exists.
struct PlanOpenLinkCard: View {
    @Bindable var model: PlanOpenLinkModel
    let onNotice: (String) -> Void

    var body: some View {
        VStack(spacing: Spacing.s3) {
            PlanCardBox(padding: 14) {
                VStack(alignment: .leading, spacing: Spacing.s3) {
                    HStack(alignment: .top, spacing: Spacing.s3) {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Theme.Color.primary100)
                            .frame(width: 40, height: 40)
                            .overlay(Icon(.link, size: 20, color: Theme.Color.primary700))
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("One link for everyone").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                            Text("For the family chat. People answer in a browser, no app needed")
                                .planFont(.small)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    buttons
                    Divider().overlay(Theme.Color.appBorder)
                    PlanSwitchRow(
                        title: "I say yes first",
                        subtitle: "People who answer wait for your OK before they get your address",
                        isOn: Binding(get: { model.yesFirst }, set: { value in Task { await model.setYesFirst(value) } })
                    )
                    .disabled(model.isWorking)
                    .accessibilityIdentifier("planOpenLinkYesFirst")
                    if let error = model.error {
                        Text(error)
                            .planFont(.footnote)
                            .foregroundStyle(Theme.Color.error)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("planOpenLinkError")
                    }
                }
            }
            if model.isOn {
                Button("Turn this link off") { model.confirmsTurnOff = true }
                    .planButton(.textDanger, size: .small)
                    .disabled(model.isWorking)
                    .accessibilityIdentifier("planOpenLinkOff")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planOpenLink")
        .alert("Share your address?", isPresented: $model.asksAboutAddress) {
            Button("Invite") { Task { await model.agreeToShareAddress() } }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("This plan is at your place. People you invite see your address once they say they're in.")
        }
        .alert("Turn this link off?", isPresented: $model.confirmsTurnOff) {
            Button("Turn off", role: .destructive) { Task { await model.turnOff(onDone: onNotice) } }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("People who already answered stay.")
        }
        .sheet(item: $model.share) { share in
            SystemShareSheet(items: share.items) {}
                .presentationDetents([.medium, .large])
        }
    }

    private var buttons: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { copyButton
                shareButton
            }
            VStack(spacing: 10) { copyButton
                shareButton
            }
        }
    }

    private var copyButton: some View {
        Button { Task { await model.copy(onDone: onNotice) } } label: {
            PlanButtonLabel(title: "Copy link", icon: .copy, kind: .secondary)
        }
        .planButton(.secondary, size: .small)
        .disabled(model.isWorking)
        .accessibilityIdentifier("planOpenLinkCopy")
    }

    private var shareButton: some View {
        Button { Task { await model.shareLink() } } label: {
            PlanButtonLabel(title: "Share", icon: .share, kind: .primary, isLoading: model.isWorking)
        }
        .planButton(.primary, size: .small)
        .disabled(model.isWorking)
        .accessibilityLabel("Share the link")
        .accessibilityIdentifier("planOpenLinkShare")
    }
}

extension PlanCardDTO {
    /// One link for everyone: a private plan hosted by a person, not a playdate, whose host has the switch (H5).
    var takesOpenLink: Bool {
        takesGuestAnswers && isPrivate
    }
}
