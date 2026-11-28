//
//  MomentSeal.swift
//  Pantopus
//
//  Relics and "Seal it" ("Pulse, reinvented" phase 3, PHASE-3 piece 7; CONTRACT 8g): a Moment that opens later, on a
//  date, when someone stands where it was left, or the next time it rains there. Until it opens nobody but its author
//  sees what it holds, and it is listed nowhere: a place relic is found only in "Relics near you" (the Spots chip, read
//  once that chip is picked; the phone's position only in the POST body) and opens there for a reader who stands within
//  100 m, whole for them alone, in a sheet of its own. The Studio's drawer offers "Seal it" (`TogetherStudioRows`); the
//  author sees "Sealed · <hint>" on their own Moment in the viewer. Only while the switch is on. Words as the web's.
//

import Observation
import SwiftUI

/// `seal` on a Moment answer (switch on).
struct MomentSealDTO: Decodable, Hashable {
    let opens: String
    let open: Bool
    let hint: String?

    private enum CodingKeys: String, CodingKey {
        case opens, open, hint
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        opens = try c.decode(String.self, forKey: .opens)
        open = (try? c.decodeIfPresent(Bool.self, forKey: .open)) ?? false
        hint = try? c.decodeIfPresent(String.self, forKey: .hint)
    }
}

/// The Studio's "Seal it" choice, sent as `seal: { opens, at? }`.
struct SealChoice: Encodable, Hashable {
    let opens: String
    let at: String?
}

struct RelicDTO: Decodable, Identifiable, Hashable {
    let id: String
    let author: MomentAuthorDTO?
    let leftAt: String?
    let hint: String?
    let here: Bool

    private enum CodingKeys: String, CodingKey {
        case id, author, hint, here
        case leftAt = "left_at"
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try? c.decodeIfPresent(MomentAuthorDTO.self, forKey: .author)
        leftAt = try? c.decodeIfPresent(String.self, forKey: .leftAt)
        hint = try? c.decodeIfPresent(String.self, forKey: .hint)
        here = (try? c.decodeIfPresent(Bool.self, forKey: .here)) ?? false
    }
}

private struct RelicsNearAnswer: Decodable {
    let relics: [RelicDTO]
}

private struct SealPlaceBody: Encodable {
    let latitude: Double
    let longitude: Double
}

enum SealEndpoints {
    /// `POST /api/reinvented/seals/near` `{ latitude, longitude }` (in the body only): place relics within 300 m.
    /// Route `backend/routes/reinvented.js` (seals/near).
    static func near(latitude: Double, longitude: Double) -> Endpoint {
        Endpoint(method: .post, path: "/api/reinvented/seals/near", body: SealPlaceBody(latitude: latitude, longitude: longitude))
    }

    /// `POST /api/reinvented/seals/:id/open` `{ latitude, longitude }`: within 100 m, `{ moment }` whole for this reader.
    /// Route `backend/routes/reinvented.js` (seals/:id/open).
    static func open(_ id: String, latitude: Double, longitude: Double) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/reinvented/seals/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/open",
            body: SealPlaceBody(latitude: latitude, longitude: longitude)
        )
    }
}

@Observable
@MainActor
final class RelicsNearModel {
    private(set) var relics: [RelicDTO] = []
    private(set) var opening: String?
    var opened: MomentDTO?
    var problem: String?
    @ObservationIgnored private var here: UserCoordinate?

    func read() async {
        guard let fix = await DeviceLocationProvider.shared.requestCurrent(timeoutSeconds: 6) else {
            relics = []
            return
        }
        here = fix
        do {
            let answer: RelicsNearAnswer = try await MomentsAPI.send(SealEndpoints.near(latitude: fix.latitude, longitude: fix.longitude))
            relics = answer.relics
        } catch {
            relics = []
            await PulseReinventedFlags.shared.recheck()
        }
    }

    /// Opens it where it was left, whole for this reader while they stand there; nothing is recorded.
    func open(_ relic: RelicDTO) async {
        guard opening == nil else { return }
        opening = relic.id
        problem = nil
        defer { opening = nil }
        guard let fix = await DeviceLocationProvider.shared.requestCurrent(timeoutSeconds: 8) ?? here else {
            problem = "Allow your location to open it where it was left."
            return
        }
        do {
            let answer: MomentEnvelope = try await MomentsAPI.send(SealEndpoints.open(
                relic.id,
                latitude: fix.latitude,
                longitude: fix.longitude
            ))
            opened = answer.moment
        } catch let failure as MomentsFailure {
            problem = failure.message.contains("Stand where") ? failure.message : "It couldn't open. Try again."
        } catch {
            problem = "It couldn't open. Try again."
        }
    }
}

/// On the Spots chip, over the list: the place relics near the reader, opened where they were left.
struct RelicsNearSection: View {
    @State private var model = RelicsNearModel()

    var body: some View {
        // Always drawn (a clear line when there are none), so its read runs when the Spots chip is picked.
        VStack(alignment: .leading, spacing: Spacing.s2) {
            if !model.relics.isEmpty {
                Label { Text("Relics near you") } icon: { Icon(.lock, size: 15, strokeWidth: 2.2, color: Theme.Color.primaryTint) }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                ForEach(model.relics) { relic in row(relic) }
                if let problem = model.problem {
                    Text(problem)
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(Theme.Color.error)
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 1, alignment: .leading)
        .padding(.horizontal, model.relics.isEmpty ? 0 : Spacing.s4)
        .task { await model.read() }
        .sheet(item: $model.opened) { moment in
            MomentRelicOpened(moment: moment)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .accessibilityIdentifier("reinventedPulse.relics")
    }

    private func row(_ relic: RelicDTO) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(relic.author.map { "\($0.name) left something here" } ?? "Something was left here")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
            Text(meta(relic))
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
            if relic.here {
                Button(model.opening == relic.id ? "Opening…" : "Open it") { Task { await model.open(relic) } }
                    .font(.system(size: 14, weight: .semibold))
                    .disabled(model.opening != nil)
                    .accessibilityIdentifier("reinventedPulse.relics.open")
            } else {
                Text("Walk to where it was left to open it.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.s3)
        .background(RoundedRectangle(cornerRadius: Radii.lg).fill(Theme.Color.appSurface))
        .overlay(RoundedRectangle(cornerRadius: Radii.lg).stroke(Theme.Color.appBorder, lineWidth: 1))
    }

    /// "Opens when you stand here · left Nov 20 · you're there".
    private func meta(_ relic: RelicDTO) -> String {
        let left = relic.leftAt.flatMap(MomentTime.parse).map { "left \($0.formatted(.dateTime.month(.abbreviated).day()))" }
        return [relic.hint, left, relic.here ? "you're there" : "within 300 m"].compactMap { $0 }.joined(separator: " · ")
    }
}

/// The opened relic, whole for this reader while they stand there.
struct MomentRelicOpened: View {
    let moment: MomentDTO

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                Label { Text("Opened where it was left") } icon: { Icon(.lock, size: 15, strokeWidth: 2.2, color: Theme.Color.primaryTint) }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.Color.primaryTint)
                switch moment.kind {
                case .text:
                    MomentsTextCard(text: moment.text ?? "", background: moment.background)
                        .frame(height: 420)
                        .clipShape(RoundedRectangle(cornerRadius: Radii.lg))
                case .photo, .video:
                    AsyncImage(url: moment.kind == .video ? moment.poster ?? moment.media : moment.media) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        Theme.Color.appSurfaceSunken.frame(height: 320)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: Radii.lg))
                }
                if let caption = moment.caption, !caption.isEmpty {
                    Text(caption)
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.Color.appText)
                }
                Text("Left by \(moment.author.name.isEmpty ? "someone" : moment.author.name)")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
            .padding(Spacing.s4)
        }
        .background(Theme.Color.appBg)
        .accessibilityIdentifier("reinventedPulse.relics.opened")
    }
}

/// In the viewer's chip row, on the author's own sealed Moment: "Sealed · Opens on Dec 25, 2026".
struct MomentSealMark: View {
    let model: MomentsViewerModel

    var body: some View {
        if PulseReinventedFlags.shared.isOn, model.isMine, let seal = model.moment?.together.seal, !seal.open {
            HStack(spacing: 6) {
                Icon(.lock, size: 15, strokeWidth: 2.2, color: .white)
                Text("Sealed · \(seal.hint ?? "only you see it until it opens")")
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.black.opacity(0.45)))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("moments.viewer.sealed")
        }
    }
}
