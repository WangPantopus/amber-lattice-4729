//
//  PulseComposeViewModel+PenName.swift
//  Pantopus
//
//  "Post as" in the Pulse composer (contract `docs/product/made-up-names/README.md`, "What each app builds" 1–3): a
//  new post to people nearby may carry the person's made-up name instead of their own. While it is chosen the post is
//  one of the four kinds, goes to people nearby, is words only, and is sent as `postAs: "pen_name"`.
//

import SwiftUI

extension PulseComposeViewModel {
    /// The composer offers "Post as": a new post by a person to a place (where they are, or their home area), of a
    /// kind a made-up name may carry.
    var offersPostAs: Bool {
        guard !isEditing, businessAuthorId == nil, quote == nil, taskShare == nil else { return false }
        switch postingTarget {
        case .currentLocation, .home: break
        default: return false
        }
        return PenNameStore.shared.allows(postType: effectivePostType)
    }

    /// The made-up name the post will carry; nil while it goes out under the person's own name.
    var penNameChosen: PenNameDTO? {
        guard offersPostAs, voice == .penName else { return nil }
        return PenNameStore.shared.penName
    }

    /// "Post as Night Gardener" or "Post as Maria Lopez": the button always names the one it will carry.
    var postAsButtonLabel: String {
        "Post as \(penNameChosen?.name ?? PenNameStore.ownName)"
    }

    /// The made-up name can't carry this draft yet: attachments (it is words only), or the place refused it.
    var penNameBlocksSubmit: Bool {
        guard penNameChosen != nil else { return false }
        return !photos.isEmpty || penNameCheck?.allowed == false
    }

    /// The place's refusal (too few verified homes), or the warning shown above the button.
    var penNamePlaceNote: (text: String, refused: Bool)? {
        guard penNameChosen != nil, let check = penNameCheck else { return nil }
        if !check.allowed, let refusal = check.refusal { return (refusal.message, true) }
        return check.warning.map { ($0, false) }
    }

    /// A choice in "Post as". The made-up name chosen before there is one opens the name screen first.
    func selectVoice(_ value: PenNameVoice) {
        guard value != voice || value == .penName else { return }
        if value == .own {
            voice = .own
            penNameCheck = nil
            return
        }
        guard let me = PenNameStore.shared.me, me.allowed else { return }
        guard me.penName != nil else {
            showsPenNameSetup = true
            return
        }
        voice = .penName
        // A made-up name speaks to people nearby only.
        visibility = .neighbors
        Task { await checkPenNamePlace() }
    }

    /// The name screen kept a name: it is chosen, and a post that waited for it goes out.
    func penNameTaken() {
        voice = .penName
        visibility = .neighbors
        let resends = sendsAfterPenName
        sendsAfterPenName = false
        Task {
            await checkPenNamePlace()
            if resends { await submit() }
        }
    }

    /// The name screen closed without a name: the post stays on the person's own name.
    func penNameSetupClosed() {
        sendsAfterPenName = false
        if PenNameStore.shared.penName == nil { voice = .own }
    }

    /// Reads `/me` for the row (once per app run) and, while the made-up name is chosen, `/check` for the place.
    func loadPostAs() async {
        guard offersPostAs else { return }
        await PenNameStore.shared.load()
        if penNameChosen != nil { await checkPenNamePlace() }
    }

    /// `GET /api/pen-names/check` at the draft's place: whether it may carry the made-up name, and the warning.
    func checkPenNamePlace() async {
        guard penNameChosen != nil, let latitude = postingTarget?.latitude, let longitude = postingTarget?.longitude
        else { return }
        penNameCheck = try? await APIClient.shared.request(
            PenNamesEndpoints.check(latitude: latitude, longitude: longitude),
            as: PenNameCheckResponse.self
        )
    }

    /// Under the made-up name the post is the place target's, with no home, business, quote, picture places or
    /// tagged venue: the server floats it over an area of at least 100 homes.
    func applyPenName(to request: inout PostCreateRequest) {
        guard penNameChosen != nil else { return }
        request.postAs = "pen_name"
        request.audience = "nearby"
        request.homeId = nil
        request.businessId = nil
        request.quotedPostId = nil
        request.mediaLocations = nil
        request.latitude = postingTarget?.latitude
        request.longitude = postingTarget?.longitude
        request.locationName = nil
        request.locationAddress = nil
        request.geocodeProvider = nil
        request.geocodeAccuracy = nil
        request.geocodePlaceId = nil
    }

    /// `PEN_NAME_NEEDED`: the name screen opens, and the post goes out again once a name is kept.
    func opensPenNameSetup(for error: any Error) -> Bool {
        guard voice == .penName, PenNameRefusal.from(error)?.needsName == true else { return false }
        sendsAfterPenName = true
        showsPenNameSetup = true
        return true
    }
}

/// The made-up name screen over the composer, and `/me` read when "Post as" shows.
struct PulseComposePenNameSurfaces: ViewModifier {
    @Bindable var viewModel: PulseComposeViewModel

    func body(content: Content) -> some View {
        content
            .sheet(
                isPresented: $viewModel.showsPenNameSetup,
                onDismiss: { viewModel.penNameSetupClosed() },
                content: { PenNameSetupView { _ in viewModel.penNameTaken() } }
            )
            .task(id: viewModel.offersPostAs) { await viewModel.loadPostAs() }
    }
}
