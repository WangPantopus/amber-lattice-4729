//
//  MomentConvergence.swift
//  Pantopus
//
//  Convergences and the sky strip ("Pulse, reinvented" phase 3, PHASE-3 piece 2; board B14; CONTRACT 8h). Rarely,
//  when the real world earns it (a sunset several people photographed, a first snow), a 15-minute window opens and the
//  Live photos whose authors chose to join become one kept piece; each sunset leaves one band of colour in the place's
//  sky strip. Never invented: the server decides by its stated rules. In Pulse a piece is one row ("Tonight's sky ·
//  6 photos") that opens it; in the viewer a chip opens it too. Only while the switch is on. Words as the web's.
//

import Observation
import SwiftUI

/// `convergence` on a Moment answer (switch on): the piece this Moment joined.
struct MomentConvergenceDTO: Decodable, Hashable {
    let id: String
    let kind: String
    let title: String
    let open: Bool

    private enum CodingKeys: String, CodingKey {
        case id, kind, title, open
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? "sunset"
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? (kind == "first_snow" ? "First snow" : "Tonight’s sky")
        open = (try? c.decodeIfPresent(Bool.self, forKey: .open)) ?? false
    }

    /// The row's and the chip's words: "Tonight’s sky", with "· open now" while its window is open.
    var tag: String {
        open ? "\(title) · open now" : title
    }
}

/// `GET /api/reinvented/convergences/:id`: the piece, its photos oldest first, the colours of its sky.
struct ConvergenceDTO: Decodable {
    let id: String
    let kind: String
    let title: String
    let openedAt: Date?
    let closesAt: Date?
    let open: Bool
    let moments: [MomentDTO]
    let bands: [String]

    private enum CodingKeys: String, CodingKey {
        case id, kind, title, open, moments, bands
        case openedAt = "opened_at"
        case closesAt = "closes_at"
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? "sunset"
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? (kind == "first_snow" ? "First snow" : "Tonight’s sky")
        openedAt = MomentTime.parse(try? c.decodeIfPresent(String.self, forKey: .openedAt))
        closesAt = MomentTime.parse(try? c.decodeIfPresent(String.self, forKey: .closesAt))
        open = (try? c.decodeIfPresent(Bool.self, forKey: .open)) ?? false
        // One Moment the app can't read leaves the rest.
        moments = ((try? c.decodeIfPresent([Lenient<MomentDTO>].self, forKey: .moments)) ?? []).compactMap(\.value)
        bands = (try? c.decodeIfPresent([String].self, forKey: .bands)) ?? []
    }
}

/// `GET /api/reinvented/strip/sky`: the place's sunsets, one entry per day there was one.
struct SkyStripDTO: Decodable {
    struct Day: Decodable, Identifiable {
        let date: String
        let bands: [String]
        let count: Int

        var id: String {
            date
        }

        private enum CodingKeys: String, CodingKey {
            case date, bands, count
        }

        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            date = try c.decode(String.self, forKey: .date)
            bands = (try? c.decodeIfPresent([String].self, forKey: .bands)) ?? []
            count = (try? c.decodeIfPresent(Int.self, forKey: .count)) ?? 0
        }
    }

    let days: [Day]
}

/// Reads one element without failing its array.
private struct Lenient<Value: Decodable>: Decodable {
    let value: Value?

    init(from decoder: any Decoder) throws {
        value = try? Value(from: decoder)
    }
}

private struct ConvergenceEnvelope: Decodable {
    let convergence: ConvergenceDTO
}

enum ConvergenceEndpoints {
    /// `GET /api/reinvented/convergences/:id` (the cell, the local date and the kind, e.g. `sunset:456:-1227:2026-11-27`).
    /// The id goes in as it is: the client encodes the path itself, so encoding it here too sent `%253A` (a 404).
    /// Route `backend/routes/reinvented.js`.
    static func piece(_ id: String) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/reinvented/convergences/\(id)",
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// `GET /api/reinvented/strip/sky?cell=<a sunset convergence's id>&days=30`.
    static func skyStrip(_ id: String) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/reinvented/strip/sky",
            query: ["cell": id, "days": "30"],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }
}

/// The piece open, from Pulse's list (`fromList`) or from the viewer, one at a time.
@Observable
@MainActor
final class ConvergencePrompt {
    static let shared = ConvergencePrompt()

    struct Open: Identifiable, Equatable {
        let id: String
    }

    var fromList: Open?
    var inViewer: Open?

    /// A Moment of a piece opens the piece (switch on); anything else opens as before.
    func opens(_ moment: MomentDTO) -> Bool {
        guard PulseReinventedFlags.shared.isOn, let sky = moment.together.convergence else { return false }
        fromList = Open(id: sky.id)
        return true
    }
}

/// Pulse's list opens a piece here (`ReinventedPulseView`).
struct MomentConvergenceListSheet: ViewModifier {
    @State private var prompt = ConvergencePrompt.shared

    func body(content: Content) -> some View {
        content.sheet(item: $prompt.fromList) { open in
            MomentConvergenceView(id: open.id)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }
}

/// The piece: its title and window, the colours of its sky, its photos oldest first, and (a sunset) the place's sky
/// strip of 30 days.
struct MomentConvergenceView: View {
    let id: String
    @State private var piece: ConvergenceDTO?
    @State private var strip: [SkyStripDTO.Day] = []
    @State private var failed = false

    private var sunset: Bool {
        id.hasPrefix("sunset:")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                header
                if let piece {
                    if !piece.bands.isEmpty { bands(piece.bands, height: 28) }
                    photos(piece.moments)
                    note("Never made up: it opens only when several people take Live photos of the real sky here.")
                    if sunset, !strip.isEmpty { skyStrip }
                } else {
                    note(failed ? "This couldn’t load." : "Loading…")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.s4)
        }
        .background(Theme.Color.appBg)
        .task(id: id) { await read() }
        .accessibilityIdentifier("together.convergence")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(piece?.title ?? "…")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            if let piece {
                Text(window(piece))
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
    }

    /// "Open now · until 4:45 PM · 6 photos", or "4:30 PM to 4:45 PM · 6 photos".
    private func window(_ piece: ConvergenceDTO) -> String {
        let time = { (date: Date?) in date.map { $0.formatted(date: .omitted, time: .shortened) } ?? "…" }
        let span = piece.open ? "Open now · until \(time(piece.closesAt))" : "\(time(piece.openedAt)) to \(time(piece.closesAt))"
        let count = piece.moments.count
        return "\(span) · \(count) \(count == 1 ? "photo" : "photos")"
    }

    private func bands(_ colours: [String], height: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(colours.enumerated()), id: \.offset) { _, hex in
                SkyBand.color(hex).frame(maxWidth: .infinity)
            }
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: Radii.sm))
        .accessibilityElement()
        .accessibilityLabel("The colours of its sky")
    }

    private func photos(_ moments: [MomentDTO]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: Spacing.s2), GridItem(.flexible(), spacing: Spacing.s2)], spacing: Spacing.s2) {
            ForEach(moments) { moment in
                VStack(alignment: .leading, spacing: 4) {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: 180)
                        .overlay {
                            AsyncImage(url: moment.kind == .video ? moment.poster : moment.media) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                Theme.Color.appSurfaceSunken
                            }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: Radii.md))
                    Text(moment.author.name)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .lineLimit(1)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(moment.caption ?? "\(moment.author.name)’s photo")
            }
        }
    }

    /// "This place’s sunsets": one line per day, its bands.
    private var skyStrip: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("This place’s sunsets")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            ForEach(strip) { day in
                HStack(spacing: Spacing.s2) {
                    Text(SkyBand.day(day.date))
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .frame(width: 56, alignment: .leading)
                    bands(day.bands, height: 16)
                }
            }
        }
        .padding(.top, Spacing.s2)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("The sky strip, 30 days")
        .accessibilityIdentifier("together.convergence.strip")
    }

    private func note(_ words: String) -> some View {
        Text(words)
            .font(.system(size: 13.5))
            .foregroundStyle(Theme.Color.appTextSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func read() async {
        do {
            let answer: ConvergenceEnvelope = try await MomentsAPI.send(ConvergenceEndpoints.piece(id))
            piece = answer.convergence
        } catch {
            failed = true
            await PulseReinventedFlags.shared.recheck()
            return
        }
        // The strip is extra: a refusal leaves it out.
        if sunset, let days: SkyStripDTO = try? await MomentsAPI.send(ConvergenceEndpoints.skyStrip(id)) {
            strip = days.days
        }
    }
}

/// A band's colour and a strip day's label.
enum SkyBand {
    /// `#RRGGBB` (the server's average of a photo's top third); anything else is a neutral grey.
    static func color(_ hex: String) -> Color {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return Color.gray.opacity(0.4) }
        return Color(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    /// "Nov 27" for "2026-11-27".
    static func day(_ date: String) -> String {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let day = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
        else { return date }
        return day.formatted(.dateTime.month(.abbreviated).day())
    }
}

/// In the viewer's chip row: "Tonight’s sky", opening the piece over the viewer.
struct MomentConvergenceChip: View {
    let model: MomentsViewerModel
    @State private var prompt = ConvergencePrompt.shared

    var body: some View {
        if PulseReinventedFlags.shared.isOn, let sky = model.moment?.together.convergence {
            Button { prompt.inViewer = .init(id: sky.id) } label: {
                HStack(spacing: 6) {
                    Icon(sky.kind == "first_snow" ? .snowflake : .sunset, size: 15, strokeWidth: 2.2, color: .white)
                    Text(sky.tag)
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
            .accessibilityHint("Opens every photo of this sky")
            .accessibilityIdentifier("moments.viewer.convergence")
            .sheet(item: $prompt.inViewer) { open in
                MomentConvergenceView(id: open.id)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
        }
    }
}

extension MomentsViewerModel {
    /// The viewer holds still while a piece is open over it.
    var convergenceOpen: Bool {
        ConvergencePrompt.shared.inViewer != nil
    }
}
