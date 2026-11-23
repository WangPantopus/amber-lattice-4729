//
//  PickupSaved.swift
//  Pantopus
//
//  What "Save schedule" says once it went through (JOURNEYS 1, board J1b):
//  a green box above the calendar's dates with the schedule in a sentence,
//  who can see it and, off the Today tab, "See it in Today". The next
//  pickup's entry is lit for about three seconds. The words and the ids are
//  the same on Android and the web.
//

import SwiftUI

/// The sentence for a schedule just saved.
struct PickupSavedNote: Equatable {
    let title: String

    /// The four collections the editor sets, in the order the sentence prefers.
    static let kinds: [(kind: String, name: String)] = [
        ("garbage", "Garbage pickup"),
        ("recycling", "Recycling pickup"),
        ("yard_waste", "Yard waste pickup"),
        ("bulk_pickup", "Bulk collection")
    ]

    private static let weekdays: [(id: String, name: String)] = [
        ("MO", "Monday"), ("TU", "Tuesday"), ("WE", "Wednesday"), ("TH", "Thursday"),
        ("FR", "Friday"), ("SA", "Saturday"), ("SU", "Sunday")
    ]

    /// Nil when nothing was saved (a cleared schedule shows no box).
    init?(collections: [PickupCollection]) {
        guard let first = Self.kinds.lazy.compactMap({ entry in
            collections.first { $0.kind == entry.kind }.map { (entry.name, $0) }
        }).first else { return nil }
        title = "\(first.0) is \(Self.pattern(first.1))"
    }

    /// "Tuesday", "Tuesday and Friday", "every other Tuesday"; anything else, "saved".
    private static func pattern(_ row: PickupCollection) -> String {
        let days = weekdays.filter { row.weekdays.contains($0.id) }.map(\.name)
        guard row.frequency == "weekly", let last = days.last else { return "saved" }
        if row.interval == 1 {
            return days.count == 1 ? last : "\(days.dropLast().joined(separator: ", ")) and \(last)"
        }
        return row.interval == 2 && days.count == 1 ? "every other \(last)" : "saved"
    }

    /// The next of the household's collections on the calendar: the entry that is lit.
    static func nextPickup(in events: [PlaceCalendarEvent]) -> PlaceCalendarEvent? {
        events.filter { isCollection($0.kind) }.min { $0.date < $1.date }
    }

    static func isCollection(_ kind: String) -> Bool {
        kinds.contains { $0.kind == kind }
    }

    /// What the page scrolls to for an event's row, in the week's list (its row's own id) and on the calendar.
    static func rowAnchor(_ event: String) -> String {
        "calendar:\(event)"
    }
}

/// The green box (`pickup.saved`).
struct PickupSavedBox: View {
    let note: PickupSavedNote
    /// "See it in Today"; nil on the Today tab itself.
    var onSeeToday: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Icon(.circleCheck, size: 22, strokeWidth: 2.25, color: Theme.Color.success)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(note.title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Theme.Color.success)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Text("People in this home can see it.")
                        .font(.system(size: 13.5))
                        .foregroundStyle(Theme.Color.success)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let onSeeToday {
                PrimaryButton(title: "See it in Today") { onSeeToday() }
                    .accessibilityIdentifier("pickup.saved.seeToday")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.successBg)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.Color.success.opacity(0.3), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("pickup.saved")
        // A screen reader reads the sentence when the box appears.
        .onAppear { AccessibilityNotification.Announcement(note.title).post() }
    }
}

/// A pickup entry lit after a save: a green wash behind its row that fades by itself.
struct PickupLitBackground: ViewModifier {
    let lit: Bool
    /// How far the wash reaches past the row on each side.
    var reach: CGFloat = 8
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .background {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Theme.Color.successBg)
                    .padding(.horizontal, -reach)
                    .opacity(lit ? 1 : 0)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.4), value: lit)
            }
    }
}

extension View {
    func pickupLit(_ lit: Bool, reach: CGFloat = 8) -> some View {
        modifier(PickupLitBackground(lit: lit, reach: reach))
    }
}
