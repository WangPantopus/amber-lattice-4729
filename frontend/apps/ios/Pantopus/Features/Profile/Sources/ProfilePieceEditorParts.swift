//
//  ProfilePieceEditorParts.swift
//  Pantopus
//
//  The parts of the piece editor (boards 10 and 11): the job or plan it starts from, When and Where, the attachments
//  as they upload, a link's card with "Prove it's yours", "How this piece will show", and proving a page.
//

import SwiftUI

// MARK: - The box around a field

extension View {
    /// The editor's field box: a tap anywhere in it types in the field (KeyboardDismissal.swift).
    func profileEditorBox() -> some View {
        padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(minHeight: 48)
            .typesInFieldOnTap()
            .background(Theme.Color.appSurface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
    }
}

// MARK: - Started from a job or plan

/// Board 10's top: Pantopus has seen this job (or plan), so a piece started from it shows as Seen.
struct ProfileOfferBanner: View {
    let offer: ProfilePieceOfferDTO

    private var isPlan: Bool {
        offer.kind == "plan"
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.s3) {
            ProfileInkGlyph(ink: .seen)
            VStack(alignment: .leading, spacing: Spacing.s2) {
                (Text(isPlan ? "Pantopus has seen this plan. " : "Pantopus has seen this job. ").bold()
                    + Text(offer.text + " A piece started from it shows as Seen."))
                    .scaledFont(14)
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                // A job's title is its poster's words: shown here to the owner, never put on the piece.
                if !isPlan, !offer.title.isEmpty {
                    Text("The job: \(offer.title)")
                        .scaledFont(13)
                        .foregroundStyle(Theme.Color.appTextStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 6) {
                    Icon(.check, size: 14, strokeWidth: 2.5, color: Theme.Color.appSurface)
                    Text(isPlan ? "Started from this plan" : "Started from this job")
                        .scaledFont(13, weight: .semibold)
                        .foregroundStyle(Theme.Color.appSurface)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Theme.Color.primary600, in: Capsule())
                .environment(\.colorScheme, .light)
            }
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.infoBg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.Color.info.opacity(0.25), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - When and Where

struct ProfileWhenWhere: View {
    @Bindable var model: ProfilePieceEditorModel

    /// The phone's own calendar and language: a calendar made without a locale names months "M01".
    private static let monthNames = Calendar.current.standaloneMonthSymbols

    private var years: [Int] {
        let now = Calendar.current.component(.year, from: Date())
        return Array((now - 60)...now).reversed()
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: Spacing.s3) { when
                where_
            }
            VStack(alignment: .leading, spacing: Spacing.s4) { when
                where_
            }
        }
    }

    /// "August 2026": one field, as board 10 draws it; a menu picks the month and the year.
    private var whenText: String {
        guard let month = model.month, let year = model.year else { return "Month and year" }
        return "\(Self.monthNames[month - 1]) \(String(year))"
    }

    private var when: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("When").scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
            Menu {
                Picker("Month", selection: $model.month) {
                    ForEach(1...12, id: \.self) { month in
                        Text(Self.monthNames[month - 1]).tag(Int?.some(month))
                    }
                }
                .pickerStyle(.menu)
                Picker("Year", selection: $model.year) {
                    ForEach(years, id: \.self) { year in
                        Text(verbatim: String(year)).tag(Int?.some(year))
                    }
                }
                .pickerStyle(.menu)
                if model.month != nil || model.year != nil {
                    Button("No month", role: .destructive) {
                        model.month = nil
                        model.year = nil
                    }
                }
            } label: {
                HStack {
                    Text(whenText)
                        .scaledFont(16)
                        .foregroundStyle(model.month == nil ? Theme.Color.appTextMuted : Theme.Color.appText)
                    Spacer(minLength: Spacing.s2)
                    Icon(.chevronDown, size: 16, color: Theme.Color.appTextSecondary)
                }
                .profileEditorBox()
                .contentShape(Rectangle())
            }
            .accessibilityLabel("When, \(whenText)")
            .onChange(of: model.month) { _, month in
                // Picking a month first fills this year, so the field always reads as a month and a year.
                if month != nil, model.year == nil { model.year = Calendar.current.component(.year, from: Date()) }
                model.refreshPreview()
            }
            .onChange(of: model.year) { _, year in
                if year != nil, model.month == nil { model.month = 1 }
                model.refreshPreview()
            }
        }
    }

    private var where_: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Where").scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
            TextField("Camas, WA", text: $model.place)
                .textContentType(.addressCityAndState)
                .submitLabel(.done)
                .profileEditorBox()
            if model.placeHasNumber {
                Text("City and state only: no numbers, never the address")
                    .scaledFont(12, weight: .semibold)
                    .foregroundStyle(Theme.Color.error)
            } else {
                Text("City only, never the address")
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
    }
}

// MARK: - Attachments

/// What the piece holds, as it uploads: each with a way to take it off.
struct ProfileEditorAttachments: View {
    let model: ProfilePieceEditorModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.s2) {
                ForEach(model.attachments) { item in
                    tile(item)
                }
            }
        }
        ForEach(model.attachments.filter { if case .failed = $0.state { true } else { false } }) { item in
            if case let .failed(message) = item.state {
                Text(message).scaledFont(13).foregroundStyle(Theme.Color.error)
            }
        }
    }

    private func tile(_ item: ProfilePieceEditorModel.Attachment) -> some View {
        ZStack(alignment: .topTrailing) {
            ZStack {
                switch item.kind {
                case "photo":
                    if let picked = item.picked {
                        Image(uiImage: picked).resizable().scaledToFill()
                    } else {
                        ProfilePiecePicture(url: item.thumbnailURL ?? item.url)
                    }
                case "video":
                    ProfileVideoBackdrop(url: item.thumbnailURL)
                    ProfilePlayMark(size: 24)
                default:
                    Theme.Color.appSurfaceSunken
                    Icon(.fileText, size: 22, color: Theme.Color.appTextSecondary)
                }
                if item.state == .uploading {
                    Theme.Color.appSurface.opacity(0.6)
                    ProgressView()
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            Button { model.remove(item) } label: {
                Icon(.x, size: 12, strokeWidth: 2.5, color: Theme.Color.appSurface)
                    .frame(width: 22, height: 22)
                    .background(Theme.Color.appText, in: Circle())
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .offset(x: 12, y: -12)
            .accessibilityLabel("Take off this \(item.kind)")
        }
        .padding(.top, 10)
        .padding(.trailing, 10)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(item.state == .uploading ? "\(item.kind.capitalized), uploading" : item.kind.capitalized)
    }
}

// MARK: - A link's card in the editor (board 10, board 11)

struct ProfileEditorLinkCard: View {
    let link: ProfilePieceEditorModel.Link
    let onProve: () -> Void
    let onRemove: () -> Void

    /// The server's card, or one made from the preview's words until the piece is saved.
    private var card: ProfilePieceReadDTO.LinkCard? {
        link.card
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            if let card {
                ProfileLinkCardView(card: card)
            } else {
                pending
            }
            HStack(spacing: Spacing.s2) {
                if (card?.ink ?? "said") != "seen", card?.provable ?? true {
                    Button("Prove it's yours", action: onProve)
                        .scaledFont(14, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .background(Theme.Color.appSurfaceSunken, in: Capsule())
                }
                Spacer(minLength: 0)
                Button("Take off", role: .destructive, action: onRemove)
                    .scaledFont(14)
                    .frame(minHeight: 44)
            }
        }
        .padding(Spacing.s3)
        .background(Theme.Color.appSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
    }

    /// Before the save: the page's words as the preview read them, Said until proven.
    private var pending: some View {
        let host = URL(string: link.url)?.host?.replacingOccurrences(of: "www.", with: "") ?? link.url
        return VStack(alignment: .leading, spacing: 3) {
            Text("LINK · \(host.uppercased())")
                .scaledFont(11, weight: .semibold)
                .tracking(0.6)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .lineLimit(1)
            Text(link.preview?.title ?? host)
                .scaledFont(15, weight: .semibold)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
            if let words = link.preview?.description {
                Text(words).scaledFont(13).foregroundStyle(Theme.Color.appTextStrong).lineLimit(3)
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                ProfileInkGlyph(ink: .said, size: 9)
                Text("Said, until you prove the page is yours")
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - How this piece will show

struct ProfileHowItWillShow: View {
    let lines: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            ProfileBlockTitle(title: "How this piece will show")
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    // An ink line repeats its word with the mark; any other line ("Shows to anyone…") gets none.
                    if let ink = Self.ink(of: line) {
                        ProfileInkGlyph(ink: ink)
                    } else {
                        Icon(.eye, size: 12, color: Theme.Color.appTextSecondary).frame(minWidth: 10)
                    }
                    Text(line)
                        .scaledFont(14)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// The server's lines start with their ink ("Seen: …", "Signed by …", "Said: …"); the mark repeats the word.
    static func ink(of line: String) -> ProfileInk? {
        if line.hasPrefix("Seen") { return .seen }
        if line.hasPrefix("Signed") { return .signed }
        if line.hasPrefix("Said") { return .said }
        return nil
    }
}

// MARK: - Proving a page (board 11)

/// "Prove it's yours": the line to put on the page, then "Check now". Pushed inside the editor's own stack.
struct ProfileLinkProofView: View {
    let model: ProfilePieceEditorModel
    let link: ProfilePieceEditorModel.Link

    @State private var proof: ProfileLinkProofDTO?
    @State private var linkId: String?
    @State private var checking = false
    @State private var answer: String?
    @State private var proven = false
    @State private var copied: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                Text("Prove the page is yours")
                    .scaledFont(22, weight: .bold)
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                Text(link.url)
                    .scaledFont(14)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .textSelection(.enabled)
                if let proof {
                    if let how = proof.how {
                        Text(how).scaledFont(15).foregroundStyle(Theme.Color.appText).fixedSize(horizontal: false, vertical: true)
                    }
                    copyRow(proof.line, label: "For the page's title or description")
                    if let meta = proof.meta {
                        copyRow(meta, label: "For your own site")
                    }
                    if proven {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            ProfileInkGlyph(ink: .seen)
                            Text("Seen: the page carries your line. The card shows it.")
                                .scaledFont(15, weight: .semibold)
                                .foregroundStyle(Theme.Color.appText)
                        }
                        PrimaryButton(title: "Done") { dismiss() }
                    } else {
                        if let answer {
                            Text(answer).scaledFont(14).foregroundStyle(Theme.Color.appTextStrong)
                        }
                        PrimaryButton(title: "Check now", isLoading: checking, isEnabled: linkId != nil) {
                            guard let linkId else { return }
                            checking = true
                            defer { checking = false }
                            answer = await model.check(linkId: linkId)
                            proven = answer == nil
                        }
                    }
                } else if let problem = model.problem {
                    Text(problem).scaledFont(14).foregroundStyle(Theme.Color.error)
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
                Text("No picture is loaded from the page itself, so the site never learns who looked.")
                    .scaledFont(13)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .padding(.top, Spacing.s2)
            }
            .padding(Spacing.s4)
        }
        .background(Theme.Color.appBg)
        .navigationTitle("Prove it's yours")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard proof == nil, let got = await model.proof(for: link) else { return }
            proof = got.0
            linkId = got.linkId
        }
    }

    private func copyRow(_ text: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text(label).scaledFont(13, weight: .semibold).foregroundStyle(Theme.Color.appTextSecondary)
            HStack(spacing: Spacing.s2) {
                Text(text)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(Theme.Color.appText)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button(copied == text ? "Copied" : "Copy") {
                    UIPasteboard.general.string = text
                    copied = text
                }
                .scaledFont(14, weight: .semibold)
                .frame(minWidth: 44, minHeight: 44)
            }
            .padding(Spacing.s3)
            .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

// MARK: - The owner's top of Work

/// Your own Work: the jobs and plans Pantopus saw that aren't a piece yet, one tap to start one, and "Add a piece"
/// (SPEC 2A). The only thing on Work while it is empty.
struct ProfileOwnerWorkCard: View {
    let mine: ProfileMyPiecesDTO
    let onStart: (ProfilePieceEditorStart) -> Void

    var body: some View {
        ProfileBlockCard(padded: false) {
            ProfileBlockTitle(title: "Your work")
                .padding(.horizontal, Spacing.s4)
                .padding(.top, 14)
                .padding(.bottom, Spacing.s1)
            ForEach(mine.offered) { offer in
                ProfileTileRow(
                    tile: ProfileTile(icon: offer.kind == "plan" ? .calendar : .briefcase, tint: .work),
                    title: offer.text,
                    detail: "Make it a piece: it shows as Seen"
                ) { onStart(.offer(offer)) }
                    .accessibilityIdentifier("profileOffer_\(offer.id)")
                ProfileRowDivider()
            }
            ProfileTileRow(
                tile: ProfileTile(icon: .plus, tint: .work),
                title: "Add a piece",
                detail: "Something you did, built or own, with photos, video, documents and links"
            ) { onStart(.new) }
                .accessibilityIdentifier("profileAddPiece")
        }
    }
}
