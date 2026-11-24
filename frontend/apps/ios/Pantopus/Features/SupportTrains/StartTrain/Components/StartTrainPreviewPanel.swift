//
//  StartTrainPreviewPanel.swift
//  Pantopus
//
//  Beside the Start-a-train wizard's form on a wide iPad (`StartTrainWideStep`): the train's page as helpers will
//  open it, filled in live as the organizer picks the person, writes the note, chooses who can open it, sets the
//  dates and adds what helpers should know. It is drawn with the train page's own pieces (the recipient card, the
//  train card, Good to know and the slot calendar, under the page's own headings), so nothing in it is new; it only
//  shows, while the train is still being made, what the page will say.
//

import SwiftUI

@MainActor
struct StartTrainPreviewPanel: View {
    let viewModel: StartSupportTrainWizardViewModel

    var body: some View {
        let slots = viewModel.generatedSlots
        let goodToKnow = helperLines(firstSlot: slots.first)
        VStack(spacing: Spacing.s0) {
            header
            VStack(alignment: .leading, spacing: Spacing.s0) {
                audienceRow
                overline("For")
                RecipientCard(content: recipient)
                overline("The train")
                TypeDatesCard(content: typeDates(slots))
                if !goodToKnow.isEmpty {
                    overline("Good to know")
                    HelperDetailsCard(lines: goodToKnow, identifier: "startSupportTrainPreviewHelperDetails")
                }
                if !slots.isEmpty {
                    overline("Slot calendar")
                    calendarCard(days: Self.calendarDays(slots))
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.bottom, Spacing.s5)
        }
        .background(Theme.Color.appBg)
        .clipShape(RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous)
                .stroke(Theme.Color.appBorder, lineWidth: 1)
        )
        .pantopusShadow(.lg)
        // A picture of the page: its calendar days and cards don't take taps here.
        .allowsHitTesting(false)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("startSupportTrainPreview")
    }

    // MARK: - Pieces

    /// The train page's title, as its top bar shows it.
    private var header: some View {
        Text("Support train")
            .pantopusTextStyle(.small)
            .fontWeight(.semibold)
            .foregroundStyle(Theme.Color.appText)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(Theme.Color.appSurface)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
            }
    }

    /// Who can open the train, in the wizard's own words for the choice.
    private var audienceRow: some View {
        let visibility = viewModel.visibility
        return HStack(alignment: .top, spacing: Spacing.s2) {
            Icon(visibility.icon, size: 14, color: Theme.Color.appTextSecondary)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(visibility.title)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(Theme.Color.appTextStrong)
                Text(visibility.subtitle)
                    .pantopusTextStyle(.caption)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Spacing.s3)
        .background(Theme.Color.appSurfaceSunken)
        .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
        .padding(.top, Spacing.s3)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("startSupportTrainPreviewAudience")
    }

    /// The train page's section heading.
    private func overline(_ label: String) -> some View {
        Text(label)
            .font(.system(size: 10.5, weight: .bold))
            .textCase(.uppercase)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .accessibilityAddTraits(.isHeader)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, Spacing.s4)
            .padding(.bottom, Spacing.s2)
    }

    private func calendarCard(days: [SlotCalendarDay]) -> some View {
        VStack {
            SlotCalendar(days: days) { _ in }
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .center)
        .background(Theme.Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                .stroke(Theme.Color.appBorder, lineWidth: 1)
        )
        .pantopusShadow(.sm)
    }

    // MARK: - The page's content, from the wizard

    /// The page names the train by its title, with its first letters in the avatar, and quotes the note.
    private var recipient: RecipientCardContent {
        let name = viewModel.derivedTitle
        return RecipientCardContent(
            initials: Self.initials(from: name),
            householdName: name,
            identityTag: .home,
            verified: false,
            address: viewModel.whereModel.place ?? "",
            proximity: nil,
            quote: viewModel.reason.trimmingCharacters(in: .whitespacesAndNewlines),
            quoteAttribution: nil
        )
    }

    private func typeDates(_ slots: [StartSupportTrainSlot]) -> TypeDatesCardContent {
        TypeDatesCardContent(
            kind: Self.kind(viewModel.kind),
            title: viewModel.derivedTitle,
            dateRange: slots.first.map { first in "\(first.dayLabel) → \(slots.last?.dayLabel ?? first.dayLabel)" } ?? "",
            daysLeft: Self.daysLeft(until: slots.last),
            slotsFilled: 0,
            slotsTotal: slots.count,
            contributors: [],
            extraCount: 0,
            status: nil
        )
    }

    /// What helpers should know, as the train page lists it.
    private func helperLines(firstSlot: StartSupportTrainSlot?) -> [SupportTrainDetailContent.HelperDetailLine] {
        typealias Line = SupportTrainDetailContent.HelperDetailLine
        var lines: [Line] = []
        let allergies = (StartSupportTrainWizardViewModel.list(viewModel.allergies) ?? [])
            .map(SupportTrainDetailViewModel.dietaryLabel)
        if !allergies.isEmpty { lines.append(Line(label: "Allergies", value: allergies.joined(separator: ", "))) }
        let diet = (StartSupportTrainWizardViewModel.list(viewModel.diet) ?? [])
            .map(SupportTrainDetailViewModel.dietaryLabel)
        if !diet.isEmpty { lines.append(Line(label: "Diet", value: diet.joined(separator: ", "))) }
        let size = viewModel.householdSize
        if size > 0 {
            lines.append(Line(label: "Household", value: size == 1 ? "1 person" : "\(size) people"))
        }
        if let firstSlot {
            let start = Self.shortTime(firstSlot.startTime)
            let window = firstSlot.endTime.isEmpty ? "From \(start)" : "\(start) – \(Self.shortTime(firstSlot.endTime))"
            lines.append(Line(label: "Drop-off", value: window))
        }
        if viewModel.contactless { lines.append(Line(label: "Contactless", value: "Leave it at the door")) }
        let instructions = viewModel.instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        if !instructions.isEmpty { lines.append(Line(label: "Instructions", value: instructions)) }
        return lines
    }

    /// The page's 4-week calendar from the first date's week, every date still open.
    static func calendarDays(_ slots: [StartSupportTrainSlot], today: Date = Date()) -> [SlotCalendarDay] {
        let cal = Calendar.current
        let parser = DateFormatter()
        parser.calendar = cal
        parser.timeZone = cal.timeZone
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        let dates = Set(slots.compactMap { parser.date(from: $0.dateKey).map(cal.startOfDay) })
        let todayStart = cal.startOfDay(for: today)
        let earliest = dates.min() ?? todayStart
        let weekday = cal.component(.weekday, from: earliest) // 1 = Sunday
        let start = cal.date(byAdding: .day, value: -(weekday - 1), to: earliest) ?? earliest
        return (0..<28).map { index in
            let date = cal.date(byAdding: .day, value: index, to: start) ?? start
            let state: SlotCalendarState = if date < todayStart {
                .past
            } else if cal.isDate(date, inSameDayAs: todayStart) {
                .today
            } else if dates.contains(date) {
                .open
            } else {
                .unscheduled
            }
            return SlotCalendarDay(
                id: "preview-day-\(index)",
                date: date,
                dayNumber: cal.component(.day, from: date),
                state: state
            )
        }
    }

    /// Days from today to the last date.
    private static func daysLeft(until slot: StartSupportTrainSlot?, today: Date = Date()) -> Int {
        guard let slot else { return 0 }
        let cal = Calendar.current
        let parser = DateFormatter()
        parser.calendar = cal
        parser.timeZone = cal.timeZone
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let last = parser.date(from: slot.dateKey) else { return 0 }
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: today), to: cal.startOfDay(for: last)).day ?? 0
        return max(0, days)
    }

    private static func kind(_ kind: SupportTrainKind) -> SupportTrainDetailKind {
        switch kind {
        case .meals: .meals
        case .rides: .rides
        case .childcare: .childcare
        case .errands: .errands
        case .dogWalks: .petcare
        case .other: .visits
        }
    }

    /// "17:00" → "5:00 pm", as the train page writes times.
    private static func shortTime(_ hhmm: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        for inputFormat in ["HH:mm:ss", "HH:mm"] {
            formatter.dateFormat = inputFormat
            if let date = formatter.date(from: hhmm) {
                formatter.dateFormat = "h:mm a"
                return formatter.string(from: date).lowercased()
            }
        }
        return hhmm
    }

    /// The first letters of the title's first two words, as the train page's avatar shows them.
    private static func initials(from name: String) -> String {
        let words = name.split(separator: " ").prefix(2)
        let letters = words.compactMap { $0.first.map(String.init) }.joined().uppercased()
        return letters.isEmpty ? "ST" : letters
    }
}
