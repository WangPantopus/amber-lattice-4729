//
//  MomentsStudioEdit.swift
//  Pantopus
//
//  "Pulse, reinvented": the 15-minute edit (CONTRACT 3; the lead's words of
//  2026-11-27 01:12). "Edit" in Moment options on one's own photo or video
//  Moment, while the switch is on and `editable_until` holds, opens the
//  Studio on it: the picture as posted (it can't change, so no Text, Draw or
//  Resize), its stamps to move, size, turn, add or take off, the caption, and
//  Nearby or Friends. "Save" sends only what changed. Nobody is told, and
//  nothing marks it as edited for others.
//

import SwiftUI

@Observable
@MainActor
final class MomentsStudioEditModel {
    let moment: MomentDTO
    var caption: String
    var stamps: [MomentStampPlacement]
    var audience: MomentAudience
    var picked: MomentStampKind?
    var showsTray = false
    var isSaving = false
    var asksDiscard = false
    /// A line over the bar after a refused save; an alert that closes the edit.
    var problem: String?
    var closingWords: String?
    /// Where a stamp added from the tray goes (as the composer places one), from the picture's frame.
    var placing = StudioEditPlacing()
    /// The value each stamp shows: the ones placed, and every one the server kept for an edit.
    let values: [MomentStampKind: MomentStampValue]
    let editableUntil: Date?

    init(moment: MomentDTO) {
        self.moment = moment
        caption = moment.caption ?? ""
        stamps = moment.stamps.map(\.placement)
        audience = moment.audience
        var values = moment.stampChoices
        for stamp in moment.stamps {
            if let value = stamp.value { values[stamp.placement.kind] = value }
        }
        self.values = values
        editableUntil = moment.editableUntil.flatMap(MomentTime.parse)
    }

    /// Edit is offered on one's own photo or video Moment while the switch is on and its window holds.
    static func offers(_ moment: MomentDTO?, mine: Bool, now: Date = Date()) -> Bool {
        guard mine, PulseReinventedFlags.shared.isOn, let moment, moment.kind != .text,
              let until = moment.editableUntil.flatMap(MomentTime.parse) else { return false }
        return until > now
    }

    var trimmedCaption: String {
        caption.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var captionChanged: Bool {
        trimmedCaption != (moment.caption ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var stampsChanged: Bool {
        stamps != moment.stamps.map(\.placement)
    }

    var changed: Bool {
        captionChanged || stampsChanged || audience != moment.audience
    }

    /// A Moment with no location goes only to connections; one at a place may go to either.
    var audiences: [MomentAudience] {
        moment.noLocation ? [.connections] : [.nearby, .connections]
    }

    /// The stamps an edit may place, in the tray's order.
    var offered: [MomentStampKind] {
        MomentStampKind.allCases.filter { values[$0] != nil }
    }

    /// "You can change this for 12 more minutes".
    func windowLine(at now: Date) -> String {
        guard let until = editableUntil else { return "" }
        let seconds = until.timeIntervalSince(now)
        if seconds < 60 { return "Less than a minute left to change this" }
        let minutes = Int(seconds / 60)
        return minutes == 1 ? "You can change this for 1 more minute" : "You can change this for \(minutes) more minutes"
    }

    func toggle(_ kind: MomentStampKind, startScale: Double, safe: CGRect) {
        if stamps.contains(where: { $0.kind == kind }) {
            stamps.removeAll { $0.kind == kind }
            if picked == kind { picked = nil }
            return
        }
        let index = Double(stamps.count)
        stamps.append(MomentStampPlacement(
            kind: kind,
            x: safe.minX + safe.width * 0.3,
            y: min(safe.minY + safe.height * (0.3 + index * 0.08), safe.maxY),
            scale: startScale
        ))
        picked = kind
    }

    enum Outcome {
        case saved(MomentDTO)
        case stays
        case closed
    }

    /// Sends what changed. Refusals the person can fix keep the edit open with a line; the window closing, the
    /// Moment ending or the switch going off close it.
    func save() async -> Outcome {
        guard changed, !isSaving else { return .stays }
        isSaving = true
        defer { isSaving = false }
        problem = nil
        let body = MomentEditBody(
            caption: captionChanged ? trimmedCaption : nil,
            stamps: stampsChanged ? stamps : nil,
            audience: audience != moment.audience ? audience.rawValue : nil
        )
        let response: APIClient.DataResponse
        do {
            response = try await APIClient.shared.requestDataResponse(
                MomentsEndpoints.edit(id: moment.id, body: body),
                includingForbidden: true,
                includingNotFound: true
            )
        } catch {
            problem = MomentsFailure.offline.message
            return .stays
        }
        let status = response.response.statusCode
        if (200..<300).contains(status), let answer = try? JSONDecoder().decode(MomentEditResponse.self, from: response.data) {
            return .saved(answer.moment)
        }
        let json = (try? JSONSerialization.jsonObject(with: response.data)) as? [String: Any]
        let code = json?["code"] as? String
        let words = json?["error"] as? String
        switch (status, code) {
        case (409, _):
            closingWords = "The 15 minutes are up. Your Moment stays as it was."
            return .stays
        case (410, _):
            closingWords = MomentsFailure.ended.message
            return .stays
        case (_, "PULSE_REINVENTED_OFF"):
            await PulseReinventedFlags.shared.recheck()
            return .closed
        case (404, _):
            closingWords = MomentsFailure.notFound.message
            return .stays
        default:
            if code == "PEN_NAME_AUDIENCE" { audience = .nearby }
            if let words, words.contains(" "), words.count <= 160 {
                problem = words
            } else {
                problem = "Couldn't save your changes. Try again."
            }
            return .stays
        }
    }
}

struct MomentsStudioEdit: View {
    @State private var model: MomentsStudioEditModel
    /// The picture as the viewer showed it (a video's poster).
    let picture: UIImage?
    let onSaved: (MomentDTO) -> Void
    let onClose: () -> Void
    @FocusState private var writing: Bool

    init(moment: MomentDTO, picture: UIImage?, onSaved: @escaping (MomentDTO) -> Void, onClose: @escaping () -> Void) {
        _model = State(initialValue: MomentsStudioEditModel(moment: moment))
        self.picture = picture
        self.onSaved = onSaved
        self.onClose = onClose
    }

    private var pictureSize: CGSize? {
        if let picture { return picture.size }
        guard let width = model.moment.width, let height = model.moment.height, width > 0, height > 0 else { return nil }
        return CGSize(width: width, height: height)
    }

    var body: some View {
        GeometryReader { geo in
            let full = CGSize(
                width: geo.size.width + geo.safeAreaInsets.leading + geo.safeAreaInsets.trailing,
                height: geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom
            )
            let frame = pictureSize.map { MomentMarks.fill($0, in: full) } ?? CGRect(origin: .zero, size: full)
            let aspect = frame.width / max(frame.height, 1)
            let safe = MomentMarks.safeBox(aspect: aspect)
            let startScale = min(max(Double(full.width / max(frame.width, 1)), 0.25), 4)
            ZStack {
                Color.black
                if let picture {
                    Image(uiImage: picture)
                        .resizable()
                        .scaledToFill()
                        .frame(width: full.width, height: full.height)
                        .clipped()
                        .accessibilityLabel(model.moment.kind == .video ? "Your video, as posted" : "Your photo, as posted")
                }
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        model.picked = nil
                        writing = false
                    }
                    .accessibilityHidden(true)
                ForEach(model.stamps, id: \.kind) { placement in
                    MomentsStudioEditStamp(model: model, placement: placement, frame: frame, safe: safe)
                }
            }
            .frame(width: full.width, height: full.height)
            .overlay(alignment: .top) { topRow(safeTop: geo.safeAreaInsets.top) }
            .onChange(of: frame, initial: true) { _, _ in model.placing = StudioEditPlacing(startScale: startScale, safe: safe) }
            .overlay(alignment: .bottom) { lower(safeBottom: geo.safeAreaInsets.bottom) }
            .ignoresSafeArea()
        }
        .environment(\.colorScheme, .dark)
        .sheet(isPresented: $model.showsTray) { tray }
        .alert("Discard your changes?", isPresented: $model.asksDiscard) {
            Button("Discard", role: .destructive) { onClose() }
                .accessibilityIdentifier("moments.edit.discard")
            Button("Keep editing", role: .cancel) {}
        }
        .alert(
            model.closingWords ?? "",
            isPresented: Binding(get: { model.closingWords != nil }, set: { if !$0 { model.closingWords = nil } })
        ) {
            Button("OK") { onClose() }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.edit")
    }

    // MARK: - Top: the X and the one tool an edit has

    private func topRow(safeTop: CGFloat) -> some View {
        HStack(alignment: .top) {
            Button { model.changed ? (model.asksDiscard = true) : onClose() } label: {
                Icon(.x, size: 22, strokeWidth: 2.4, color: .white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.black.opacity(0.42)))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
            .accessibilityIdentifier("moments.edit.close")
            Spacer()
            if !model.offered.isEmpty {
                Button { model.showsTray = true } label: {
                    HStack(spacing: Spacing.s3) {
                        Text("Stamps")
                            .scaledFont(15, weight: .semibold)
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.6), radius: 2, x: 0, y: 1)
                        Icon(.stamp, size: 20, strokeWidth: 2.2, color: .white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Color.black.opacity(0.42)))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("moments.edit.rail.stamps")
            }
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, safeTop + Spacing.s2)
    }

    // MARK: - Bottom: the caption, the line, who sees it, Save

    private func lower(safeBottom: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            TextField("", text: $model.caption, prompt: Text("Add a caption").foregroundColor(.white.opacity(0.7)), axis: .vertical)
                .scaledFont(22, weight: .bold)
                .foregroundStyle(.white)
                .tint(.white)
                .lineLimit(1...3)
                .focused($writing)
                .shadow(color: .black.opacity(0.6), radius: 3, x: 0, y: 1)
                .onChange(of: model.caption) { _, text in
                    if text.count > 100 { model.caption = String(text.prefix(100)) }
                }
                .accessibilityLabel("Caption")
                .accessibilityIdentifier("moments.edit.caption")
                .padding(.horizontal, Spacing.s4)
            VStack(alignment: .leading, spacing: Spacing.s3) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(model.problem ?? model.windowLine(at: context.date))
                        .scaledFont(13, weight: .medium)
                        .foregroundStyle(model.problem == nil ? Color.white.opacity(0.85) : Theme.Color.error)
                        .accessibilityIdentifier("moments.edit.window")
                }
                HStack(spacing: Spacing.s2) {
                    ForEach(model.audiences, id: \.self) { audience in
                        chip(audience == .nearby ? "Nearby" : "Friends", on: model.audience == audience) { model.audience = audience }
                            .accessibilityIdentifier("moments.edit.audience.\(audience == .nearby ? "nearby" : "friends")")
                    }
                }
                HStack(spacing: Spacing.s3) {
                    pill
                    saveButton
                }
            }
            .padding(Spacing.s4)
            .padding(.bottom, max(safeBottom - Spacing.s2, 0))
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24, style: .continuous)
                    .fill(Color.black.opacity(0.78))
            )
        }
    }

    private func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .scaledFont(15, weight: .semibold)
                .foregroundStyle(on ? Color(uiColor: MomentsPalette.ink(MomentMarks.Ink.black.rawValue)) : .white)
                .padding(.horizontal, Spacing.s4)
                .frame(minHeight: 40)
                .background(Capsule().fill(on ? Color.white : Color.white.opacity(0.12)))
                .overlay(Capsule().strokeBorder(Color.white.opacity(on ? 0 : 0.3), lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    /// The time left and the place as posted; it opens nothing in an edit.
    private var pill: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            HStack(spacing: Spacing.s2) {
                Icon(.clock, size: 18, strokeWidth: 2.2, color: .white)
                VStack(alignment: .leading, spacing: 1) {
                    Text(fadesLine(at: context.date))
                        .scaledFont(14, weight: .semibold)
                        .foregroundStyle(.white)
                    if !model.moment.placeLabel.isEmpty {
                        Text(model.moment.placeLabel)
                            .scaledFont(12)
                            .foregroundStyle(.white.opacity(0.75))
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Spacing.s3)
            .frame(minHeight: 52)
            .background(Capsule().fill(Color.white.opacity(0.12)))
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("moments.edit.pill")
    }

    private func fadesLine(at now: Date) -> String {
        guard let end = model.moment.expiresAtDate else { return "" }
        let minutes = max(Int(end.timeIntervalSince(now) / 60), 0)
        if minutes < 60 { return minutes <= 1 ? "Fades in 1 minute" : "Fades in \(minutes) minutes" }
        let hours = Int((Double(minutes) / 60).rounded())
        return hours == 1 ? "Fades in 1 hour" : "Fades in \(hours) hours"
    }

    private var saveButton: some View {
        Button {
            writing = false
            Task {
                switch await model.save() {
                case let .saved(updated): onSaved(updated)
                case .closed: onClose()
                case .stays: break
                }
            }
        } label: {
            ZStack {
                Text("Save").opacity(model.isSaving ? 0 : 1)
                if model.isSaving { ProgressView().tint(.white) }
            }
            .scaledFont(17, weight: .bold)
            .foregroundStyle(.white)
            .padding(.horizontal, Spacing.s5)
            .frame(minHeight: 52)
            .background(Capsule().fill(Theme.Color.primary600.opacity(model.changed ? 1 : 0.45)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!model.changed || model.isSaving)
        .accessibilityIdentifier("moments.edit.save")
    }

    // MARK: - The tray: the stamps an edit may place

    private var tray: some View {
        MomentsStudioEditTray(model: model)
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
            .presentationBackground { Theme.Color.appSurface.environment(\.colorScheme, .dark) }
            .environment(\.colorScheme, .dark)
    }
}

/// Where a stamp added from the edit's tray goes (as the composer places one).
struct StudioEditPlacing {
    var startScale: Double = 1
    var safe = CGRect(x: 0, y: 0.25, width: 1, height: 0.7)
}
