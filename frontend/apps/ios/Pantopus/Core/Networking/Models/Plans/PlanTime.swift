//
//  PlanTime.swift
//  Pantopus
//
//  Nearby Plans: the ISO 8601 times the Plans API sends and takes (moved
//  out of PlansDTOs.swift unchanged).
//

import Foundation

/// ISO 8601 times from the Plans API, with or without fractional seconds.
enum PlanTime {
    static func parse(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: raw)
    }

    static func string(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}
