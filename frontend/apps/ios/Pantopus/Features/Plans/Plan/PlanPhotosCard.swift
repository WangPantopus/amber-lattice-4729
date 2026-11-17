//
//  PlanPhotosCard.swift
//  Pantopus
//
//  Plans for the holidays, photos afterwards on the page of a plan that is over (08-extras section 5, board 29):
//  "Photos" with "23 from 5 people", a grid four across, "Add yours" (the photo picker, several at once) and "Only the
//  people who came can see these. They stay with the plan." Tapping a picture opens it full screen, with "Remove" for
//  whoever added it and the host. Pictures load only by their signed links and stay in memory, never on disk; the
//  grid is read again once the links run out.
//

import PhotosUI
import SwiftUI

struct PlanPhotosCard: View {
    let planId: String
    let photos: PlanPhotosCardDTO
    var api: APIClient = .shared

    @State private var grid: PlanPhotosGridDTO?
    /// When the grid's links stop working.
    @State private var linksEnd = Date.distantPast
    @State private var picked: [PhotosPickerItem] = []
    @State private var adding: (done: Int, of: Int)?
    @State private var open: PlanPhotoDTO?
    @State private var line: String?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: Spacing.s2), count: 4)

    var body: some View {
        PlanCardBox(padding: 14) {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline) {
                        title
                        Spacer(minLength: Spacing.s2)
                        count
                    }
                    VStack(alignment: .leading, spacing: Spacing.s1) {
                        title
                        count
                    }
                }
                .accessibilityElement(children: .combine)
                if let pictures = grid?.photos, !pictures.isEmpty {
                    LazyVGrid(columns: columns, spacing: Spacing.s2) {
                        ForEach(pictures) { photo in
                            Button { open = photo } label: { PlanPhotoTile(photo: photo) }
                                .buttonStyle(.plain)
                                .accessibilityLabel(photo.byName.map { "Photo from \($0)" } ?? "Photo")
                                .accessibilityHint("Opens it")
                                .accessibilityIdentifier("planPhoto")
                        }
                    }
                }
                if grid?.canAdd ?? photos.canAdd { addButton }
                if let line {
                    Text(line)
                        .planFont(.footnote)
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("planPhotosError")
                }
                if let note = grid?.note ?? photos.note { PlanScopeLine(text: note) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planPhotosCard")
        .task { await loadIfNeeded() }
        .onChange(of: picked) { _, items in add(items) }
        .fullScreenCover(item: $open) { photo in
            PlanPhotoViewer(photo: photo, onRemove: photo.canRemove ? { remove(photo) } : nil) { open = nil }
        }
    }

    private var title: some View {
        Text("Photos").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
    }

    private var count: some View {
        Text(grid?.text ?? photos.text)
            .planFont(.small)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .accessibilityIdentifier("planPhotosCount")
    }

    private var addButton: some View {
        PhotosPicker(selection: $picked, maxSelectionCount: 10, matching: .images) {
            PlanButtonLabel(
                title: adding.map { "Adding \($0.done + 1) of \($0.of)" } ?? "Add yours",
                icon: .image,
                kind: .primary,
                isLoading: adding != nil
            )
        }
        .planButton(.primary, size: .small)
        .disabled(adding != nil)
        .accessibilityIdentifier("planPhotosAdd")
    }

    /// Reads the grid when there is none yet or its links have run out.
    private func loadIfNeeded() async {
        guard grid == nil || Date() >= linksEnd else { return }
        do {
            let answer: PlanPhotosGridDTO = try await api.request(PlansEndpoints.planPhotos(planId: planId))
            show(answer)
        } catch is CancellationError {
        } catch {
            line = PlanErrors.sentence(for: error)
        }
    }

    private func show(_ answer: PlanPhotosGridDTO) {
        grid = answer
        // A minute early, so a picture opened near the end still loads.
        linksEnd = Date().addingTimeInterval(TimeInterval(max(answer.expiresIn - 60, 30)))
    }

    /// Each picture as its own call, in the order picked; the first refusal stops the rest and shows its sentence.
    private func add(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty, adding == nil else { return }
        Task {
            line = nil
            for (index, item) in items.enumerated() {
                adding = (index, items.count)
                do {
                    guard let data = try await item.loadTransferable(type: Data.self),
                          let jpeg = PlanPhotoPrep.jpeg(from: data) else { continue }
                    let answer = try await MultipartUploader.shared.uploadPlanPhoto(planId: planId, jpeg: jpeg)
                    show(answer)
                } catch {
                    line = PlanErrors.sentence(for: error)
                    break
                }
            }
            adding = nil
            picked = []
            PlansStoreReads.changed(planId: planId)
        }
    }

    private func remove(_ photo: PlanPhotoDTO) {
        open = nil
        Task {
            do {
                let answer: PlanPhotosGridDTO = try await api.request(PlansEndpoints.removePlanPhoto(planId: planId, photoId: photo.id))
                show(answer)
                PlansStoreReads.changed(planId: planId)
            } catch {
                line = PlanErrors.sentence(for: error)
            }
        }
    }
}

/// One square of the grid: the picture's small copy, by its signed link, kept in memory only.
private struct PlanPhotoTile: View {
    let photo: PlanPhotoDTO
    @State private var image: UIImage?

    var body: some View {
        RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
            .fill(Theme.Color.appSurfaceSunken)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
            .task(id: photo.id) {
                guard let url = URL(string: photo.thumbUrl ?? photo.url) else { return }
                image = await PantopusImagePipeline.shared.image(for: url, keepsOnDisk: false, maxPixelSize: 300)
            }
    }
}

/// A picture full screen, with "Remove" for whoever added it and the host.
private struct PlanPhotoViewer: View {
    let photo: PlanPhotoDTO
    let onRemove: (() -> Void)?
    let onClose: () -> Void

    @State private var image: UIImage?
    @State private var asksRemove = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onClose) { Icon(.x, size: 22, color: Theme.Color.appText) }
                    .frame(width: 44, height: 44)
                    .accessibilityLabel("Close")
                    .accessibilityIdentifier("planPhotoClose")
                Spacer()
                if onRemove != nil {
                    Button("Remove") { asksRemove = true }
                        .planButton(.textDanger, size: .small)
                        .fixedSize()
                        .accessibilityLabel("Remove this photo")
                        .accessibilityIdentifier("planPhotoRemove")
                }
            }
            .padding(.horizontal, Spacing.s3)
            Spacer(minLength: 0)
            Group {
                if let image {
                    Image(uiImage: image).resizable().scaledToFit()
                } else {
                    Shimmer(width: nil, height: 300, cornerRadius: Radii.md)
                }
            }
            .accessibilityLabel(photo.byName.map { "Photo from \($0)" } ?? "Photo")
            Spacer(minLength: 0)
            if let name = photo.byName {
                Text(name)
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .padding(.bottom, Spacing.s4)
            }
        }
        .background(Theme.Color.appBg)
        .task {
            guard let url = URL(string: photo.url) else { return }
            image = await PantopusImagePipeline.shared.image(for: url, keepsOnDisk: false, maxPixelSize: 2048)
        }
        .confirmationDialog("Remove this photo?", isPresented: $asksRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { onRemove?() }
            Button("Cancel", role: .cancel) {}
        }
        .accessibilityIdentifier("planPhotoViewer")
    }
}

/// A picked picture as a JPEG for the upload: at most 4096 px on its longer side, under the server's 10 MB.
enum PlanPhotoPrep {
    static func jpeg(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height) * image.scale
        guard longest > 4096 else { return image.jpegData(compressionQuality: 0.85) }
        let ratio = 4096 / longest
        let size = CGSize(width: image.size.width * image.scale * ratio, height: image.size.height * image.scale * ratio)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.85)
    }
}
