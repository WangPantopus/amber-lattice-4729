//
//  TodayNeedsYou.swift
//  Pantopus
//
//  "Needs you" on the Today tab
//  (`docs/product/ai-assistant-phase3-contract-2026-10-22.md` §6.4, placed by
//  the phase 3 brief under the sky and its hourly strip, above "Coming up at
//  home"): what waits on the person, from `GET /api/ai/needs-you`. Three rows,
//  "Show all (N)" expands in place, and it is hidden when nothing waits. It
//  shows the last list at once and refreshes when Today appears, comes back
//  and on pull to refresh; a failed refresh keeps the last list, and with no
//  list yet it shows nothing. Each row opens its link through the deep-link
//  router (a task opens over Today, as the agenda's do). Parity twin of
//  Android's Today Needs you card.
//
//  With the house on Today (JOURNEYS section 3) the card sits directly under
//  the picture and says the same things in words: a first row while mail
//  waits ("You have mail"), its items as before, a last row on a pickup
//  evening ("Pickup is tomorrow"), and for a person with a home one line
//  instead of hiding: "Nothing needs you today."
//

import Observation
import SwiftUI

/// The Today tab's one Needs you list, shared by its loaded, no-place and
/// couldn't-load views.
@Observable
@MainActor
final class TodayNeedsYouModel {
    /// The server's items, most urgent first (at most 20).
    private(set) var items: [AINeedsYouItemDTO] = []
    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    /// The saved list at once, then the server's.
    func load() async {
        let store = ScreenStore.store(for: api)
        let endpoint = AIEndpoints.needsYou()
        if items.isEmpty, let saved = store.peek(endpoint, as: AINeedsYouResponse.self) {
            items = saved.value.items
        }
        do {
            let fresh = try await store.load(endpoint, as: AINeedsYouResponse.self, kind: .notifications, force: true)
            items = fresh.value.items
        } catch APIError.notFound {
            // A server without the route: nothing to show.
            items = []
        } catch {
            // Offline, a server error or a sign-in change: the last list stays (or nothing).
        }
    }

    /// The rows the card shows: a household task already on "Coming up at home" is left out.
    func shown(hidingTaskIds taskIds: Set<String>) -> [AINeedsYouItemDTO] {
        guard !taskIds.isEmpty else { return items }
        return items.filter { item in
            guard item.type == "task_overdue" || item.type == "task_assigned", let id = item.subject?.id else { return true }
            return !taskIds.contains(id.lowercased())
        }
    }
}

/// The house on Today: what the card says besides the server's items.
struct TodayNeedsYouHouse {
    /// Unopened mail (the count on the Mail tab's badge); over 0 shows the first row.
    var unopenedMail = 0
    var onMail: () -> Void = {}
    /// On a pickup evening, tomorrow's kinds ("Garbage and recycling"): the last row.
    var pickupKinds: String?
    /// The pickup schedule, as the bins open it.
    var onPickup: () -> Void = {}
    /// A person with a home: "Nothing needs you today." instead of hiding.
    var hasHome = false
}

struct TodayNeedsYouCard: View {
    let model: TodayNeedsYouModel
    /// Tasks "Coming up at home" already shows on this screen.
    var hiddenTaskIds: Set<String> = []
    /// Opens a task over Today, so Back comes back here.
    var onOpenTask: ((_ homeId: String, _ taskId: String) -> Void)?
    /// The house on Today's rows and quiet line; nil is the card as it was.
    var house: TodayNeedsYouHouse?
    @State private var showsAll = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let firstRows = 3

    /// A row of the card: the mail row, one of the server's items, or the pickup row.
    private enum Entry: Identifiable {
        case mail(Int)
        case item(AINeedsYouItemDTO)
        case pickup(String)

        var id: String {
            switch self {
            case .mail: "house.mail"
            case let .item(item): item.id
            case .pickup: "house.pickup"
            }
        }
    }

    private var entries: [Entry] {
        var rows = model.shown(hidingTaskIds: hiddenTaskIds).map(Entry.item)
        if let house, house.unopenedMail > 0 { rows.insert(.mail(house.unopenedMail), at: 0) }
        if let kinds = house?.pickupKinds { rows.append(.pickup(kinds)) }
        return rows
    }

    var body: some View {
        let rows = entries
        if rows.isEmpty, house?.hasHome == true {
            quietLine
        } else if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                PlaceSectionHeading(title: "Needs you")
                PlaceGroupSurface {
                    let visible = showsAll ? rows : Array(rows.prefix(Self.firstRows))
                    ForEach(Array(visible.enumerated()), id: \.element.id) { index, entry in
                        if index > 0 { PlaceRowDivider() }
                        row(entry)
                    }
                    if rows.count > Self.firstRows {
                        PlaceRowDivider()
                        PlaceInlineAction(
                            title: showsAll ? "Show fewer" : "Show all (\(rows.count))",
                            identifier: "needsYou.showAll"
                        ) {
                            withAnimation(reduceMotion ? nil : .snappy(duration: 0.25)) { showsAll.toggle() }
                        }
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("needsYou.card")
        }
    }

    /// A quiet day, for a person with a home (board H5).
    private var quietLine: some View {
        PlaceGroupSurface {
            HStack(spacing: 10) {
                Icon(.check, size: 17, strokeWidth: 2.4, color: Theme.Color.success)
                    .accessibilityHidden(true)
                Text("Nothing needs you today.")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
        .padding(.top, 12)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("today.house.quiet")
    }

    @ViewBuilder
    private func row(_ entry: Entry) -> some View {
        switch entry {
        case let .mail(count):
            row(
                look: Look(icon: .mail, tint: Theme.Color.error, background: Theme.Color.errorBg),
                title: "You have mail",
                subtitle: "\(count) unopened",
                identifier: "today.house.mailRow"
            ) { house?.onMail() }
        case let .item(item):
            row(look: Self.look(item.type), title: item.title, subtitle: item.subtitle, identifier: "needsYou.row.\(item.type)") {
                Self.open(item, onOpenTask: onOpenTask)
            }
        case let .pickup(kinds):
            row(
                look: Look(icon: .trash, tint: Theme.Color.home, background: Theme.Color.homeBg),
                title: "Pickup is tomorrow",
                subtitle: kinds,
                identifier: "today.house.pickupRow"
            ) { house?.onPickup() }
        }
    }

    private func row(look: Look, title: String, subtitle: String?, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 12) {
                RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                    .fill(look.background)
                    .frame(width: 36, height: 36)
                    .overlay(Icon(look.icon, size: 17, strokeWidth: 2.2, color: look.tint))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Icon(.chevronRight, size: 16, strokeWidth: 2.25, color: Theme.Color.appTextMuted)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 12)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier(identifier)
    }

    /// A task opens over Today; everything else through the deep-link router. (The note on the house's door opens
    /// the first item the same way.)
    static func open(_ item: AINeedsYouItemDTO, onOpenTask: ((_ homeId: String, _ taskId: String) -> Void)?) {
        if let onOpenTask, let subject = item.subject, subject.type == "task",
           let homeId = subject.homeId, let taskId = subject.id {
            onOpenTask(homeId, taskId)
            return
        }
        guard let link = item.link, !link.isEmpty else { return }
        DeepLinkRouter.shared.handle(path: link)
    }

    private struct Look {
        let icon: PantopusIcon
        let tint: Color
        let background: Color
    }

    private static func look(_ type: String) -> Look {
        switch type {
        case "still_coming": Look(icon: .calendarCheck, tint: Theme.Color.primaryInk, background: Theme.Color.primary50)
        case "plan_requests": Look(icon: .users, tint: Theme.Color.primaryInk, background: Theme.Color.primary50)
        case "task_overdue": Look(icon: .clockAlert, tint: Theme.Color.warning, background: Theme.Color.warningBg)
        case "task_assigned": Look(icon: .listChecks, tint: Theme.Color.home, background: Theme.Color.homeBg)
        case "home_invite", "household_request": Look(icon: .home, tint: Theme.Color.home, background: Theme.Color.homeBg)
        case "connection_request": Look(icon: .userPlus, tint: Theme.Color.primaryInk, background: Theme.Color.primary50)
        case "question_answered": Look(icon: .messageSquare, tint: Theme.Color.primaryInk, background: Theme.Color.primary50)
        default: Look(icon: .sparkles, tint: Theme.Color.magic, background: Theme.Color.magicBg)
        }
    }
}
