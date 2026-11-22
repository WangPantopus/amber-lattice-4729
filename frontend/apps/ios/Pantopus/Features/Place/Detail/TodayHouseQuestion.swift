//
//  TodayHouseQuestion.swift
//  Pantopus
//
//  The house on Today's one question, already answered (JOURNEYS section 3,
//  board H4): for a person with a home whose calendar has no schedule of the
//  household's own but shows a garbage date from the address's general
//  schedule, "Bins go out Tuesday. Remind you Monday night?". "Yes, remind
//  me" saves that schedule for garbage and recycling as the household's own
//  (the request the editor's "Save schedule" sends) and turns the reminder
//  on, as the reminder question's "Remind me" does. "Change day" opens the
//  pickup editor. It goes for good once the household has a schedule.
//

import SwiftUI

/// What the address's general schedule says about garbage and recycling, for the question.
struct TodayHousePickup: Equatable {
    /// The garbage day: "Tuesday".
    let day: String
    /// The day before it: "Monday".
    let eve: String
    /// The general schedule is not confirmed for this address.
    let unverified: Bool
    /// The schedule as the household's own: garbage, and recycling where the general schedule has it.
    let collections: [PickupCollection]

    private static let codes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]
    private static let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    /// Nil when the household has a schedule, or the general schedule shows no garbage date.
    init?(_ calendar: PlaceAddressCalendarData) {
        guard calendar.needsPickupDay, let garbage = Self.pattern("garbage", in: calendar),
              let weekday = Self.weekday(garbage.anchorDate) else { return nil }
        day = Self.names[weekday]
        eve = Self.names[(weekday + 6) % 7]
        unverified = calendar.upcoming.contains { $0.kind == "garbage" && !$0.isHousehold && $0.confidence == "unverified" }
        collections = [garbage] + [Self.pattern("recycling", in: calendar)].compactMap(\.self)
    }

    /// A kind's dates on the general schedule as a weekly collection: every week when two of its dates are a
    /// week apart, every other week otherwise (two weeks show only one). A date moved for a holiday counts as
    /// the day it moved from.
    private static func pattern(_ kind: String, in calendar: PlaceAddressCalendarData) -> PickupCollection? {
        let days = calendar.upcoming
            .filter { $0.kind == kind && !$0.isHousehold }
            .map { String(($0.movedFrom ?? $0.date).prefix(10)) }
            .sorted()
        guard let first = days.first, let weekday = weekday(first) else { return nil }
        let weekly = days.dropFirst().first.map { TodayAgenda.offset($0, from: first) <= 7 } ?? false
        return PickupCollection(kind: kind, frequency: "weekly", interval: weekly ? 1 : 2, weekdays: [codes[weekday]], anchorDate: first)
    }

    /// 0 (Sunday) to 6, for a calendar day "2026-11-24".
    private static func weekday(_ day: String) -> Int? {
        guard let date = PlacePresentation.parseCalendarDay(day) else { return nil }
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = TimeZone(identifier: "UTC") ?? .current
        return gregorian.component(.weekday, from: date) - 1
    }
}

/// The card under the picture (`today.house.question`).
struct TodayHouseQuestion: View {
    let pickup: TodayHousePickup
    let isSaving: Bool
    let error: String?
    let onYes: () async -> Void
    let onChange: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Bins go out \(pickup.day). Remind you \(pickup.eve) night?")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(
                pickup.unverified
                    ? "From your city's schedule, not confirmed. Change it if yours differs."
                    : "From your city's schedule. Change it if yours differs."
            )
            .font(.system(size: 13.5))
            .foregroundStyle(Theme.Color.appTextSecondary)
            .fixedSize(horizontal: false, vertical: true)
            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.error)
                    .fixedSize(horizontal: false, vertical: true)
            }
            buttons.padding(.top, 6)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.primary50)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.Color.primary600.opacity(0.55), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.house.question")
    }

    /// Side by side; one under the other at the largest text sizes.
    @ViewBuilder
    private var buttons: some View {
        let yes = PrimaryButton(title: "Yes, remind me", isLoading: isSaving, isEnabled: !isSaving, action: onYes)
            .accessibilityIdentifier("today.house.question.yes")
        let change = GhostButton(title: "Change day", isEnabled: !isSaving) { onChange() }
            .accessibilityIdentifier("today.house.question.change")
        if typeSize.isAccessibilitySize {
            VStack(spacing: 8) {
                yes
                change
            }
        } else {
            HStack(spacing: 10) {
                yes
                change
            }
        }
    }
}
