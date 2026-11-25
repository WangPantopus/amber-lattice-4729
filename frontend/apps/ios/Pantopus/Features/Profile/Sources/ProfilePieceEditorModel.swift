//
//  ProfilePieceEditorModel.swift
//  Pantopus
//
//  Adding and changing a piece (board 10; CONTRACT P2.3, P2.4): its fields, its attachments uploaded through today's
//  `POST /api/files/portfolio` the moment they are picked, its links (cards made by the server, words only), "How this
//  piece will show" as the server words it, and saving as a draft, adding it to Work, or removing it.
//

import Foundation
import Logging
import Observation
import UIKit

/// Where the editor starts: a new piece, one started from a job or plan, or a piece being changed.
public enum ProfilePieceEditorStart: Hashable, Sendable {
    case new
    case offer(ProfilePieceOfferDTO)
    case change(pieceId: String)
}

extension Notification.Name {
    /// A piece was made, changed or removed: the owner's page reads itself again.
    static let profilePiecesChanged = Notification.Name("profilePiecesChanged")
}

@Observable
@MainActor
final class ProfilePieceEditorModel {
    /// A photo, video or document on the piece: uploaded at once, attached by its file id on save.
    struct Attachment: Identifiable, Hashable {
        enum State: Hashable {
            case uploading
            case ready
            case failed(String)
        }

        let id: String
        /// photo | video | document
        let kind: String
        var fileId: String?
        var url: URL?
        var thumbnailURL: URL?
        var picked: UIImage?
        var title: String?
        var state: State
    }

    /// A link on the piece: its card once the server has read it, else the words the preview found.
    struct Link: Identifiable, Hashable {
        let id: String
        let url: String
        var card: ProfilePieceReadDTO.LinkCard?
        var preview: LinkPreviewDTO?
    }

    enum Audience: String, CaseIterable, Identifiable {
        case anyone, members, connections

        var id: String {
            rawValue
        }

        var words: String {
            switch self {
            case .anyone: "Anyone with your link"
            case .members: "People on Pantopus"
            case .connections: "Your connections"
            }
        }
    }

    static let titleMost = 60
    static let wordsMost = 280
    static let attachmentsMost = 12
    static let skillsMost = 5

    let start: ProfilePieceEditorStart
    var pieceId: String?
    private(set) var loading = false
    private(set) var loadFailed = false
    private(set) var isDraft = true
    private(set) var saving = false
    private(set) var removing = false
    var howItWillShow: [String] = []
    /// The server's own sentence when a save is refused.
    var problem: String?

    var title = ""
    /// None until the person taps one (as on the web), so a piece is never labelled by accident.
    var kind: String?
    /// The month and year of "When"; nil until picked.
    var month: Int?
    var year: Int?
    /// "Camas, WA": city and state only.
    var place = ""
    var words = ""
    var skills: [String] = []
    var audience: Audience = .anyone
    var pinned = false
    var hidden = false
    /// Your own part on the piece ("Lead carpenter"), shown first in "Who was on it".
    var ownerRole = ""
    /// Who was on it (the server's ties on): each with its status; and who to suggest naming.
    var credits: [ProfileCreditDTO] = []
    var suggested: [ProfileSuggestedCreditDTO] = []
    private(set) var attachments: [Attachment] = []
    var links: [Link] = []

    let client: APIClient
    private let uploader: MultipartUploader
    private let logger = Logger(label: "app.pantopus.ios.ProfilePieceEditor")
    @ObservationIgnored private var previewTask: Task<Void, Never>?
    @ObservationIgnored private var loadedBody: ProfilePieceBody?

    init(start: ProfilePieceEditorStart, client: APIClient = .shared, uploader: MultipartUploader = .shared) {
        self.start = start
        self.client = client
        self.uploader = uploader
        switch start {
        case .new:
            break
        case let .offer(offer):
            // A job's title is the poster's words: the piece starts without one. A plan's is the host's own.
            if offer.kind == "plan" { title = String(offer.title.prefix(Self.titleMost)) }
            suggested = offer.suggestedCredits
        case let .change(pieceId):
            self.pieceId = pieceId
            isDraft = false
        }
    }

    var isNew: Bool {
        if case .change = start { return pieceId == nil }
        return pieceId == nil
    }

    var offer: ProfilePieceOfferDTO? {
        if case let .offer(offer) = start { return offer }
        return nil
    }

    var count: Int {
        attachments.count + links.count
    }

    /// A place is a city and state, never an address: anything with a number in it is refused.
    var placeHasNumber: Bool {
        place.rangeOfCharacter(from: .decimalDigits) != nil
    }

    var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !placeHasNumber
            && !attachments.contains { $0.state == .uploading }
            && !saving && !removing
    }

    /// Something changed since it was loaded (or anything entered on a new piece).
    var isDirty: Bool {
        if let loadedBody { return body(draft: nil) != loadedBody }
        return !title.isEmpty || !words.isEmpty || !attachments.isEmpty || !links.isEmpty || offer != nil
    }

    private var ownerId: String? {
        if case let .signedIn(user) = AuthManager.shared.state { return user.id }
        return nil
    }

    // MARK: Loading a piece to change

    func load() async {
        guard case let .change(pieceId) = start, let ownerId else { return }
        loading = true
        loadFailed = false
        defer { loading = false }
        do {
            let read: ProfilePieceReadDTO = try await client.request(
                ProfilePageEndpoints.piece(identifier: ownerId, pieceId: pieceId)
            )
            fill(from: read.piece)
            loadedBody = body(draft: nil)
        } catch {
            logger.info("Piece not loaded: \(error)")
            loadFailed = true
        }
    }

    private func fill(from piece: ProfilePieceReadDTO.Piece) {
        let summary = piece.summary
        title = summary.title
        kind = summary.kind
        if let month = summary.to ?? summary.from {
            let bits = month.split(separator: "-").compactMap { Int($0) }
            if bits.count == 2 {
                year = bits[0]
                self.month = bits[1]
            }
        }
        place = summary.place ?? ""
        words = piece.description?.text ?? ""
        skills = piece.showsCan
        audience = summary.audience.flatMap(Audience.init(rawValue:)) ?? .anyone
        pinned = summary.pinned
        hidden = summary.hidden
        isDraft = summary.draft
        howItWillShow = piece.howItWillShow
        ownerRole = piece.ownerRole ?? ""
        credits = piece.credits
        suggested = piece.suggestedCredits
        attachments = piece.attachments.map { item in
            Attachment(
                id: item.id ?? item.url,
                kind: item.kind,
                fileId: item.id,
                url: URL(string: item.url),
                thumbnailURL: item.thumbnailURL.flatMap(URL.init(string:)),
                picked: nil,
                title: item.title,
                state: .ready
            )
        }
        links = piece.links.map { Link(id: $0.id ?? $0.url, url: $0.url, card: $0, preview: nil) }
    }

    // MARK: Attachments

    /// Uploads a picked file at once through today's portfolio upload; it is attached when the piece is saved.
    func attach(kind: String, data: Data, filename: String, mimeType: String, picture: UIImage?) {
        guard count < Self.attachmentsMost else {
            problem = "A piece holds \(Self.attachmentsMost) attachments at most, files and links together."
            return
        }
        let local = UUID().uuidString
        attachments.append(Attachment(
            id: local, kind: kind, fileId: nil, url: nil, thumbnailURL: nil, picked: picture, title: nil, state: .uploading
        ))
        Task { await upload(local, data: data, filename: filename, mimeType: mimeType) }
    }

    private func upload(_ local: String, data: Data, filename: String, mimeType: String) async {
        do {
            let answer = try await uploader.uploadPortfolio(
                file: MultipartFile(fieldName: "file", filename: filename, mimeType: mimeType, data: data),
                title: filename,
                description: nil,
                category: nil,
                clientRequestId: local
            )
            guard let index = attachments.firstIndex(where: { $0.id == local }) else { return }
            guard let file = answer.file else {
                attachments[index].state = .failed("Couldn't upload that. Try again.")
                return
            }
            attachments[index].fileId = file.id
            attachments[index].url = file.url.flatMap(URL.init(string:))
            attachments[index].state = .ready
            refreshPreview()
        } catch {
            guard let index = attachments.firstIndex(where: { $0.id == local }) else { return }
            attachments[index].state = .failed(Self.sentence(error, otherwise: "Couldn't upload that. Try again."))
        }
    }

    func remove(_ attachment: Attachment) {
        attachments.removeAll { $0.id == attachment.id }
        refreshPreview()
    }

    // MARK: The body

    /// The piece's fields as the server takes them. `draft` nil leaves it out (a preview, or comparing for changes).
    func body(draft: Bool?) -> ProfilePieceBody {
        var body = ProfilePieceBody()
        body.set("title", .text(String(title.prefix(Self.titleMost))))
        body.set("kind", kind.map { .string($0) } ?? .null)
        if let month, let year {
            let value = String(format: "%04d-%02d", year, month)
            body.set("from", .string(value))
            body.set("to", .string(value))
        }
        let parts = place.split(separator: ",", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
        body.set("city", .text(parts.first ?? ""))
        body.set("state", .text(parts.count > 1 ? parts[1] : ""))
        body.set("description", .text(String(words.prefix(Self.wordsMost))))
        if ProfileTies.isOn == true || !ownerRole.isEmpty { body.set("role", .text(String(ownerRole.prefix(40)))) }
        body.set("skills", .strings(Array(skills.prefix(Self.skillsMost))))
        body.set("audience", .string(audience.rawValue))
        body.set("pinned", .bool(pinned))
        body.set("hidden", .bool(hidden))
        body.set("attachments", .objects(attachments.compactMap { $0.fileId.map { ["file_id": $0] } }))
        body.set("links", .objects(links.map { ["url": $0.url] }))
        if let draft { body.set("draft", .bool(draft)) }
        if isNew, let offer { body.set("started_from", .object(["kind": offer.kind, "id": offer.id])) }
        return body
    }

    // MARK: How this piece will show

    /// Asks the server again, a moment after the last change. Only a piece not saved yet: a preview can't carry the
    /// job or plan a saved piece started from, so a saved piece shows the lines its read and each save answer with.
    func refreshPreview() {
        previewTask?.cancel()
        guard pieceId == nil, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let body = body(draft: nil)
        previewTask = Task {
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
            if let answer: ProfilePiecePreviewDTO = try? await client.request(ProfilePageEndpoints.previewPiece(body)),
               !Task.isCancelled {
                howItWillShow = answer.howItWillShow
            }
        }
    }

    // MARK: Saving and removing

    /// Saves the piece: as a draft only its owner sees, or on Work. True when it saved.
    @discardableResult
    func save(draft: Bool) async -> Bool {
        guard canSave else { return false }
        saving = true
        problem = nil
        defer { saving = false }
        do {
            let answer: ProfileOwnedPieceDTO = if let pieceId {
                // A change sends only what changed since the piece was read or last saved.
                try await client.request(ProfilePageEndpoints.updatePiece(
                    id: pieceId,
                    loadedBody.map { body(draft: draft).changes(since: $0) } ?? body(draft: draft)
                ))
            } else {
                try await client.request(ProfilePageEndpoints.createPiece(body(draft: draft)))
            }
            pieceId = answer.id
            isDraft = answer.summary.draft
            howItWillShow = answer.howItWillShow
            await reloadLinks()
            loadedBody = body(draft: nil)
            NotificationCenter.default.post(name: .profilePiecesChanged, object: nil)
            return true
        } catch {
            problem = Self.sentence(error, otherwise: "Couldn't save the piece. Try again.")
            return false
        }
    }

    /// After a save the server's cards carry their ids (for "Prove it's yours").
    private func reloadLinks() async {
        guard let pieceId, let ownerId,
              let read: ProfilePieceReadDTO = try? await client.request(
                  ProfilePageEndpoints.piece(identifier: ownerId, pieceId: pieceId)
              ) else { return }
        links = read.piece.links.map { card in
            let before = links.first { $0.url == card.url }
            return Link(id: card.id ?? card.url, url: card.url, card: card, preview: before?.preview)
        }
        for item in read.piece.attachments {
            if let index = attachments.firstIndex(where: { $0.fileId == item.id }) {
                attachments[index].thumbnailURL = item.thumbnailURL.flatMap(URL.init(string:))
            }
        }
    }

    func remove() async -> Bool {
        guard let pieceId else { return true }
        removing = true
        defer { removing = false }
        do {
            _ = try await client.request(ProfilePageEndpoints.deletePiece(id: pieceId), as: EmptyResponse.self)
            NotificationCenter.default.post(name: .profilePiecesChanged, object: nil)
            return true
        } catch {
            problem = Self.sentence(error, otherwise: "Couldn't remove the piece. Try again.")
            return false
        }
    }

    static func sentence(_ error: any Error, otherwise: String) -> String {
        // The server's own sentence from its `{ error }` body, never the raw JSON.
        if case let APIError.clientError(_, message) = error, let text = APIError.friendlyClientMessage(message) { return text }
        return otherwise
    }
}

// MARK: - Proving a page

extension ProfilePieceEditorModel {
    // MARK: Links

    /// Adds a pasted link. Its card is made by the server when the piece is saved; until then the app's own preview
    /// read (words only) shows what the page is.
    func addLink(_ raw: String) {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        if !text.contains("://") { text = "https://" + text }
        guard let url = URL(string: text), url.scheme == "https" || url.scheme == "http", url.host != nil else {
            problem = "That doesn't look like a link."
            return
        }
        guard count < Self.attachmentsMost else {
            problem = "A piece holds \(Self.attachmentsMost) attachments at most, files and links together."
            return
        }
        guard !links.contains(where: { $0.url == text }) else { return }
        let link = Link(id: UUID().uuidString, url: text, card: nil, preview: nil)
        links.append(link)
        refreshPreview()
        Task {
            let words: LinkPreviewDTO? = try? await client.request(LinkPreviewEndpoints.preview(url: text))
            guard let index = links.firstIndex(where: { $0.id == link.id }) else { return }
            links[index].preview = words
        }
    }

    func remove(_ link: Link) {
        links.removeAll { $0.id == link.id }
        refreshPreview()
    }

    // MARK: Proving a page

    /// The line to put on the page. A piece not saved yet is saved as a draft first, so its link has a card.
    func proof(for link: Link) async -> (ProfileLinkProofDTO, linkId: String)? {
        if link.card?.id == nil {
            guard await save(draft: isDraft) else { return nil }
        }
        guard let pieceId, let card = links.first(where: { $0.url == link.url })?.card, let linkId = card.id else { return nil }
        do {
            let answer: ProfileLinkProofDTO = try await client.request(ProfilePageEndpoints.linkProof(pieceId: pieceId, linkId: linkId))
            return (answer, linkId)
        } catch {
            problem = Self.sentence(error, otherwise: "Couldn't get your line. Try again.")
            return nil
        }
    }

    /// Reads the page for the line. Nil when it is Seen now; else the server's sentence.
    func check(linkId: String) async -> String? {
        guard let pieceId else { return "Save the piece first." }
        do {
            let card: ProfilePieceReadDTO.LinkCard = try await client.request(
                ProfilePageEndpoints.linkCheck(pieceId: pieceId, linkId: linkId)
            )
            if let index = links.firstIndex(where: { $0.card?.id == linkId }) { links[index].card = card }
            NotificationCenter.default.post(name: .profilePiecesChanged, object: nil)
            refreshPreview()
            return nil
        } catch {
            return Self.sentence(error, otherwise: "Couldn't read the page. Try again later.")
        }
    }
}
