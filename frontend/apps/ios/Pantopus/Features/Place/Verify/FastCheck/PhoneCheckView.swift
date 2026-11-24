//
//  PhoneCheckView.swift
//  Pantopus
//
//  "Phone check" (FASTVERIFY drawings V2 and V3, then B3 or B4): the mobile
//  number and the name on its account, the texted code, and the result.
//

import SwiftUI
import UIKit

struct PhoneCheckView: View {
    @State private var viewModel: PhoneCheckViewModel
    @FocusState private var focus: Field?
    private let isRenter: Bool
    private let onStart: (PlaceVerifyMethod) -> Void
    private let onMailCode: () -> Void
    private let onGoToPlace: () -> Void
    private let onBack: () -> Void

    private enum Field: Hashable { case phone, first, last }

    init(
        viewModel: PhoneCheckViewModel,
        isRenter: Bool,
        onStart: @escaping (PlaceVerifyMethod) -> Void,
        onMailCode: @escaping () -> Void,
        onGoToPlace: @escaping () -> Void,
        onBack: @escaping () -> Void
    ) {
        _viewModel = State(initialValue: viewModel)
        self.isRenter = isRenter
        self.onStart = onStart
        self.onMailCode = onMailCode
        self.onGoToPlace = onGoToPlace
        self.onBack = onBack
    }

    var body: some View {
        Group {
            switch viewModel.stage {
            case .number, .code:
                VStack(spacing: 0) {
                    FastCheckTopBar(title: "Phone check") {
                        if viewModel.stage == .code { viewModel.changeNumber() } else { onBack() }
                    }
                    ScrollView {
                        VStack(alignment: .leading, spacing: Spacing.s4) {
                            if viewModel.stage == .number { numberForm } else { codeForm }
                        }
                        .padding(.horizontal, Spacing.s4)
                        .padding(.top, Spacing.s3)
                        .padding(.bottom, Spacing.s5)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    dock
                }
            case .verified:
                FastCheckVerifiedView(
                    kind: .phone,
                    address: viewModel.address,
                    isRenter: isRenter,
                    onMailCode: HomeVerifyOptionsStore.shared.cached(homeId: viewModel.homeId)?.offers(.mail) == true ? onMailCode : nil,
                    onGoToPlace: onGoToPlace
                )
            case .noMatch:
                VStack(spacing: 0) {
                    FastCheckTopBar(title: "Phone check", onBack: onBack)
                    PhoneCheckNoMatchView(
                        address: viewModel.address,
                        number: viewModel.sentTo.map(PhoneCheckViewModel.display) ?? "",
                        rows: PlaceVerifySheet.otherWays(
                            HomeVerifyOptionsStore.shared.cached(homeId: viewModel.homeId),
                            excluding: .phone
                        ),
                        onStart: onStart,
                        onNotNow: onBack
                    )
                }
            }
        }
        .background(Theme.Color.appBg)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task { await viewModel.load() }
        .accessibilityIdentifier("phoneCheck")
    }

    // MARK: V2, the number

    private var numberForm: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            Text("What's your mobile number?")
                .scaledFont(28, weight: .bold)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            (Text("We text you a code. Then we ask the phone company's records one thing: is this number billed to ")
                + Text(viewModel.address).bold() + Text("?"))
                .scaledFont(16)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text("Mobile number")
                    .scaledFont(14, weight: .medium)
                    .foregroundStyle(Theme.Color.appText)
                field("Mobile number", text: $viewModel.phoneInput, field: .phone, contentType: .telephoneNumber)
                    .keyboardType(.phonePad)
                    .accessibilityIdentifier("phoneCheck.number")
            }
            accountName
            HStack(alignment: .top, spacing: Spacing.s3) {
                Icon(.lock, size: 16, color: Theme.Color.primary700)
                    .accessibilityHidden(true)
                Text("We send your name, this address and your number to our phone-check service. "
                    + "It answers match or no match. We never see your phone records.")
                    .scaledFont(14)
                    .foregroundStyle(Theme.Color.primary700)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(Spacing.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).fill(Theme.Color.infoBg))
            .accessibilityElement(children: .combine)
            errorLine
        }
    }

    /// "Name on the phone account": the account's name, or someone else's when the bill is in their name.
    private var accountName: some View {
        FastCheckCard {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                Text("Name on the phone account", style: .overline)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                if viewModel.usesOtherName {
                    field("First name", text: $viewModel.otherFirstName, field: .first, contentType: .givenName)
                        .accessibilityIdentifier("phoneCheck.firstName")
                    field("Last name", text: $viewModel.otherLastName, field: .last, contentType: .familyName)
                        .accessibilityIdentifier("phoneCheck.lastName")
                } else {
                    ViewThatFits(in: .horizontal) {
                        HStack {
                            nameText
                            Spacer(minLength: Spacing.s2)
                            otherNameButton
                        }
                        VStack(alignment: .leading, spacing: Spacing.s1) {
                            nameText
                            otherNameButton
                        }
                    }
                }
            }
        }
    }

    private var nameText: some View {
        Text(viewModel.accountName)
            .scaledFont(17, weight: .medium)
            .foregroundStyle(Theme.Color.appText)
            .accessibilityIdentifier("phoneCheck.accountName")
    }

    private var otherNameButton: some View {
        Button {
            viewModel.usesOtherName = true
            focus = .first
        } label: {
            Text("Someone else's name")
                .scaledFont(14)
                .foregroundStyle(Theme.Color.appText)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("phoneCheck.otherName")
    }

    // MARK: V3, the code

    private var codeForm: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            Text("Enter the 6-digit code")
                .scaledFont(28, weight: .bold)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            (Text("We texted it to ") + Text(viewModel.sentTo.map(PhoneCheckViewModel.display) ?? "").bold() + Text("."))
                .scaledFont(16)
                .foregroundStyle(Theme.Color.appTextSecondary)
            Button(action: viewModel.changeNumber) {
                Text("Change number")
                    .scaledFont(14)
                    .foregroundStyle(Theme.Color.appText)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("phoneCheck.changeNumber")
            CodeInput(value: $viewModel.code, identifier: "phoneCheck.code") { _ in
                Task { await viewModel.verify() }
            }
            resendLine
            HStack(alignment: .top, spacing: Spacing.s3) {
                Icon(.info, size: 16, color: Theme.Color.primary700)
                    .accessibilityHidden(true)
                Text("Next we check this number against your home's address. It takes a few seconds.")
                    .scaledFont(14)
                    .foregroundStyle(Theme.Color.primary700)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(Spacing.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).fill(Theme.Color.infoBg))
            .accessibilityElement(children: .combine)
            errorLine
        }
    }

    /// "Send again in 0:24", then a way to send again.
    private var resendLine: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int((viewModel.resendAvailableAt ?? .distantPast).timeIntervalSince(context.date).rounded(.up)))
            Group {
                if left > 0 {
                    Text("Send again in \(left / 60):\(String(format: "%02d", left % 60))")
                        .scaledFont(14)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .frame(minHeight: 44)
                } else {
                    Button {
                        Task { await viewModel.sendCode() }
                    } label: {
                        Text("Send again")
                            .scaledFont(14, weight: .medium)
                            .foregroundStyle(Theme.Color.primaryInk)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.isWorking)
                    .accessibilityIdentifier("phoneCheck.sendAgain")
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: Pieces

    @ViewBuilder
    private var errorLine: some View {
        if let error = viewModel.error {
            Text(error)
                .scaledFont(14)
                .foregroundStyle(Theme.Color.error)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("phoneCheck.error")
        }
    }

    private var dock: some View {
        FastCheckDock {
            if viewModel.stage == .number {
                PrimaryButton(title: "Text me a code", isLoading: viewModel.isWorking, isEnabled: viewModel.canSend) {
                    focus = nil
                    await viewModel.sendCode()
                }
                .accessibilityIdentifier("phoneCheck.send")
                Text("We use your number for this check only. Message rates may apply.")
                    .scaledFont(13)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                PrimaryButton(title: "Verify", isLoading: viewModel.isWorking, isEnabled: viewModel.canVerify) {
                    await viewModel.verify()
                }
                .accessibilityIdentifier("phoneCheck.verify")
            }
        }
    }

    private func field(_ label: String, text: Binding<String>, field: Field, contentType: UITextContentType) -> some View {
        TextField(label, text: text)
            .font(Theme.Font.body)
            .textContentType(contentType)
            .autocorrectionDisabled()
            .focused($focus, equals: field)
            .padding(.horizontal, Spacing.s3)
            .frame(minHeight: 48)
            .typesInFieldOnTap()
            .background(Theme.Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                    .stroke(focus == field ? Theme.Color.primary600 : Theme.Color.appBorder, lineWidth: focus == field ? 1.5 : 1)
            )
    }
}

/// A fast-check screen's top bar: back and the centered title, as the drawings show.
struct FastCheckTopBar: View {
    let title: String
    let onBack: () -> Void

    var body: some View {
        ZStack {
            // Capped like the wizard's bar: the title stays clear of the back button at the largest sizes.
            Text(title)
                .scaledFont(17, weight: .semibold)
                .foregroundStyle(Theme.Color.appText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, 52)
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .accessibilityAddTraits(.isHeader)
            HStack {
                Button(action: onBack) {
                    Icon(.chevronLeft, size: 22, color: Theme.Color.appText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")
                .accessibilityIdentifier("fastCheck.back")
                Spacer()
            }
            .padding(.horizontal, Spacing.s2)
        }
        .frame(minHeight: 52)
        .background(Theme.Color.appBg)
        // On an iPad the bar runs the window's width, Back in its top-left corner.
        .topBarSpansWindow()
    }
}
