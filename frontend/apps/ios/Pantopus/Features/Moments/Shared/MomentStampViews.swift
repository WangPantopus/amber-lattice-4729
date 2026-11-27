//
//  MomentStampViews.swift
//  Pantopus
//
//  How a Pantopus-checked stamp looks ("Pulse, reinvented" phase 0 step 3; boards B1, B2, B3, B5). The postmark is
//  one round mark (place over the top, weather under it, the date and time inside), in wet red ink while the Moment
//  reads "Live from here" and dark ink after; every other stamp is a small chip with its icon and words. The same
//  views draw a stamp in the Studio, in the viewer and anywhere else a Moment shows its picture.
//

import SwiftUI

/// One stamp at its natural size (scale 1).
struct MomentStampView: View {
    let kind: MomentStampKind
    let value: MomentStampValue?
    /// The postmark's ink: wet while the Moment reads "Live from here".
    var wet = true

    var body: some View {
        switch kind {
        case .postmark:
            MomentPostmark(
                place: value?.place ?? "",
                date: value?.dateLabel ?? "",
                time: value?.timeLabel ?? "",
                weather: Self.weatherWords(value?.weather),
                wet: wet
            )
        default:
            MomentStampChip(icon: Self.icon(kind), words: Self.words(kind, value))
        }
    }

    /// What a chip reads.
    static func words(_ kind: MomentStampKind, _ value: MomentStampValue?) -> String {
        switch kind {
        case .weather:
            weatherWords(MomentStampWeather(tempF: value?.tempF, kind: value?.kind, label: value?.label))
        default:
            value?.label ?? ""
        }
    }

    /// "48°F · Fog".
    static func weatherWords(_ weather: MomentStampWeather?) -> String {
        guard let weather else { return "" }
        let temp = weather.tempF.map { "\($0)°F" }
        return [temp, weather.label].compactMap { $0 }.joined(separator: " · ")
    }

    static func icon(_ kind: MomentStampKind) -> PantopusIcon {
        switch kind {
        case .postmark: .circleDot
        case .weather: .cloud
        case .elevation: .mountain
        case .place: .mapPin
        case .time: .clock
        case .sunset: .sunset
        case .homeDistance: .home
        }
    }

    /// The tray's name for each kind, for VoiceOver.
    static func name(_ kind: MomentStampKind) -> String {
        switch kind {
        case .postmark: "Postmark"
        case .weather: "Weather"
        case .elevation: "Elevation"
        case .place: "Place"
        case .time: "Time"
        case .sunset: "Sunset"
        case .homeDistance: "Miles from home"
        }
    }
}

/// A small stamp: its icon and its words on a dark glass chip (B2's "180 ft").
struct MomentStampChip: View {
    let icon: PantopusIcon
    let words: String

    var body: some View {
        HStack(spacing: 6) {
            Icon(icon, size: 15, strokeWidth: 2.2, color: .white)
            Text(words)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .fixedSize()
        }
        .padding(.horizontal, 12)
        .frame(height: 34)
        .background(Capsule().fill(StudioPalette.chip))
        .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(words)
    }
}

/// The postmark (B2): a round paper mark with two rings, the place along the top, the weather along the bottom, and
/// the date over the time in the middle, all in one ink.
struct MomentPostmark: View {
    let place: String
    let date: String
    let time: String
    let weather: String
    let wet: Bool
    /// The natural size, in points.
    static let size: CGFloat = 96

    var body: some View {
        let ink = wet ? StudioPalette.wetInk : StudioPalette.driedInk
        let unit = Self.size / 76
        ZStack {
            Circle().fill(StudioPalette.paper)
            Circle().stroke(ink, lineWidth: 1.8 * unit).padding(3.5 * unit)
            Circle().stroke(ink, lineWidth: 1 * unit).frame(width: 40 * unit, height: 40 * unit)
            MomentArcText(text: place.uppercased(), radius: 25 * unit, fontSize: 8.4 * unit, kerning: 1.6 * unit, top: true)
            MomentArcText(text: weather.uppercased(), radius: 28.5 * unit, fontSize: 7.4 * unit, kerning: 1.3 * unit, top: false)
            VStack(spacing: 1 * unit) {
                Text(date.uppercased()).font(.system(size: 9.6 * unit, weight: .heavy))
                Text(time.uppercased()).font(.system(size: 7.6 * unit, weight: .bold))
            }
        }
        .foregroundStyle(ink)
        .frame(width: Self.size, height: Self.size)
        .shadow(color: .black.opacity(0.4), radius: 5, x: 0, y: 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Postmark: \(place), \(date), \(time)\(weather.isEmpty ? "" : ", \(weather)")")
    }
}

/// Words set along a circle: over the top reading left to right, or under the bottom reading left to right.
struct MomentArcText: View {
    let text: String
    let radius: CGFloat
    let fontSize: CGFloat
    var kerning: CGFloat = 0
    let top: Bool

    var body: some View {
        let letters = Array(text)
        // Each letter's width, roughly: the font's average for these heavy capitals, plus the kerning. A long name
        // ("Camas Heritage Park") shrinks until it fits a little less than half the circle.
        let natural = (fontSize * 0.68 + kerning) * CGFloat(max(letters.count - 1, 0))
        let fit = min(1, .pi * radius * 0.82 / max(natural, 1))
        let size = fontSize * fit
        let step = (fontSize * 0.68 + kerning) * fit
        let total = step * CGFloat(max(letters.count - 1, 0))
        ZStack {
            ForEach(Array(letters.enumerated()), id: \.offset) { index, letter in
                let offset = CGFloat(index) * step - total / 2
                let angle = Double(offset / radius) * 180 / .pi
                Text(String(letter))
                    .font(.system(size: size, weight: .heavy))
                    // Over the top the letters stand outward; under the bottom they stand inward, so both read upright.
                    .offset(y: top ? -radius : radius)
                    .rotationEffect(.degrees(top ? angle : -angle))
            }
        }
        .accessibilityHidden(true)
    }
}
