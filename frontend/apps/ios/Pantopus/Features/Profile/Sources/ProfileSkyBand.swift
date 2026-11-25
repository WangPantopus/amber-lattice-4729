//
//  ProfileSkyBand.swift
//  Pantopus
//
//  The band over the portrait (boards 1–4): the sky over the person's city
//  right now. Drawn only when the server sends a place (the city part is on
//  for this viewer); otherwise the header starts with the mark. A still
//  picture in the Today sky's palette (`SkyPalette`), so it reads the same in
//  light and dark, as a sky does.
//

import SwiftUI

/// The server's sky word: "<time>_<weather>", e.g. "evening_rain", "night", "day_clear".
struct ProfileSky: Equatable {
    let phase: SkyPalette.Phase
    let weather: SkyPalette.Weather

    init(_ word: String?) {
        let parts = (word ?? "").lowercased().split(separator: "_").map(String.init)
        phase = switch parts.first {
        case "dawn", "morning", "sunrise": .dawn
        case "evening", "dusk", "sunset": .dusk
        case "night": .night
        default: .day
        }
        weather = switch parts.dropFirst().first {
        case "partly": .partly
        case "cloudy", "overcast", "clouds": .overcast
        case "fog", "mist", "haze": .fog
        case "rain", "drizzle", "wet", "showers": .wet
        case "snow", "sleet": .snow
        case "storm", "thunder": .storm
        default: .clear
        }
    }

    /// "evening, light rain" for the band's spoken label.
    var spoken: String {
        let time = switch phase {
        case .dawn: "morning"
        case .day: "day"
        case .dusk: "evening"
        case .night: "night"
        }
        let sky = switch weather {
        case .clear: "clear"
        case .partly: "a few clouds"
        case .overcast: "cloudy"
        case .fog: "fog"
        case .wet: "rain"
        case .snow: "snow"
        case .storm: "a storm"
        }
        return "\(time), \(sky)"
    }
}

struct ProfileSkyBand: View {
    let sky: ProfileSky

    var body: some View {
        Canvas { context, size in
            let palette = SkyPalette.sky(sky.phase, sky.weather)
            let gradient = Gradient(stops: [
                .init(color: palette.top.color, location: 0),
                .init(color: palette.mid.color, location: 0.55),
                .init(color: palette.bottom.color, location: 1)
            ])
            context.fill(
                Path(CGRect(origin: .zero, size: size)),
                with: .linearGradient(gradient, startPoint: .zero, endPoint: CGPoint(x: 0, y: size.height))
            )
            var seed = SkyNoise(seed: 23)
            if sky.phase == .night, sky.weather == .clear || sky.weather == .partly {
                for _ in 0..<38 {
                    let point = CGPoint(x: seed.next() * size.width, y: seed.next() * size.height * 0.62)
                    let dot = 0.6 + seed.next() * 0.9
                    context.fill(
                        Path(ellipseIn: CGRect(x: point.x, y: point.y, width: dot, height: dot)),
                        with: .color(SkyPalette.white.color(opacity: 0.55 + seed.next() * 0.4))
                    )
                }
                let moon = CGRect(x: size.width * 0.84, y: size.height * 0.18, width: 18, height: 18)
                context.fill(Path(ellipseIn: moon), with: .color(SkyPalette.moon.color))
                context.fill(Path(ellipseIn: moon.offsetBy(dx: 5, dy: -3)), with: .color(palette.top.color))
            }
            if sky.weather != .clear {
                let cloud = sky.phase == .night ? SkyPalette.cloudNight : palette.mid.mixed(with: SkyPalette.white, by: 0.22)
                // Each cloud's box, as parts of the band's width and height.
                let clouds = [
                    CGRect(x: 0.04, y: 0.13, width: 0.36, height: 0.2),
                    CGRect(x: 0.485, y: 0.235, width: 0.47, height: 0.23),
                    CGRect(x: 0.335, y: 0.075, width: 0.31, height: 0.15)
                ]
                for box in clouds {
                    let rect = CGRect(
                        x: size.width * box.minX,
                        y: size.height * box.minY,
                        width: size.width * box.width,
                        height: size.height * box.height
                    )
                    context.fill(Path(ellipseIn: rect), with: .color(cloud.color(opacity: 0.85)))
                }
            }
            if sky.weather == .wet || sky.weather == .storm || sky.weather == .snow {
                let drop = sky.phase == .night ? SkyPalette.rainNight : SkyPalette.rainDay
                for _ in 0..<46 {
                    let x = seed.next() * size.width
                    let y = seed.next() * size.height * 0.8
                    var path = Path()
                    if sky.weather == .snow {
                        path.addEllipse(in: CGRect(x: x, y: y, width: 2.2, height: 2.2))
                        context.fill(path, with: .color(SkyPalette.white.color(opacity: 0.7)))
                    } else {
                        path.move(to: CGPoint(x: x, y: y))
                        path.addLine(to: CGPoint(x: x - 5, y: y + 14))
                        context.stroke(path, with: .color(drop.color(opacity: 0.4)), style: StrokeStyle(lineWidth: 1.1, lineCap: .round))
                    }
                }
            }
            // A line of trees along the bottom, darker than the horizon.
            let tree = palette.bottom.mixed(with: SkyPalette.black, by: sky.phase == .night ? 0.45 : 0.6)
            var ridge = Path()
            ridge.move(to: CGPoint(x: 0, y: size.height))
            var x: CGFloat = -6
            while x < size.width + 12 {
                let width = 9 + seed.next() * 8
                let height = 14 + seed.next() * 16
                ridge.addLine(to: CGPoint(x: x, y: size.height - 6))
                ridge.addLine(to: CGPoint(x: x + width / 2, y: size.height - 6 - height))
                ridge.addLine(to: CGPoint(x: x + width, y: size.height - 6))
                x += width * 0.8
            }
            ridge.addLine(to: CGPoint(x: size.width, y: size.height))
            ridge.closeSubpath()
            context.fill(ridge, with: .color(tree.color))
        }
        .accessibilityHidden(true)
    }
}

/// The same scatter of stars and drops every time (a small linear congruential generator).
private struct SkyNoise {
    private var state: UInt64

    init(seed: UInt64) {
        state = seed
    }

    mutating func next() -> CGFloat {
        state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
        return CGFloat((state >> 33) % 10000) / 10000
    }
}
