//
//  PulseTravel.swift
//  Pantopus
//
//  Passing on, and Eyes on ("Pulse, reinvented" phase 3, PHASE-3 piece 6; CONTRACT 8f). A post travels when someone
//  passes it on from where they are: a pass is the passer's own post quoting the original, made from their place now, so
//  it reaches people around them by today's rules, and it says who carried it. Today's screens and the apps in the
//  stores see an ordinary quote post. An Eyes-on Ask asks a place a question that people there now answer with a Live
//  photo (`EyesOnNear.swift`). Only while the switch is on: the new Pulse's list is where all of this shows. Words as
//  the web's.
//

import SwiftUI

/// What a post in the new Pulse's list carries about travelling (switch on): who passed it on, who carried it here,
/// and an Eyes-on Ask's window; and whose it is, so "Pass it on" is never offered on one's own.
public struct ReinventedTravelDTO: Decodable, Sendable, Hashable {
    public struct Passed: Decodable, Sendable, Hashable {
        let count: Int
        let carriers: [MomentAuthorDTO]

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: Keys.self)
            count = (try? c.decodeIfPresent(Int.self, forKey: .count)) ?? 0
            carriers = (try? c.decodeIfPresent([MomentAuthorDTO].self, forKey: .carriers)) ?? []
        }

        private enum Keys: String, CodingKey {
            case count, carriers
        }
    }

    public struct PassedOn: Decodable, Sendable, Hashable {
        let carriedBy: MomentAuthorDTO?

        private enum CodingKeys: String, CodingKey {
            case carriedBy = "carried_by"
        }
    }

    public struct EyesOn: Decodable, Sendable, Hashable {
        let open: Bool
        let until: String?
        let answers: Int

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: Keys.self)
            open = (try? c.decodeIfPresent(Bool.self, forKey: .open)) ?? false
            until = try? c.decodeIfPresent(String.self, forKey: .until)
            answers = (try? c.decodeIfPresent(Int.self, forKey: .answers)) ?? 0
        }

        private enum Keys: String, CodingKey {
            case open, until, answers
        }
    }

    let passed: Passed?
    let passedOn: PassedOn?
    let eyesOn: EyesOn?
    let userId: String?
    let postAs: String?
    let postType: String?

    private enum CodingKeys: String, CodingKey {
        case passed
        case passedOn = "passed_on"
        case eyesOn = "eyes_on"
        case userId = "user_id"
        case postAs = "post_as"
        case postType = "post_type"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        passed = try? c.decodeIfPresent(Passed.self, forKey: .passed)
        passedOn = try? c.decodeIfPresent(PassedOn.self, forKey: .passedOn)
        eyesOn = try? c.decodeIfPresent(EyesOn.self, forKey: .eyesOn)
        userId = try? c.decodeIfPresent(String.self, forKey: .userId)
        postAs = try? c.decodeIfPresent(String.self, forKey: .postAs)
        postType = try? c.decodeIfPresent(String.self, forKey: .postType)
    }

    /// Under a post's status line: who carried it here, who passed it on, or an Eyes-on Ask's window.
    var line: String? {
        if let carrier = passedOn?.carriedBy { return "Carried here by \(Self.first(carrier))" }
        if let passed, passed.count >= 1 { return "Passed on by \(Self.names(passed.carriers, count: passed.count))" }
        if let eyesOn {
            let until = eyesOn.until.flatMap(MomentTime.parse)?.formatted(date: .omitted, time: .shortened) ?? ""
            var words = "Eyes on · " + (eyesOn.open ? "open until \(until)" : "closed")
            let n = eyesOn.answers
            if n > 0 { words += " · \(n) \(n == 1 ? "Live answer" : "Live answers")" }
            return words
        }
        return nil
    }

    /// "Pass it on" is offered on someone else's post that isn't a pass itself or under a made-up name.
    func mayPass(viewer: String?) -> Bool {
        guard let viewer, let userId else { return false }
        return userId != viewer && passedOn == nil && postAs != "pen_name"
    }

    private static func first(_ person: MomentAuthorDTO) -> String {
        person.firstName ?? (person.name.isEmpty ? "someone" : person.name)
    }

    /// "Dana and Ade", "Dana, Ade and 3 others".
    private static func names(_ people: [MomentAuthorDTO], count: Int) -> String {
        let shown = people.prefix(2).map(first)
        let rest = count - shown.count
        if shown.isEmpty { return "\(count) \(count == 1 ? "person" : "people")" }
        return rest > 0 ? "\(shown.joined(separator: ", ")) and \(rest) \(rest == 1 ? "other" : "others")"
            : shown.joined(separator: " and ")
    }
}

/// `POST /api/posts` for a pass: today's body (a quote of the original, from the passer's place now) with
/// `studio: { passed_on: true }` beside its keys.
private struct PassOnBody: Encodable {
    struct Studio: Encodable {
        let passedOn = true

        private enum CodingKeys: String, CodingKey {
            case passedOn = "passed_on"
        }
    }

    let base: PostCreateRequest
    let studio = Studio()

    private enum Key: String, CodingKey {
        case studio
    }

    func encode(to encoder: any Encoder) throws {
        try base.encode(to: encoder)
        var c = encoder.container(keyedBy: Key.self)
        try c.encode(studio, forKey: .studio)
    }
}

enum PassOnEndpoints {
    /// `POST /api/posts` (today's route), a quote of `postId` with the passer's words and place. Route
    /// `backend/routes/posts.js` (create); the pass checks are CONTRACT 8f's (`PASS_OWN`, `PASS_INVALID`, `PASSED_ALREADY`).
    static func pass(postId: String, words: String, kind: String?, at fix: UserCoordinate) -> Endpoint {
        let type = StudioPostKind(rawValue: kind ?? "").flatMap { $0 == .localWin ? nil : $0 } ?? .localUpdate
        var request = PostCreateRequest(
            content: words,
            postType: type.rawValue,
            visibility: "neighborhood",
            postAs: "personal",
            latitude: fix.latitude,
            longitude: fix.longitude,
            gpsTimestamp: MomentTime.string(Date()),
            gpsLatitude: fix.latitude,
            gpsLongitude: fix.longitude,
            showOnProfile: true,
            profileVisibilityScope: "local_context",
            audience: "nearby",
            purpose: type.purpose
        )
        request.clientRequestId = UUID().uuidString.lowercased()
        request.quotedPostId = postId
        return Endpoint(method: .post, path: "/api/posts", body: PassOnBody(base: request))
    }
}

/// Under a post in the new Pulse: "Pass it on", opening a short sheet for the passer's words.
struct ReinventedPassItOn: View {
    let postId: String
    let travel: ReinventedTravelDTO
    let viewer: String?
    @State private var writing = false
    @State private var passed = false

    var body: some View {
        if travel.mayPass(viewer: viewer) {
            Group {
                if passed {
                    Text("Passed on, from where you are.")
                        .font(.system(size: 13.5))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                } else {
                    Button { writing = true } label: {
                        Label { Text("Pass it on") } icon: { Icon(.send, size: 15, strokeWidth: 2.2, color: Theme.Color.primaryTint) }
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.Color.primaryTint)
                            .frame(minHeight: 36)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("reinventedPulse.passOn.\(postId)")
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.bottom, Spacing.s2)
            .sheet(isPresented: $writing) {
                ReinventedPassOnSheet(postId: postId, kind: travel.postType) {
                    writing = false
                    passed = true
                }
                .presentationDetents([.medium])
            }
        }
    }
}

struct ReinventedPassOnSheet: View {
    let postId: String
    let kind: String?
    let onPassed: () -> Void
    @State private var words = ""
    @State private var busy: String?
    @State private var problem: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text("Pass it on from where you are")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            Text("It goes to people around you now, with your words, and says you carried it.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
            TextField("Why it's worth passing on", text: $words, axis: .vertical)
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
                .onChange(of: words) { _, new in if new.count > 500 { words = String(new.prefix(500)) } }
                .accessibilityLabel("Your words")
                .accessibilityIdentifier("reinventedPulse.passOn.words")
            if let problem {
                Text(problem)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(Theme.Color.error)
                    .accessibilityIdentifier("reinventedPulse.passOn.problem")
            }
            HStack(spacing: Spacing.s2) {
                Spacer(minLength: 0)
                ReinventedCircleButton("Cancel", busy: busy != nil) { dismiss() }
                ReinventedCircleButton(busy ?? "Pass it on", strong: true, busy: busy != nil) { Task { await send() } }
                    .disabled(words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("reinventedPulse.passOn.send")
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.s5)
        .background(Theme.Color.appBg)
    }

    private func send() async {
        problem = nil
        busy = "Finding where you are…"
        defer { busy = nil }
        guard let fix = await DeviceLocationProvider.shared.requestCurrent(timeoutSeconds: 8) else {
            problem = "Allow your location to pass it on from where you are."
            return
        }
        busy = "Passing it on…"
        do {
            let endpoint = PassOnEndpoints.pass(
                postId: postId,
                words: words.trimmingCharacters(in: .whitespacesAndNewlines),
                kind: kind,
                at: fix
            )
            try await MomentsAPI.send(endpoint)
            onPassed()
        } catch let failure as MomentsFailure {
            problem = failure.message
            await PulseReinventedFlags.shared.recheck()
        } catch {
            problem = "Couldn't pass it on. Try again."
        }
    }
}
