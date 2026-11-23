//
//  ClaimOwnershipWizardView.swift
//  Pantopus
//
//  Wraps `WizardShell` with the three claim-ownership steps.
//

import SwiftUI

/// Concrete claim-ownership wizard view. Mirrors `AddHomeWizardView` —
/// owns a `ClaimOwnershipWizardViewModel` instance, renders the active
/// step inside the shared `WizardShell`, and dispatches outbound events
/// (`dismiss` / `openClaimsList`) to the host nav stack.
@MainActor
public struct ClaimOwnershipWizardView: View {
    @State private var viewModel: ClaimOwnershipWizardViewModel
    private let onClose: @MainActor () -> Void
    private let onOpenClaimsList: @MainActor () -> Void
    /// Someone else's verification already blocks this home — RN sends
    /// the user to `/homes/find` (`claim-owner/evidence.tsx:210`).
    private let onOpenFindHome: @MainActor () -> Void
    /// A bill read at once verified the person (FASTVERIFY): B3's "Mail me a code" and "Go to your Place".
    private let billVerified: BillVerifiedActions?

    init(
        homeId: String,
        api: APIClient = .shared,
        uploader: MultipartUploader = .shared,
        verificationType: ClaimVerificationType = .owner,
        onClose: @escaping @MainActor () -> Void,
        onOpenClaimsList: @escaping @MainActor () -> Void,
        onOpenFindHome: @escaping @MainActor () -> Void = {},
        billVerified: BillVerifiedActions? = nil
    ) {
        _viewModel = State(initialValue: ClaimOwnershipWizardViewModel(
            homeId: homeId,
            api: api,
            uploader: uploader,
            verificationType: verificationType
        ))
        self.onClose = onClose
        self.onOpenClaimsList = onOpenClaimsList
        self.onOpenFindHome = onOpenFindHome
        self.billVerified = billVerified
    }

    public var body: some View {
        if viewModel.billResult == "verified", viewModel.currentStep == .success {
            FastCheckVerifiedView(
                kind: .bill,
                address: billVerified?.address ?? viewModel.startContent.homeLabel,
                isRenter: billVerified?.isRenter ?? false,
                onMailCode: billMailAction
            ) {
                (billVerified?.onGoToPlace ?? onClose)()
            }
            .navigationBarBackButtonHidden(true)
            .toolbar(.hidden, for: .navigationBar)
        } else {
            wizard
        }
    }

    private var billMailAction: (() -> Void)? {
        guard let billVerified, HomeVerifyOptionsStore.shared.cached(homeId: viewModel.homeId)?.offers(.mail) == true else { return nil }
        return { billVerified.onMailCode() }
    }

    private var wizard: some View {
        WizardShell(model: viewModel, scrollResetID: viewModel.currentStep) {
            stepContent
        }
        .onChange(of: viewModel.pendingEvent) { _, event in
            handle(event)
        }
        .onChange(of: viewModel.currentStep) { _, step in
            Analytics.track(.screenClaimOwnershipStepViewed(stepName: step.rawValue))
        }
        // Not `.task`: the view model counts appearances and loads on its own task (see `appeared()`).
        .onAppear {
            viewModel.appeared()
            Analytics.track(.screenClaimOwnershipStepViewed(stepName: viewModel.currentStep.rawValue))
        }
        .onDisappear { viewModel.disappeared() }
        .onChange(of: viewModel.hasCurrentSession) { _, current in if !current { viewModel.retire() } }
        .alert(
            "Request sent",
            isPresented: Binding(
                get: { viewModel.askRequestConfirmation != nil },
                set: { if !$0 { viewModel.acknowledgeAskConfirmation() } }
            )
        ) {
            Button("OK") { viewModel.acknowledgeAskConfirmation() }
        } message: {
            Text(viewModel.askRequestConfirmation ?? "")
        }
        .alert(
            "Could not send request",
            isPresented: Binding(
                get: { viewModel.askRequestError != nil },
                set: { if !$0 { viewModel.acknowledgeAskError() } }
            )
        ) {
            Button("OK", role: .cancel) { viewModel.acknowledgeAskError() }
        } message: {
            Text(viewModel.askRequestError ?? "")
        }
        .alert(
            "Unable to submit",
            isPresented: Binding(
                get: { viewModel.blockedByOtherClaimPrompt != nil },
                set: { if !$0 { viewModel.dismissBlockedByOtherClaim() } }
            )
        ) {
            Button("OK", role: .cancel) { viewModel.dismissBlockedByOtherClaim() }
            Button("Search homes") { viewModel.openFindHomeFromBlockedClaim() }
        } message: {
            Text(viewModel.blockedByOtherClaimPrompt ?? "")
        }
        .alert(
            viewModel.routingWarning?.title ?? "",
            isPresented: Binding(
                get: { viewModel.routingWarning != nil },
                set: { if !$0 { viewModel.acknowledgeRoutingWarning() } }
            )
        ) {
            Button("Continue") { viewModel.acknowledgeRoutingWarning() }
                .accessibilityIdentifier("claimOwnership_routingWarningContinue")
        } message: {
            Text(viewModel.routingWarning?.message ?? "")
        }
        .accessibilityIdentifier("claimOwnershipWizard")
    }

    @ViewBuilder
    private var stepContent: some View {
        switch viewModel.currentStep {
        case .start:
            if let error = viewModel.startLoadError {
                ClaimUploadErrorBanner(message: error)
                if viewModel.canRetryLoad {
                    ClaimRetryLoadButton { viewModel.retryLoad() }
                }
            }
            ClaimStartStep(
                content: viewModel.startContent,
                showsAskVerifiedOwner: viewModel.showsAskVerifiedOwner,
                selectedMethod: viewModel.selectedStartMethod
            ) { viewModel.selectStartMethod($0) }
        case .upload:
            ClaimUploadStep(viewModel: viewModel)
        case .success:
            ClaimSuccessStep(outcomeNote: viewModel.submissionOutcomeNote)
        }
    }

    private func handle(_ event: ClaimOwnershipOutboundEvent?) {
        guard let event else { return }
        switch event {
        case .dismiss:
            onClose()
        case .openClaimsList:
            onOpenClaimsList()
        case .openFindHome:
            onOpenFindHome()
        }
        viewModel.acknowledgePendingEvent()
    }
}

#Preview {
    ClaimOwnershipWizardView(
        homeId: "home-preview",
        onClose: {},
        onOpenClaimsList: {}
    )
}

/// What B3 opens after a bill read at once verified the person (FASTVERIFY phase 4).
struct BillVerifiedActions {
    let address: String
    let isRenter: Bool
    let onMailCode: @MainActor () -> Void
    let onGoToPlace: @MainActor () -> Void
}
