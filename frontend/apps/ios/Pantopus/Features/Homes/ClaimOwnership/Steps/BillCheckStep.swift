//
//  BillCheckStep.swift
//  Pantopus
//
//  "Bill check" (FASTVERIFY drawing B1): the residency upload as a photo of a
//  bill that the server reads at once. The same claim, upload and review as
//  today; only the words, the photo and the result are new. The person still
//  may pick a PDF or a picture from Files.
//

import PhotosUI
import SwiftUI
import UIKit

struct BillCheckStep: View {
    @Bindable var viewModel: ClaimOwnershipWizardViewModel
    @State private var showsCamera = false
    @State private var showsFiles = false
    @State private var showsLibrary = false
    @State private var libraryItem: PhotosPickerItem?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            HeadlineBlock("Take a photo of a bill", subtitle: "A utility bill, bank statement or lease from the last 90 days.")
            whatWeRead
            HStack(alignment: .top, spacing: Spacing.s3) {
                Icon(.info, size: 16, color: Theme.Color.primary700)
                    .accessibilityHidden(true)
                Text("You're verified as soon as you use this photo. A person at Pantopus also reviews it afterwards.")
                    .pantopusTextStyle(.caption)
                    .foregroundStyle(Theme.Color.primary700)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(Spacing.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).fill(Theme.Color.infoBg))
            .accessibilityElement(children: .combine)
            HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                Icon(.lock, size: 14, color: Theme.Color.appTextSecondary)
                    .accessibilityHidden(true)
                Text("Cover account numbers if you like. We only read the name, address and date.")
                    .pantopusTextStyle(.caption)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            if let error = viewModel.startLoadError == nil ? viewModel.submitError : nil {
                ClaimUploadErrorBanner(message: error)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fullScreenCover(isPresented: $showsCamera) {
            SystemCameraPicker(isPresented: $showsCamera) { image in use(image) }
                .ignoresSafeArea()
        }
        .fileImporter(isPresented: $showsFiles, allowedContentTypes: [.pdf, .image]) { result in
            guard viewModel.canPick else { return }
            do { try viewModel.picked(.residency, file: ClaimPickedFile.read(result.get())) } catch { viewModel.filePickFailed(error) }
        }
        .photosPicker(isPresented: $showsLibrary, selection: $libraryItem, matching: .images)
        .onChange(of: libraryItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) { use(image) }
                libraryItem = nil
            }
        }
    }

    /// The photo beside the three things the server reads from it.
    private var whatWeRead: some View {
        HStack(alignment: .top, spacing: Spacing.s4) {
            photo
            VStack(alignment: .leading, spacing: Spacing.s3) {
                Text("What we read", style: .overline)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                readRow("Name")
                readRow("Address")
                readRow("Date")
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous).strokeBorder(Theme.Color.appBorder, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("billCheck.whatWeRead")
    }

    private func readRow(_ label: String) -> some View {
        HStack(spacing: Spacing.s2) {
            Icon(.scanLine, size: 14, color: Theme.Color.appTextSecondary)
                .accessibilityHidden(true)
            Text(label)
                .pantopusTextStyle(.body)
                .foregroundStyle(Theme.Color.appText)
        }
    }

    /// "Your photo" until one is chosen; then the photo. A tap offers the camera, the photo library and Files.
    private var photo: some View {
        Menu {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button("Take a photo") { showsCamera = true }
            }
            Button("Choose a photo") { showsLibrary = true }
            Button("Choose a file") { showsFiles = true }
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                    .fill(Theme.Color.appSurfaceSunken)
                if let image = pickedImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
                        .accessibilityLabel("Your photo")
                } else if let name = pickedFileName {
                    Text(name)
                        .pantopusTextStyle(.caption)
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.center)
                        .padding(Spacing.s2)
                } else {
                    RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                        .strokeBorder(Theme.Color.appBorderStrong, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                    Text("Your photo")
                        .pantopusTextStyle(.caption)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .frame(width: 92, height: 120)
            .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .disabled(!viewModel.canPick)
        .accessibilityIdentifier("billCheck.photo")
    }

    private var pickedFile: ClaimPickedFile? {
        switch viewModel.slots[.residency] ?? .empty {
        case let .picked(file), let .uploading(file, _), let .uploaded(file, _), let .failed(file, _): file
        case .empty: nil
        }
    }

    private var pickedImage: UIImage? {
        guard let file = pickedFile, file.mimeType.hasPrefix("image/") else { return nil }
        return UIImage(data: file.data)
    }

    private var pickedFileName: String? {
        pickedFile?.filename
    }

    /// A photo becomes the bill, as a JPEG small enough to send.
    private func use(_ image: UIImage) {
        guard viewModel.canPick, let data = Self.jpeg(image) else { return }
        viewModel.picked(.residency, file: ClaimPickedFile(filename: "bill.jpg", mimeType: "image/jpeg", data: data))
    }

    private static func jpeg(_ image: UIImage) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let scale = longest > 2400 ? 2400 / longest : 1
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let resized = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.85)
    }
}
