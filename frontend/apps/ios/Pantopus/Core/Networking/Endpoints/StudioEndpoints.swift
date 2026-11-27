//
//  StudioEndpoints.swift
//  Pantopus
//
//  The requests only the Studio sends ("Pulse, reinvented", CONTRACT sections 2 to 4), and only while
//  `pulse_reinvented` is on for the person. Today's screens never send them.
//

import Foundation

public enum StudioEndpoints {
    /// `PUT /api/moments/:id/reaction` with `{ "signal": … }` (CONTRACT 4): one of the five signals, or null to take it
    /// back; it replaces the caller's emoji. Route `backend/routes/moments.js` (reaction).
    static func signal(momentId: String, signal: String?) -> Endpoint {
        let id = momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId
        return Endpoint(method: .put, path: "/api/moments/\(id)/reaction", body: MomentSignalBody(signal: signal))
    }

    /// `POST /api/moments/:id/guess` (CONTRACT 5c): the reader's one guess at a guess-the-spot Moment's spot. Answers how
    /// far off it was and the Moment in full. Route `backend/routes/moments.js` (guess).
    static func guess(momentId: String, latitude: Double, longitude: Double) -> Endpoint {
        let id = momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId
        return Endpoint(method: .post, path: "/api/moments/\(id)/guess", body: MomentGuessBody(latitude: latitude, longitude: longitude))
    }

    /// `GET /api/moments/daily-spot` (CONTRACT 5d): the town's guess-the-spot Moment for today, the same for everyone.
    /// Route `backend/routes/moments.js:764` (daily-spot).
    static func dailySpot(latitude: Double, longitude: Double) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/moments/daily-spot",
            query: ["latitude": String(format: "%.4f", latitude), "longitude": String(format: "%.4f", longitude)],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

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
