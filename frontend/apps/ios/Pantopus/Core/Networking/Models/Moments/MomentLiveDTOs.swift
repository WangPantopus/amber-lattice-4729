//
//  MomentLiveDTOs.swift
//  Pantopus
//
//  The Live mark and the weather stamp (Moments API v4.1,
//  docs/product/moments/api-v4.1.md): a photo or video the app's own camera
//  made at its spot reads "Live from here" until `live_until`, then "Taken
//  here", and may carry the weather when it was posted ("31°F · Snow"). A
//  ring carries the latest `live_until` among its Moments, for the map's
//  "Live now" chip and the live dot. Every field is read without throwing, so
//  a Moment or a ring never fails over them, and an older server sends none.
//  Beside `MomentsDTOs.swift`, which has no room.
//

import Foundation

/// A Moment's Live mark and weather stamp (v4.1). The server decides the mark: never at home, on an area, floating or
/// with no location, and never on a library pick.
public struct MomentLiveStateDTO: Sendable, Hashable {
    /// The app's own camera made it at its spot (`taken_here`): it reads "Live from here", then "Taken here".
    public let takenHere: Bool
    /// Until when it reads "Live from here"; nil without the mark and for a Moment shared later, which only ever
    /// reads "Taken here".
    public let liveUntil: Date?
    /// The weather when it was posted; only with the mark.
    public let weather: MomentWeatherDTO?

    private enum CodingKeys: String, CodingKey {
        case weather
        case takenHere = "taken_here"
        case liveUntil = "live_until"
    }

    init(from decoder: any Decoder) {
        let c = try? decoder.container(keyedBy: CodingKeys.self)
        takenHere = (try? c?.decodeIfPresent(Bool.self, forKey: .takenHere)) ?? false
        liveUntil = takenHere ? MomentTime.parse(try? c?.decodeIfPresent(String.self, forKey: .liveUntil)) : nil
        weather = takenHere ? (try? c?.decodeIfPresent(MomentWeatherDTO.self, forKey: .weather)) : nil
    }

    /// "Live from here" now: before `live_until`.
    public func isLive(at now: Date) -> Bool {
        liveUntil.map { now < $0 } ?? false
    }
}

/// The weather stamp, `{ temp_f, kind, label }`: whole degrees Fahrenheit, one of nine kinds for the icon (the kinds
/// Today's sky uses, `WeatherConditionCode`), and the words the pill shows, which always agree with the kind.
public struct MomentWeatherDTO: Decodable, Sendable, Hashable {
    public let tempF: Int
    public let kind: WeatherConditionCode
    /// "Snow", "Partly cloudy", "Wind 38 mph".
    public let label: String

    private enum CodingKeys: String, CodingKey {
        case kind, label
        case tempF = "temp_f"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tempF = try Int(c.decode(Double.self, forKey: .tempF).rounded())
        kind = (try? c.decodeIfPresent(WeatherConditionCode.self, forKey: .kind)) ?? .unknown
        label = try c.decode(String.self, forKey: .label)
        // No words, no stamp: the pill never shows a bare temperature.
        guard !label.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .label, in: c, debugDescription: "empty label")
        }
    }

    /// "31°F · Snow", the pill's words.
    public var text: String {
        "\(tempF)°F · \(label)"
    }

    /// What VoiceOver reads: "31 degrees Fahrenheit, Snow".
    public var spoken: String {
        "\(tempF) degrees Fahrenheit, \(label)"
    }
}

extension MomentRingDTO {
    /// A ring's `live_until` (v4.1): the latest among its Moments that keep the mark, only when the Moment it is drawn
    /// at is itself an exact pin away from home; nil otherwise, and on every ring in `unplaced`.
    static func liveUntil(from decoder: any Decoder) -> Date? {
        let c = try? decoder.container(keyedBy: RingLiveKeys.self)
        return MomentTime.parse(try? c?.decodeIfPresent(String.self, forKey: .liveUntil))
    }

    /// Live now: before its `live_until`. The map clears a ring's time once it passes (`MomentsMapMemo.running`), so
    /// its pin loses the dot and "Live now" lets it go on the map's own clock.
    func isLive(at now: Date) -> Bool {
        liveUntil.map { now < $0 } ?? false
    }
}

private enum RingLiveKeys: String, CodingKey {
    case liveUntil = "live_until"
}
