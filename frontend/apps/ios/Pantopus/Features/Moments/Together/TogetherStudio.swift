//
//  TogetherStudio.swift
//  Pantopus
//
//  What the open Studio adds to the Moment it makes for "Pulse, reinvented" phase 3 ("together and back outside",
//  CONTRACT 8): what the Studio was opened for (a frame for someone's Retake, 8e) and the person's own choices in the
//  drawer (start a Retake). Each rides the create request as one more key (`TogetherCreate`). Only while the switch is
//  on, and only for the Studio the choices were made in: today's Post sheet never shows the rows, so it never sends
//  any of this, and with nothing chosen the request is exactly today's.
//

import Foundation
import Observation

@Observable
@MainActor
final class TogetherStudio {
    static let shared = TogetherStudio()

    /// What the Studio was opened for, from a screen of this build's own.
    enum Context: Equatable {
        /// Add a frame to a Retake (8e): its first picture is a ghost to line up with.
        case retakeFrame(startId: String, title: String, ghost: URL?)
    }

    /// Set before the Studio opens; cleared when it closes (`ReinventedStudioPresenter.close`).
    var context: Context?
    /// The Retake's first picture over the Studio's own while adding a frame (on by default; one tap hides it).
    var ghostOn = true
    /// "Start a Retake" and its name (1 to 60 characters).
    var startsRetake = false
    var retakeTitle = ""

    /// The Studio the choices belong to: its drawer rows claim it when they appear. A request from any other composer
    /// (today's Post sheet, another Studio) gets none of them.
    @ObservationIgnored private weak var owner: MomentsComposerModel?

    func claim(_ model: MomentsComposerModel) {
        if owner !== model { owner = model }
    }

    /// The Studio's stage is gone: its choices and what it was opened for go too.
    func release(_ model: MomentsComposerModel) {
        if owner === model { reset() }
    }

    func reset() {
        context = nil
        ghostOn = true
        startsRetake = false
        retakeTitle = ""
        owner = nil
    }

    /// The keys this Studio adds to the Moment it makes (the first part only), or nil for today's request.
    func fields(for model: MomentsComposerModel, part: Int) -> TogetherCreateFields? {
        guard PulseReinventedFlags.shared.isOn, owner === model, part == 0 else { return nil }
        var fields = TogetherCreateFields()
        switch context {
        case let .retakeFrame(startId, _, _):
            fields.retakeOf = startId
        case nil:
            let title = String(retakeTitle.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
            if startsRetake, !title.isEmpty, model.offersRetake { fields.retake = .init(title: title) }
        }
        return fields.isEmpty ? nil : fields
    }
}

extension MomentsComposerModel {
    /// `POST /api/moments` for one part of this Post (`part` 0 is the first): exactly today's request, plus phase 3's
    /// keys where this Studio chose some (`TogetherCreate`).
    func createEndpoint(_ body: MomentCreateBody, part: Int) -> Endpoint {
        TogetherCreate.endpoint(body, part: part, from: self)
    }

    /// "Start a Retake" may be chosen (8e): one photo with an exact place, taken now, away from home, under the person's
    /// own name, not a guess spot, not a Pulse post. The server checks again (`400 RETAKE_INVALID`).
    var offersRetake: Bool {
        guard case .photo = draft, !noLocationOn, pin != nil, !floats, shareLaterBody == nil else { return false }
        return !postsUnderMadeUpName && !studioGuess && studioPostKind == nil && place?.atHome != true
    }
}

/// The keys phase 3 adds at the top level of `POST /api/moments` (CONTRACT 8), each left out when not chosen.
struct TogetherCreateFields: Encodable, Hashable {
    struct RetakeStart: Encodable, Hashable {
        let title: String
    }

    var retake: RetakeStart?
    var retakeOf: String?

    var isEmpty: Bool {
        retake == nil && retakeOf == nil
    }

    private enum CodingKeys: String, CodingKey {
        case retake
        case retakeOf = "retake_of"
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(retake, forKey: .retake)
        try c.encodeIfPresent(retakeOf, forKey: .retakeOf)
    }
}

/// Today's create body with phase 3's keys beside its own, at the same level (as a subclass encodes after its super).
private struct TogetherCreateBody: Encodable {
    let base: MomentCreateBody
    let together: TogetherCreateFields

    func encode(to encoder: any Encoder) throws {
        try base.encode(to: encoder)
        try together.encode(to: encoder)
    }
}

enum TogetherCreate {
    /// `POST /api/moments` for one part of a Studio's Post. Exactly today's `MomentsEndpoints.create(body)` unless the
    /// switch is on and this Studio chose something of phase 3; then the same body plus those keys. Route
    /// `backend/routes/moments.js:371` (create).
    @MainActor
    static func endpoint(_ body: MomentCreateBody, part: Int, from model: MomentsComposerModel) -> Endpoint {
        guard let fields = TogetherStudio.shared.fields(for: model, part: part) else { return MomentsEndpoints.create(body) }
        return Endpoint(method: .post, path: "/api/moments", body: TogetherCreateBody(base: body, together: fields))
    }
}
