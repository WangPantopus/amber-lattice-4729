//
//  MomentEditDTOs.swift
//  Pantopus
//
//  "Pulse, reinvented": the author's 15-minute edit of a Moment (CONTRACT 3), `PATCH /api/moments/:id`. Only what
//  changed is sent; a caption of "" clears it.
//

import Foundation

public struct MomentEditBody: Encodable, Sendable {
    public var caption: String?
    public var stamps: [MomentStampPlacement]?
    public var audience: String?

    public init(caption: String? = nil, stamps: [MomentStampPlacement]? = nil, audience: String? = nil) {
        self.caption = caption
        self.stamps = stamps
        self.audience = audience
    }

    private enum CodingKeys: String, CodingKey {
        case caption, stamps, audience
    }

    /// Keys left out unless set, so the server changes only what changed.
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(caption, forKey: .caption)
        try c.encodeIfPresent(stamps, forKey: .stamps)
        try c.encodeIfPresent(audience, forKey: .audience)
    }
}

/// `200 { moment }`.
public struct MomentEditResponse: Decodable, Sendable {
    public let moment: MomentDTO
}

/// `stamp_choices` on the author's own Moment while it may be edited: the value the server kept for every stamp an
/// edit may place (until when: `editable_until`; last changed: `edited_at`). A kind the app doesn't know, or one with
/// no value, is left out.
struct MomentStampChoices: Decodable {
    let values: [MomentStampKind: MomentStampValue]

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode([String: MomentStampValue?].self)
        var values: [MomentStampKind: MomentStampValue] = [:]
        for (key, value) in raw {
            if let kind = MomentStampKind(rawValue: key), let value { values[kind] = value }
        }
        self.values = values
    }
}
