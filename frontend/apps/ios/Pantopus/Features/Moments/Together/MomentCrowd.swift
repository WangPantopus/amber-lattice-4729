//
//  MomentCrowd.swift
//  Pantopus
//
//  The crowd freeze ("Pulse, reinvented" phase 3, PHASE-3 piece 3; CONTRACT 8i): one scene taken from many phones at
//  one time. The server finds the other Live photos and videos taken within a minute and 150 m (shared with people
//  nearby, that this reader may see; three at least), ordered around the scene, and the reader walks around it with one
//  slider. In the viewer a chip "Seen from 4 phones" opens it; a sky piece's photos open it too. Nothing is stored.
//  Only while the switch is on. Words as the web's `crowd/Crowd.tsx`.
//

import Observation
import SwiftUI

private struct CrowdEnvelope: Decodable {
    struct Crowd: Decodable {
        let center: String
        let moments: [MomentDTO]

        private enum CodingKeys: String, CodingKey {
            case center, moments
        }

        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            center = try c.decode(String.self, forKey: .center)
            moments = ((try? c.decodeIfPresent([LenientMoment].self, forKey: .moments)) ?? []).compactMap(\.value)
        }
    }

    let crowd: Crowd?
}

/// Reads one Moment without failing its array.
private struct LenientMoment: Decodable {
    let value: MomentDTO?

    init(from decoder: any Decoder) throws {
        value = try? MomentDTO(from: decoder)
    }
}

enum CrowdEndpoints {
    /// `GET /api/reinvented/crowd/:id` (a photo or video Moment). Route `backend/routes/reinvented.js`.
    static func crowd(_ id: String) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/reinvented/crowd/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)",
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }
}

/// The scenes read so far, by Moment: read once per Moment while the app runs, when the viewer first shows it.
@Observable
@MainActor
final class MomentCrowdStore {
    static let shared = MomentCrowdStore()

    struct Scene: Equatable {
        let center: String
        let moments: [MomentDTO]
    }

    private(set) var scenes: [String: Scene] = [:]
    @ObservationIgnored private var asked = Set<String>()

    /// The scene around this photo or video, once read (three phones at least), else nil; the first call reads it.
    func scene(for moment: MomentDTO) -> Scene? {
        guard PulseReinventedFlags.shared.isOn, moment.kind != .text else { return nil }
        if !asked.contains(moment.id) {
            asked.insert(moment.id)
            Task { await read(moment.id) }
        }
        return scenes[moment.id]
    }

    func read(_ id: String) async {
        guard let answer: CrowdEnvelope = try? await MomentsAPI.send(CrowdEndpoints.crowd(id)),
              let crowd = answer.crowd, crowd.moments.count >= 3 else { return }
        scenes[id] = Scene(center: crowd.center, moments: crowd.moments)
    }
}

/// In the viewer's chip row: "Seen from 4 phones" when others caught the same scene.
struct MomentCrowdChip: View {
    let model: MomentsViewerModel
    @State private var open: String?

    var body: some View {
        if let moment = model.moment, let scene = MomentCrowdStore.shared.scene(for: moment) {
            Button { open = moment.id } label: {
                HStack(spacing: 6) {
                    Icon(.users, size: 15, strokeWidth: 2.2, color: .white)
                    Text("Seen from \(scene.moments.count) phones")
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
            .accessibilityHint("Opens the scene from every phone")
            .accessibilityIdentifier("moments.viewer.crowd")
            .sheet(item: Binding(get: { open.map(CrowdOpen.init) }, set: { open = $0?.id })) { opened in
                MomentCrowdView(id: opened.id)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .onChange(of: open) { _, now in MomentCrowdPrompt.shared.inViewer = now != nil }
        }
    }
}

struct CrowdOpen: Identifiable, Equatable {
    let id: String
}

/// Whether the scene is open over the viewer (the viewer holds still meanwhile).
@Observable
@MainActor
final class MomentCrowdPrompt {
    static let shared = MomentCrowdPrompt()
    var inViewer = false
}

/// The scene from every phone: one picture at a time, one slider around it.
struct MomentCrowdView: View {
    let id: String
    @State private var scene: MomentCrowdStore.Scene?
    @State private var loaded = false
    @State private var at: Double?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("The scene from \(scene.map { "\($0.moments.count)" } ?? "…") phones")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Theme.Color.appText)
                        .accessibilityAddTraits(.isHeader)
                    Text("Taken within a minute of each other, around one place.")
                        .font(.system(size: 13.5))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
                if let scene {
                    frame(scene)
                } else {
                    Text(loaded ? "Not enough phones caught this scene." : "Loading…")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .padding(Spacing.s4)
        }
        .background(Theme.Color.appBg)
        .task(id: id) {
            if MomentCrowdStore.shared.scenes[id] == nil { await MomentCrowdStore.shared.read(id) }
            scene = MomentCrowdStore.shared.scenes[id]
            loaded = true
        }
        .accessibilityIdentifier("together.crowd")
    }

    @ViewBuilder
    private func frame(_ scene: MomentCrowdStore.Scene) -> some View {
        let last = scene.moments.count - 1
        let start = scene.moments.firstIndex { $0.id == scene.center } ?? 0
        let index = min(last, max(0, Int((at ?? Double(start)).rounded())))
        let moment = scene.moments[index]
        AsyncImage(url: moment.kind == .video ? moment.poster : moment.media) { image in
            image.resizable().scaledToFit()
        } placeholder: {
            Theme.Color.appSurfaceSunken.frame(height: 320)
        }
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg))
        .overlay(alignment: .topLeading) {
            Text([moment.author.name, moment.createdAtDate?.formatted(date: .omitted, time: .standard)].compactMap { $0 }
                .joined(separator: " · "))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(Color.black.opacity(0.5)))
                .padding(Spacing.s2)
        }
        .accessibilityLabel(moment.caption ?? "\(moment.author.name)’s view")
        if last > 0 {
            VStack(alignment: .leading, spacing: 4) {
                Text("Walk around it")
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                Slider(
                    value: Binding(get: { Double(index) }, set: { at = $0.rounded() }),
                    in: 0...Double(last),
                    step: 1
                )
                .tint(Theme.Color.primarySolid)
                .accessibilityValue("\(moment.author.name)’s view")
                .accessibilityIdentifier("together.crowd.scrub")
            }
        }
    }
}

extension MomentsViewerModel {
    /// The viewer holds still while the scene is open over it.
    var crowdOpen: Bool {
        MomentCrowdPrompt.shared.inViewer
    }
}
