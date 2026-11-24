//
//  ProfileRecordBlocks.swift
//  Pantopus
//
//  The Record tab (boards 12, 13): the full rings with their three lines a
//  year, drawn from the lanes this viewer may see (a lane whose part is off is
//  simply not drawn), and a month opened from them. The chart's legend and the
//  "How to read a line" note are the app's own words.
//

import SwiftUI

struct ProfileRecordChartBlock: View {
    let title: String?
    let chart: ProfileRecordChartDTO
    let context: ProfileBlockContext

    private var rings: ProfileRings? {
        var lanes: [ProfileLane: [String]] = [:]
        for lane in chart.lanes {
            if let key = ProfileLane(rawValue: lane.lane) { lanes[key] = lane.months }
        }
        return ProfileRings(from: chart.from, now: chart.now, lanes: lanes)
    }

    var body: some View {
        if let rings {
            ProfileBlockCard {
                VStack(alignment: .leading, spacing: Spacing.s3) {
                    HStack(alignment: .firstTextBaseline) {
                        if let title {
                            Text(title)
                                .scaledFont(15, weight: .semibold)
                                .foregroundStyle(Theme.Color.appText)
                                .accessibilityAddTraits(.isHeader)
                        }
                        Spacer(minLength: Spacing.s2)
                        if let subtitle = chart.subtitle {
                            Text(subtitle).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                        }
                    }
                    ProfileRecordChart(rings: rings, selected: context.openedMonth) { month in
                        guard rings.ink(year: month.year, month: month.month) != nil else { return }
                        context.openLink(.month(String(format: "%04d-%02d", month.year, month.month + 1)))
                    }
                    .padding(.horizontal, Spacing.s2)
                    .accessibilityElement()
                    .accessibilityLabel(spoken(rings))
                    .accessibilityHint("Opens the latest month with something in it")
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction {
                        if let latest = latestMonth(rings) {
                            context.openLink(.month(String(format: "%04d-%02d", latest.year, latest.month + 1)))
                        }
                    }
                    .accessibilityIdentifier("profileRecordChart")
                    inkLegend
                    laneLegend(rings)
                    if let note = chart.note {
                        Text(note)
                            .scaledFont(13)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    /// The newest month any shown lane has something in.
    private func latestMonth(_ rings: ProfileRings) -> ProfileRingMonth? {
        for year in rings.years.reversed() {
            for month in (0..<12).reversed() where rings.ink(year: year, month: month) != nil {
                if year * 12 + month <= rings.nowYear * 12 + Int(rings.nowMonth) {
                    return ProfileRingMonth(year: year, month: month)
                }
            }
        }
        return nil
    }

    private func spoken(_ rings: ProfileRings) -> String {
        let lanes = rings.lanes.keys.sorted { $0.rawValue < $1.rawValue }.map(\.title).joined(separator: ", ")
        let first = rings.years.first.map(String.init) ?? ""
        return "Rings from \(first) to today, one a year. Lines shown: \(lanes)."
    }

    private var inkLegend: some View {
        HStack(spacing: 14) {
            ForEach(ProfileInk.allCases, id: \.self) { ink in
                HStack(spacing: 6) {
                    ProfileLegendStroke(ink: ink).frame(width: 18, height: 6)
                    Text(ink.word).scaledFont(12).foregroundStyle(Theme.Color.appTextStrong)
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func laneLegend(_ rings: ProfileRings) -> some View {
        let lanes: [(ProfileLane, Color)] = [(.home, Theme.Color.home), (.work, Theme.Color.business), (.others, Theme.Color.personal)]
        return HStack(spacing: 14) {
            ForEach(lanes.filter { rings.lanes[$0.0] != nil }, id: \.0) { lane, color in
                HStack(spacing: 6) {
                    Circle().fill(color).frame(width: 8, height: 8)
                    Text(lane.title).scaledFont(12).foregroundStyle(Theme.Color.appTextStrong)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// A short stroke in the chart's style for the legend.
struct ProfileLegendStroke: View {
    let ink: ProfileInk

    var body: some View {
        Canvas { context, size in
            var path = Path()
            path.move(to: CGPoint(x: 1, y: size.height / 2))
            path.addLine(to: CGPoint(x: size.width - 1, y: size.height / 2))
            let style: StrokeStyle = switch ink {
            case .seen: StrokeStyle(lineWidth: 4)
            case .signed: StrokeStyle(lineWidth: 1.5)
            case .said: StrokeStyle(lineWidth: 1.8, lineCap: .round, dash: [0.1, 3.5])
            }
            context.stroke(path, with: .color(Theme.Color.appText), style: style)
        }
    }
}

/// "How to read a line", at the foot of Record (board 12), and the day the record was read.
struct ProfileReadingGuide: View {
    let firstName: String
    let asOf: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            VStack(alignment: .leading, spacing: 10) {
                ProfileBlockTitle(title: "How to read a line")
                entry(.seen, "Pantopus's own records show it happened.")
                entry(.signed, "The named person, business or issuer confirmed it.")
                entry(.said, "\(firstName)'s own words.")
            }
            .padding(Spacing.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            Text(footnote)
                .scaledFont(12)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }

    private var footnote: String {
        let address = "\(firstName)'s address is never part of the record."
        guard let asOf, let date = Self.day(asOf) else { return address }
        return "As of \(date.formatted(.dateTime.month(.wide).day().year())). \(address)"
    }

    private static func day(_ iso: String) -> Date? {
        let bits = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard bits.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: bits[0], month: bits[1], day: bits[2]))
    }

    private func entry(_ ink: ProfileInk, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            ProfileInkGlyph(ink: ink)
            (Text("\(ink.word). ").fontWeight(.semibold) + Text(text))
                .scaledFont(13)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - A month, opened (board 13)

struct ProfileMonthSheet: View {
    let model: ProfilePageModel
    let firstName: String
    let onOpenLink: (ProfilePageLinkDTO) -> Void

    var body: some View {
        let month = model.openedMonth
        let rings = model.content.flatMap { content -> ProfileRings? in
            guard let chart = content.recordChart else { return content.rings }
            var lanes: [ProfileLane: [String]] = [:]
            for lane in chart.lanes {
                if let key = ProfileLane(rawValue: lane.lane) { lanes[key] = lane.months }
            }
            return ProfileRings(from: chart.from, now: chart.now, lanes: lanes)
        }
        VStack(alignment: .leading, spacing: Spacing.s4) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.monthLines?.title ?? month?.title ?? "")
                        .scaledFont(22, weight: .bold)
                        .foregroundStyle(Theme.Color.appText)
                        .accessibilityAddTraits(.isHeader)
                    if let subtitle = model.monthLines?.subtitle {
                        Text(subtitle).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                    }
                }
                Spacer(minLength: Spacing.s2)
                if let month, let rings {
                    step(month, by: -1, rings: rings, icon: .chevronLeft, label: "Month before")
                    step(month, by: 1, rings: rings, icon: .chevronRight, label: "Month after")
                }
            }
            if model.monthLoading, model.monthLines == nil {
                VStack(alignment: .leading, spacing: Spacing.s3) {
                    Shimmer(height: 18, cornerRadius: Radii.sm)
                    Shimmer(width: 220, height: 14, cornerRadius: Radii.sm)
                    Shimmer(height: 18, cornerRadius: Radii.sm)
                }
                .accessibilityHidden(true)
            } else if let lines = model.monthLines?.lines {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                            ProfileMonthLine(line: line, position: index, onOpenLink: onOpenLink)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.s4)
        .padding(.top, Spacing.s2)
        .background(Theme.Color.appSurface)
        .accessibilityIdentifier("profileMonthSheet")
    }

    private func step(_ month: ProfileRingMonth, by delta: Int, rings: ProfileRings, icon: PantopusIcon, label: String) -> some View {
        let next = Self.nextMonth(from: month, by: delta, rings: rings)
        return Button {
            Task { await model.step(from: month, by: delta, rings: rings) }
        } label: {
            Icon(icon, size: 18, color: next == nil ? Theme.Color.appTextMuted : Theme.Color.appText)
                .frame(width: 44, height: 44)
                .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(next == nil || model.monthLoading)
        .accessibilityLabel(label)
    }

    /// The next month with something in a shown lane, before or after.
    static func nextMonth(from month: ProfileRingMonth, by delta: Int, rings: ProfileRings) -> ProfileRingMonth? {
        var current = month
        let now = (rings.nowYear, Int(rings.nowMonth))
        for _ in 0..<(12 * max(1, rings.years.count)) {
            guard let next = current.moved(by: delta, within: rings.years, now: (now.0, now.1)) else { return nil }
            if rings.ink(year: next.year, month: next.month) != nil { return next }
            current = next
        }
        return nil
    }
}

/// A month's line: its ink and words, and the lane's colour beside how we know it.
private struct ProfileMonthLine: View {
    let line: ProfilePageLineDTO
    let position: Int
    let onOpenLink: (ProfilePageLinkDTO) -> Void

    var body: some View {
        let source = line.sourceLine(at: position)
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            ProfileInkGlyph(ink: source.ink)
                .frame(minWidth: 16, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                if source.ink == .said {
                    Text(line.text).profileSaidFont().foregroundStyle(Theme.Color.appTextStrong)
                } else {
                    Text(line.text).scaledFont(15).foregroundStyle(Theme.Color.appText)
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if let lane = source.lane {
                        Circle().fill(Self.color(lane)).frame(width: 7, height: 7)
                    }
                    Text(source.source).scaledFont(12).foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
        .onTapGesture { if let link = line.link { onOpenLink(link) } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([source.spoken, source.lane.map { "\($0.title) line" }].compactMap(\.self).joined(separator: ". "))
        .accessibilityAddTraits(line.link == nil ? [] : .isButton)
    }

    static func color(_ lane: ProfileLane) -> Color {
        switch lane {
        case .home: Theme.Color.home
        case .work: Theme.Color.business
        case .others: Theme.Color.personal
        }
    }
}

extension ProfileSourcesContent {
    /// The Record tab's chart, when this viewer gets one.
    var recordChart: ProfileRecordChartDTO? {
        for tab in tabs {
            for block in tab.blocks {
                if case let .recordChart(chart) = block.content { return chart }
            }
        }
        return nil
    }
}
