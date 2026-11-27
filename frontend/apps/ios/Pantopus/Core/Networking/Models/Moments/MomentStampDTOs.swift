//
//  MomentStampDTOs.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 0 step 3: the stamps Pantopus checked (CONTRACT section 2). The author places them; the
//  server fills every value when the Moment is posted, so nobody can type one. Only while `pulse_reinvented` is on
//  for the caller does the server read or send any of this; today's apps never see it.
//

import Foundation

/// The seven kinds, in the tray's order.
public enum MomentStampKind: String, Codable, CaseIterable, Sendable, Hashable {
    case postmark
    case weather
    case elevation
    case place
    case time
    case sunset
    case homeDistance = "home_distance"
}

/// Where a stamp sits on the picture (or a text card): its centre as 0–1 of the width and height from the top left,
/// its size (1 is the natural size, 0.25–4) and its turn in degrees, clockwise.
public struct MomentStampPlacement: Codable, Sendable, Hashable {
    public var kind: MomentStampKind
    public var x: Double
    public var y: Double
    public var scale: Double
    public var rotation: Double

    public init(kind: MomentStampKind, x: Double, y: Double, scale: Double = 1, rotation: Double = 0) {
        self.kind = kind
        self.x = x
        self.y = y
        self.scale = scale
        self.rotation = rotation
    }
}

/// The weather a stamp reads: "48°F · Fog".
public struct MomentStampWeather: Decodable, Sendable, Hashable {
    public let tempF: Int?
    public let kind: String?
    public let label: String?

    private enum CodingKeys: String, CodingKey {
        case kind, label
        case tempF = "temp_f"
    }
}

/// A stamp's value, as the server filled it. Every field is optional: each kind carries its own few, and a field the
/// app doesn't know is never an error.
public struct MomentStampValue: Decodable, Sendable, Hashable {
    /// The postmark's place ("Camas, WA"); the place stamp uses `label`.
    public let place: String?
    public let dateLabel: String?
    public let timeLabel: String?
    public let weather: MomentStampWeather?
    /// What the stamp reads as is: "Lacamas Lake", "4:41 PM", "Sunset in 12 min", "3 mi from home", "180 ft".
    public let label: String?
    // The weather stamp's own fields (its value is the weather itself).
    public let tempF: Int?
    public let kind: String?

    private enum CodingKeys: String, CodingKey {
        case place, weather, label, kind
        case dateLabel = "date_label"
        case timeLabel = "time_label"
        case tempF = "temp_f"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        place = try? c.decodeIfPresent(String.self, forKey: .place)
        dateLabel = try? c.decodeIfPresent(String.self, forKey: .dateLabel)
        timeLabel = try? c.decodeIfPresent(String.self, forKey: .timeLabel)
        weather = try? c.decodeIfPresent(MomentStampWeather.self, forKey: .weather)
        label = try? c.decodeIfPresent(String.self, forKey: .label)
        tempF = try? c.decodeIfPresent(Int.self, forKey: .tempF)
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
    }

    public init(
        place: String? = nil,
        dateLabel: String? = nil,
        timeLabel: String? = nil,
        weather: MomentStampWeather? = nil,
        label: String? = nil,
        tempF: Int? = nil,
        kind: String? = nil
    ) {
        self.place = place
        self.dateLabel = dateLabel
        self.timeLabel = timeLabel
        self.weather = weather
        self.label = label
        self.tempF = tempF
        self.kind = kind
    }
}

/// A placed stamp with the value the server filled (CONTRACT 2c).
public struct MomentStampDTO: Decodable, Sendable, Hashable {
    public let placement: MomentStampPlacement
    public let value: MomentStampValue?

    private enum CodingKeys: String, CodingKey {
        case kind, x, y, scale, rotation, value
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        placement = try MomentStampPlacement(
            kind: c.decode(MomentStampKind.self, forKey: .kind),
            x: c.decode(Double.self, forKey: .x),
            y: c.decode(Double.self, forKey: .y),
            scale: (try? c.decodeIfPresent(Double.self, forKey: .scale)) ?? 1,
            rotation: (try? c.decodeIfPresent(Double.self, forKey: .rotation)) ?? 0
        )
        value = try? c.decodeIfPresent(MomentStampValue.self, forKey: .value)
    }
}

/// Steps past a stamp the app can't read (a kind from a newer server) in a list.
struct MomentStampSkip: Decodable {}

extension MomentStampDTO {
    /// A Moment's `stamps`, one by one: one the app can't read is left out, never the Moment.
    static func list(from decoder: any Decoder) -> [MomentStampDTO] {
        enum Keys: String, CodingKey { case stamps }
        guard let c = try? decoder.container(keyedBy: Keys.self), var list = try? c.nestedUnkeyedContainer(forKey: .stamps) else {
            return []
        }
        var read: [MomentStampDTO] = []
        while !list.isAtEnd {
            if let stamp = try? list.decode(MomentStampDTO.self) {
                read.append(stamp)
            } else {
                _ = try? list.decode(MomentStampSkip.self)
            }
        }
        return read
    }
}
