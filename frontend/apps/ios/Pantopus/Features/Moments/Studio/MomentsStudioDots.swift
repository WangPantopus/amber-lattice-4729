//
//  MomentsStudioDots.swift
//  Pantopus
//
//  Illuminate in the Studio ("Pulse, reinvented" phase 2, living objects; CONTRACT 7c): the author puts dots on things
//  in the photo or video, each holding a note, a rating or a link (a thing to name and a voice whisper come with field
//  cards and sound). Up to eight. A reader taps one in the viewer. Dots are placed on the picture as stamps are (0 to 1
//  across and down), dragged where they belong, and go out with the Moment (`dots`). A link takes only an https address
//  and isn't offered under a made-up name. With the switch off none of this is drawn or sent.
//

import SwiftUI

extension MomentsComposerModel {
    /// Up to eight dots on one picture.
    static let dotLimit = 8

    /// Dots go on a photo or a video.
    var offersDots: Bool {
        switch draft {
        case .photo, .video: true
        case .text, nil: false
        }
    }

    var studioDotDrafts: [MomentDotDTO] {
        offersDots ? marking.studio?.dots ?? [] : []
    }

    /// The dots that go out: each one finished, and none of a kind this post can't carry.
    var studioDots: [MomentDotDTO]? {
        let ready = studioDotDrafts.compactMap { dot -> MomentDotDTO? in
            guard Self.dotReady(dot), dot.kind != .link || !postsUnderMadeUpName else { return nil }
            var out = MomentDotDTO(id: dot.id, kind: dot.kind, x: (dot.x * 1000).rounded() / 1000, y: (dot.y * 1000).rounded() / 1000)
            switch dot.kind {
            case .note: out.text = dot.text?.trimmingCharacters(in: .whitespacesAndNewlines)
            case .rating: (out.label, out.stars) = (dot.label?.trimmingCharacters(in: .whitespacesAndNewlines), dot.stars)
            case .link:
                out.url = Self.httpsLink(dot.url)?.absoluteString
                let title = dot.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                out.title = title.isEmpty ? nil : title
            case .thing, .whisper, .unknown: return nil
            }
            return out
        }
        return ready.isEmpty ? nil : ready
    }

    /// Whether a dot has what it needs to go out.
    static func dotReady(_ dot: MomentDotDTO) -> Bool {
        switch dot.kind {
        case .note: !(dot.text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        case .rating: !(dot.label?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) && (1...5).contains(dot.stars ?? 0)
        case .link: httpsLink(dot.url) != nil
        case .thing, .whisper, .unknown: false
        }
    }

    /// The address as an https link ("example.com" reads as https://example.com); nil for anything else.
    static func httpsLink(_ typed: String?) -> URL? {
        let trimmed = typed?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty, trimmed.count <= 500 else { return nil }
        let full = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
        guard let url = URL(string: full), url.scheme?.lowercased() == "https", let host = url.host(),
              host.contains(".") else { return nil }
        return url
    }

    /// A new dot of `kind` near the middle (each a little lower than the last), picked for editing.
    func addStudioDot(_ kind: MomentDotDTO.Kind) {
        guard offersDots, studioDotDrafts.count < Self.dotLimit else { return }
        if marking.studio == nil { marking.studio = MomentsStudioTools() }
        var number = 1
        while studioDotDrafts.contains(where: { $0.id == "dot-\(number)" }) {
            number += 1
        }
        let count = Double(studioDotDrafts.count)
        var dot = MomentDotDTO(id: "dot-\(number)", kind: kind, x: 0.5, y: min(0.32 + count * 0.06, 0.8))
        if kind == .rating { dot.stars = 4 }
        marking.studio?.dots.append(dot)
        marking.studio?.pickedDot = dot.id
    }

    func removeStudioDot(_ id: String) {
        marking.studio?.dots.removeAll { $0.id == id }
        if marking.studio?.pickedDot == id { marking.studio?.pickedDot = studioDotDrafts.last?.id }
    }

    func updateStudioDot(_ id: String, _ change: (inout MomentDotDTO) -> Void) {
        guard let index = marking.studio?.dots.firstIndex(where: { $0.id == id }) else { return }
        guard var dot = marking.studio?.dots[index] else { return }
        change(&dot)
        marking.studio?.dots[index] = dot
    }

    /// A field of the picked dot, as the Illuminate sheet edits it.
    func dotField(_ id: String, _ field: WritableKeyPath<MomentDotDTO, String?>, limit: Int) -> Binding<String> {
        Binding(
            get: { self.studioDotDrafts.first { $0.id == id }?[keyPath: field] ?? "" },
            set: { typed in self.updateStudioDot(id) { $0[keyPath: field] = String(typed.prefix(limit)) } }
        )
    }
}

extension MomentDotDTO.Kind {
    var name: String {
        switch self {
        case .note: "Note"
        case .rating: "Rating"
        case .link: "Link"
        case .thing: "A thing to name"
        case .whisper: "Whisper"
        case .unknown: "Dot"
        }
    }

    var icon: PantopusIcon {
        switch self {
        case .note: .info
        case .rating: .starFill
        case .link: .link
        case .thing: .sparkles
        case .whisper: .circleDot
        case .unknown: .circleDot
        }
    }
}

/// The dots on the Studio's picture: each one is dragged where it belongs; a tap opens it in Illuminate.
struct MomentsStudioDotLayer: View {
    let model: MomentsComposerModel
    /// The picture's own size, as the stamps are placed on it (nil: the screen is the frame).
    let picture: CGSize?
    let open: () -> Void

    var body: some View {
        GeometryReader { geo in
            let frame = picture.map { MomentMarks.fill($0, in: geo.size) } ?? CGRect(origin: .zero, size: geo.size)
            ForEach(model.studioDotDrafts, id: \.id) { dot in
                MomentsStudioPlacedDot(model: model, dot: dot, frame: frame, open: open)
            }
        }
    }
}

private struct MomentsStudioPlacedDot: View {
    let model: MomentsComposerModel
    let dot: MomentDotDTO
    let frame: CGRect
    let open: () -> Void
    @GestureState private var moving: CGSize = .zero

    var body: some View {
        let picked = model.marking.studio?.pickedDot == dot.id
        MomentDotMark(kind: dot.kind, picked: picked, unfinished: !MomentsComposerModel.dotReady(dot))
            .frame(width: 44, height: 44)
            .contentShape(Circle())
            .position(x: frame.minX + dot.x * frame.width + moving.width, y: frame.minY + dot.y * frame.height + moving.height)
            .gesture(
                DragGesture(minimumDistance: 4)
                    .updating($moving) { value, moving, _ in moving = value.translation }
                    .onEnded { value in
                        model.updateStudioDot(dot.id) { placed in
                            placed.x = min(max(placed.x + value.translation.width / max(frame.width, 1), 0.03), 0.97)
                            placed.y = min(max(placed.y + value.translation.height / max(frame.height, 1), 0.03), 0.97)
                        }
                    }
            )
            .simultaneousGesture(TapGesture().onEnded {
                model.marking.studio?.pickedDot = dot.id
                open()
            })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Dot: \(dot.kind.name)")
            .accessibilityHint("Opens it in Illuminate. Drag to move it.")
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("moments.studio.dot.\(dot.id)")
    }
}

/// A dot as it sits on a picture: a white ring with its kind's mark, glowing so it reads on any photo.
struct MomentDotMark: View {
    let kind: MomentDotDTO.Kind
    var picked = false
    var unfinished = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.28))
                .frame(width: 34, height: 34)
            Circle()
                .fill(unfinished ? Color.black.opacity(0.45) : Theme.Color.primarySolid)
                .frame(width: 24, height: 24)
                .overlay(Circle().stroke(Color.white, lineWidth: picked ? 3 : 2))
            Icon(kind.icon, size: 12, strokeWidth: 2.6, color: .white)
        }
        .shadow(color: .black.opacity(0.4), radius: 4, x: 0, y: 1)
    }
}
