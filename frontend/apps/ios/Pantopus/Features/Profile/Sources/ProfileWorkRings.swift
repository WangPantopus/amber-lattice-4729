//
//  ProfileWorkRings.swift
//  Pantopus
//
//  The work line of the rings opened flat (board 7, `work_rings`): each year a
//  half band from the centre out, months left to right over the top, a dot per
//  piece in its ink, and a chip a year to light one year.
//

import SwiftUI

// MARK: - work_rings

struct ProfileWorkRingsBlock: View {
    let title: String?
    let rings: ProfileWorkRingsDTO
    let context: ProfileBlockContext

    @State private var year: Int?

    private var parsed: ProfileRings? {
        ProfileRings(from: rings.from, now: rings.now, lanes: [.work: rings.months])
    }

    var body: some View {
        if let parsed {
            ProfileBlockCard {
                VStack(alignment: .leading, spacing: Spacing.s2) {
                    HStack(alignment: .firstTextBaseline) {
                        if let title { ProfileBlockTitle(title: title) }
                        Spacer(minLength: Spacing.s2)
                        let total = rings.years.reduce(0) { $0 + $1.pieces }
                        if total > 0 {
                            Text(total == 1 ? "1 piece" : "\(total) pieces")
                                .scaledFont(12)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                        }
                    }
                    ProfileWorkFan(rings: parsed, dots: dots(parsed), selectedYear: year)
                        .accessibilityElement()
                        .accessibilityLabel(spoken(parsed))
                    legend
                    if !rings.years.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Spacing.s2) {
                                ForEach(rings.years.sorted { $0.year > $1.year }, id: \.year) { item in
                                    let on = year == item.year
                                    Button { year = on ? nil : item.year } label: {
                                        Text(verbatim: "\(item.year) · \(item.pieces)")
                                            .scaledFont(12, weight: .semibold)
                                            .foregroundStyle(on ? Theme.Color.appSurface : Theme.Color.appTextStrong)
                                            .padding(.horizontal, 10)
                                            .frame(minHeight: 44)
                                            .background(on ? Theme.Color.appText : Theme.Color.appSurfaceSunken, in: Capsule())
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("\(item.year), \(item.pieces == 1 ? "1 piece" : "\(item.pieces) pieces")")
                                    .accessibilityAddTraits(on ? .isSelected : [])
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private var legend: some View {
        HStack(spacing: 14) {
            ForEach(ProfileInk.allCases, id: \.self) { ink in
                HStack(spacing: 6) {
                    ProfileWorkDot(ink: ink, pinned: false).frame(width: 10, height: 10)
                    Text(ink.word).scaledFont(12).foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            Text("A dot is a piece").scaledFont(12).foregroundStyle(Theme.Color.appTextSecondary)
        }
        .accessibilityHidden(true)
    }

    private func dots(_: ProfileRings) -> [ProfileWorkFan.Dot] {
        rings.dots.compactMap { dot in
            let bits = dot.month.split(separator: "-").compactMap { Int($0) }
            guard bits.count == 2 else { return nil }
            return ProfileWorkFan.Dot(
                year: bits[0],
                month: bits[1] - 1,
                ink: context.pieceInk(dot.pieceId) ?? .said,
                pinned: false
            )
        }
    }

    private func spoken(_ parsed: ProfileRings) -> String {
        let years = rings.years.sorted { $0.year > $1.year }.map { "\($0.year): \($0.pieces == 1 ? "1 piece" : "\($0.pieces) pieces")" }
        return (["Work rings, \(parsed.years.first.map(String.init) ?? "") to today"] + years).joined(separator: ". ")
    }
}

/// The work line of the rings opened flat (the design's `fan_chart`): each year a half band from the centre out,
/// months left to right over the top, a dot per piece.
struct ProfileWorkFan: View {
    struct Dot: Hashable {
        let year: Int
        let month: Int
        let ink: ProfileInk
        let pinned: Bool
    }

    let rings: ProfileRings
    let dots: [Dot]
    var selectedYear: Int?

    var body: some View {
        Canvas { context, size in
            draw(in: &context, size: size)
        }
        .aspectRatio(358 / 206, contentMode: .fit)
    }

    private func draw(in context: inout GraphicsContext, size: CGSize) {
        let years = rings.years
        guard !years.isEmpty, let rows = rings.lanes[.work] else { return }
        let scale = size.width / 358
        let center = CGPoint(x: size.width / 2, y: 184 * scale)
        let r0 = 26 * scale
        let r1 = 172 * scale
        let pitch = (r1 - r0) / CGFloat(years.count)
        func radius(_ index: Int) -> CGFloat {
            r0 + CGFloat(index) * pitch + pitch / 2
        }
        func arc(_ r: CGFloat, _ start: Double, _ end: Double) -> Path {
            var path = Path()
            path.addArc(
                center: center,
                radius: r,
                startAngle: .degrees(180 + 15 * start),
                endAngle: .degrees(180 + 15 * end),
                clockwise: false
            )
            return path
        }
        for (index, year) in years.enumerated() {
            let fill: Color = if let selectedYear {
                year == selectedYear ? Theme.Color.businessBg : Theme.Color.appSurfaceMuted
            } else {
                Theme.Color.appSurfaceSunken
            }
            context.stroke(arc(radius(index), 0, 12), with: .color(fill), lineWidth: max(1, pitch - 2.2 * scale))
        }
        for (index, year) in years.enumerated() where index < rows.count {
            let dim = selectedYear.map { $0 == year ? 1.0 : 0.45 } ?? 1.0
            for run in rings.runs(of: rows[index], year: year) {
                let style: StrokeStyle = switch run.ink {
                case .seen: StrokeStyle(lineWidth: 3 * scale, lineCap: .butt)
                case .signed: StrokeStyle(lineWidth: 1.3 * scale)
                case .said: StrokeStyle(lineWidth: 1.5 * scale, lineCap: .round, dash: [0.1, 3.5 * scale])
                }
                context.stroke(arc(radius(index), run.start, run.end), with: .color(Theme.Color.business.opacity(dim)), style: style)
            }
        }
        for dot in dots {
            guard let index = years.firstIndex(of: dot.year) else { continue }
            let point = RingStroke.point(center: center, radius: radius(index), degrees: 180 + 15 * (Double(dot.month) + 0.5))
            let size = (dot.pinned ? 8.8 : 6.6) * scale
            var inner = context
            inner.opacity = selectedYear.map { $0 == dot.year ? 1 : 0.5 } ?? 1
            inner.translateBy(x: point.x - size / 2, y: point.y - size / 2)
            ProfileWorkDot.draw(dot.ink, in: &inner, side: size)
        }
        var base = Path()
        base.move(to: CGPoint(x: center.x - r1 - 4 * scale, y: center.y))
        base.addLine(to: CGPoint(x: center.x + r1 + 4 * scale, y: center.y))
        context.stroke(base, with: .color(Theme.Color.appBorderStrong), lineWidth: 1)
        let font = Font.system(size: 10 * max(1, scale), weight: .semibold)
        for index in Set([0, years.count / 2, years.count - 1]).sorted() {
            let color = years[index] == selectedYear ? Theme.Color.business : Theme.Color.appTextSecondary
            context.draw(
                Text(verbatim: "\(years[index])").font(font).foregroundStyle(color),
                at: CGPoint(x: center.x + radius(index), y: center.y + 14 * scale)
            )
        }
        context.draw(
            Text("Jan").font(font).foregroundStyle(Theme.Color.appTextSecondary),
            at: CGPoint(x: center.x - r1, y: center.y + 14 * scale),
            anchor: .leading
        )
    }
}

/// A piece's dot in the work colour: solid for Seen, a ring with a centre for Signed, dashed for Said.
struct ProfileWorkDot: View {
    let ink: ProfileInk
    let pinned: Bool

    var body: some View {
        Canvas { context, size in
            Self.draw(ink, in: &context, side: min(size.width, size.height))
        }
    }

    static func draw(_ ink: ProfileInk, in context: inout GraphicsContext, side: CGFloat) {
        let rect = CGRect(x: 0, y: 0, width: side, height: side)
        let color = Theme.Color.business
        switch ink {
        case .seen:
            context.fill(Path(ellipseIn: rect), with: .color(color))
        case .signed:
            context.fill(Path(ellipseIn: rect), with: .color(Theme.Color.appSurface))
            context.stroke(Path(ellipseIn: rect.insetBy(dx: 0.8, dy: 0.8)), with: .color(color), lineWidth: 1.6)
            let dot = side * 0.18
            context.fill(
                Path(ellipseIn: CGRect(x: side / 2 - dot, y: side / 2 - dot, width: dot * 2, height: dot * 2)),
                with: .color(color)
            )
        case .said:
            context.fill(Path(ellipseIn: rect), with: .color(Theme.Color.appSurface))
            context.stroke(
                Path(ellipseIn: rect.insetBy(dx: 0.7, dy: 0.7)),
                with: .color(color),
                style: StrokeStyle(lineWidth: 1.3, dash: [1.4, 1.6])
            )
        }
    }
}
