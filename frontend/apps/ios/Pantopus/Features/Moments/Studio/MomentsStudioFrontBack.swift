//
//  MomentsStudioFrontBack.swift
//  Pantopus
//
//  "Pulse, reinvented", front and back together (DESIGN row 7): the back camera and the front camera in one shot,
//  the small picture inside the big one. It is a mode the person picks in the Studio's camera ("Front and back"),
//  never the default, and only while the switch is on and the phone can run two cameras at once
//  (`AVCaptureMultiCamSession.isMultiCamSupported`). Today's camera and its capture session are left exactly as they
//  are: they stop while this mode is open and start again when it closes, and the shot reaches the Studio as an
//  ordinary photo (`tookPhoto`), so nothing new is sent and a reader with the switch off sees the same picture.
//
//  A simulator has no camera: on simulator builds only, two stand-in pictures go through this same code (the small
//  picture inside the big one, swapping them, the Studio taking the result), so what runs on the phone is seen
//  running. The real two-camera capture needs a real iPhone.
//

import AVFoundation
import SwiftUI
import UIKit

enum MomentsFrontBack {
    /// This phone runs two cameras at once; a simulator build runs the stand-in.
    static var available: Bool {
        #if targetEnvironment(simulator)
        true
        #else
        AVCaptureMultiCamSession.isMultiCamSupported
        #endif
    }

    /// One picture: `big` filling it, `small` inside it at the top left with rounded corners and a white edge.
    static func compose(big: UIImage, small: UIImage) -> UIImage {
        let size = big.size
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = big.scale
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            big.draw(in: CGRect(origin: .zero, size: size))
            let inset = insetFrame(in: size, small: small.size)
            let edge = size.width * 0.008
            let radius = inset.width * 0.12
            UIColor.white.setFill()
            UIBezierPath(roundedRect: inset.insetBy(dx: -edge, dy: -edge), cornerRadius: radius + edge).fill()
            UIBezierPath(roundedRect: inset, cornerRadius: radius).addClip()
            small.draw(in: inset)
        }
    }

    /// Where the small picture sits in a picture of `size`: 30% of its width, at the top left.
    static func insetFrame(in size: CGSize, small: CGSize) -> CGRect {
        let width = size.width * 0.3
        let aspect = small.height / max(small.width, 1)
        let margin = size.width * 0.045
        return CGRect(x: margin, y: margin, width: width, height: width * aspect)
    }
}

/// Both cameras at once (`AVCaptureMultiCamSession`), each with its own picture and preview. Made only when the
/// person opens the mode; today's `MomentsCameraController` is not touched.
final class MomentsFrontBackCamera: NSObject, @unchecked Sendable {
    let session = AVCaptureMultiCamSession()
    let backPreview: AVCaptureVideoPreviewLayer
    let frontPreview: AVCaptureVideoPreviewLayer
    private let queue = DispatchQueue(label: "app.pantopus.ios.moments.frontback")
    private var outputs: [AVCaptureDevice.Position: AVCapturePhotoOutput] = [:]
    private var configured: Bool?
    private var shots: [Shot] = []

    override init() {
        backPreview = AVCaptureVideoPreviewLayer(sessionWithNoConnection: session)
        frontPreview = AVCaptureVideoPreviewLayer(sessionWithNoConnection: session)
        backPreview.videoGravity = .resizeAspectFill
        frontPreview.videoGravity = .resizeAspectFill
        super.init()
    }

    /// Sets up both cameras and starts them; false where the phone can't (or the camera isn't allowed).
    func start() async -> Bool {
        guard AVCaptureMultiCamSession.isMultiCamSupported, await AVCaptureDevice.requestAccess(for: .video) else { return false }
        return await withCheckedContinuation { continuation in
            queue.async { [self] in
                if configured == nil { configured = configure() }
                if configured == true, !session.isRunning { session.startRunning() }
                continuation.resume(returning: configured == true)
            }
        }
    }

    func stop() {
        queue.async { [self] in
            if session.isRunning { session.stopRunning() }
        }
    }

    /// Both pictures, taken together; nil if either failed.
    func take() async -> (back: UIImage, front: UIImage)? {
        async let back = take(.back)
        async let front = take(.front)
        guard let back = await back, let front = await front else { return nil }
        return (back, front)
    }

    private func take(_ position: AVCaptureDevice.Position) async -> UIImage? {
        await withCheckedContinuation { continuation in
            queue.async { [self] in
                guard let output = outputs[position] else { return continuation.resume(returning: nil) }
                let shot = Shot()
                shot.done = { [weak self, weak shot] image in
                    continuation.resume(returning: image)
                    guard let self, let shot else { return }
                    queue.async { self.shots.removeAll { $0 === shot } }
                }
                shots.append(shot)
                output.capturePhoto(with: AVCapturePhotoSettings(), delegate: shot)
            }
        }
    }

    private func configure() -> Bool {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        for (position, preview) in [(AVCaptureDevice.Position.back, backPreview), (.front, frontPreview)] {
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
                  let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { return false }
            session.addInputWithNoConnections(input)
            guard let port = input.ports(for: .video, sourceDeviceType: device.deviceType, sourceDevicePosition: position).first
            else { return false }
            let output = AVCapturePhotoOutput()
            guard session.canAddOutput(output) else { return false }
            session.addOutputWithNoConnections(output)
            let taking = AVCaptureConnection(inputPorts: [port], output: output)
            guard session.canAddConnection(taking) else { return false }
            session.addConnection(taking)
            upright(taking, front: position == .front)
            let showing = AVCaptureConnection(inputPort: port, videoPreviewLayer: preview)
            guard session.canAddConnection(showing) else { return false }
            session.addConnection(showing)
            upright(showing, front: position == .front)
            outputs[position] = output
        }
        // Two cameras at full size can be more than the phone can run: then the mode says so and stays shut.
        return session.hardwareCost <= 1
    }

    /// Portrait, as the screen is held; the front camera as a mirror, as today's camera shows it.
    private func upright(_ connection: AVCaptureConnection, front: Bool) {
        if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
        if front, connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = true
        }
    }

    private final class Shot: NSObject, AVCapturePhotoCaptureDelegate {
        var done: ((UIImage?) -> Void)?

        func photoOutput(_: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error _: (any Error)?) {
            done?(photo.fileDataRepresentation().flatMap(UIImage.init(data:)))
            done = nil
        }
    }
}

/// The Studio camera's "Front and back" button, and the mode it opens. Nothing shows, and nothing of the mode runs,
/// with the switch off or on a phone that can't run two cameras at once.
struct MomentsStudioFrontBackEntry: View {
    let model: MomentsComposerModel
    @State private var flags = PulseReinventedFlags.shared
    @State private var open = false

    var body: some View {
        if flags.isOn, MomentsFrontBack.available, model.wantsCamera, !model.camera.recording {
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button { pick() } label: {
                        HStack(spacing: 10) {
                            Text("Front and back")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white)
                                .shadow(color: .black.opacity(0.55), radius: 4, x: 0, y: 1)
                            MomentsFrontBackGlyph()
                                .frame(width: 44, height: 44)
                                .background(Circle().fill(Color.black.opacity(0.42)))
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Front and back together")
                    .accessibilityHint("Takes the back and front cameras in one shot")
                    .accessibilityIdentifier("moments.studio.frontBack.open")
                }
                .padding(.trailing, Spacing.s4)
                Spacer()
                Spacer()
            }
            .fullScreenCover(isPresented: $open) {
                MomentsFrontBackScreen { image in
                    open = false
                    if let image { model.tookPhoto(image) } else { Task { await model.camera.start() } }
                }
            }
        }
    }

    /// Today's camera lets go of the back camera first; it starts again if the person comes back without a shot.
    private func pick() {
        model.camera.stop()
        open = true
    }
}

/// Two overlapping frames: the small picture inside the big one.
private struct MomentsFrontBackGlyph: View {
    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 4).stroke(.white, lineWidth: 2.2).frame(width: 20, height: 22)
            RoundedRectangle(cornerRadius: 2.5).fill(.white).frame(width: 8, height: 10).offset(x: 3.5, y: 3.5)
        }
        .frame(width: 20, height: 22)
    }
}

/// Front and back together, full screen: the big picture, the small one at the top left (a tap on it swaps them),
/// the shutter, and close. `done` gets the one picture, or nil when the person closes it.
struct MomentsFrontBackScreen: View {
    let done: (UIImage?) -> Void
    /// Made only on a phone that can run two cameras at once (never on a simulator).
    @State private var camera: MomentsFrontBackCamera?
    /// nil while starting; false where it can't run here.
    @State private var ready: Bool?
    /// The front camera is the big picture.
    @State private var frontBig = false
    @State private var taking = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            big.ignoresSafeArea()
            if ready == true || MomentsFrontBackStandIn.isOn {
                small
                    .padding(.top, 72)
                    .padding(.leading, Spacing.s4)
            }
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button { done(nil) } label: {
                        Icon(.x, size: 22, strokeWidth: 2.4, color: .white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Color.black.opacity(0.42)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close front and back")
                    .accessibilityIdentifier("moments.studio.frontBack.close")
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
                Spacer(minLength: 0)
                if ready == false, !MomentsFrontBackStandIn.isOn {
                    Text("This phone can't use both cameras at once.")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Spacing.s6)
                        .accessibilityIdentifier("moments.studio.frontBack.unavailable")
                    Spacer(minLength: 0)
                }
                Text(MomentsFrontBackStandIn.isOn ? "Stand-in pictures: this build has no camera." : "Front and back together")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.6), radius: 1.5, x: 0, y: 1)
                    .padding(.bottom, Spacing.s4)
                HStack {
                    Color.clear.frame(width: 86, height: 1)
                    Spacer(minLength: 0)
                    shutter
                    Spacer(minLength: 0)
                    Button { swap() } label: {
                        Icon(.switchCamera, size: 24, color: .white)
                            .frame(width: 48, height: 48)
                            .background(Circle().fill(Color.black.opacity(0.42)))
                    }
                    .buttonStyle(.plain)
                    .frame(width: 86)
                    .accessibilityLabel(frontBig ? "Show the back camera big" : "Show the front camera big")
                    .accessibilityIdentifier("moments.studio.frontBack.swap")
                }
                .padding(.horizontal, Spacing.s1)
                .padding(.bottom, 32)
            }
        }
        .environment(\.colorScheme, .dark)
        .task {
            guard !MomentsFrontBackStandIn.isOn else { return }
            guard AVCaptureMultiCamSession.isMultiCamSupported else {
                ready = false
                return
            }
            let made = camera ?? MomentsFrontBackCamera()
            camera = made
            ready = await made.start()
        }
        .onDisappear { camera?.stop() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.studio.frontBack")
    }

    private var big: some View {
        picture(front: frontBig)
            .accessibilityLabel(frontBig ? "Front camera" : "Back camera")
    }

    private var small: some View {
        Button { swap() } label: {
            picture(front: !frontBig)
                .frame(width: 118, height: 157)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white, lineWidth: 3))
                .shadow(color: .black.opacity(0.35), radius: 6, x: 0, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(frontBig ? "Back camera, small. Tap to swap" : "Front camera, small. Tap to swap")
        .accessibilityIdentifier("moments.studio.frontBack.small")
    }

    @ViewBuilder
    private func picture(front: Bool) -> some View {
        if MomentsFrontBackStandIn.isOn {
            Image(uiImage: MomentsFrontBackStandIn.picture(front: front))
                .resizable()
                .scaledToFill()
        } else if ready == true, let camera {
            MomentsFrontBackPreview(layer: front ? camera.frontPreview : camera.backPreview)
        } else {
            Color.black
        }
    }

    private var shutter: some View {
        Button { shoot() } label: {
            ZStack {
                Circle().stroke(.white, lineWidth: 4).frame(width: 80, height: 80)
                Circle().fill(.white).frame(width: 66, height: 66)
            }
            .opacity(taking ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(taking || !(ready == true || MomentsFrontBackStandIn.isOn))
        .accessibilityLabel("Take front and back")
        .accessibilityIdentifier("moments.studio.frontBack.shutter")
    }

    private func swap() {
        withAnimation(.easeInOut(duration: 0.2)) { frontBig.toggle() }
    }

    private func shoot() {
        guard !taking else { return }
        taking = true
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task {
            let pair: (back: UIImage, front: UIImage)? = MomentsFrontBackStandIn.isOn
                ? (MomentsFrontBackStandIn.picture(front: false), MomentsFrontBackStandIn.picture(front: true))
                : await camera?.take()
            taking = false
            guard let pair else { return }
            let big = frontBig ? pair.front : pair.back
            let small = frontBig ? pair.back : pair.front
            done(MomentsFrontBack.compose(big: big, small: small))
        }
    }
}

/// One camera's live picture, edge to edge.
private struct MomentsFrontBackPreview: UIViewRepresentable {
    let layer: AVCaptureVideoPreviewLayer

    func makeUIView(context _: Context) -> Host {
        let view = Host()
        view.backgroundColor = .black
        view.preview = layer
        return view
    }

    func updateUIView(_ view: Host, context _: Context) {
        if view.preview !== layer { view.preview = layer }
    }

    final class Host: UIView {
        var preview: AVCaptureVideoPreviewLayer? {
            didSet {
                oldValue?.removeFromSuperlayer()
                if let preview { layer.addSublayer(preview) }
                setNeedsLayout()
            }
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            preview?.frame = bounds
            CATransaction.commit()
        }
    }
}

/// Simulator builds only: two drawn pictures in place of the cameras, so the mode's own code runs where there is no
/// camera. Never in a build for a phone.
enum MomentsFrontBackStandIn {
    static var isOn: Bool {
        #if targetEnvironment(simulator)
        true
        #else
        false
        #endif
    }

    @MainActor private static var made: [Bool: UIImage] = [:]

    @MainActor
    static func picture(front: Bool) -> UIImage {
        if let image = made[front] { return image }
        let size = CGSize(width: 900, height: 1200)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            let colors = front
                ? [UIColor(red: 0.98, green: 0.62, blue: 0.45, alpha: 1), UIColor(red: 0.62, green: 0.27, blue: 0.55, alpha: 1)]
                : [UIColor(red: 0.36, green: 0.66, blue: 0.86, alpha: 1), UIColor(red: 0.16, green: 0.42, blue: 0.30, alpha: 1)]
            let gradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: colors.map(\.cgColor) as CFArray,
                locations: [0, 1]
            )
            if let gradient {
                context.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
            }
            let words = front ? "Front camera\n(stand-in)" : "Back camera\n(stand-in)"
            let style = NSMutableParagraphStyle()
            style.alignment = .center
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 84, weight: .bold),
                .foregroundColor: UIColor.white,
                .paragraphStyle: style
            ]
            let text = NSAttributedString(string: words, attributes: attributes)
            let box = text.boundingRect(
                with: CGSize(width: size.width - 80, height: size.height),
                options: .usesLineFragmentOrigin,
                context: nil
            )
            text.draw(in: CGRect(x: 40, y: (size.height - box.height) / 2, width: size.width - 80, height: box.height))
        }
        made[front] = image
        return image
    }
}
