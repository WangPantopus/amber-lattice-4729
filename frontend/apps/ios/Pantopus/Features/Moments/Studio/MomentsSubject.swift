//
//  MomentsSubject.swift
//  Pantopus
//
//  "Pulse, reinvented", phase 0 step 4: the photo's subject, lifted on the
//  phone with Apple's Vision (the people, animals and things in front), for
//  words set behind it. It is the picture the marks are on (the photo, or its
//  canvas once placed) with everything but the subject clear, at the same
//  size, so it lines up with the marks wherever they are drawn. Nothing is
//  sent anywhere: like every mark it ends up drawn into the picture that goes
//  up.
//

import CoreImage
import SwiftUI
import UIKit
import Vision

final class MomentsSubject: Equatable, @unchecked Sendable {
    /// The picture with only its subject, the size of the picture it was lifted from.
    let image: UIImage
    /// Where the picture sat on its canvas when it was lifted (nil: not placed): placed again, it is lifted again.
    let placement: MomentPlacement?

    private init(image: UIImage, placement: MomentPlacement?) {
        self.image = image
        self.placement = placement
    }

    static func == (lhs: MomentsSubject, rhs: MomentsSubject) -> Bool {
        lhs === rhs
    }

    /// The subject of `photo` (drawn on its canvas when `placement` is set), off the main thread; nil when Vision finds
    /// none (a landscape, a wall) or can't run here.
    static func lift(
        _ photo: UIImage,
        placement: MomentPlacement?,
        backdrop: MomentPlacement.Backdrop?
    ) async -> MomentsSubject? {
        await Task.detached(priority: .userInitiated) {
            guard let surface = surface(photo, placement: placement, backdrop: backdrop) else { return nil }
            let request = foregroundRequest()
            let handler = VNImageRequestHandler(cgImage: surface, options: [:])
            guard (try? handler.perform([request])) != nil,
                  let observation = request.results?.first,
                  !observation.allInstances.isEmpty,
                  let masked = try? observation.generateMaskedImage(
                      ofInstances: observation.allInstances,
                      from: handler,
                      croppedToInstancesExtent: false
                  ),
                  let image = cgImage(masked)
            else {
                #if targetEnvironment(simulator)
                return standIn(surface, oval: CGRect(x: 0.3, y: 0.35, width: 0.4, height: 0.45)).map {
                    MomentsSubject(image: UIImage(cgImage: $0), placement: placement)
                }
                #else
                return nil
                #endif
            }
            return MomentsSubject(image: UIImage(cgImage: image), placement: placement)
        }.value
    }

    #if targetEnvironment(simulator)
    /// The simulator only: Vision can't run there (no Neural Engine: "Could not create inference context"), so to
    /// try the rest of the Studio a centered oval of the picture stands in for what it would lift. Never in an app
    /// built for a phone.
    static func standIn(_ surface: CGImage, oval: CGRect) -> CGImage? {
        let size = CGSize(width: surface.width, height: surface.height)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            let shape = CGRect(
                x: oval.minX * size.width,
                y: oval.minY * size.height,
                width: oval.width * size.width,
                height: oval.height * size.height
            )
            renderer.cgContext.addEllipse(in: shape)
            renderer.cgContext.clip()
            UIImage(cgImage: surface).draw(in: CGRect(origin: .zero, size: size))
        }.cgImage
    }
    #endif

    /// Vision's request for the things in front. The simulator has no Neural Engine: there it runs on a device Vision
    /// says it supports (a GPU), or lifts nothing.
    static func foregroundRequest() -> VNGenerateForegroundInstanceMaskRequest {
        let request = VNGenerateForegroundInstanceMaskRequest()
        #if targetEnvironment(simulator)
        if let supported = try? request.supportedComputeStageDevices[.main],
           let device = supported.first(where: { if case .gpu = $0 { true } else { false } }) ?? supported.first {
            try? request.setComputeDevice(device, for: .main)
        }
        #endif
        return request
    }

    /// What the marks are on, as one upright picture at scale 1: the photo, or its canvas when placed.
    static func surface(_ photo: UIImage, placement: MomentPlacement?, backdrop: MomentPlacement.Backdrop?) -> CGImage? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        if let placement {
            let size = MomentPlacement.pixels
            let backdrop = backdrop ?? MomentPlacementDrawing.backdrop(of: photo)
            return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
                MomentPlacementDrawing.draw(photo, at: placement, backdrop: backdrop, in: renderer.cgContext, size: size)
            }.cgImage
        }
        let pixels = CGSize(width: photo.size.width * photo.scale, height: photo.size.height * photo.scale)
        let scale = min(1, MomentMarksDrawing.maxPixels / max(pixels.width, pixels.height, 1))
        let size = CGSize(width: max(1, (pixels.width * scale).rounded()), height: max(1, (pixels.height * scale).rounded()))
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            photo.draw(in: CGRect(origin: .zero, size: size))
        }.cgImage
    }

    static func cgImage(_ buffer: CVPixelBuffer) -> CGImage? {
        let image = CIImage(cvPixelBuffer: buffer)
        return CIContext(options: [.cacheIntermediates: false]).createCGImage(image, from: image.extent)
    }
}

extension MomentMarks {
    /// Words set behind the subject, which are drawn under it.
    var hasBehind: Bool {
        labels.contains(where: \.behind)
    }

    /// Something only the Studio makes is in these marks (its lines, words behind the subject, cutouts).
    var isStudio: Bool {
        strokes.contains(where: \.isStudio) || hasBehind || !cutouts.isEmpty
    }
}

// MARK: - Words behind the subject in the Studio's Text

extension MomentsMarking {
    /// Behind the subject on or off for one label. On, the subject is lifted first when there isn't one for the
    /// picture as it sits now; when Vision finds none, the words stay in front and the editor says why.
    func setBehind(_ id: UUID, _ behind: Bool, photo: UIImage) {
        studio?.noSubject = false
        update(id) { $0.behind = behind }
        if behind { liftSubject(photo: photo) }
    }

    /// Lifts the subject of the picture as it sits now, unless it's there already or being lifted.
    func liftSubject(photo: UIImage) {
        guard studio?.lifting != true, editing.subject == nil || editing.subject?.placement != editingPlacement else { return }
        studio?.lifting = true
        let placement = editingPlacement
        Task { [weak self] in
            let subject = await MomentsSubject.lift(photo, placement: placement, backdrop: self?.backdrop)
            guard let self else { return }
            studio?.lifting = false
            // Moved on the canvas meanwhile: the keeper lifts it again for where it is now.
            guard isOpen, editingPlacement == placement else { return }
            var marks = editing
            if let subject {
                marks.subject = subject
            } else {
                studio?.noSubject = true
                for index in marks.labels.indices {
                    marks.labels[index].behind = false
                }
            }
            moveMarks(marks)
        }
    }
}

/// Keeps the subject in step with the picture in the Studio's editor: moved or resized on its canvas (Resize), the
/// old subject no longer lines up, so it goes at once (the words show in front) and is lifted again once the picture
/// rests.
struct MomentsStudioSubjectKeeper: View {
    let marking: MomentsMarking
    let photo: UIImage?

    var body: some View {
        Color.clear
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onChange(of: marking.editingPlacement) { _, placement in
                guard let subject = marking.editing.subject, subject.placement != placement else { return }
                var marks = marking.editing
                marks.subject = nil
                marking.moveMarks(marks)
            }
            .task(id: marking.editingPlacement) {
                try? await Task.sleep(for: .milliseconds(600))
                guard !Task.isCancelled, let photo, marking.editing.hasBehind, marking.editing.subject == nil else { return }
                marking.liftSubject(photo: photo)
            }
    }
}
