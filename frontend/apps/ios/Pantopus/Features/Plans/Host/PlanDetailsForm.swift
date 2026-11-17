//
//  PlanDetailsForm.swift
//  Pantopus
//
//  Boards H2 (watch party), H3 (playdate), H4 (pickup game) and H5 (walk &
//  coffee), and the study group: the kind's own choices, the title, when,
//  where (with the place picker, H6), spots, how people get in, the note for
//  people who are in, and for a watch party the "about" everyone sees.
//

import SwiftUI

struct PlanDetailsForm: View {
    @Bindable var model: PlanComposerModel
    let step: String
    let onBack: () -> Void
    let onPreview: () -> Void
    /// Plans step 2: the Repeats screen, from the When card's Repeats row.
    var onRepeats: () -> Void = {}
    /// Plans for the holidays H2: the bring list (board 19), from "Add to this plan".
    var onBringList: () -> Void = {}

    @State private var showsPlacePicker = false

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(
                title: model.privacy.occasion?.text ?? model.businessKind?.name ?? model.kind.title,
                leading: .back,
                trailing: step,
                onLeading: onBack
            )
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s6) {
                    // A business's plan (board B2): its label, its own location, who gets in; no price, no repeats.
                    if model.isBusiness { PlanBusinessLabelField(model: model) }
                    PlanKindFields(model: model)
                    if model.kind != .pickupGame || model.isBusiness { titleField }
                    if model.kind == .walkCoffee { PlanWalkExtras(model: model) }
                    if !model.picksDate { when } // Find a date (board 26): the offered times take its place
                    if model.isBusiness { PlanBusinessWhereField(model: model) } else { whereSection }
                    if model.offersPrivate { PlanAudienceField(model: model) }
                    spotsRow
                    if model.offersPrice { PlanBusinessPriceField(model: model) } // B2: "Price a spot"
                    if model.offersPayHere { PlanBusinessPayHereField(model: model) } // B5: paying the bill here
                    // Plans for the holidays (board 3): the extras, each behind its own switch, under "Room for".
                    if model.offersAddToPlan { PlanAddToPlanCard(model: model, onBringList: onBringList) }
                    // A private plan's people get in right away: "Guests can bring a friend" instead (board Details).
                    if model.isBusiness { PlanWhoGetsInField(model: model) } else if model.isPrivate {
                        PlanGuestsCanInviteRow(model: model)
                    } else { approvalSection }
                    if model.kind == .pickupGame { gearSwitch }
                    noteField
                    if model.kind == .watchParty || model.isBusiness { aboutField }
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
                .padding(.bottom, Spacing.s6)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
        .background(Theme.Color.appBg)
        .sheet(isPresented: $showsPlacePicker) {
            PlanPlacePicker(model: model, offersHereNow: model.kind == .pickupGame) { showsPlacePicker = false }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planDetailsForm")
    }

    // MARK: - Fields

    private var titleField: some View {
        PlanFormField(label: "Title") {
            PlanTextInput(placeholder: titlePlaceholder, text: $model.title, identifier: "planTitle", label: "Title")
        }
    }

    /// The watch-party hint names no team: a picked game fills in the title itself (as on Android).
    private var titlePlaceholder: String {
        switch model.kind {
        case .watchParty: "Give it a short title"
        case .playdate: "Playground morning"
        case .pickupGame: ""
        case .walkCoffee: "Coffee walk around the lake"
        case .studyGroup: "Spanish practice at the library"
        case .foodDrinks, .gameNight, .outdoors, .somethingElse: PlanKindsMore.titlePlaceholder(model.kind)
        }
    }

    private var when: some View {
        PlanFormField(label: "When") {
            if model.kind == .pickupGame, !model.isBusiness {
                PlanSegmented(
                    options: [(true, "Now"), (false, "Later")],
                    selection: $model.startsNow,
                    label: "When"
                )
            }
            PlanFormCard {
                if !(model.kind == .pickupGame && model.startsNow) || model.isBusiness {
                    PlanDateRow(
                        label: "Starts",
                        date: $model.start,
                        components: [.date, .hourAndMinute],
                        // A business plans up to 60 days ahead (its limits), a private plan 60; a person's public plan 14.
                        range: Date()...Date().addingTimeInterval(TimeInterval(model.daysAhead) * 86400)
                    )
                    Divider().overlay(Theme.Color.appBorder)
                }
                PlanDateRow(
                    label: model.kind == .pickupGame && model.startsNow ? "Until" : "Ends",
                    date: $model.end,
                    components: [.hourAndMinute],
                    range: model.effectiveStart.addingTimeInterval(15 * 60)...model.effectiveStart.addingTimeInterval(8 * 3600)
                )
                // Board Details (Plans step 2): a person's plan, with `plans_repeat` on.
                if model.offersRepeat {
                    Divider().overlay(Theme.Color.appBorder)
                    PlanRepeatsRow(value: model.repeating.rowValue, action: onRepeats)
                }
            }
            if model.kind == .playdate {
                PlanScopeLine(
                    text: "Others see \u{201C}\(PlanFormat.dayPartPhrase(dayPart, day: model.start))\u{201D} until you accept them."
                )
            }
        }
        .onChange(of: model.start) { old, new in
            model.end = model.end.addingTimeInterval(new.timeIntervalSince(old))
            // A repeating plan's own day moves with its start (Plans step 2).
            model.repeating.follow(start: model.effectiveStart)
        }
        .onAppear { model.repeating.follow(start: model.effectiveStart) }
    }

    private var dayPart: PlanDayPart {
        let hour = Calendar.current.component(.hour, from: model.start)
        switch hour {
        case 5..<12: return .morning
        case 12..<17: return .afternoon
        case 17..<21: return .evening
        default: return .night
        }
    }

    private var whereSection: some View {
        PlanFormField(label: "Where") {
            PlanWhereChoices(model: model)
            if model.whereKind == .online {
                PlanOnlineLinkField(model: model)
            } else if model.whereKind == .home {
                PlanFormCard {
                    HStack(spacing: Spacing.s3) {
                        smallTile(.home, tint: Theme.Color.appSurfaceSunken, ink: Theme.Color.appTextStrong)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(model.kind == .walkCoffee ? "My porch" : "My place").planFont(.bodyStrong)
                                .foregroundStyle(Theme.Color.appText)
                            Text(model.home.map { home in
                                "Your home\(home.city.map { " in \($0)" } ?? "")"
                            } ?? "Add your home to host there")
                                .planFont(.small)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                        }
                        Spacer()
                    }
                    .padding(.vertical, 10)
                }
                PlanScopeLine(text: PlanPrivateCopy.homeLine(isPrivate: model.isPrivate))
            } else {
                Button { showsPlacePicker = true } label: {
                    PlanFormCard {
                        HStack(spacing: Spacing.s3) {
                            smallTile(placeIsHereNow ? .navigation : .mapPin, tint: model.kind.tint, ink: model.kind.color)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(model.place?.name ?? "Choose a place").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                                Text(placeSubtitle).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
                        }
                        .padding(.vertical, 10)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("planChoosePlace")
                // Those lines are about people nearby and the area; a private plan's people see the place itself.
                if let placeScope, !model.isPrivate { PlanScopeLine(text: placeScope) }
            }
        }
    }

    /// "Playground · public place · 0.4 mi" (board H3, as on Android); "You're here now" under a place
    /// H6's "You're here now" found (board H4).
    private var placeSubtitle: String {
        guard let place = model.place else { return "Parks, courts, trails, libraries, cafés" }
        if placeIsHereNow { return "You're here now" }
        let first = place.category?.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) }
        let kind = first.flatMap { $0.isEmpty ? nil : $0.prefix(1).uppercased() + $0.dropFirst() }
        return [kind, "public place", place.distanceMeters.map(PlanFormat.placeDistance)].compactMap { $0 }.joined(separator: " · ")
    }

    /// Board H4: the place H6's "You're here now" found (a pickup game's; another type shows the usual line).
    private var placeIsHereNow: Bool {
        model.kind == .pickupGame && model.placeIsHereNow
    }

    /// Boards H2 and H5 draw no line under a public place (as on Android).
    private var placeScope: String? {
        switch model.kind {
        case .playdate: "Families you accept see the exact spot. Others see the general area."
        case .pickupGame: "Your location only proves you're nearby. The pin shows the place's area."
        default: nil
        }
    }

    private var spotsRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 0) {
                Text(spotsTitle).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                Text(spotsSubtitle)
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            // Board 3: holding the plus steps by 5 where a private plan has room for up to 100.
            PlanStepper(value: $model.spots, range: 1...model.spotsLimit, label: spotsTitle, holdStep: model.offersGuestAnswers ? 5 : nil)
                .accessibilityIdentifier(model.offersGuestAnswers ? "planRoomFor" : "planSpotsStepper")
        }
        .onChange(of: model.spotsLimit) { _, limit in
            if model.spots > limit { model.spots = limit }
        }
    }

    private var spotsTitle: String {
        if model.isBusiness { return "Spots" }
        if model.offersGuestAnswers { return "Room for" }
        return switch model.kind {
        case .watchParty, .studyGroup, .foodDrinks, .gameNight, .outdoors, .somethingElse: "Spots"
        case .playdate: "Families"
        case .pickupGame: "Players needed"
        case .walkCoffee: "People"
        }
    }

    private var spotsSubtitle: String {
        if model.isBusiness { return "Guests see how many are left" }
        if model.offersGuestAnswers { return "Adults and kids, besides your household" }
        return switch model.kind {
        case .watchParty, .studyGroup, .foodDrinks, .gameNight, .outdoors, .somethingElse: "People who can join, besides you"
        case .playdate: "Besides yours"
        case .pickupGame: "Shown as \u{201C}need \(model.spots)\u{201D}"
        case .walkCoffee: "Besides you"
        }
    }

    private var approvalSection: some View {
        PlanFormField(label: model.kind == .playdate ? "How families get in" : "How people get in") {
            PlanApprovalOptions(model: model)
        }
    }

    private var gearSwitch: some View {
        PlanSwitchRow(
            title: "I have extra \(PlanComposerOptions.gearNoun(model.sport))",
            subtitle: "Shown on the plan",
            isOn: $model.extraGear
        )
    }

    private var noteField: some View {
        PlanFormField(label: model.kind == .playdate ? "Note for families who are in" : "Note for people who are in", locked: true) {
            PlanTextInput(
                placeholder: notePlaceholder,
                text: $model.guestNote,
                multiline: true,
                limit: 500,
                identifier: "planGuestNote",
                label: "Note for people who are in"
            )
        }
    }

    private var notePlaceholder: String {
        if model.isOnline || model.kind.isNewer { return PlanKindsMore.notePlaceholder(model.kind, online: model.isOnline) }
        return switch model.kind {
        case .watchParty:
            model.whereKind == .home ? "Park on the street. The side gate is open." : "We'll be at the big table by the window."
        case .playdate: "Meet by the big slide. We'll bring bubbles."
        case .pickupGame: "Court 3, by the fence."
        case .walkCoffee: "Meet at the trailhead sign. Coffee after."
        case .studyGroup: "Second floor, the long table by the windows."
        case .foodDrinks, .gameNight, .outdoors, .somethingElse: ""
        }
    }

    private var aboutField: some View {
        PlanFormField(label: "About · everyone sees this") {
            PlanTextInput(
                placeholder: model.isBusiness ? "What happens, who it's for, what to bring" : "Big screen in the backyard. Kids welcome.",
                text: $model.about,
                multiline: true,
                limit: 500,
                identifier: "planAbout",
                label: "About, everyone sees this"
            )
        }
    }

    private func smallTile(_ icon: PantopusIcon, tint: Color, ink: Color) -> some View {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(tint)
            .frame(width: 36, height: 36)
            .overlay(Icon(icon, size: 18, color: ink))
            .accessibilityHidden(true)
    }

    private var footer: some View {
        VStack(spacing: Spacing.s2) {
            if let problem = model.problem {
                Text(problem).planFont(.caption).foregroundStyle(Theme.Color.appTextSecondary)
            }
            Button("Preview", action: onPreview)
                .planButton(.primary)
                .disabled(model.problem != nil)
                .accessibilityIdentifier("planPreviewButton")
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .background(Theme.Color.appSurface)
        .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
    }
}

// MARK: - Kind fields

/// The kind's own choices at the top of the form.
struct PlanKindFields: View {
    @Bindable var model: PlanComposerModel

    var body: some View {
        switch model.kind {
        case .watchParty:
            PlanWatchGameFields(model: model)
        case .playdate:
            PlanNote(
                icon: .shieldCheck,
                text: "Playdates happen in public places, parents stay, and only ages are shared. "
                    + "You approve each family."
            )
            PlanFormField(label: "Kids' ages") {
                PlanChoiceChips(
                    options: PlanKidsAgeBand.allCases.map { PlanChoiceOption(id: $0, label: PlanComposerOptions.ageLabel($0)) },
                    isSelected: { model.kidsAges.contains($0) },
                    onTap: { band in
                        if model.kidsAges.contains(band) { model.kidsAges.remove(band) } else { model.kidsAges.insert(band) }
                    },
                    groupLabel: "Kids' ages",
                    identifier: "planKidsAges"
                )
            }
        case .pickupGame:
            PlanFormField(label: "Sport") {
                PlanChoiceChips(
                    options: PlanComposerOptions.sports.map { PlanChoiceOption(id: $0.value, label: $0.label) },
                    isSelected: { $0 == model.sport },
                    onTap: { model.sport = $0 },
                    groupLabel: "Sport",
                    identifier: "planSport"
                )
            }
            PlanFormField(label: "Level") {
                PlanSegmented(options: PlanComposerOptions.levels.map { ($0.value, $0.label) }, selection: $model.level, label: "Level")
            }
        case .walkCoffee:
            PlanFormField(label: "Kind") {
                PlanChoiceChips(
                    options: PlanComposerOptions.walkKinds.map { PlanChoiceOption(id: $0.value, label: $0.label) },
                    isSelected: { $0 == model.walkKind },
                    onTap: { model.walkKind = $0 },
                    groupLabel: "Kind",
                    identifier: "planWalkKind"
                )
            }
        case .studyGroup:
            PlanFormField(label: "Subject") {
                PlanTextInput(placeholder: "Spanish", text: $model.subject, limit: 60, identifier: "planSubject", label: "Subject")
            }
            PlanFormField(label: "How you'll study") {
                PlanSegmented(
                    options: PlanComposerOptions.studyStyles.map { ($0.value, $0.label) },
                    selection: $model.studyStyle,
                    label: "How you'll study"
                )
            }
        case .foodDrinks, .gameNight, .outdoors, .somethingElse:
            PlanMoreKindFields(model: model)
        }
    }
}

/// H5's pace and "Dogs welcome".
struct PlanWalkExtras: View {
    @Bindable var model: PlanComposerModel

    var body: some View {
        PlanFormField(label: "Pace") {
            PlanSegmented(options: PlanComposerOptions.paces.map { ($0.value, $0.label) }, selection: $model.pace, label: "Pace")
        }
        PlanSwitchRow(title: "Dogs welcome", subtitle: "Shown on the plan", isOn: $model.dogsWelcome)
    }
}

/// "How people get in": the options for this kind and place, plus "Also let
/// in people I've hosted" where it applies.
struct PlanApprovalOptions: View {
    @Bindable var model: PlanComposerModel

    var body: some View {
        PlanFormCard {
            if model.kind == .playdate {
                optionRow(title: "You approve each family", subtitle: "Always on for playdates", selected: true, locked: true) {}
            } else {
                ForEach(Array(model.approvalOptions.enumerated()), id: \.element) { index, option in
                    if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                    optionRow(
                        title: title(option),
                        subtitle: subtitle(option),
                        selected: model.approval == option,
                        locked: false
                    ) { model.approval = option }
                }
                if model.kind != .pickupGame {
                    Divider().overlay(Theme.Color.appBorder)
                    Button { model.alsoHostedBefore.toggle() } label: {
                        HStack(spacing: Spacing.s3) {
                            PlanCheckbox(isOn: model.alsoHostedBefore)
                            VStack(alignment: .leading, spacing: 0) {
                                Text("Also let in people I've hosted").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                                Text("They get in right away, until the spots fill").planFont(.small)
                                    .foregroundStyle(Theme.Color.appTextSecondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(model.alsoHostedBefore ? [.isButton, .isSelected] : .isButton)
                    .accessibilityIdentifier("planAlsoHosted")
                }
            }
        }
    }

    private func title(_ option: PlanApproval) -> String {
        switch option {
        case .approveEach: "I approve each person"
        case .verifiedAuto: "People with a verified address get in right away"
        case .anyoneNearby: "Anyone nearby gets in right away"
        }
    }

    private func subtitle(_ option: PlanApproval) -> String? {
        switch option {
        case .approveEach: model.whereKind == .home ? "Always on for plans at your place" : nil
        case .verifiedAuto: "Others ask, and you approve"
        case .anyoneNearby: "Until the spots fill"
        }
    }

    private func optionRow(title: String, subtitle: String?, selected: Bool, locked: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Spacing.s3) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    if let subtitle { Text(subtitle).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if locked {
                    Icon(.lock, size: 18, color: Theme.Color.appTextSecondary)
                } else if selected {
                    Icon(.check, size: 22, strokeWidth: 2.6, color: Theme.Color.primary600)
                }
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(locked)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}
