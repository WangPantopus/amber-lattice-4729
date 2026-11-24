//
//  HomeRecordBlocks.swift
//  Pantopus
//
//  One view per block kind of the home record contract (v1), drawn from the
//  server's words. Sizes, inks and spacing follow the drawn screens
//  (lookup before verifying, and the confirmed owner's record).
//

// swiftlint:disable file_length

import SwiftUI

/// Every block of the page in the server's order, then the footer.
struct HomeRecordBlocksView: View {
    let record: HomeRecord
    let onOpen: (String) -> Void

    var body: some View {
        let blocks = record.drawnBlocks
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
                HomeRecordBlockView(block: block, onOpen: onOpen)
                    .padding(.top, index == 0 ? 0 : Self.space(before: block))
            }
            if let footer = record.footer, !footer.isEmpty {
                Text(footer)
                    .font(.system(size: 12))
                    .lineSpacing(5)
                    .foregroundStyle(Theme.Color.appTextMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Spacing.s1)
                    .padding(.top, Spacing.s5)
                    .accessibilityIdentifier("homeRecord.footer")
            }
        }
    }

    /// Room above a block: a heading that opens a new part of the page gets more.
    private static func space(before block: HomeRecordBlock) -> CGFloat {
        switch block {
        case .intro: 28
        case .sectionLabel: Spacing.s6
        case let .meters(_, meters) where meters.title?.isEmpty == false: Spacing.s6
        default: Spacing.s3
        }
    }
}

struct HomeRecordBlockView: View {
    let block: HomeRecordBlock
    let onOpen: (String) -> Void

    var body: some View {
        Group {
            switch block {
            case let .picture(_, picture): HomeRecordPictureBlock(picture: picture)
            case let .facts(_, facts): HomeRecordFactsBlock(facts: facts)
            case let .meters(_, meters): HomeRecordMetersBlock(meters: meters)
            case let .intro(_, intro): HomeRecordIntroBlock(intro: intro)
            case let .closedGroup(_, group): HomeRecordClosedGroupBlock(group: group)
            case let .promise(_, promise): HomeRecordPromiseBlock(promise: promise, onOpen: onOpen)
            case let .note(_, note): HomeRecordNoteBlock(note: note)
            case let .sectionLabel(_, text): HomeRecordSectionLabel(text: text)
            case let .value(_, value): HomeRecordValueBlock(value: value)
            case let .photoYears(_, photos): HomeRecordPhotoYearsBlock(photos: photos)
            case let .timeline(_, timeline): HomeRecordTimelineBlock(timeline: timeline)
            case let .notice(_, notice): HomeRecordNoticeBlock(notice: notice)
            case let .rows(_, rows): HomeRecordRowsBlock(rows: rows, onOpen: onOpen)
            case let .tiles(_, tiles): HomeRecordTilesBlock(tiles: tiles)
            case let .bars(_, bars): HomeRecordBarsBlock(bars: bars)
            case let .card(_, card): HomeRecordCardBlock(card: card, onOpen: onOpen)
            case .unknown: EmptyView()
            }
        }
        // A container, so the block's buttons keep their own test ids.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("homeRecord.block.\(block.id)")
    }
}

// MARK: - Shared pieces

/// The small grey line under a block that names where its data came from.
private struct HomeRecordSourceLine: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 12))
            .lineSpacing(4)
            .foregroundStyle(Theme.Color.appTextMuted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A block's heading inside its card.
private struct HomeRecordCardTitle: View {
    let text: String
    var size: CGFloat = 17

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .semibold))
            .kerning(-0.17)
            .foregroundStyle(Theme.Color.appText)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

/// An uppercase label above a card.
struct HomeRecordSectionLabel: View {
    let text: String

    var body: some View {
        Text(text, style: .overline)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .padding(.horizontal, Spacing.s1)
            .padding(.bottom, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A full-width link button: outlined, or filled for the card's one action.
private struct HomeRecordLinkButton: View {
    let link: HomeRecordLink
    var filled = false
    let onOpen: (String) -> Void

    private var leavesApp: Bool {
        !link.url.hasPrefix("/")
    }

    var body: some View {
        Button { onOpen(link.url) } label: {
            HStack(spacing: Spacing.s2) {
                Text(link.label)
                    .font(.system(size: 14, weight: .semibold))
                    .multilineTextAlignment(.center)
                if leavesApp {
                    Icon(.arrowUpRight, size: 15, strokeWidth: 2.25, color: ink)
                }
            }
            .foregroundStyle(ink)
            .padding(.horizontal, Spacing.s3)
            .padding(.vertical, Spacing.s2)
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(
                RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                    .fill(filled ? Theme.Color.primarySolid : Theme.Color.appSurface)
            )
            .overlay {
                if !filled {
                    RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                        .strokeBorder(Theme.Color.appBorderStrong, lineWidth: 1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(leavesApp ? "Opens in your browser" : "")
    }

    private var ink: Color {
        filled ? Theme.Color.appTextInverse : Theme.Color.primaryInk
    }
}

private func homeRecordChip(_ chip: HomeRecordChip, icon: PantopusIcon? = nil) -> PlaceChip {
    PlaceChip(model: PlaceChipModel(tone: chip.tone.placeTone, text: chip.text, icon: icon))
}

extension HomeRecordLevelTone {
    /// The ink of a meter's word and filled segments.
    var meterInk: Color {
        switch self {
        case .low: Theme.Color.success
        case .mid: Theme.Color.warning
        case .high: Theme.Color.error
        }
    }
}

/// The contract's icon names, in the app's icon set. An unknown name draws the default.
enum HomeRecordIcon {
    // swiftlint:disable:next cyclomatic_complexity
    static func icon(_ name: String?) -> PantopusIcon {
        switch name {
        case "history": .history
        case "trend": .trendingUp
        case "tag": .tag
        case "bank": .landmark
        case "bars": .barChart3
        case "shield": .shieldCheck
        case "image": .image
        case "wrench": .wrench
        case "bell": .bell
        case "layers": .layers
        case "home": .home
        case "alert": .alertTriangle
        case "file": .fileText
        case "mail": .mail
        case "percent": .percent
        case "eye_off": .eyeOff
        default: .info
        }
    }
}

// MARK: - facts

struct HomeRecordFactsBlock: View {
    let facts: HomeRecordFacts

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            if !facts.tiles.isEmpty {
                HStack(alignment: .top, spacing: Spacing.s2) {
                    ForEach(Array(facts.tiles.prefix(3).enumerated()), id: \.offset) { _, tile in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tile.label, style: .overline)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            (Text(tile.value)
                                .font(.system(size: 22, weight: .bold))
                                .kerning(-0.33)
                                .foregroundColor(Theme.Color.appText)
                                + Text(tile.unit.map { " \($0)" } ?? "")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Theme.Color.appTextSecondary))
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                        }
                        .padding(.vertical, Spacing.s3)
                        .padding(.horizontal, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            if let line = facts.line, !line.isEmpty {
                Text(line)
                    .font(.system(size: 14))
                    .lineSpacing(6)
                    .foregroundStyle(Theme.Color.appTextStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let source = facts.source, !source.isEmpty {
                HomeRecordSourceLine(text: source)
            }
        }
        .padding(Spacing.s4)
        .homeRecordCard()
    }
}

// MARK: - meters

struct HomeRecordMetersBlock: View {
    let meters: HomeRecordMeters

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title = meters.title, !title.isEmpty {
                HomeRecordSectionLabel(text: title)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(meters.groups.enumerated()), id: \.offset) { index, group in
                    if let title = group.title, !title.isEmpty {
                        Text(title)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.Color.appTextStrong)
                            .padding(.top, index == 0 ? Spacing.s3 : Spacing.s4)
                            .padding(.bottom, 2)
                            .accessibilityAddTraits(.isHeader)
                    }
                    ForEach(Array(group.rows.enumerated()), id: \.offset) { _, row in
                        MeterRow(row: row)
                    }
                }
                if let note = meters.note, !note.isEmpty {
                    HomeRecordSourceLine(text: note)
                        .padding(.top, Spacing.s3)
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, 6)
            .padding(.bottom, 14)
            .homeRecordCard()
        }
    }

    private struct MeterRow: View {
        let row: HomeRecordMeters.Row

        var body: some View {
            HStack(spacing: 10) {
                Text(row.label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.Color.appText)
                    .frame(width: 104, alignment: .leading)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                HStack(spacing: 3) {
                    ForEach(1...5, id: \.self) { step in
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(step <= row.level ? row.tone.meterInk : Theme.Color.appBorder)
                            .frame(width: 16, height: 8)
                    }
                }
                .accessibilityHidden(true)
                Text(row.word)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(row.tone.meterInk)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .frame(minHeight: 44)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(row.label): \(row.word), \(row.level) of 5")
        }
    }
}

// MARK: - intro

struct HomeRecordIntroBlock: View {
    let intro: HomeRecordIntro

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(intro.title)
                .font(.system(size: 22, weight: .bold))
                .kerning(-0.33)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let body = intro.body, !body.isEmpty {
                Text(body)
                    .font(.system(size: 14))
                    .lineSpacing(6)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, Spacing.s1)
        .padding(.bottom, Spacing.s1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - closed_group

struct HomeRecordClosedGroupBlock: View {
    let group: HomeRecordClosedGroup

    var body: some View {
        // A group with nothing in it is left out (the server leaves it out too).
        if !group.items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: Spacing.s2) {
                    HomeRecordCardTitle(text: group.title, size: 15)
                    Spacer(minLength: 0)
                    if let chip = group.chip, !chip.isEmpty {
                        PlaceChip(model: PlaceChipModel(tone: .neutral, text: chip, icon: .lock))
                    }
                }
                .frame(minHeight: 48)
                ForEach(Array(group.items.enumerated()), id: \.offset) { _, item in
                    HStack(spacing: Spacing.s3) {
                        PlaceIconTile(icon: HomeRecordIcon.icon(item.icon), tone: .home, size: 30)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(item.title)
                                .font(.system(size: 14.5, weight: .semibold))
                                .kerning(-0.15)
                                .foregroundStyle(Theme.Color.appText)
                            if let line = item.line, !line.isEmpty {
                                Text(line)
                                    .font(.system(size: 12.5))
                                    .lineSpacing(5)
                                    .foregroundStyle(Theme.Color.appTextSecondary)
                            }
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 7)
                    .frame(minHeight: 56)
                    .overlay(alignment: .top) {
                        Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityHint(group.chip ?? "")
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, Spacing.s1)
            .padding(.bottom, 6)
            .homeRecordCard()
        }
    }
}

// MARK: - promise

struct HomeRecordPromiseBlock: View {
    let promise: HomeRecordPromise
    let onOpen: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(promise.title)
                    .font(.system(size: 20, weight: .bold))
                    .kerning(-0.24)
                    .foregroundStyle(Theme.Color.primaryInkStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let body = promise.body, !body.isEmpty {
                    Text(body)
                        .font(.system(size: 14))
                        .lineSpacing(6)
                        .foregroundStyle(Theme.Color.appTextStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if !promise.steps.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(promise.steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .top, spacing: Spacing.s3) {
                            Text("\(index + 1)")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Theme.Color.primaryInk)
                                .frame(width: 26, height: 26)
                                .background(Circle().fill(Theme.Color.appSurface))
                                .overlay(Circle().strokeBorder(Theme.Color.primary200, lineWidth: 1))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(step.title)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Theme.Color.appText)
                                if let line = step.line, !line.isEmpty {
                                    Text(line)
                                        .font(.system(size: 13))
                                        .lineSpacing(5)
                                        .foregroundStyle(Theme.Color.appTextSecondary)
                                }
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Step \(index + 1): \(step.title). \(step.line ?? "")")
                    }
                }
            }
            if let button = promise.button {
                PrimaryButton(title: button.label) { onOpen(button.url) }
                    .accessibilityIdentifier("homeRecord.promise.button")
            }
            if let alt = promise.alt {
                Button { onOpen(alt.url) } label: {
                    (Text(alt.lead.map { "\($0) " } ?? "")
                        .foregroundColor(Theme.Color.appTextSecondary)
                        + Text(alt.label)
                        .fontWeight(.semibold)
                        .foregroundColor(Theme.Color.primaryInk))
                        .font(.system(size: 13))
                        .lineSpacing(5)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("homeRecord.promise.alt")
            }
        }
        .padding(.top, Spacing.s5)
        .padding(.horizontal, Spacing.s4)
        .padding(.bottom, Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.infoBg, in: RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous)
                .strokeBorder(Theme.Color.primary200, lineWidth: 1)
        )
    }
}

// MARK: - note

struct HomeRecordNoteBlock: View {
    let note: HomeRecordNote

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            Icon(HomeRecordIcon.icon(note.icon), size: 18, strokeWidth: 2, color: Theme.Color.appTextSecondary)
                .padding(.top, 1)
                .accessibilityHidden(true)
            Text(note.text)
                .font(.system(size: 13))
                .lineSpacing(6)
                .foregroundStyle(Theme.Color.appTextStrong)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurface, in: RoundedRectangle(cornerRadius: Radii.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radii.xl, style: .continuous)
                .strokeBorder(Theme.Color.appBorder, lineWidth: 1)
        )
    }
}

// MARK: - value

struct HomeRecordValueBlock: View {
    let value: HomeRecordValue

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value.label, style: .overline)
                .foregroundStyle(Theme.Color.appTextSecondary)
            Text(value.value)
                .font(.system(size: 36, weight: .bold))
                .kerning(-0.72)
                .foregroundStyle(Theme.Color.appText)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.top, Spacing.s1)
            if let chip = value.chip {
                homeRecordChip(chip)
                    .padding(.top, 6)
            }
            if !value.bars.isEmpty {
                ValueBars(bars: value.bars)
                    .padding(.top, Spacing.s4)
            }
            if let source = value.source, !source.isEmpty {
                HomeRecordSourceLine(text: source)
                    .padding(.top, 10)
            }
            if let estimate = value.estimate {
                EstimateRow(estimate: estimate)
                    .padding(.top, 14)
                    .overlay(alignment: .top) {
                        Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
                    }
                    .padding(.top, 14)
            }
        }
        .padding(Spacing.s4)
        .homeRecordCard()
    }

    private struct ValueBars: View {
        let bars: [HomeRecordValue.Bar]

        var body: some View {
            let top = max(bars.map(\.amount).max() ?? 1, 1)
            VStack(spacing: 6) {
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(Array(bars.enumerated()), id: \.offset) { index, bar in
                        UnevenRoundedRectangle(
                            topLeadingRadius: 6,
                            bottomLeadingRadius: 2,
                            bottomTrailingRadius: 2,
                            topTrailingRadius: 6,
                            style: .continuous
                        )
                        .fill(index == bars.count - 1 ? Theme.Color.primary500 : Theme.Color.primary200)
                        .frame(height: max(4, 116 * bar.amount / top))
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 120, alignment: .bottom)
                HStack(spacing: 6) {
                    ForEach(Array(bars.enumerated()), id: \.offset) { _, bar in
                        Text(bar.year)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.appTextMuted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(bars.map { "\($0.year): \(Self.amount($0.amount))" }.joined(separator: ", "))
        }

        private static func amount(_ value: Double) -> String {
            value.formatted(.currency(code: "USD").precision(.fractionLength(0)))
        }
    }

    private struct EstimateRow: View {
        let estimate: HomeRecordValue.Estimate

        var body: some View {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                    Text(estimate.label)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.Color.appTextStrong)
                    Spacer(minLength: 0)
                    Text(estimate.text)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.trailing)
                }
                .accessibilityElement(children: .combine)
                GeometryReader { geo in
                    let width = geo.size.width
                    let low = min(max(estimate.low, 0), 1)
                    let high = min(max(estimate.high, low), 1)
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.Color.appSurfaceSunken)
                        Capsule().fill(Theme.Color.primary200)
                            .frame(width: max(8, width * (high - low)))
                            .offset(x: width * low)
                        if let mark = estimate.mark {
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .fill(Theme.Color.primarySolid)
                                .frame(width: 4, height: 14)
                                .offset(x: width * min(max(mark, 0), 1) - 2)
                        }
                    }
                }
                .frame(height: 8)
                .accessibilityHidden(true)
                if let note = estimate.note, !note.isEmpty {
                    HomeRecordSourceLine(text: note)
                        .padding(.top, 2)
                }
            }
        }
    }
}

// MARK: - photo_years

struct HomeRecordPhotoYearsBlock: View {
    let photos: HomeRecordPhotoYears
    @State private var selected: Int?

    var body: some View {
        // Newest last: it shows first.
        let shown = selected.flatMap { photos.photos.indices.contains($0) ? $0 : nil } ?? photos.photos.count - 1
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                HomeRecordCardTitle(text: photos.title)
                Spacer(minLength: 0)
                if let count = photos.count, !count.isEmpty {
                    Text(count)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            if photos.photos.indices.contains(shown) {
                let photo = photos.photos[shown]
                HomeRecordAerialView(imageURL: photo.imageURL, outline: photo.outline, dimsOutside: false)
                    .frame(height: 216)
                    .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
                    .overlay(alignment: .bottomLeading) {
                        HomeRecordPhotoChip(text: photo.label ?? photo.year, dark: true)
                            .padding(10)
                    }
                    .padding(.top, Spacing.s3)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Photo from above of the lot, \(photo.label ?? photo.year)")
                    .accessibilityAddTraits(.isImage)
                if photos.photos.count > 1 {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.s2), count: 4), spacing: Spacing.s2) {
                        ForEach(Array(photos.photos.enumerated()), id: \.offset) { index, item in
                            YearButton(photo: item, isOn: index == shown) {
                                withAnimation(.easeInOut(duration: 0.2)) { selected = index }
                            }
                        }
                    }
                    .padding(.top, 10)
                }
            }
            if let note = photos.note, !note.isEmpty {
                HomeRecordSourceLine(text: note)
                    .padding(.top, 10)
            }
        }
        .padding(Spacing.s4)
        .homeRecordCard()
    }

    private struct YearButton: View {
        let photo: HomeRecordPhotoYears.Photo
        let isOn: Bool
        let action: () -> Void

        var body: some View {
            Button(action: action) {
                VStack(spacing: 0) {
                    HomeRecordAerialView(imageURL: photo.imageURL, outline: nil, dimsOutside: false, thumbnail: true)
                        .frame(height: 50)
                        .clipped()
                    Text(photo.year)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(isOn ? Theme.Color.primaryInk : Theme.Color.appTextStrong)
                        .frame(maxWidth: .infinity, minHeight: 22)
                }
                .background(isOn ? Theme.Color.infoBg : Theme.Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(isOn ? Theme.Color.primaryInk : Theme.Color.appBorder, lineWidth: 2)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isOn ? "Showing \(photo.year)" : "Show \(photo.year)")
            .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        }
    }
}

// MARK: - timeline

struct HomeRecordTimelineBlock: View {
    let timeline: HomeRecordTimeline

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title = timeline.title, !title.isEmpty {
                HomeRecordCardTitle(text: title)
                    .padding(.bottom, Spacing.s3)
            }
            ForEach(Array(timeline.items.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .top, spacing: Spacing.s3) {
                    VStack(spacing: Spacing.s1) {
                        Circle()
                            .fill(item.strong ? Theme.Color.home : Theme.Color.appSurface)
                            .overlay(Circle().strokeBorder(item.strong ? Theme.Color.home : Theme.Color.appTextMuted, lineWidth: 2))
                            .frame(width: 12, height: 12)
                            .padding(.top, Spacing.s1)
                        Rectangle().fill(Theme.Color.appBorder).frame(width: 2)
                    }
                    .frame(width: 14)
                    .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                            Text(item.title)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Theme.Color.appText)
                            Spacer(minLength: 0)
                            if let right = item.right, !right.isEmpty {
                                Text(right)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(item.strong ? Theme.Color.appText : Theme.Color.appTextMuted)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                        if let detail = detailLine(item) {
                            detail
                                .font(.system(size: 12.5))
                                .lineSpacing(5)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, Spacing.s3)
                }
                .frame(minHeight: 62, alignment: .top)
                .accessibilityElement(children: .combine)
            }
            if let note = timeline.note, !note.isEmpty {
                HomeRecordSourceLine(text: note)
            }
        }
        .padding(Spacing.s4)
        .homeRecordCard()
    }

    /// "Mar 12, 2021 · Doc 5871234", the document number set in a fixed-width face.
    private func detailLine(_ item: HomeRecordTimeline.Item) -> Text? {
        let line = item.line.flatMap { $0.isEmpty ? nil : $0 }
        let mono = item.mono.flatMap { $0.isEmpty ? nil : $0 }
        switch (line, mono) {
        case let (line?, mono?):
            return Text("\(line) · ") + Text(mono).font(.system(size: 12, design: .monospaced))
        case let (line?, nil):
            return Text(line)
        case let (nil, mono?):
            return Text(mono).font(.system(size: 12, design: .monospaced))
        case (nil, nil):
            return nil
        }
    }
}

// MARK: - notice

struct HomeRecordNoticeBlock: View {
    let notice: HomeRecordNotice

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.Color.infoBg)
                Icon(.bell, size: 18, strokeWidth: 2, color: Theme.Color.primaryInkStrong)
            }
            .frame(width: 34, height: 34)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                if let eyebrow = notice.eyebrow, !eyebrow.isEmpty {
                    Text(eyebrow, style: .overline)
                        .foregroundStyle(Theme.Color.primaryInkStrong)
                }
                Text(notice.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                if let line = notice.line, !line.isEmpty {
                    Text(line)
                        .font(.system(size: 12.5))
                        .lineSpacing(5)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Spacing.s4)
        .homeRecordCard()
        .accessibilityElement(children: .combine)
    }
}

// MARK: - rows

struct HomeRecordRowsBlock: View {
    let rows: HomeRecordRows
    let onOpen: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title = rows.title, !title.isEmpty {
                HomeRecordCardTitle(text: title)
            }
            if let lead = rows.lead, !lead.isEmpty {
                Text(lead)
                    .font(.system(size: 13))
                    .lineSpacing(5)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            }
            VStack(spacing: 0) {
                ForEach(Array(rows.rows.enumerated()), id: \.offset) { index, row in
                    HStack(spacing: Spacing.s2) {
                        Text(row.label)
                            .font(.system(size: 14, weight: row.value == nil ? .medium : .regular))
                            .foregroundStyle(row.value == nil ? Theme.Color.appText : Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: Spacing.s2)
                        if let value = row.value, !value.isEmpty {
                            Text(value)
                                .font(.system(size: 14, weight: .medium, design: row.mono ? .monospaced : .default))
                                .foregroundStyle(Theme.Color.appText)
                                .multilineTextAlignment(.trailing)
                        }
                        if let chip = row.chip {
                            homeRecordChip(chip)
                        }
                    }
                    .padding(.vertical, 10)
                    .frame(minHeight: 46)
                    .overlay(alignment: .top) {
                        if index > 0 || rows.lead != nil {
                            Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.top, 6)
            if let action = rows.action {
                HomeRecordLinkButton(link: action, onOpen: onOpen)
                    .padding(.top, Spacing.s2)
            }
            if let note = rows.note, !note.isEmpty {
                HomeRecordSourceLine(text: note)
                    .padding(.top, 10)
            }
        }
        .padding(Spacing.s4)
        .homeRecordCard()
    }
}

// MARK: - tiles

struct HomeRecordTilesBlock: View {
    let tiles: HomeRecordTiles

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title = tiles.title, !title.isEmpty {
                HomeRecordCardTitle(text: title)
                    .padding(.bottom, 10)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Spacing.s2), GridItem(.flexible())], spacing: Spacing.s2) {
                ForEach(Array(tiles.tiles.enumerated()), id: \.offset) { _, tile in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(tile.label, style: .overline)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                        Text(tile.value)
                            .font(.system(size: 20, weight: .bold))
                            .kerning(-0.3)
                            .foregroundStyle(Theme.Color.appText)
                        if let line = tile.line, !line.isEmpty {
                            Text(line)
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Color.appTextSecondary)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(Spacing.s3)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
                    .accessibilityElement(children: .combine)
                }
            }
            if !tiles.rows.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(tiles.rows.enumerated()), id: \.offset) { index, row in
                        HStack(spacing: Spacing.s2) {
                            Text(row.label)
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.Color.appTextSecondary)
                            Spacer(minLength: Spacing.s2)
                            Text(row.value)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Theme.Color.appText)
                                .multilineTextAlignment(.trailing)
                        }
                        .frame(minHeight: 44)
                        .overlay(alignment: .bottom) {
                            if index < tiles.rows.count - 1 {
                                Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.top, 6)
            }
            if let note = tiles.note, !note.isEmpty {
                HomeRecordSourceLine(text: note)
                    .padding(.top, 6)
            }
        }
        .padding(Spacing.s4)
        .homeRecordCard()
    }
}

// MARK: - bars

struct HomeRecordBarsBlock: View {
    let bars: HomeRecordBars

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title = bars.title, !title.isEmpty {
                HomeRecordCardTitle(text: title)
                    .padding(.bottom, Spacing.s1)
            }
            ForEach(Array(bars.items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                        Text(item.title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.Color.appText)
                        Spacer(minLength: 0)
                        if let right = item.right, !right.isEmpty {
                            Text(right)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(item.tone == .low ? Theme.Color.appTextStrong : item.tone.meterInk)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.Color.appSurfaceSunken)
                            Capsule()
                                .fill(item.tone == .low ? Theme.Color.home : item.tone.meterInk)
                                .frame(width: geo.size.width * min(max(item.fill, 0), 1))
                        }
                    }
                    .frame(height: 6)
                    .accessibilityHidden(true)
                    if let line = item.line, !line.isEmpty {
                        Text(line)
                            .font(.system(size: 12))
                            .lineSpacing(4)
                            .foregroundStyle(Theme.Color.appTextMuted)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, 10)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
                }
                .accessibilityElement(children: .combine)
            }
            if let note = bars.note, !note.isEmpty {
                HomeRecordSourceLine(text: note)
                    .padding(.top, 10)
            }
        }
        .padding(Spacing.s4)
        .homeRecordCard()
    }
}

// MARK: - card

struct HomeRecordCardBlock: View {
    let card: HomeRecordCard
    let onOpen: (String) -> Void

    /// The drawn record fills the action of a card that has only words to say
    /// (no chip, no rows): it is the one thing to do there.
    private var fillsAction: Bool {
        card.chip == nil && card.rows.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(spacing: Spacing.s2) {
                HomeRecordCardTitle(text: card.title, size: 15)
                Spacer(minLength: 0)
                if let chip = card.chip {
                    homeRecordChip(chip)
                }
            }
            if let lead = card.lead, !lead.isEmpty {
                Text(lead)
                    .font(.system(size: 13.5))
                    .lineSpacing(5)
                    .foregroundStyle(Theme.Color.appTextStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !card.rows.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(card.rows.enumerated()), id: \.offset) { _, row in
                        HStack(spacing: Spacing.s2) {
                            Text(row.label)
                                .font(.system(size: 13.5, weight: .medium))
                                .foregroundStyle(Theme.Color.appText)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: Spacing.s2)
                            Text(row.value)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.Color.appText)
                                .multilineTextAlignment(.trailing)
                        }
                        .padding(.vertical, Spacing.s2)
                        .frame(minHeight: 44)
                        .overlay(alignment: .top) {
                            Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            ForEach(Array(card.notes.enumerated()), id: \.offset) { _, note in
                Text(note)
                    .font(.system(size: 12.5))
                    .lineSpacing(5)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let action = card.action {
                HomeRecordLinkButton(link: action, filled: fillsAction, onOpen: onOpen)
                    .padding(.top, Spacing.s1)
            }
            if let source = card.source, !source.isEmpty {
                HomeRecordSourceLine(text: source)
            }
        }
        .padding(Spacing.s4)
        .homeRecordCard()
    }
}
