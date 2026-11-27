//
//  StudioEndpoints.swift
//  Pantopus
//
//  The requests only the Studio sends ("Pulse, reinvented", CONTRACT sections 2 to 4), and only while
//  `pulse_reinvented` is on for the person. Today's screens never send them.
//

import Foundation

public enum StudioEndpoints {
    /// `POST /api/moments/place-preview` with `stamps: true` (CONTRACT 2a): what the tray's stamps would read for a
    /// Moment posted here now. Route `backend/routes/moments.js` (place-preview).
    public static func stampsPreview(latitude: Double, longitude: Double) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/moments/place-preview",
            body: StudioStampsPreviewBody(latitude: latitude, longitude: longitude)
        )
    }
}

struct StudioStampsPreviewBody: Encodable {
    let latitude: Double
    let longitude: Double
    let stamps = true
}

/// The tray's values: each kind's value, or nil where the server can't give one here (an app hides that stamp).
public struct StudioStampsPreviewDTO: Decodable, Sendable, Hashable {
    public let values: [MomentStampKind: MomentStampValue]

    private struct Keys: CodingKey {
        var stringValue: String
        var intValue: Int? {
            nil
        }

        init(stringValue: String) {
            self.stringValue = stringValue
        }

        init?(intValue _: Int) {
            nil
        }
    }

    private enum CodingKeys: String, CodingKey {
        case stamps
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let stamps = try? c.nestedContainer(keyedBy: Keys.self, forKey: .stamps) else {
            values = [:]
            return
        }
        var read: [MomentStampKind: MomentStampValue] = [:]
        for key in stamps.allKeys {
            guard let kind = MomentStampKind(rawValue: key.stringValue),
                  let value = try? stamps.decodeIfPresent(MomentStampValue.self, forKey: key) else { continue }
            read[kind] = value
        }
        values = read
    }
}
