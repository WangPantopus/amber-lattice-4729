//
//  PlanBringListScreen.swift
//  Pantopus
//
//  Plans for the holidays, board 19 (Bring): the bring list, for the host.
//  Pushed from the host form's "Bring list" row and from the plan's bring
//  card. The items with who is bringing each; an X that removes one; "Add
//  something"; tap a name to change it, add a short note, or bring it
//  yourself; "Guests can add their own"; "Done".
//

import SwiftUI

struct PlanBringListScreen: View {
    @Bindable var editor: PlanBringEditor
    /// After "Done" went through (on a posted plan, once the list is saved).
    let onDone: () -> Void
    let onBack: () -> Void

    @State private var editing: PlanBringEditor.Item?
    @State private var confirmRemove: PlanBringEditor.Item?
    @FocusState private var addFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "Bring list", leading: .back, onLeading: onBack)
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s4) {
                    Text("List what's needed. Guests pick what they'll bring, in the app or in a browser.")
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if !editor.items.isEmpty { items }
                    addField
                    PlanSwitchRow(
                        title: "Guests can add their own",
                        subtitle: "\u{201C}I'll bring something else\u{201D}",
                        isOn: $editor.guestsCanAdd
                    )
                    .accessibilityIdentifier("planBringGuestsCanAdd")
                    if let error = editor.error {
                        Text(error)
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.error)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("planBringError")
                    }
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
                .padding(.bottom, Spacing.s6)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
        .background(Theme.Color.appBg)
        .toolbar(.hidden, for: .navigationBar)
        .sheet(item: $editing) { item in
            PlanBringItemEditor(item: item) { editor.update($0) }
        }
        .alert(
            "Remove \(confirmRemove?.label ?? "")?",
            isPresented: Binding(get: { confirmRemove != nil }, set: { if !$0 { confirmRemove = nil } }),
            presenting: confirmRemove
        ) { item in
            Button("Remove", role: .destructive) { editor.remove(item) }
            Button("Keep it", role: .cancel) {}
        } message: { item in
            Text("\(item.claimName ?? "Someone") was bringing it.")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planBringList")
    }

    private var items: some View {
        PlanFormCard {
            ForEach(Array(editor.items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                HStack(spacing: Spacing.s3) {
                    Button { editing = item } label: {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(item.label).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                            Text(item.line)
                                .planFont(.small)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Change it or add a note")
                    .accessibilityIdentifier("planBringItem")
                    Button {
                        if item.claimName != nil { confirmRemove = item } else { editor.remove(item) }
                    } label: {
                        Icon(.x, size: 18, color: Theme.Color.appText)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove \(item.label)")
                    .accessibilityIdentifier("planBringRemove")
                }
            }
        }
    }

    private var addField: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text.planOverline("Add something")
            HStack(spacing: Spacing.s2) {
                TextField("Cranberry sauce", text: $editor.newLabel)
                    .planFont(.body)
                    .submitLabel(.done)
                    .focused($addFocused)
                    .onSubmit { editor.add() }
                    .onChange(of: editor.newLabel) { _, new in
                        if new.count > PlanBringEditor.labelLimit { editor.newLabel = String(new.prefix(PlanBringEditor.labelLimit)) }
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 48)
                    .typesInFieldOnTap($addFocused)
                    .background(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).fill(Theme.Color.appSurface))
                    .overlay(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).stroke(Theme.Color.appBorderStrong, lineWidth: 1))
                    .accessibilityLabel("Add something")
                    .accessibilityIdentifier("planBringNew")
                Button { editor.add() } label: {
                    Icon(.plus, size: 20, color: Theme.Color.appTextInverse)
                        .frame(width: 48, height: 48)
                        .background(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).fill(Theme.Color.primarySolid))
                }
                .buttonStyle(.plain)
                .disabled(!editor.canAdd)
                .opacity(editor.canAdd ? 1 : 0.5)
                .accessibilityLabel("Add to the list")
                .accessibilityIdentifier("planBringAdd")
            }
            Text("Tap a name to change it or add a short note, like \u{201C}Two, please\u{201D}.")
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var footer: some View {
        VStack(spacing: Spacing.s2) {
            Button {
                Task { if await editor.save() { onDone() } }
            } label: {
                PlanButtonLabel(title: "Done", kind: .primary, isLoading: editor.isSaving)
            }
            .planButton(.primary)
            .disabled(editor.isSaving)
            .accessibilityIdentifier("planBringDone")
            Text("\(editor.items.count == 1 ? "1 thing" : "\(editor.items.count) things") · up to \(PlanBringEditor.maxItems)")
                .planFont(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .background(Theme.Color.appSurface)
        .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
    }
}

/// Tapping an item: its name and a short note to change, and "I'm bringing this".
struct PlanBringItemEditor: View {
    @State var item: PlanBringEditor.Item
    let onSave: (PlanBringEditor.Item) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        // Scrolls, and opens full height at the largest text sizes, so the title and the switch's words fit.
        ScrollView {
            fields
        }
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.Color.appSurface)
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            HStack {
                Text("Change it")
                    .planFont(.h3)
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button { dismiss() } label: {
                    Icon(.x, size: 16, color: Theme.Color.appText)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Theme.Color.appSurfaceSunken))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            PlanFormField(label: "Name") {
                PlanTextInput(
                    placeholder: "Rolls",
                    text: $item.label,
                    limit: PlanBringEditor.labelLimit,
                    identifier: "planBringItemName",
                    label: "Name"
                )
            }
            PlanFormField(label: "Note") {
                PlanTextInput(
                    placeholder: "Two, please",
                    text: $item.note,
                    limit: PlanBringEditor.noteLimit,
                    identifier: "planBringItemNote",
                    label: "Note"
                )
            }
            PlanSwitchRow(
                title: "I'm bringing this",
                subtitle: item.claimName.map { "\($0) is bringing it now" } ?? "Guests see it's taken",
                isOn: $item.mine
            )
            .accessibilityIdentifier("planBringItemMine")
            Button {
                onSave(item)
                dismiss()
            } label: {
                PlanButtonLabel(title: "Save", kind: .primary)
            }
            .planButton(.primary)
            .disabled(item.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityIdentifier("planBringItemSave")
        }
        .padding(Spacing.s4)
        .padding(.top, Spacing.s2)
    }
}

/// The bring list of a posted plan (from its bring card): read fresh, saved on "Done".
struct PlanBringListRoute: View {
    let onClose: () -> Void
    @State private var editor: PlanBringEditor

    init(planId: String, onClose: @escaping () -> Void) {
        _editor = State(initialValue: PlanBringEditor(planId: planId))
        self.onClose = onClose
    }

    var body: some View {
        PlanBringListScreen(editor: editor, onDone: onClose, onBack: onClose)
            .task { await editor.reload() }
    }
}
