//
//  PlanMoreFields.swift
//  Pantopus
//
//  Plans steps 3 and 4 on the details step (board Details): the newer
//  kinds' choices at the top of the form, Where's three choices ("Online"
//  with the video glyph), and an online plan's link field with the line
//  that says who sees it.
//

import SwiftUI

/// Food & drinks, game night and outdoors: their kind (outdoors also its pace). "Something else" has no
/// choices: its title says what it is.
struct PlanMoreKindFields: View {
    @Bindable var model: PlanComposerModel

    var body: some View {
        @Bindable var more = model.more
        switch model.kind {
        case .foodDrinks:
            chips(PlanKindsMore.foodKinds, selection: $more.foodKind, identifier: "planFoodKind")
        case .gameNight:
            chips(PlanKindsMore.gameKinds, selection: $more.gameKind, identifier: "planGameKind")
        case .outdoors:
            chips(PlanKindsMore.outdoorKinds, selection: $more.outdoorKind, identifier: "planOutdoorKind")
            PlanFormField(label: "Pace") {
                PlanSegmented(options: PlanComposerOptions.paces.map { ($0.value, $0.label) }, selection: $model.pace, label: "Pace")
            }
        default:
            EmptyView()
        }
    }

    private func chips(_ options: [(value: String, label: String)], selection: Binding<String>, identifier: String) -> some View {
        PlanFormField(label: "Kind") {
            PlanChoiceChips(
                options: options.map { PlanChoiceOption(id: $0.value, label: $0.label) },
                isSelected: { $0 == selection.wrappedValue },
                onTap: { selection.wrappedValue = $0 },
                groupLabel: "Kind",
                identifier: identifier
            )
        }
    }
}

/// Where's segmented control (board Details): "A public place", "My place" (or "My porch") where the plan
/// may be at home, and "Online" with `plans_online` for the kinds that can be.
struct PlanWhereChoices: View {
    @Bindable var model: PlanComposerModel

    var body: some View {
        let choices = model.whereChoices
        if choices.count > 1 {
            PlanSegmented(
                options: choices.map { ($0, label($0)) },
                selection: Binding(get: { model.whereKind }, set: { model.setWhere($0) }),
                label: "Where",
                identifiers: choices.map(identifier),
                icons: choices.map { $0 == .online ? .video : nil }
            )
        }
    }

    private func label(_ choice: PlanComposerModel.Where) -> String {
        switch choice {
        case .publicPlace: "A public place"
        case .home: model.kind == .walkCoffee ? "My porch" : "My place"
        case .online: PlanOnlineCopy.word
        }
    }

    private func identifier(_ choice: PlanComposerModel.Where) -> String {
        switch choice {
        case .publicPlace: "plansWherePublic"
        case .home: "plansWhereHome"
        case .online: "plansWhereOnline"
        }
    }
}

/// An online plan's link (board Details): pasted, never shown to anyone but the people who are in.
struct PlanOnlineLinkField: View {
    @Bindable var model: PlanComposerModel

    var body: some View {
        @Bindable var more = model.more
        VStack(alignment: .leading, spacing: Spacing.s2) {
            PlanTextInput(
                placeholder: PlanOnlineCopy.linkPlaceholder,
                text: $more.onlineLink,
                // Never cut a pasted link short: one over 300 characters gets the server's sentence instead.
                limit: 2000,
                identifier: "planOnlineLink",
                label: "The link people will join with"
            )
            .keyboardType(.URL)
            .textContentType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.done)
            PlanScopeLine(text: PlanOnlineCopy.linkScope)
        }
    }
}
