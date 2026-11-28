//
//  MomentMailIt.swift
//  Pantopus
//
//  "Mail it" ("Pulse, reinvented" phase 3, PHASE-3 piece 9; board B11; CONTRACT 8j): the author sends their own
//  Moment's picture as an ordinary letter in today's Mail tab. The server first keeps the picture as one of the
//  sender's own mail enclosures (`POST /api/reinvented/moments/:id/enclosure`); the letter then goes through today's
//  `POST /api/mailbox/send`, so every rule of today's letters applies: writing to someone else is today's `mail_extras`,
//  and blocks, the stamp and the recipient's own mail settings all hold. It reads like the morning postcards: "A
//  postcard from Ivy", the words, "<place> · <day>". Offered in the viewer's options on one's own Moment with a
//  picture; the viewer closes and the form opens over Pulse. Only while the switch is on and the Mailbox is.
//  Words as the web's `mailit/MailIt.tsx`.
//

import Observation
import SwiftUI

/// `POST /api/reinvented/moments/:id/enclosure`: the picture kept as one of the sender's own mail enclosures.
private struct MailItEnclosed: Decodable {
    struct Enclosure: Decodable {
        let ref: String
    }

    let enclosure: Enclosure
    let place: String?
}

/// Today's `POST /api/mailbox/send` with a letter and its enclosure (the structured form the web sends).
private struct MailItLetter: Encodable {
    struct Recipient: Encodable {
        let mode = "user"
        let userId: String
    }

    struct Envelope: Encodable {
        let type = "letter"
        let subject: String
    }

    struct Body: Encodable {
        struct Payload: Encodable {
            let bodyFormat = "plain_text"
        }

        let format = "mailjson_v1"
        let mimeType = "application/json"
        let title: String
        let content: String
        let attachments: [String]
        let payload = Payload()
    }

    struct Tracking: Encodable {
        let source = "pulse_mail_it_ios"
    }

    let recipient: Recipient
    let envelope: Envelope
    let object: Body
    let tracking = Tracking()
}

enum MomentMailIt {
    /// Offered on one's own Moment with a picture, under one's own name, not a live guess spot, not an unopened relic.
    @MainActor
    static func offers(_ moment: MomentDTO?, mine: Bool) -> Bool {
        guard PulseReinventedFlags.shared.isOn, LaunchFeatures.mailbox, mine, let moment else { return false }
        guard moment.kind == .photo || moment.kind == .video, !moment.together.underPenName else { return false }
        if moment.guess != nil, moment.state == .live { return false }
        return moment.together.seal?.open != false
    }

    /// From the viewer's options: the viewer closes, then the form opens over Pulse.
    @MainActor
    static func open(_ moment: MomentDTO, from viewer: MomentsViewerModel) {
        viewer.close()
        Task {
            try? await Task.sleep(for: .milliseconds(600))
            MomentMailItPrompt.shared.moment = moment
        }
    }

    fileprivate static func enclosure(_ id: String) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/reinvented/moments/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/enclosure",
            body: [String: String]()
        )
    }

    fileprivate static func send(_ letter: MailItLetter) -> Endpoint {
        Endpoint(method: .post, path: "/api/mailbox/send", body: letter)
    }
}

@Observable
@MainActor
final class MomentMailItPrompt {
    static let shared = MomentMailItPrompt()
    var moment: MomentDTO?
}

/// The new Pulse hosts the form (`ReinventedPulseView`).
struct MomentMailItHost: ViewModifier {
    @State private var prompt = MomentMailItPrompt.shared

    func body(content: Content) -> some View {
        content.sheet(item: $prompt.moment) { moment in
            MomentMailItForm(moment: moment) { prompt.moment = nil }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }
}

/// "Mail it": to whom (yourself; others while today's `mail_extras` is on), the words, and the send.
struct MomentMailItForm: View {
    let moment: MomentDTO
    let onDone: () -> Void
    @State private var to: String?
    @State private var words: String
    @State private var busy = false
    @State private var error: String?
    @State private var sent: String?
    @State private var people = MomentsStudioConnections.shared

    init(moment: MomentDTO, onDone: @escaping () -> Void) {
        self.moment = moment
        self.onDone = onDone
        _words = State(initialValue: (moment.caption ?? moment.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Label { Text("Mail it") } icon: { Icon(.mail, size: 16, strokeWidth: 2.2, color: Theme.Color.primaryTint) }
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            if let sent {
                Text(sent)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityIdentifier("together.mailIt.sent")
            } else {
                form
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.s4)
        .background(Theme.Color.appBg)
        .task { if LaunchFeatures.mailExtras { await people.readIfNeeded() } }
        .accessibilityIdentifier("together.mailIt")
    }

    @ViewBuilder
    private var form: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("To")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
            Picker("To", selection: $to) {
                Text("Yourself, in your Mail").tag(String?.none)
                if LaunchFeatures.mailExtras {
                    ForEach(people.people, id: \.id) { person in
                        Text(person.name).tag(String?.some(person.id))
                    }
                }
            }
            .pickerStyle(.menu)
            .disabled(busy)
            .accessibilityIdentifier("together.mailIt.to")
        }
        VStack(alignment: .leading, spacing: 4) {
            Text("Words")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
            TextField("A few words to go with it", text: $words, axis: .vertical)
                .lineLimit(3...6)
                .textFieldStyle(.roundedBorder)
                .disabled(busy)
                .onChange(of: words) { _, new in if new.count > 2000 { words = String(new.prefix(2000)) } }
                .accessibilityIdentifier("together.mailIt.words")
        }
        Text("It goes as a letter with this photo, by today’s mail rules.")
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.Color.appTextSecondary)
        if let error {
            Text(error)
                .font(.system(size: 13.5))
                .foregroundStyle(Theme.Color.error)
                .fixedSize(horizontal: false, vertical: true)
        }
        HStack(spacing: Spacing.s2) {
            Button("Cancel") { onDone() }
                .buttonStyle(.bordered)
                .disabled(busy)
            Button { Task { await send() } } label: {
                Text(busy ? "Mailing…" : "Mail it").frame(minWidth: 96)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.Color.primarySolid)
            .disabled(busy)
            .accessibilityIdentifier("together.mailIt.send")
        }
    }

    private func send() async {
        guard !busy, case let .signedIn(user) = AuthManager.shared.state else { return }
        let account = user.id
        busy = true
        error = nil
        defer { busy = false }
        do {
            let kept: MailItEnclosed = try await MomentsAPI.send(MomentMailIt.enclosure(moment.id))
            // Written as the morning postcards are (CONTRACT 8j): "A postcard from <first name>", the words, "<place> · <day>".
            let first = (moment.author.firstName ?? moment.author.name).split(separator: " ").first.map(String.init) ?? "me"
            let subject = "A postcard from \(first)"
            let day = moment.createdAtDate?.formatted(.dateTime.month(.abbreviated).day())
            let footer = [kept.place, day].compactMap { $0 }.joined(separator: " · ")
            let trimmed = words.trimmingCharacters(in: .whitespacesAndNewlines)
            let content = [trimmed.isEmpty ? nil : trimmed, footer.isEmpty ? nil : footer].compactMap { $0 }.joined(separator: "\n\n")
            let letter = MailItLetter(
                recipient: .init(userId: to ?? account),
                envelope: .init(subject: subject),
                object: .init(title: subject, content: content, attachments: [kept.enclosure.ref])
            )
            try await MomentsAPI.send(MomentMailIt.send(letter))
            let name = to.flatMap { id in people.people.first { $0.id == id }?.name }
            sent = name.map { "Mailed. It’s in \($0)’s Mail." } ?? "Mailed. It’s in your Mail."
            try? await Task.sleep(for: .milliseconds(1600))
            onDone()
        } catch let failure as MomentsFailure {
            // The server's own words (a letter to someone else while `mail_extras` is off says so).
            error = failure.message
            await PulseReinventedFlags.shared.recheck()
        } catch {
            self.error = "Couldn’t mail it. Try again."
        }
    }
}
