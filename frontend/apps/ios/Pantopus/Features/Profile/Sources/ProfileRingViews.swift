//
//  ProfileRingViews.swift
//  Pantopus
//
//  The drawings of the profile with sources: the mark around a portrait
//  (boards 1–4), the full chart on Record with its three lines a year (boards
//  12, 13), the ring on any avatar (board 6), the record meter and the ink
//  dot. Geometry from the design's `make_assets.py`; colours are the app's
//  tokens, so night follows the system. The word (Seen, Signed, Said) always
//  sits beside these: they never tell an ink alone.
//

import SwiftUI

// MARK: - Strokes

private enum RingStroke {
    /// An arc over months `start..<end` on a circle, January at the top, clockwise.
    static func arc(center: CGPoint, radius: CGFloat, start: Double, end: Double) -> Path {
        var path = Path()
        if end - start >= 11.999 {
            path.addEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
            return path
        }
        path.addArc(
            center: center,
            radius: radius,
            startAngle: .degrees(-90 + 30 * start),
            endAngle: .degrees(-90 + 30 * end),
            clockwise: false
        )
        return path
    }

    /// Seen is thick, Signed thin, Said dotted (the design's `ink_path`).
    static func style(_ ink: ProfileInk, seen: CGFloat, thin: CGFloat) -> StrokeStyle {
        switch ink {
        case .seen: StrokeStyle(lineWidth: seen, lineCap: .butt)
        case .signed: StrokeStyle(lineWidth: thin)
        case .said: StrokeStyle(lineWidth: thin * 1.15, lineCap: .round, dash: [0.1, thin * 2.7])
        }
    }

    static func point(center: CGPoint, radius: CGFloat, degrees: Double) -> CGPoint {
        let angle = degrees * .pi / 180
        return CGPoint(x: center.x + radius * cos(angle), y: center.y + radius * sin(angle))
    }
}

// MARK: - The mark around a portrait

/// One line a year around the portrait, the strongest ink of each month, in the
/// text colour; a dot where today is. The board's 176 pt mark holds an 80 pt
/// portrait; other sizes scale the same.
struct ProfileRingMark<Portrait: View>: View {
    let rings: ProfileRings
    var size: CGFloat = 176
    @ViewBuilder let portrait: () -> Portrait

    var body: some View {
        ZStack {
            Canvas { context, canvas in
                draw(in: &context, side: min(canvas.width, canvas.height))
            }
            portrait()
                .frame(width: size * 80 / 176, height: size * 80 / 176)
        }
        .frame(width: size, height: size)
    }

    private func draw(in context: inout GraphicsContext, side: CGFloat) {
        let scale = side / 176
        let center = CGPoint(x: side / 2, y: side / 2)
        let years = rings.years
        let rows = rings.merged
        let count = years.count
        let inner = 47.0 * scale
        let outer = 83.0 * scale
        let pitch = count > 1 ? min(5.6 * scale, (outer - inner) / CGFloat(count - 1)) : 0
        let seen = count > 1 ? min(2.6 * scale, max(1.7 * scale, pitch * 0.62)) : 2.6 * scale
        let thin = min(1.2 * scale, seen * 0.5)

        let plate = Path(ellipseIn: CGRect(x: 1, y: 1, width: side - 2, height: side - 2))
        context.fill(plate, with: .color(Theme.Color.appSurface))
        var nowPoint: CGPoint?
        for (index, year) in years.enumerated() {
            let radius = inner + CGFloat(index) * pitch
            let guide = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
            context.stroke(guide, with: .color(Theme.Color.appBorder), lineWidth: 0.8 * scale)
            for run in rings.runs(of: rows[index], year: year) {
                let path = RingStroke.arc(center: center, radius: radius, start: run.start, end: run.end)
                context.stroke(path, with: .color(Theme.Color.appText), style: RingStroke.style(run.ink, seen: seen, thin: thin))
            }
            if year == rings.nowYear {
                nowPoint = RingStroke.point(center: center, radius: radius, degrees: -90 + 30 * rings.nowMonth)
            }
        }
        if let nowPoint {
            let dot = 3.6 * scale
            let rect = CGRect(x: nowPoint.x - dot, y: nowPoint.y - dot, width: dot * 2, height: dot * 2)
            context.fill(Path(ellipseIn: rect), with: .color(Theme.Color.personal))
            context.stroke(Path(ellipseIn: rect), with: .color(Theme.Color.appSurface), lineWidth: 1.6 * scale)
        }
    }
}

// MARK: - The full chart (Record)

/// A month picked on the chart.
struct ProfileRingMonth: Hashable, Identifiable {
    let year: Int
    /// 0 = January.
    let month: Int

    var id: String {
        "\(year)-\(month)"
    }

    /// "August 2026", in the reader's language.
    var title: String {
        let date = Calendar.current.date(from: DateComponents(year: year, month: month + 1, day: 1)) ?? Date()
        return date.formatted(.dateTime.month(.wide).year())
    }

    /// The month before or after, inside `years`.
    func moved(by step: Int, within years: [Int], now: (year: Int, month: Int)) -> ProfileRingMonth? {
        let index = year * 12 + month + step
        let next = ProfileRingMonth(year: index / 12, month: index % 12)
        guard let first = years.first, next.year >= first, next.year * 12 + next.month <= now.year * 12 + now.month else {
            return nil
        }
        return next
    }
}

/// Three lines a year, home inside, work, then with others outside; January at
/// the top; the centre names the first year. A tap opens the month under the
/// finger. With a month picked, its year is lit and its month marked.
struct ProfileRecordChart: View {
    let rings: ProfileRings
    var selected: ProfileRingMonth?
    var onPick: ((ProfileRingMonth) -> Void)?

    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            Canvas { context, _ in
                draw(in: &context, side: side)
            }
            .frame(width: side, height: side)
            .contentShape(Circle())
            .gesture(
                SpatialTapGesture().onEnded { tap in
                    if let month = month(at: tap.location, side: side) { onPick?(month) }
                }
            )
            .frame(maxWidth: .infinity)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private struct Geometry {
        let scale: CGFloat
        let center: CGPoint
        let r0: CGFloat
        let r1: CGFloat
        let yearPitch: CGFloat
        let lanePitch: CGFloat

        init(side: CGFloat, years: Int) {
            scale = side / 384
            center = CGPoint(x: side / 2, y: side / 2)
            r0 = 30 * scale
            r1 = 160 * scale
            yearPitch = (r1 - r0) / CGFloat(max(1, years))
            lanePitch = yearPitch * 0.27
        }
    }

    private func month(at point: CGPoint, side: CGFloat) -> ProfileRingMonth? {
        let years = rings.years
        guard !years.isEmpty else { return nil }
        let geo = Geometry(side: side, years: years.count)
        let dx = point.x - geo.center.x
        let dy = point.y - geo.center.y
        let distance = (dx * dx + dy * dy).squareRoot()
        guard distance >= geo.r0 - 8 * geo.scale, distance <= geo.r1 + 12 * geo.scale else { return nil }
        let index = min(years.count - 1, max(0, Int((distance - geo.r0) / geo.yearPitch)))
        var degrees = atan2(dy, dx) * 180 / .pi + 90
        if degrees < 0 { degrees += 360 }
        let month = min(11, Int(degrees / 30))
        let picked = ProfileRingMonth(year: years[index], month: month)
        guard picked.year * 12 + picked.month <= rings.nowYear * 12 + Int(rings.nowMonth) else { return nil }
        return picked
    }

    private func draw(in context: inout GraphicsContext, side: CGFloat) {
        let years = rings.years
        guard !years.isEmpty else { return }
        let geo = Geometry(side: side, years: years.count)
        let band = geo.lanePitch * 2 + 3 * geo.scale
        for (index, year) in years.enumerated() {
            let radius = geo.r0 + CGFloat(index) * geo.yearPitch + geo.lanePitch + 1.2 * geo.scale
            let fill: Color = if let selected {
                year == selected.year ? Theme.Color.personalBg : Theme.Color.appSurfaceMuted
            } else {
                Theme.Color.appSurfaceSunken
            }
            context.stroke(circle(geo.center, radius), with: .color(fill), lineWidth: band)
        }
        drawMonthMarks(in: &context, geo: geo)
        let laneOrder: [(ProfileLane, Color)] = [(.home, Theme.Color.home), (.work, Theme.Color.business), (.others, Theme.Color.personal)]
        var nowRadius: CGFloat?
        for (index, year) in years.enumerated() {
            let dim = selected.map { $0.year == year ? 1.0 : 0.32 } ?? 1.0
            for (laneIndex, lane) in laneOrder.enumerated() {
                let radius = geo.r0 + CGFloat(index) * geo.yearPitch + 1.2 * geo.scale + CGFloat(laneIndex) * geo.lanePitch
                if year == rings.nowYear, laneIndex == 2 { nowRadius = radius }
                guard let rows = rings.lanes[lane.0], index < rows.count else { continue }
                for run in rings.runs(of: rows[index], year: year) {
                    let path = RingStroke.arc(center: geo.center, radius: radius, start: run.start, end: run.end)
                    let style = RingStroke.style(run.ink, seen: 2.9 * geo.scale, thin: 1.5 * geo.scale)
                    context.stroke(path, with: .color(lane.1.opacity(dim)), style: style)
                }
            }
        }
        if let selected {
            let start = -90 + 30 * Double(selected.month)
            let end = start + 30
            var wedge = Path()
            wedge.move(to: RingStroke.point(center: geo.center, radius: geo.r0 - 6 * geo.scale, degrees: start))
            wedge.addLine(to: RingStroke.point(center: geo.center, radius: geo.r1 + 2 * geo.scale, degrees: start))
            wedge.addArc(
                center: geo.center,
                radius: geo.r1 + 2 * geo.scale,
                startAngle: .degrees(start),
                endAngle: .degrees(end),
                clockwise: false
            )
            wedge.addLine(to: RingStroke.point(center: geo.center, radius: geo.r0 - 6 * geo.scale, degrees: end))
            wedge.addArc(
                center: geo.center,
                radius: geo.r0 - 6 * geo.scale,
                startAngle: .degrees(end),
                endAngle: .degrees(start),
                clockwise: true
            )
            wedge.closeSubpath()
            context.fill(wedge, with: .color(Theme.Color.personal.opacity(0.10)))
            context.stroke(wedge, with: .color(Theme.Color.personal), lineWidth: 1.2 * geo.scale)
        } else if let nowRadius {
            let point = RingStroke.point(center: geo.center, radius: nowRadius + 4.5 * geo.scale, degrees: -90 + 30 * rings.nowMonth)
            let dot = 3.6 * geo.scale
            let rect = CGRect(x: point.x - dot, y: point.y - dot, width: dot * 2, height: dot * 2)
            context.fill(Path(ellipseIn: rect), with: .color(Theme.Color.personal))
            context.stroke(Path(ellipseIn: rect), with: .color(Theme.Color.appSurface), lineWidth: 1.6 * geo.scale)
        }
        context.fill(circle(geo.center, geo.r0 - 7 * geo.scale), with: .color(Theme.Color.appSurfaceSunken))
        let first = Text(verbatim: "\(years[0])").font(.system(size: 10 * max(1, geo.scale), weight: .bold))
            .foregroundStyle(Theme.Color.appTextSecondary)
        context.draw(first, at: geo.center, anchor: .center)
    }

    /// A tick a month around the outside, longer at each quarter, and the quarters' names.
    private func drawMonthMarks(in context: inout GraphicsContext, geo: Geometry) {
        for month in 0..<12 {
            let degrees = -90 + 30 * Double(month)
            var tick = Path()
            tick.move(to: RingStroke.point(center: geo.center, radius: geo.r1 + 3 * geo.scale, degrees: degrees))
            tick.addLine(to: RingStroke.point(center: geo.center, radius: geo.r1 + (month % 3 == 0 ? 8 : 6) * geo.scale, degrees: degrees))
            context.stroke(tick, with: .color(Theme.Color.appTextMuted), lineWidth: 1)
        }
        let names = ["Jan", "Apr", "Jul", "Oct"]
        let anchors: [UnitPoint] = [.bottom, .leading, .top, .trailing]
        for quarter in 0..<4 {
            let degrees = -90 + 90 * Double(quarter)
            let point = RingStroke.point(center: geo.center, radius: geo.r1 + 11 * geo.scale, degrees: degrees)
            let text = Text(names[quarter]).font(.system(size: 10 * max(1, geo.scale), weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
            context.draw(text, at: point, anchor: anchors[quarter])
        }
    }

    private func circle(_ center: CGPoint, _ radius: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    }
}

// MARK: - The ring on an avatar (board 6)

/// One ring hugging an avatar: thicker with years on record, dotted until something is seen. Drawn outside the
/// circle, so the circle keeps its size and place.
struct ProfileAvatarRing: View {
    let summary: ProfileMarkSummary
    /// The avatar's diameter: the board draws a 40 pt avatar.
    let diameter: CGFloat

    /// How far the ring reaches outside the avatar.
    static func reach(_ summary: ProfileMarkSummary, diameter: CGFloat) -> CGFloat {
        let scale = max(0.6, diameter / 40)
        return gap(scale) + width(summary, scale: scale)
    }

    private static func gap(_ scale: CGFloat) -> CGFloat {
        max(1.5, 2 * scale)
    }

    private static func width(_ summary: ProfileMarkSummary, scale: CGFloat) -> CGFloat {
        summary.hasSeen ? max(1, CGFloat(summary.width) * scale) : max(1, 1.5 * scale)
    }

    var body: some View {
        let scale = max(0.6, diameter / 40)
        let width = Self.width(summary, scale: scale)
        let inset = Self.gap(scale) + width / 2
        Circle()
            .inset(by: -inset)
            .stroke(
                summary.hasSeen ? Theme.Color.appText : Theme.Color.appTextSecondary,
                style: summary.hasSeen
                    ? StrokeStyle(lineWidth: width)
                    : StrokeStyle(lineWidth: width, lineCap: .round, dash: [0.1, width * 2.2])
            )
            .accessibilityHidden(true)
            .allowsHitTesting(false)
    }
}

// MARK: - The ink dot

/// The mark before a line: a solid dot for Seen, a ring with a centre for
/// Signed, a dotted ring for Said. Always beside the word.
struct ProfileInkGlyph: View {
    let ink: ProfileInk
    var size: CGFloat = 10

    /// Grows with the reader's text size, like the words beside it.
    @ScaledMetric(relativeTo: .footnote) private var scale: CGFloat = 1

    var body: some View {
        let side = size * min(scale, 2.4)
        Canvas { context, canvas in
            let rect = CGRect(origin: .zero, size: canvas).insetBy(dx: 0.75, dy: 0.75)
            switch ink {
            case .seen:
                context.fill(Path(ellipseIn: CGRect(origin: .zero, size: canvas)), with: .color(Theme.Color.appText))
            case .signed:
                context.stroke(Path(ellipseIn: rect), with: .color(Theme.Color.appText), lineWidth: 1.5)
                let dot = canvas.width * 0.16
                let center = CGRect(x: canvas.width / 2 - dot, y: canvas.height / 2 - dot, width: dot * 2, height: dot * 2)
                context.fill(Path(ellipseIn: center), with: .color(Theme.Color.appText))
            case .said:
                context.stroke(
                    Path(ellipseIn: rect),
                    with: .color(Theme.Color.appTextSecondary),
                    style: StrokeStyle(lineWidth: 1.5, lineCap: .round, dash: [0.1, 2.6])
                )
            }
        }
        .frame(width: side, height: side)
        // In a first-baseline row the mark sits on the middle of the first line, not on its baseline.
        .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + $0.height * 0.45 }
        .accessibilityHidden(true)
    }
}

// MARK: - The record meter

/// "12 years on record": a thick piece for Seen, a thin line for Signed and
/// dots for Said, each as long as its share of the months shown.
struct ProfileRecordMeter: View {
    let seen: Int
    let signed: Int
    let said: Int

    var body: some View {
        GeometryReader { proxy in
            let total = max(1, seen + signed + said)
            let parts = [(ProfileInk.seen, seen), (.signed, signed), (.said, said)].filter { $0.1 > 0 }
            let gaps = CGFloat(max(0, parts.count - 1)) * 3
            let room = max(0, proxy.size.width - gaps)
            HStack(spacing: 3) {
                ForEach(parts, id: \.0) { ink, months in
                    piece(ink).frame(width: max(4, room * CGFloat(months) / CGFloat(total)))
                }
            }
            .frame(height: 8)
        }
        .frame(height: 8)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func piece(_ ink: ProfileInk) -> some View {
        switch ink {
        case .seen:
            RoundedRectangle(cornerRadius: 2).fill(Theme.Color.appText).frame(height: 5)
        case .signed:
            Rectangle().fill(Theme.Color.appText).frame(height: 1.5)
        case .said:
            Canvas { context, canvas in
                var path = Path()
                path.move(to: CGPoint(x: 1, y: canvas.height / 2))
                path.addLine(to: CGPoint(x: canvas.width, y: canvas.height / 2))
                context.stroke(
                    path,
                    with: .color(Theme.Color.appTextSecondary),
                    style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [0.1, 4])
                )
            }
            .frame(height: 2)
        }
    }
}
