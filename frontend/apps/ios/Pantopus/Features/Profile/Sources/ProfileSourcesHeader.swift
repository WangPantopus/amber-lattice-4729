//
//  ProfileSourcesHeader.swift
//  Pantopus
//
//  The top card of the profile with sources (boards 1–4): the sky over the
//  person's city when the server sends a place, the mark around the portrait,
//  the name and headline, the buttons for where the viewer stands, the record
//  well ("12 years on record", Open the record) and up to three key lines.
//

import SwiftUI

struct ProfileSourcesHeader<Actions: View>: View {
    let content: ProfileSourcesContent
    /// The colour behind initials when there's no photo (today's feed tint for this person).
    let avatarColor: ProfileAvatarColor
    /// The lines under the well (`key_lines`), when the first tab starts with them.
    let keyLines: [ProfilePageLineDTO]
    /// Opens the Record tab; nil when there is none.
    var onOpenRecord: (() -> Void)?
    var onOpenLink: ((ProfilePageLinkDTO) -> Void)?
    @ViewBuilder let actions: () -> Actions

    @Environment(\.dynamicTypeSize) private var typeSize

    private var header: ProfilePageHeaderDTO {
        content.header
    }

    var body: some View {
        ProfileBlockCard(padded: false) {
            VStack(spacing: Spacing.s0) {
                top
                VStack(spacing: 2) {
                    Text(header.name)
                        .scaledFont(30, weight: .bold)
                        .tracking(-0.6)
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("profileSourcesName")
                    if let headline = trimmed(header.headline) {
                        Text(headline)
                            .scaledFont(15)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityLabel("\(headline). Said")
                    }
                    if let accountName = trimmed(header.accountName), accountName != header.name {
                        ProfilePrivateNameLine(text: "Your account name, \(accountName), stays private.")
                            .padding(.top, Spacing.s2)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, Spacing.s5)
                .padding(.top, 6)
                .padding(.bottom, Spacing.s4)

                actions()
                    .padding(.horizontal, Spacing.s4)
                    .padding(.bottom, Spacing.s4)

                if let summary = content.page.summary, summary.seenMonths + summary.signedMonths + summary.saidMonths > 0 {
                    ProfileRecordWell(summary: summary, onOpen: onOpenRecord)
                        .padding(.horizontal, Spacing.s4)
                }

                if !keyLines.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.s3) {
                        ForEach(Array(keyLines.enumerated()), id: \.offset) { index, line in
                            ProfileInkLineView(line: line.sourceLine(at: index), onOpen: linkOpener(line))
                        }
                    }
                    .padding(.horizontal, Spacing.s5)
                    .padding(.top, Spacing.s4)
                }
                Color.clear.frame(height: Spacing.s5)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profileSourcesHeader")
    }

    private func linkOpener(_ line: ProfilePageLineDTO) -> ((String) -> Void)? {
        guard let link = line.link, let onOpenLink else { return nil }
        return { _ in onOpenLink(link) }
    }

    /// The sky band with the place and how this viewer sees the page, then the mark over it; without a place, the
    /// mark alone with the phrase above it.
    @ViewBuilder private var top: some View {
        let markSize: CGFloat = typeSize.isAccessibilitySize ? 150 : 176
        if let place = header.place {
            VStack(spacing: Spacing.s0) {
                ZStack(alignment: .top) {
                    ProfileSkyBand(sky: ProfileSky(place.sky))
                        .frame(height: 132)
                        .accessibilityElement()
                        .accessibilityLabel("The sky over \(place.label) now: \(ProfileSky(place.sky).spoken)")
                    if !typeSize.isAccessibilitySize {
                        chips(place: place)
                            .padding(10)
                    }
                }
                mark(size: markSize)
                    .padding(.top, -markSize / 2)
                // At the accessibility sizes the chips would cover the sky and the mark: they go under it instead.
                if typeSize.isAccessibilitySize {
                    chips(place: place)
                        .padding(.horizontal, Spacing.s4)
                        .padding(.top, Spacing.s2)
                }
            }
        } else {
            VStack(spacing: Spacing.s2) {
                if let seenAs = trimmed(header.seenAs) {
                    ProfileSeenAsChip(text: seenAs, onSky: false)
                }
                mark(size: markSize)
            }
            .padding(.top, Spacing.s4)
        }
    }

    @ViewBuilder
    private func chips(place: ProfilePagePlaceDTO) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Spacing.s2))
        layout {
            ProfilePlaceChip(place: place)
            if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
            if let seenAs = trimmed(header.seenAs) {
                ProfileSeenAsChip(text: seenAs, onSky: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func mark(size: CGFloat) -> some View {
        Group {
            if let rings = content.rings {
                ProfileRingMark(rings: rings, size: size, spoken: markLabel) { portrait(size: size * 80 / 176) }
            } else {
                ZStack {
                    Color.clear
                        .accessibilityElement()
                        .accessibilityLabel(markLabel)
                        .accessibilityAddTraits(.isImage)
                    portrait(size: size * 80 / 176)
                }
                .frame(width: size, height: size)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func portrait(size: CGFloat) -> some View {
        ProfileAvatarDisc(
            name: header.name,
            showsInitials: !header.name.isEmpty,
            imageURL: header.portraitURL,
            color: avatarColor,
            size: size
        )
        .momentsRing(of: header.userId)
    }

    private var markLabel: String {
        guard let summary = content.page.summary, summary.years > 0 else { return "\(header.name)'s photo" }
        return "\(header.name)'s photo, in rings: \(ProfileRecordWell.yearsText(summary.years))"
    }

    private func trimmed(_ text: String?) -> String? {
        guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }
}

// MARK: - Chips

/// "Camas, WA · 7:12 PM": the city and its time now, kept running from the city's time zone.
struct ProfilePlaceChip: View {
    let place: ProfilePagePlaceDTO

    var body: some View {
        TimelineView(.everyMinute) { context in
            Text(label(at: context.date))
                .scaledFont(12, weight: .semibold)
                .foregroundStyle(Theme.Color.appSurface)
                .padding(.horizontal, 10)
                .frame(minHeight: 28)
                .background(Theme.Color.appText, in: Capsule())
        }
        .accessibilityElement(children: .combine)
    }

    private func label(at date: Date) -> String {
        guard let time = time(at: date) else { return place.label }
        return "\(place.label) · \(time)"
    }

    private func time(at date: Date) -> String? {
        guard let id = place.timeZone, let zone = TimeZone(identifier: id) else { return place.time }
        let style = Date.FormatStyle(date: .omitted, time: .shortened, timeZone: zone)
        return date.formatted(style)
    }
}

/// "Seen from nearby", "Seen as a connection", "This is your page".
struct ProfileSeenAsChip: View {
    let text: String
    let onSky: Bool

    var body: some View {
        HStack(spacing: 6) {
            Icon(.eye, size: 13, strokeWidth: 2.2, color: Theme.Color.appText)
            Text(text)
                .scaledFont(12, weight: .semibold)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 28)
        .background(onSky ? Theme.Color.appSurface : Theme.Color.appSurfaceSunken, in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("profileSourcesSeenAs")
    }
}

// MARK: - The record well

/// "12 years on record · Open the record", the meter, and each ink with how long it covers. An ink with no months
/// is left out of both, never shown as zero.
struct ProfileRecordWell: View {
    let summary: ProfilePageSummaryDTO
    var onOpen: (() -> Void)?

    @Environment(\.dynamicTypeSize) private var typeSize

    static func yearsText(_ years: Int) -> String {
        years == 1 ? "1 year on record" : "\(years) years on record"
    }

    /// Months as the board writes them: under two years in months, from two years in years.
    static func amount(_ months: Int) -> String {
        if months >= 24 {
            let years = Int((Double(months) / 12).rounded())
            return "\(years) years"
        }
        return months == 1 ? "1 month" : "\(months) months"
    }

    private var inks: [(ProfileInk, Int)] {
        [(ProfileInk.seen, summary.seenMonths), (.signed, summary.signedMonths), (.said, summary.saidMonths)].filter { $0.1 > 0 }
    }

    var body: some View {
        let content = VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(alignment: .firstTextBaseline) {
                Text(Self.yearsText(summary.years))
                    .scaledFont(15, weight: .semibold)
                    .foregroundStyle(Theme.Color.appText)
                Spacer(minLength: Spacing.s2)
                if onOpen != nil {
                    Text("Open the record")
                        .scaledFont(13, weight: .semibold)
                        .foregroundStyle(Theme.Color.primaryInk)
                }
            }
            ProfileRecordMeter(seen: summary.seenMonths, signed: summary.signedMonths, said: summary.saidMonths)
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
                : AnyLayout(HStackLayout(alignment: .top, spacing: Spacing.s2))
            layout {
                ForEach(inks, id: \.0) { ink, months in
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 6) {
                            ProfileInkGlyph(ink: ink)
                            Text(ink.word)
                                .scaledFont(12, weight: .semibold)
                                .foregroundStyle(Theme.Color.appTextStrong)
                        }
                        Text(Self.amount(months))
                            .scaledFont(12)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                    }
                    .frame(maxWidth: typeSize.isAccessibilitySize ? nil : .infinity, alignment: .leading)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

        if let onOpen {
            Button(action: onOpen) { content }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
                .accessibilityHint("Opens the record")
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("profileSourcesRecordWell")
        } else {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
        }
    }

    private var spoken: String {
        ([Self.yearsText(summary.years)] + inks.map { "\($0.0.word), \(Self.amount($0.1))" }).joined(separator: ". ")
    }
}

extension ProfilePageLineDTO {
    /// The line as the views draw it.
    func sourceLine(at position: Int) -> ProfileSourceLine {
        ProfileSourceLine(
            ink: ProfileInk(serverValue: ink),
            text: text,
            how: how,
            lane: lane.flatMap(ProfileLane.init(rawValue:)),
            link: link == nil ? nil : "link",
            position: position
        )
    }
}
