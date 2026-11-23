//
//  MomentsMarksCompositor.swift
//  Pantopus
//
//  Text and Draw on a video (plan part 2): the marks are drawn once, on a
//  clear picture the size of the exported frame, and laid over every frame
//  while the video is exported. A small custom compositor on the encoder's
//  own composition does it: it applies the same transform the layer
//  instruction applies (the phone's rotation and the scale to 720 px), then
//  lays the overlay on. Core Image does both on the GPU; the frames it is
//  handed are already standard colours (an HDR video is tone-mapped first),
//  as the composition asks for.
//

import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins

/// The one instruction for a marked or placed video: the source track, the transform onto the output frame, the overlay,
/// and for a placed one (Resize) the canvas's background.
final class MomentsMarksInstruction: NSObject, AVVideoCompositionInstructionProtocol, @unchecked Sendable {
    let timeRange = CMTimeRange(start: .zero, duration: .positiveInfinity)
    let enablePostProcessing = false
    let containsTweening = false
    let requiredSourceTrackIDs: [NSValue]?
    let passthroughTrackID = kCMPersistentTrackID_Invalid
    let trackID: CMPersistentTrackID
    /// The layer instruction's transform, in the video's own top-left coordinates.
    let transform: CGAffineTransform
    /// The marks drawn on a clear picture the size of the output frame.
    let overlay: CIImage?
    /// A placed video's background: a top-to-bottom blend of its two colours, the size of the output frame.
    let background: CIImage?

    init(trackID: CMPersistentTrackID, transform: CGAffineTransform, overlay: CGImage?, backdrop: MomentPlacement.Backdrop?, size: CGSize) {
        self.trackID = trackID
        self.transform = transform
        self.overlay = overlay.map { CIImage(cgImage: $0) }
        background = backdrop.flatMap { colors in
            let blend = CIFilter.linearGradient()
            // Core Image's y runs up: the top colour at the top.
            blend.point0 = CGPoint(x: 0, y: size.height)
            blend.color0 = CIColor(cgColor: colors.top.cgColor)
            blend.point1 = .zero
            blend.color1 = CIColor(cgColor: colors.bottom.cgColor)
            return blend.outputImage?.cropped(to: CGRect(origin: .zero, size: size))
        }
        requiredSourceTrackIDs = [NSNumber(value: trackID)]
    }
}

final class MomentsMarksCompositor: NSObject, AVVideoCompositing, @unchecked Sendable {
    private let context = CIContext(options: [.cacheIntermediates: false])

    let sourcePixelBufferAttributes: [String: any Sendable]? = [
        kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, kCVPixelFormatType_32BGRA]
    ]
    let requiredPixelBufferAttributesForRenderContext: [String: any Sendable] = [
        kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, kCVPixelFormatType_32BGRA]
    ]

    func renderContextChanged(_: AVVideoCompositionRenderContext) {}

    func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        guard let instruction = request.videoCompositionInstruction as? MomentsMarksInstruction,
              let source = request.sourceFrame(byTrackID: instruction.trackID),
              let output = request.renderContext.newPixelBuffer()
        else {
            request.finish(with: NSError(domain: "MomentsMarksCompositor", code: 1))
            return
        }
        let width = CGFloat(CVPixelBufferGetWidth(output))
        let height = CGFloat(CVPixelBufferGetHeight(output))
        let sourceHeight = CGFloat(CVPixelBufferGetHeight(source))
        // The transform is in top-left coordinates; Core Image's run up from the bottom-left.
        let flipIn = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: sourceHeight)
        let flipOut = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: height)
        let frame = CIImage(cvPixelBuffer: source)
            .transformed(by: flipIn.concatenating(instruction.transform).concatenating(flipOut))
        var marked = instruction.background.map { frame.composited(over: $0) } ?? frame
        if let overlay = instruction.overlay { marked = overlay.composited(over: marked) }
        marked = marked.cropped(to: CGRect(x: 0, y: 0, width: width, height: height))
        context.render(marked, to: output)
        request.finish(withComposedVideoFrame: output)
    }

    func cancelAllPendingVideoCompositionRequests() {}
}
