//
//  MomentRetake.swift
//  Pantopus
//
//  Retake ("Pulse, reinvented" phase 3, PHASE-3 piece 1; board B13; CONTRACT 8e): stand where someone stood. A Retake
//  is its first Moment and the frames people added from the same spot; it stays. In Pulse it is one row ("Retake · 4
//  frames") that opens the Retake; in the viewer a chip opens it too. There a reader drags through the frames by date
//  and season and, where they may, adds their own: the Studio opens with the first picture as a ghost to line up with.
//  Only while the switch is on. Words as the web's Retake.
//

import Observation
import SwiftUI

/// `retake` on a Moment answer (switch on): the Retake it belongs to, and the frames this reader may see.
struct MomentRetakeDTO: Decodable, Hashable {
    let startId: String
    let title: String
    let frames: Int
    let isStart: Bool

    private enum CodingKeys: String, CodingKey {
        case title, frames
        case startId = "start_id"
        case isStart = "is_start"
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        startId = try c.decode(String.self, forKey: .startId)
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
        frames = (try? c.decodeIfPresent(Int.self, forKey: .frames)) ?? 1
        isStart = (try? c.decodeIfPresent(Bool.self, forKey: .isStart)) ?? false
    }

    /// "Retake · 4 frames".
    var tag: String {
        "Retake · \(frames) \(frames == 1 ? "frame" : "frames")"
    }
}

/// `GET /api/reinvented/retakes/:id`: the Retake, its frames oldest first.
struct RetakeDTO: Decodable {
    struct Frame: Decodable, Identifiable, Hashable {
        let id: String
        let author: MomentAuthorDTO?
        let dateLabel: String
        let weather: String?
        let season: String
        let thumbURL: URL?
        let mediaURL: URL?

        private enum CodingKeys: String, CodingKey {
            case id, author, weather, season
            case dateLabel = "date_label"
            case thumbURL = "thumb_url"
            case mediaURL = "media_url"
        }

        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            author = try? c.decodeIfPresent(MomentAuthorDTO.self, forKey: .author)
            dateLabel = (try? c.decodeIfPresent(String.self, forKey: .dateLabel)) ?? ""
            weather = try? c.decodeIfPresent(String.self, forKey: .weather)
            season = (try? c.decodeIfPresent(String.self, forKey: .season)) ?? ""
            thumbURL = (try? c.decodeIfPresent(String.self, forKey: .thumbURL)).flatMap(URL.init(string:))
            mediaURL = (try? c.decodeIfPresent(String.self, forKey: .mediaURL)).flatMap(URL.init(string:))
        }

        var picture: URL? {
            mediaURL ?? thumbURL
        }

        /// "Oct 3 · Fall · fog".
        var label: String {
            let seasons = ["winter": "Winter", "spring": "Spring", "summer": "Summer", "fall": "Fall"]
            let parts = [dateLabel, seasons[season] ?? season, weather ?? ""]
            return parts.filter { !$0.isEmpty }.joined(separator: " · ")
        }
    }

    let startId: String
    let title: String
    let placeLabel: String?
    let startedBy: MomentAuthorDTO?
    let frames: [Frame]
    let wantToGo: Int
    let canAdd: Bool

    private enum CodingKeys: String, CodingKey {
        case title, frames
        case startId = "start_id"
        case placeLabel = "place_label"
        case startedBy = "started_by"
        case wantToGo = "want_to_go"
        case canAdd = "can_add"
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        startId = try c.decode(String.self, forKey: .startId)
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
        placeLabel = try? c.decodeIfPresent(String.self, forKey: .placeLabel)
        startedBy = try? c.decodeIfPresent(MomentAuthorDTO.self, forKey: .startedBy)
        frames = (try? c.decodeIfPresent([Frame].self, forKey: .frames)) ?? []
        wantToGo = (try? c.decodeIfPresent(Int.self, forKey: .wantToGo)) ?? 0
        canAdd = (try? c.decodeIfPresent(Bool.self, forKey: .canAdd)) ?? false
    }
}

private struct RetakeEnvelope: Decodable {
    let retake: RetakeDTO
}

enum RetakeEndpoints {
    /// `GET /api/reinvented/retakes/:id` (the start's id or any frame's). Route `backend/routes/reinvented.js` (retakes).
    static func retake(_ id: String) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/reinvented/retakes/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)",
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }
}

/// The Retake open, from Pulse's list (`fromList`) or from the viewer, one at a time.
@Observable
@MainActor
final class RetakePrompt {
    static let shared = RetakePrompt()

    struct Open: Identifiable, Equatable {
        let id: String
    }

    var fromList: Open?
    var inViewer: Open?

    /// A Moment of a Retake opens the Retake (switch on); anything else opens as before.
    func opens(_ moment: MomentDTO) -> Bool {
        guard PulseReinventedFlags.shared.isOn, let retake = moment.together.retake else { return false }
        fromList = Open(id: retake.startId)
        return true
    }

    /// "Add your frame": the Studio opens over Pulse with the Retake's first picture as a ghost, once whatever was in
    /// front of it has closed.
    func addFrame(to retake: RetakeDTO) {
        fromList = nil
        inViewer = nil
        TogetherStudio.shared.reset()
        TogetherStudio.shared.context = .retakeFrame(startId: retake.startId, title: retake.title, ghost: retake.frames.first?.picture)
        Task {
            try? await Task.sleep(for: .milliseconds(600))
            ReinventedStudioPresenter.shared.composing = MomentsComposeRequest(model: MomentsComposerModel(), studio: true)
        }
    }
}

/// Pulse's list opens a Retake here (`ReinventedPulseView`).
struct MomentRetakeListSheet: ViewModifier {
    @State private var prompt = RetakePrompt.shared

    func body(content: Content) -> some View {
        content.sheet(item: $prompt.fromList) { open in
            MomentRetakeView(id: open.id) { prompt.addFrame(to: $0) }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }
}

/// The Retake: its frames, oldest first, dragged through with one slider; "Add your frame" where allowed.
struct MomentRetakeView: View {
    let id: String
    let onAdd: (RetakeDTO) -> Void
    @State private var retake: RetakeDTO?
    @State private var failed = false
    @State private var at: Double?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                header
                if let retake {
                    if retake.frames.isEmpty {
                        note("No frames you can see yet.")
                    } else {
                        frames(retake)
                    }
                } else {
                    note(failed ? "This Retake couldn't load." : "Loading…")
                }
            }
            .padding(Spacing.s4)
        }
        .background(Theme.Color.appBg)
        .task(id: id) { await read() }
        .accessibilityIdentifier("together.retake")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Retake")
                .font(.system(size: 12.5, weight: .bold))
                .foregroundStyle(Theme.Color.primaryTint)
                .textCase(.uppercase)
            Text(retake?.title ?? "…")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            if let retake {
                let count = retake.frames.count
                Text([retake.placeLabel, "started by \(retake.startedBy?.name ?? "someone")", "\(count) \(count == 1 ? "frame" : "frames")"]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
    }

    @ViewBuilder
    private func frames(_ retake: RetakeDTO) -> some View {
        let last = retake.frames.count - 1
        let index = min(last, max(0, Int((at ?? Double(last)).rounded())))
        let frame = retake.frames[index]
        AsyncImage(url: frame.picture) { image in
            image.resizable().scaledToFit()
        } placeholder: {
            Theme.Color.appSurfaceSunken.frame(height: 320)
        }
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg))
        .overlay(alignment: .topLeading) {
            Text(frame.label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(Color.black.opacity(0.55)))
                .padding(Spacing.s3)
        }
        .accessibilityLabel("\(frame.label), \(frame.author?.name ?? "someone")")
        HStack(spacing: Spacing.s2) {
            if let author = frame.author { MomentAvatar(author: author, size: 26) }
            Text("\(frame.author?.name ?? "Someone") \(index == 0 ? "took the first picture" : "stood here too")")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.appText)
        }
        if retake.frames.count > 1 { scrub(retake, index: index) }
        actions(retake)
    }

    private func scrub(_ retake: RetakeDTO, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Frame \(index + 1) of \(retake.frames.count)")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
            Slider(
                value: Binding(get: { at ?? Double(retake.frames.count - 1) }, set: { at = $0 }),
                in: 0...Double(retake.frames.count - 1),
                step: 1
            )
            .tint(Theme.Color.primarySolid)
            .accessibilityLabel("Frame")
            .accessibilityValue(retake.frames[index].label)
            .accessibilityIdentifier("together.retake.scrub")
            HStack {
                Text(retake.frames.first?.dateLabel ?? "")
                Spacer()
                Text(retake.frames.last?.dateLabel ?? "")
            }
            .font(.system(size: 12))
            .foregroundStyle(Theme.Color.appTextSecondary)
            .accessibilityHidden(true)
        }
    }

    private func actions(_ retake: RetakeDTO) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            if retake.wantToGo > 0 { note("\(retake.wantToGo) want to go") }
            if retake.canAdd {
                note("Your frame stays in this Retake.")
                Button { onAdd(retake) } label: {
                    Label { Text("Add your frame") } icon: { Icon(.camera, size: 18, strokeWidth: 2.2, color: .white) }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.s4)
                        .frame(height: 44)
                        .background(Capsule().fill(Theme.Color.primarySolid))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("together.retake.add")
            } else {
                note("Stand where the first picture was taken to add a frame.")
            }
        }
        .padding(.top, Spacing.s2)
    }

    private func note(_ words: String) -> some View {
        Text(words)
            .font(.system(size: 14))
            .foregroundStyle(Theme.Color.appTextSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func read() async {
        do {
            let answer: RetakeEnvelope = try await MomentsAPI.send(RetakeEndpoints.retake(id))
            retake = answer.retake
        } catch {
            failed = true
            await PulseReinventedFlags.shared.recheck()
        }
    }
}

/// In the viewer's chip row: "Retake · 4 frames", opening the Retake over the viewer.
struct MomentRetakeChip: View {
    let model: MomentsViewerModel
    @State private var prompt = RetakePrompt.shared

    var body: some View {
        if PulseReinventedFlags.shared.isOn, let retake = model.moment?.together.retake {
            Button { prompt.inViewer = .init(id: retake.startId) } label: {
                HStack(spacing: 6) {
                    Icon(.history, size: 15, strokeWidth: 2.2, color: .white)
                    Text(retake.tag)
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(Color.black.opacity(0.45)))
                .overlay(Capsule().stroke(Color.white.opacity(0.35), lineWidth: 1))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the Retake's frames")
            .accessibilityIdentifier("moments.viewer.retake")
            .sheet(item: $prompt.inViewer) { open in
                MomentRetakeView(id: open.id) { retake in
                    model.close()
                    prompt.addFrame(to: retake)
                }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
            }
        }
    }
}

extension MomentsViewerModel {
    /// The viewer holds still while a Retake is open over it.
    var retakeOpen: Bool {
        RetakePrompt.shared.inViewer != nil
    }
}
