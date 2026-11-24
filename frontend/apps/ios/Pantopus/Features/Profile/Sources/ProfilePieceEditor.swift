//
//  ProfilePieceEditor.swift
//  Pantopus
//
//  "New piece" and "Change piece" (board 10): the job or plan it starts from, what was done or built, the kind, when
//  and where (city only), up to twelve photos, videos, documents and links, the person's own words, who sees it,
//  pinned or hidden, and "How this piece will show" as the server words it. Always pushed (from the owner's Work in
//  the profile's own stack, or inside an opened piece's sheet), never presented from a cover.
//

import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct ProfilePieceEditor: View {
    enum Outcome {
        case saved
        case removed
        case cancelled
    }

    let onFinished: (Outcome) -> Void

    @State var model: ProfilePieceEditorModel
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var videoItem: [PhotosPickerItem] = []
    @State private var pickingPhotos = false
    @State private var pickingVideo = false
    @State private var pickingDocument = false
    @State private var pastedLink = ""
    @State var newSkill = ""
    @State private var confirmingDiscard = false
    @State private var confirmingRemove = false
    @State private var proving: ProfilePieceEditorModel.Link?
    @FocusState private var linkFocused: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    init(start: ProfilePieceEditorStart, onFinished: @escaping (Outcome) -> Void) {
        _model = State(initialValue: ProfilePieceEditorModel(start: start))
        self.onFinished = onFinished
    }

    var body: some View {
        ScrollView {
            if model.loading {
                VStack(alignment: .leading, spacing: Spacing.s3) {
                    Shimmer(height: 52, cornerRadius: Radii.md)
                    Shimmer(height: 52, cornerRadius: Radii.md)
                    Shimmer(height: 120, cornerRadius: Radii.md)
                }
                .padding(Spacing.s4)
                .accessibilityHidden(true)
            } else if model.loadFailed {
                VStack(spacing: Spacing.s3) {
                    Text("Couldn't open this piece").scaledFont(17, weight: .semibold).foregroundStyle(Theme.Color.appText)
                    PrimaryButton(title: "Try again") { await model.load() }
                }
                .padding(Spacing.s6)
            } else {
                form
            }
        }
        .background(Theme.Color.appBg)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { bottomBar }
        .navigationTitle(model.isNew ? "New piece" : "Change piece")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    if model.isDirty { confirmingDiscard = true } else { onFinished(.cancelled) }
                } label: {
                    Icon(.x, size: 20, strokeWidth: 2.25, color: Theme.Color.appText).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Close")
            }
            if model.isNew || model.isDraft {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save draft") {
                        Task { if await model.save(draft: true) { onFinished(.saved) } }
                    }
                    .disabled(!model.canSave)
                }
            }
        }
        .navigationDestination(item: $proving) { link in
            ProfileLinkProofView(model: model, link: link)
        }
        .confirmationDialog("Leave without saving?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
            Button("Leave without saving", role: .destructive) { onFinished(.cancelled) }
            Button("Keep changing", role: .cancel) {}
        }
        .confirmationDialog("Remove this piece?", isPresented: $confirmingRemove, titleVisibility: .visible) {
            Button("Remove piece", role: .destructive) {
                Task { if await model.remove() { onFinished(.removed) } }
            }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("It goes from your Work, and the files only it holds go with it.")
        }
        .photosPicker(isPresented: $pickingPhotos, selection: $photoItems, maxSelectionCount: max(1, room), matching: .images)
        .photosPicker(isPresented: $pickingVideo, selection: $videoItem, maxSelectionCount: 1, matching: .videos)
        .fileImporter(isPresented: $pickingDocument, allowedContentTypes: allowedUploadTypes) { result in
            if case let .success(url) = result { attachDocument(url) }
        }
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            photoItems = []
            for item in items {
                attach(item, kind: "photo")
            }
        }
        .onChange(of: videoItem) { _, items in
            guard let item = items.first else { return }
            videoItem = []
            attach(item, kind: "video")
        }
        .task { await model.load() }
        .accessibilityIdentifier("profilePieceEditor")
    }

    private var room: Int {
        ProfilePieceEditorModel.attachmentsMost - model.count
    }

    // MARK: The form

    private var form: some View {
        VStack(alignment: .leading, spacing: Spacing.s5) {
            if let offer = model.offer {
                ProfileOfferBanner(offer: offer)
            }
            field("What did you do or build?", counter: "\(model.title.count) of \(ProfilePieceEditorModel.titleMost)") {
                TextField("Rebuilt a 1912 porch", text: $model.title)
                    .textInputAutocapitalization(.sentences)
                    .submitLabel(.done)
                    .onChange(of: model.title) { _, value in
                        if value.count > ProfilePieceEditorModel.titleMost {
                            model.title = String(value.prefix(ProfilePieceEditorModel.titleMost))
                        }
                        model.refreshPreview()
                    }
                    .profileEditorBox()
            }
            field("Kind") {
                Picker("Kind", selection: $model.kind) {
                    Text("Did").tag(String?.some("did"))
                    Text("Built").tag(String?.some("built"))
                    Text("Owns").tag(String?.some("owns"))
                }
                .pickerStyle(.segmented)
                .onChange(of: model.kind) { _, _ in model.refreshPreview() }
            }
            ProfileWhenWhere(model: model)
            showIt
            skills
            field("In your words", counter: "\(model.words.count) of \(ProfilePieceEditorModel.wordsMost)") {
                TextField("What you did, how, and what it took", text: $model.words, axis: .vertical)
                    .lineLimit(4...10)
                    .profileSaidFont()
                    .onChange(of: model.words) { _, value in
                        if value.count > ProfilePieceEditorModel.wordsMost {
                            model.words = String(value.prefix(ProfilePieceEditorModel.wordsMost))
                        }
                        model.refreshPreview()
                    }
                    .profileEditorBox()
            }
            whoSees
            if !model.howItWillShow.isEmpty {
                ProfileHowItWillShow(lines: model.howItWillShow)
            }
            if let problem = model.problem {
                Text(problem)
                    .scaledFont(14)
                    .foregroundStyle(Theme.Color.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            if !model.isNew {
                PantopusButton(title: "Remove piece", kind: .destructive, isLoading: model.removing) {
                    confirmingRemove = true
                }
            }
        }
        .padding(Spacing.s4)
    }

    private var bottomBar: some View {
        PrimaryButton(
            title: model.isNew || model.isDraft ? "Add to Work" : "Save changes",
            isLoading: model.saving,
            isEnabled: model.canSave
        ) {
            if await model.save(draft: false) { onFinished(.saved) }
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .background(Theme.Color.appBg)
    }

    // MARK: Show it

    private var showIt: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(alignment: .firstTextBaseline) {
                Text("Show it").scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                Spacer()
                Text("\(model.count) of \(ProfilePieceEditorModel.attachmentsMost) added")
                    .scaledFont(13)
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
            // Four in a row as board 10; two by two at the largest text sizes.
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.s2), count: typeSize.isAccessibilitySize ? 2 : 4),
                spacing: Spacing.s2
            ) {
                adder("Photos", icon: .image) { pickingPhotos = true }
                adder("Video", icon: .video) { pickingVideo = true }
                adder("Document", icon: .fileText) { pickingDocument = true }
                adder("Link", icon: .link) { linkFocused = true }
            }
            if !model.attachments.isEmpty {
                ProfileEditorAttachments(model: model)
            }
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text("A link").scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                HStack(spacing: Spacing.s2) {
                    TextField("yoursite.example/your-work", text: $pastedLink)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .focused($linkFocused)
                        .onSubmit(addLink)
                        .profileEditorBox()
                    if !pastedLink.isEmpty {
                        Button("Add", action: addLink)
                            .scaledFont(15, weight: .semibold)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                }
                ForEach(model.links) { link in
                    ProfileEditorLinkCard(link: link, onProve: { proving = link }, onRemove: { model.remove(link) })
                }
            }
        }
    }

    private func adder(_ title: String, icon: PantopusIcon, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Icon(icon, size: 20, color: Theme.Color.appText)
                Text(title).scaledFont(13, weight: .semibold).foregroundStyle(Theme.Color.appText)
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(Theme.Color.appSurface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(room <= 0)
        .accessibilityLabel("Add \(title.lowercased())")
    }

    private func addLink() {
        model.addLink(pastedLink)
        pastedLink = ""
        linkFocused = false
    }

    private func attach(_ item: PhotosPickerItem, kind: String) {
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self) else {
                model.problem = "Couldn't read that \(kind). Check Photos access and try again."
                return
            }
            let type = item.supportedContentTypes.first
            let ext = type?.preferredFilenameExtension ?? (kind == "video" ? "mov" : "jpg")
            let mime = type?.preferredMIMEType ?? (kind == "video" ? "video/quicktime" : "image/jpeg")
            let picture = kind == "photo" ? UIImage(data: data) : nil
            model.attach(
                kind: kind,
                data: data,
                filename: "\(kind)-\(UUID().uuidString.prefix(8)).\(ext)",
                mimeType: mime,
                picture: picture
            )
        }
    }

    private func attachDocument(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            model.problem = "Couldn't read that document."
            return
        }
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        model.attach(kind: "document", data: data, filename: url.lastPathComponent, mimeType: mime, picture: nil)
    }

    func field(_ label: String, counter: String? = nil, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                Spacer()
                if let counter {
                    Text(counter).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            content()
        }
    }
}

// MARK: - Skills and who sees it

extension ProfilePieceEditor {
    // MARK: Skills

    var skills: some View {
        field("Skills it shows", counter: "\(model.skills.count) of \(ProfilePieceEditorModel.skillsMost)") {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                if !model.skills.isEmpty {
                    ProfileWrapLayout(spacing: Spacing.s2) {
                        ForEach(model.skills, id: \.self) { skill in
                            Button {
                                model.skills.removeAll { $0 == skill }
                                model.refreshPreview()
                            } label: {
                                HStack(spacing: 6) {
                                    Text(skill).scaledFont(13, weight: .semibold)
                                    Icon(.x, size: 12, color: Theme.Color.business)
                                }
                                .foregroundStyle(Theme.Color.business)
                                .padding(.horizontal, 12)
                                .frame(minHeight: 36)
                                .background(Theme.Color.businessBg, in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(skill). Remove")
                        }
                    }
                }
                if model.skills.count < ProfilePieceEditorModel.skillsMost {
                    TextField("Add a skill, like Finish carpentry", text: $newSkill)
                        .submitLabel(.done)
                        .onSubmit {
                            let skill = newSkill.trimmingCharacters(in: .whitespacesAndNewlines)
                            if !skill.isEmpty, !model.skills.contains(skill) { model.skills.append(String(skill.prefix(60))) }
                            newSkill = ""
                            model.refreshPreview()
                        }
                        .profileEditorBox()
                }
            }
        }
    }

    // MARK: Who sees it

    var whoSees: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Who sees it").scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
            Picker("Who sees it", selection: $model.audience) {
                ForEach(ProfilePieceEditorModel.Audience.allCases) { audience in
                    Text(audience.words).tag(audience)
                }
            }
            .pickerStyle(.menu)
            .tint(Theme.Color.appText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .profileEditorBox()
            .onChange(of: model.audience) { _, _ in model.refreshPreview() }
            Text("Never wider than who sees your Work in Share your profile.")
                .scaledFont(12)
                .foregroundStyle(Theme.Color.appTextSecondary)
            Toggle("Pin to the top of Work", isOn: $model.pinned)
                .scaledFont(15)
                .tint(Theme.Color.primary600)
                .frame(minHeight: 44)
            Toggle("Hide it from everyone else", isOn: $model.hidden)
                .scaledFont(15)
                .tint(Theme.Color.primary600)
                .frame(minHeight: 44)
                .onChange(of: model.hidden) { _, _ in model.refreshPreview() }
        }
    }
}
