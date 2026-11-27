//
//  MomentsStudioIlluminate.swift
//  Pantopus
//
//  The Studio's Illuminate sheet ("Pulse, reinvented" phase 2; CONTRACT 7c), opened from the rail: add a dot (a note,
//  a rating, a link), write what it holds, and remove it. Each new dot sits near the middle of the picture; the author
//  drags it onto the thing it is about once the sheet is closed.
//

import SwiftUI

struct MomentsStudioIlluminate: View {
    let model: MomentsComposerModel
    let onDone: () -> Void

    private var kinds: [MomentDotDTO.Kind] {
        var kinds: [MomentDotDTO.Kind] = model.postsUnderMadeUpName ? [.note, .rating] : [.note, .rating, .link]
        if model.offersThings { kinds.append(.thing) }
        return kinds
    }

    private var picked: MomentDotDTO? {
        let dots = model.studioDotDrafts
        return dots.first { $0.id == model.marking.studio?.pickedDot } ?? dots.last
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                    Text("Illuminate")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.Color.appText)
                        .accessibilityAddTraits(.isHeader)
                    Text("Dots people tap on the picture")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
                if !model.studioDotDrafts.isEmpty {
                    dotRow
                }
                if let picked {
                    editor(picked)
                }
                if model.studioDotDrafts.count < MomentsComposerModel.dotLimit {
                    addRow
                } else {
                    hint("Up to \(MomentsComposerModel.dotLimit) dots on one picture.")
                }
                if !model.studioDotDrafts.isEmpty {
                    hint("Close this and drag each dot onto what it's about.")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s5)
            .padding(.bottom, Spacing.s4)
        }
        .task { await MomentsStudioAI.shared.read() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.studio.illuminate")
    }

    /// The dots so far: a tap picks one to edit.
    private var dotRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.s2) {
                ForEach(Array(model.studioDotDrafts.enumerated()), id: \.element.id) { index, dot in
                    let on = picked?.id == dot.id
                    Button { model.marking.studio?.pickedDot = dot.id } label: {
                        chip("\(index + 1) · \(dot.kind.name)", icon: dot.kind.icon, on: on)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                    .accessibilityIdentifier("moments.studio.illuminate.pick.\(dot.id)")
                }
            }
        }
    }

    private var addRow: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Add a dot")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
            HStack(spacing: Spacing.s2) {
                ForEach(kinds, id: \.self) { kind in
                    Button { model.addStudioDot(kind) } label: {
                        chip(Self.addWords(kind), icon: kind.icon, on: false)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("moments.studio.illuminate.add.\(kind.rawValue)")
                }
            }
        }
    }

    private func editor(_ dot: MomentDotDTO) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            switch dot.kind {
            case .note:
                field("What should people know here?", text: model.dotField(dot.id, \.text, limit: 140), id: "note")
            case .rating:
                field("What you rate", text: model.dotField(dot.id, \.label, limit: 40), id: "label")
                stars(dot)
            case .link:
                field("https://…", text: model.dotField(dot.id, \.url, limit: 500), id: "url")
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                field("Title (optional)", text: model.dotField(dot.id, \.title, limit: 60), id: "title")
                if !(dot.url ?? "").trimmingCharacters(in: .whitespaces).isEmpty, MomentsComposerModel.httpsLink(dot.url) == nil {
                    hint("Only an https link.")
                }
                if model.postsUnderMadeUpName {
                    hint("A made-up name can't post a link: this one stays off.")
                }
            case .thing:
                thingEditor(dot)
            case .whisper, .unknown:
                EmptyView()
            }
            Button { model.removeStudioDot(dot.id) } label: {
                chip("Remove dot", icon: .trash, on: false)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("moments.studio.illuminate.remove")
        }
    }

    private static func addWords(_ kind: MomentDotDTO.Kind) -> String {
        switch kind {
        case .note: "A note"
        case .rating: "A rating"
        case .link: "A link"
        case .thing: "A thing to name"
        case .whisper, .unknown: kind.name
        }
    }

    /// A thing to name: the author's own guess, and how much of the picture its outline takes.
    private func thingEditor(_ dot: MomentDotDTO) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            field("What you think it is (optional)", text: model.dotField(dot.id, \.label, limit: 40), id: "label")
            HStack(spacing: Spacing.s2) {
                Button { resize(dot, by: -0.06) } label: { chip("Smaller outline", icon: .minus, on: false) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("moments.studio.illuminate.smaller")
                Button { resize(dot, by: 0.06) } label: { chip("Bigger outline", icon: .plus, on: false) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("moments.studio.illuminate.bigger")
            }
            hint("A reader's tap names it with a source (Pantopus AI). It always says \"likely\", and people can correct it.")
        }
    }

    private func resize(_ dot: MomentDotDTO, by step: Double) {
        model.updateStudioDot(dot.id) { thing in
            let size = min(max((thing.box?.w ?? MomentsComposerModel.thingSize) + step, 0.1), 0.8)
            thing.box = MomentPlayItem.Box(x: 0, y: 0, w: size, h: size)
        }
    }

    private func stars(_ dot: MomentDotDTO) -> some View {
        HStack(spacing: Spacing.s1) {
            ForEach(1...5, id: \.self) { count in
                let on = count <= (dot.stars ?? 0)
                Button { model.updateStudioDot(dot.id) { $0.stars = count } } label: {
                    Icon(
                        on ? .starFill : .star,
                        size: 24,
                        strokeWidth: 2,
                        color: on ? Theme.Color.primaryTint : Theme.Color.appTextSecondary
                    )
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(count) of 5")
                .accessibilityAddTraits(count == dot.stars ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("moments.studio.illuminate.star.\(count)")
            }
        }
    }

    private func field(_ placeholder: String, text: Binding<String>, id: String) -> some View {
        TextField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.Color.appTextSecondary))
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Theme.Color.appText)
            .submitLabel(.done)
            .padding(.horizontal, 14)
            .frame(height: 44)
            .typesInFieldOnTap()
            .background(RoundedRectangle(cornerRadius: Radii.md).fill(Theme.Color.appSurfaceRaised))
            .overlay(RoundedRectangle(cornerRadius: Radii.md).stroke(Theme.Color.appBorder, lineWidth: 1))
            .accessibilityLabel(placeholder)
            .accessibilityIdentifier("moments.studio.illuminate.\(id)")
    }

    private func hint(_ words: String) -> some View {
        Text(words)
            .font(.system(size: 13))
            .foregroundStyle(Theme.Color.appTextSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func chip(_ words: String, icon: PantopusIcon, on: Bool) -> some View {
        HStack(spacing: 6) {
            Icon(icon, size: 15, strokeWidth: 2.2, color: on ? .white : Theme.Color.primaryTint)
            Text(words)
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(on ? Color.white : Theme.Color.appText)
                .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .frame(height: 38)
        .background(Capsule().fill(on ? Theme.Color.primarySolid : Theme.Color.appSurfaceRaised))
        .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: on ? 0 : 1))
        .contentShape(Capsule())
    }
}
