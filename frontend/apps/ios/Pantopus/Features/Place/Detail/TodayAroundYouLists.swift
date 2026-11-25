//
//  TodayAroundYouLists.swift
//  Pantopus
//
//  Around you's lists behind the first page (founder, 2026-11-24: topics,
//  and "should users be able to keep scrolling as long as there are
//  available ones?"). A row of chips over the page (All, Talked about,
//  Events, Kids & schools, Sports, …; the server says which this place has),
//  each a list that keeps loading as its end nears for as long as there are
//  stories. Under All the first page's sections are followed by every
//  earlier story, under the day each was first seen. `TodayAroundYouModel`
//  reads the pages; `TodayAroundYouPage` draws the cards. Parity twin of the
//  web's `AroundYouPosts` (components/hub/AroundYou.tsx).
//

import SwiftUI

/// The place an Around you page is for, as its reads name it.
enum AroundYouPlace: Equatable {
    case area(AreaTodayBody)
    case savedPlace(String)
    case home(String)

    @MainActor
    init?(_ detail: PlaceDetailViewModel) {
        if let area = detail.area {
            self = .area(AreaTodayBody(latitude: area.latitude, longitude: area.longitude))
        } else if let savedPlaceId = detail.savedPlaceId {
            self = .savedPlace(savedPlaceId)
        } else if !detail.homeId.isEmpty {
            self = .home(detail.homeId)
        } else {
            return nil
        }
    }

    /// The first page.
    var page: Endpoint {
        switch self {
        case let .area(body): AroundYouEndpoints.area(body)
        case let .savedPlace(id): AroundYouEndpoints.savedPlace(id: id)
        case let .home(id): AroundYouEndpoints.home(id: id)
        }
    }

    /// A page of one of its lists; `before` is the last page's `next`.
    func list(_ list: String, before: String?) -> Endpoint {
        switch self {
        case let .area(body): AroundYouEndpoints.areaList(AreaAroundListBody(area: body, list: list, before: before))
        case let .savedPlace(id): AroundYouEndpoints.savedPlaceList(id: id, list: list, before: before)
        case let .home(id): AroundYouEndpoints.homeList(id: id, list: list, before: before)
        }
    }
}

/// How the open list's read stands.
enum AroundYouListState: Equatable {
    /// Nothing asked yet (All's earlier stories wait until the page's end nears).
    case idle
    case loading
    /// A page was read and the server has more.
    case more
    /// The list's end.
    case ended
    case failed
}

/// A list's stories under the day each was first seen.
struct AroundYouDayGroup: Identifiable {
    /// The heading over the group ("Earlier · Yesterday", "Today"); nil for a list that shows no days.
    let heading: String?
    let postIds: [String]

    var id: String {
        "\(heading ?? "")|\(postIds.first ?? "")"
    }

    /// The posts of `list` in their order, cut where the day changes. The coming events and what is talked about
    /// are one group with no heading.
    @MainActor
    static func groups(of posts: [FeedPostDTO], list: String, now: Date = Date()) -> [AroundYouDayGroup] {
        guard !posts.isEmpty else { return [] }
        let dated = list != AroundYouListDTO.events && list != AroundYouListDTO.talked
        guard dated else { return [AroundYouDayGroup(heading: nil, postIds: posts.map(\.id))] }
        var groups: [(day: String, ids: [String])] = []
        for post in posts {
            let day = dayLabel(post.createdAt, now: now)
            if groups.last?.day == day {
                groups[groups.count - 1].ids.append(post.id)
            } else {
                groups.append((day, [post.id]))
            }
        }
        return groups.map { group in
            let heading: String = if list == AroundYouListDTO.all {
                group.day.isEmpty ? "Earlier" : "Earlier · \(group.day)"
            } else {
                group.day
            }
            return AroundYouDayGroup(heading: heading.isEmpty ? nil : heading, postIds: group.ids)
        }
    }

    @MainActor private static let stamp: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    @MainActor private static let plainStamp = ISO8601DateFormatter()

    /// "Today", "Yesterday", "Sunday, Nov 22": the day a story was first seen; "" when its time can't be read.
    @MainActor
    static func dayLabel(_ iso: String, now: Date, calendar: Calendar = .current) -> String {
        guard let seen = stamp.date(from: iso) ?? plainStamp.date(from: iso) else { return "" }
        let days = calendar.dateComponents(
            [.day], from: calendar.startOfDay(for: seen), to: calendar.startOfDay(for: now)
        ).day ?? 0
        if days <= 0 { return "Today" }
        if days == 1 { return "Yesterday" }
        let sameYear = calendar.component(.year, from: seen) == calendar.component(.year, from: now)
        return seen.formatted(sameYear
            ? .dateTime.weekday(.wide).month(.abbreviated).day()
            : .dateTime.weekday(.wide).month(.abbreviated).day().year())
    }
}

/// The chips over Around you: which list shows. Drawn as Pulse draws its filter chips.
struct TodayAroundYouChips: View {
    let lists: [AroundYouListDTO]
    let active: String
    let onSelect: @MainActor (String) -> Void

    var body: some View {
        FeedChipRow(
            chips: lists.map { FeedChipItem(id: $0.id, label: $0.title) },
            activeId: active,
            onSelect: onSelect
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("aroundYouLists")
    }
}

/// The foot of the open list: it asks for the next page as it nears the screen, and says how the read stands
/// (reading, could not be read, nothing here, the end).
struct TodayAroundYouListFoot: View {
    let list: String
    let state: AroundYouListState
    let isEmpty: Bool
    /// More than one page was read: the end says so.
    let ranLong: Bool
    let onNear: @MainActor () -> Void
    let onRetry: @MainActor () -> Void

    /// How far below the screen's foot the list's foot is when the next page is asked for: about a screen.
    private static let lead: CGFloat = 700

    var body: some View {
        Group {
            switch state {
            case .idle, .more:
                Color.clear.frame(height: 1)
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.s3)
                    .accessibilityLabel("Loading")
            case .failed:
                failed
            case .ended:
                ended
            }
        }
        .frame(maxWidth: .infinity)
        // Where the foot is under the scroll view's top edge: near once it is within a screen of the visible part.
        // Read as it is laid out and as the list scrolls, so it asks whether the foot starts near or comes near.
        .onGeometryChange(for: Bool.self) { proxy in
            guard let visible = proxy.bounds(of: .scrollView) else { return false }
            return proxy.frame(in: .scrollView).minY < visible.height + Self.lead
        } action: { near in
            if near { onNear() }
        }
    }

    private var failed: some View {
        HStack(spacing: Spacing.s2) {
            Text("Couldn't load this list.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.appTextSecondary)
            Button("Try again", action: onRetry)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.primary600)
                .accessibilityIdentifier("aroundYouListRetry")
        }
        .padding(.horizontal, Spacing.s5)
        .padding(.vertical, Spacing.s2)
    }

    @ViewBuilder private var ended: some View {
        if isEmpty, list != AroundYouListDTO.all {
            Text(Self.emptyText(list))
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, Spacing.s5)
                .padding(.vertical, Spacing.s6)
                .accessibilityIdentifier("aroundYouListEmpty")
        } else if ranLong, !isEmpty {
            Text("That's everything so far.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.s2)
                .accessibilityIdentifier("aroundYouListEnd")
        } else {
            Color.clear.frame(height: 1)
        }
    }

    /// What an empty list says.
    static func emptyText(_ list: String) -> String {
        switch list {
        case AroundYouListDTO.talked: "No one has replied or reacted yet. Open a story and be the first."
        case AroundYouListDTO.events: "No events on the calendars in the next week."
        default: "Nothing here yet."
        }
    }
}
