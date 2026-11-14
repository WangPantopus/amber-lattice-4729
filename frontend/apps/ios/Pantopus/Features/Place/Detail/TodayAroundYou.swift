//
//  TodayAroundYou.swift
//  Pantopus
//
//  Today's two halves (founder decision 2026-11-14): "At home" is Today as it
//  was; "Around you" lists local headlines for the same place, each the
//  outlet's own with its name, opened at the outlet. The switch is the big
//  two-part one Pulse draws for List | Map, and it shows only when the server
//  has something for this place (`available`), so an area without local
//  sources sees Today unchanged. Parity twin of Android's `TodayAroundYou.kt`.
//

import Observation
import SafariServices
import SwiftUI

/// Which half of Today shows.
enum TodayHalf: String, CaseIterable {
    case home
    case around

    var label: String {
        switch self {
        case .home: "At home"
        case .around: "Around you"
        }
    }

    var icon: PantopusIcon {
        switch self {
        case .home: .home
        case .around: .megaphone
        }
    }
}

/// The Around you page for the place Today shows. It keeps the last answer
/// for that place; a failed read keeps it, and another place starts blank.
@Observable
@MainActor
final class TodayAroundYouModel {
    private(set) var page: AroundYouDTO?
    private var placeKey: String?
    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    /// Something to show for this place: Today offers the switch.
    var available: Bool {
        page?.available == true && page?.sections.isEmpty == false
    }

    func load(for detail: PlaceDetailViewModel?) async {
        guard let detail else {
            page = nil
            placeKey = nil
            return
        }
        if placeKey != detail.identity {
            page = nil
            placeKey = detail.identity
        }
        let endpoint: Endpoint
        if let area = detail.area {
            endpoint = AroundYouEndpoints.area(AreaTodayBody(latitude: area.latitude, longitude: area.longitude))
        } else if let savedPlaceId = detail.savedPlaceId {
            endpoint = AroundYouEndpoints.savedPlace(id: savedPlaceId)
        } else if !detail.homeId.isEmpty {
            endpoint = AroundYouEndpoints.home(id: detail.homeId)
        } else {
            return
        }
        let key = detail.identity
        do {
            let answer: AroundYouDTO = try await api.request(endpoint)
            if placeKey == key { page = answer }
        } catch {
            // The last answer for this place stays.
        }
    }

    /// "3 hr ago", "Yesterday", "2 days ago": how long since the story was first seen.
    static func seenAgo(_ iso: String, now: Date = Date()) -> String? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let seen = withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }
        let minutes = max(0, Int((now.timeIntervalSince(seen) / 60).rounded()))
        if minutes < 60 { return minutes < 2 ? "Just now" : "\(minutes) min ago" }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 24 { return "\(hours) hr ago" }
        let days = Int((Double(hours) / 24).rounded())
        return days == 1 ? "Yesterday" : "\(days) days ago"
    }
}

/// The big two-part switch under Today's title, drawn as Pulse's List | Map.
struct TodayHalfSwitch: View {
    @Binding var half: TodayHalf

    var body: some View {
        HStack(spacing: 2) {
            ForEach(TodayHalf.allCases, id: \.rawValue) { option in
                let active = half == option
                Button {
                    withAnimation(.easeOut(duration: 0.15)) { half = option }
                } label: {
                    HStack(spacing: 6) {
                        Icon(
                            option.icon,
                            size: 17,
                            strokeWidth: 2.2,
                            color: active ? Theme.Color.appTextInverse : Theme.Color.appTextSecondary
                        )
                        Text(option.label)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(active ? Theme.Color.appTextInverse : Theme.Color.appTextSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 38)
                    .background(active ? Theme.Color.primarySolid : Color.clear)
                    .clipShape(Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("todayHalfSegment_\(option.rawValue)")
                .accessibilityLabel(option.label)
                .accessibilityAddTraits(active ? [.isSelected] : [])
            }
        }
        .padding(3)
        .background(Theme.Color.appSurfaceSunken)
        .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: 1))
        .clipShape(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("todayHalfToggle")
    }
}

/// The Around you page: the sections the server sends, each a card of rows.
struct TodayAroundYouPage: View {
    let page: AroundYouDTO
    let onRefresh: () async -> Void
    @State private var opened: OpenedStory?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s5) {
                if let area = page.area {
                    Text("From local news outlets around \(area). Each headline opens the story where it was published.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, Spacing.s1)
                }
                ForEach(page.sections) { section in
                    sectionCard(section)
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s2)
            .padding(.bottom, Spacing.s10)
        }
        .refreshable { await onRefresh() }
        .sheet(item: $opened) { story in
            StoryBrowser(url: story.url).ignoresSafeArea()
        }
        .accessibilityIdentifier("aroundYouPanel")
    }

    private func sectionCard(_ section: AroundYouSectionDTO) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text(section.title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .kerning(0.77)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .padding(.horizontal, Spacing.s1)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: Spacing.s0) {
                ForEach(Array(section.items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { PlaceRowDivider() }
                    row(item)
                }
            }
            .background(Theme.Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.xl, style: .continuous)
                    .strokeBorder(Theme.Color.appBorder, lineWidth: 1)
            )
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("aroundYouSection_\(section.id)")
    }

    @ViewBuilder
    private func row(_ item: AroundYouItemDTO) -> some View {
        if let link = item.url.flatMap(URL.init(string:)), ["https", "http"].contains(link.scheme?.lowercased() ?? "") {
            Button {
                opened = OpenedStory(url: link)
            } label: {
                HStack(alignment: .top, spacing: Spacing.s3) {
                    rowText(item, timed: true)
                    Icon(.externalLink, size: 16, color: Theme.Color.appTextMuted)
                        .padding(.top, 2)
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the story at \(item.source ?? "its outlet").")
            .accessibilityIdentifier("aroundYouItem")
        } else {
            // A tip is its own text: nothing to open, and no time (it is not news).
            rowText(item, timed: false)
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("aroundYouItem")
        }
    }

    private func rowText(_ item: AroundYouItemDTO, timed: Bool) -> some View {
        let meta = [item.source, timed ? TodayAroundYouModel.seenAgo(item.seenAt) : nil]
            .compactMap { $0 }
            .joined(separator: " · ")
        return VStack(alignment: .leading, spacing: Spacing.s1) {
            Text(item.title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if !meta.isEmpty {
                Text(meta)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private struct OpenedStory: Identifiable {
        let url: URL
        var id: String {
            url.absoluteString
        }
    }
}

/// The story at its outlet, in the app's own browser sheet (as a link in a post opens).
private struct StoryBrowser: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context _: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_: SFSafariViewController, context _: Context) {}
}
