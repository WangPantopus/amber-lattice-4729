//
//  PlanGiftCard.swift
//  Pantopus
//
//  Plans for the holidays, the gift exchange on the plan's page (08-extras section 4, board 28). Before the draw, for
//  a person who is in (the host too): "Gift exchange" / "Up to $25" / "Names are drawn Friday at noon · 8 joined",
//  "Your wish, if you like" and "Join"; joined, "You're in the exchange" with "Change" and "Leave". After the draw:
//  "You're giving to", the name, their wish and "Only you can see who you drew…", then "Your wish" with "Change". The
//  host sees the count and "Draw names now", never a name but their own. The name drawn lives only in this card,
//  read with the plan's page (memory only while open); it is never logged or kept anywhere else.
//

import SwiftUI

struct PlanGiftCard: View {
    let viewModel: PlanScreenViewModel
    let gift: PlanGiftDTO
    let isHost: Bool

    @State private var wish = ""
    @State private var editing = false
    @State private var isWorking = false
    @State private var asksDrawAgain = false
    @State private var line: String?
    @Environment(\.dynamicTypeSize) private var typeSize

    private var joined: Bool {
        gift.mine?.joined == true
    }

    var body: some View {
        VStack(spacing: Spacing.s3) {
            PlanCardBox(padding: 14) {
                VStack(alignment: .leading, spacing: Spacing.s3) {
                    header
                    if gift.isDrawn, let receiver = gift.mine?.givingTo {
                        PlanGiftReceiver(receiver: receiver, mine: gift.mine)
                    } else {
                        Text("\(gift.drawText) · \(gift.joinedText)")
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("planGiftStatus")
                    }
                    if !gift.isDrawn {
                        if joined, !editing { joinedRow } else if joined || gift.canJoin { wishForm }
                    }
                    if isHost { hostButton }
                    if let line {
                        Text(line)
                            .planFont(.footnote)
                            .foregroundStyle(Theme.Color.error)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("planGiftError")
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("planGiftCard")
            if gift.isDrawn, joined { yourWish }
        }
        .confirmationDialog("Draw names again?", isPresented: $asksDrawAgain, titleVisibility: .visible) {
            Button("Draw again") { draw() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Everyone in the exchange gets a new name.")
        }
    }

    /// The tile, "Gift exchange" and "Up to $25"; the amount goes under the name at the accessibility text sizes.
    private var header: some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.appSurfaceSunken)
                .frame(width: 36, height: 36)
                .overlay(Icon(.gift, size: 18, color: Theme.Color.appTextStrong))
                .accessibilityHidden(true)
            stacked {
                Text("Gift exchange")
                    .planFont(.bodyStrong)
                    .foregroundStyle(Theme.Color.appText)
                    .frame(maxWidth: typeSize.isAccessibilitySize ? nil : .infinity, alignment: .leading)
                Text(gift.budgetText).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Side by side, or one under the other at the accessibility text sizes.
    private func stacked(@ViewBuilder _ content: () -> some View) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Spacing.s3))
        return layout { content() }.frame(maxWidth: .infinity, alignment: .leading)
    }

    /// "You're in the exchange", the wish, "Change" and "Leave".
    private var joinedRow: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(spacing: Spacing.s2) {
                Icon(.checkCircle, size: 18, color: Theme.Color.success).accessibilityHidden(true)
                Text("You're in the exchange")
                    .planFont(.bodyStrong)
                    .foregroundStyle(Theme.Color.appText)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let mine = gift.mine?.wish, !mine.isEmpty {
                Text(mine).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: Spacing.s4) {
                Button("Change") { startEditing() }
                    .planButton(.text, size: .small)
                    .accessibilityLabel("Change your wish")
                    .accessibilityIdentifier("planGiftChange")
                Button("Leave") { leave() }
                    .planButton(.textDanger, size: .small)
                    .disabled(isWorking)
                    .accessibilityLabel("Leave the gift exchange")
                    .accessibilityIdentifier("planGiftLeave")
            }
        }
    }

    /// "Your wish, if you like" and "Join" (or "Save" while changing it).
    private var wishForm: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            TextField("Your wish, if you like", text: $wish, axis: .vertical)
                .planFont(.body)
                .lineLimit(1...4)
                .padding(.horizontal, Spacing.s3)
                .padding(.vertical, 10)
                .frame(minHeight: 44)
                .typesInFieldOnTap()
                .overlay(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).stroke(Theme.Color.appBorderStrong, lineWidth: 1))
                .onChange(of: wish) { _, new in if new.count > 120 { wish = String(new.prefix(120)) } }
                .accessibilityLabel("Your wish, if you like")
                .accessibilityIdentifier("planGiftWish")
            Button { save() } label: {
                PlanButtonLabel(title: joined ? "Save" : "Join", kind: .primary, isLoading: isWorking)
            }
            .planButton(.primary, size: .small)
            .disabled(isWorking)
            .accessibilityLabel(joined ? "Save your wish" : "Join the gift exchange")
            .accessibilityIdentifier("planGiftJoin")
        }
    }

    /// The host's: "Draw names now" before the draw, "Draw again" after it.
    private var hostButton: some View {
        Button {
            if gift.isDrawn { asksDrawAgain = true } else { draw() }
        } label: {
            PlanButtonLabel(title: gift.isDrawn ? "Draw again" : "Draw names now", kind: .secondary, isLoading: isWorking && !editing)
        }
        .planButton(gift.isDrawn ? .text : .secondary, size: .small)
        .disabled(isWorking)
        .accessibilityIdentifier("planGiftDraw")
    }

    /// After the draw: "Your wish" with "Change", or the field while changing it.
    private var yourWish: some View {
        PlanCardBox(padding: 14) {
            if editing {
                VStack(alignment: .leading, spacing: Spacing.s2) {
                    Text("Your wish").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    wishForm
                }
            } else {
                stacked {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Your wish").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                        if let mine = gift.mine?.wish, !mine.isEmpty {
                            Text(mine)
                                .planFont(.small)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                    Button("Change") { startEditing() }
                        .planButton(.text, size: .small)
                        .fixedSize()
                        .accessibilityLabel("Change your wish")
                        .accessibilityIdentifier("planGiftChange")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planGiftYourWish")
    }

    private func startEditing() {
        wish = gift.mine?.wish ?? ""
        editing = true
    }

    private func save() {
        let text = wish.trimmingCharacters(in: .whitespacesAndNewlines)
        let api = viewModel.api, planId = viewModel.planId
        let endpoint = joined
            ? PlansEndpoints.changeGiftWish(planId: planId, wish: text)
            : PlansEndpoints.joinGift(planId: planId, wish: text)
        run(closesEditor: true) { try await api.request(endpoint, as: PlanGiftResponse.self) }
    }

    private func leave() {
        let api = viewModel.api, planId = viewModel.planId
        run { try await api.request(PlansEndpoints.leaveGift(planId: planId), as: PlanGiftResponse.self) }
    }

    private func draw() {
        let api = viewModel.api, planId = viewModel.planId
        run { try await api.request(PlansEndpoints.drawGift(planId: planId), as: PlanGiftResponse.self) }
    }

    private func run(closesEditor: Bool = false, _ work: @escaping () async throws -> PlanGiftResponse) {
        guard !isWorking else { return }
        Task {
            isWorking = true
            line = nil
            do {
                _ = try await work()
                if closesEditor { editing = false }
                PlansStoreReads.changed(planId: viewModel.planId)
            } catch {
                line = PlanErrors.sentence(for: error)
            }
            await viewModel.load()
            isWorking = false
        }
    }
}

/// Board 28: "You're giving to", the initial and name, their wish, and the line that only the reader sees it.
private struct PlanGiftReceiver: View {
    let receiver: PlanGiftReceiverDTO
    let mine: PlanGiftMineDTO?

    var body: some View {
        VStack(spacing: Spacing.s3) {
            VStack(spacing: Spacing.s2) {
                Text("You're giving to").planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                Circle()
                    .fill(Theme.Color.successBg)
                    .frame(width: 64, height: 64)
                    .overlay(Text(String(receiver.name.prefix(1))).planFont(.h2).foregroundStyle(Theme.Color.success))
                    .accessibilityHidden(true)
                Text(receiver.name).planFont(.h2).foregroundStyle(Theme.Color.appText).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("planGiftGivingTo")
            if let wish = receiver.wish, !wish.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                    Icon(.heart, size: 14, color: Theme.Color.primary600).accessibilityHidden(true)
                    (Text("\(mine?.wishText ?? "Their wish"): ").bold() + Text(wish))
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(Spacing.s3)
                .background(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous).fill(Theme.Color.infoBg))
                .accessibilityElement(children: .combine)
            }
            if let secret = mine?.secretText {
                PlanScopeLine(text: secret)
            }
        }
    }
}
