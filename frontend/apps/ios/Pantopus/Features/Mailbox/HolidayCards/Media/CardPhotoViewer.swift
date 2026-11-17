//
//  CardPhotoViewer.swift
//  Pantopus
//
//  A card's own photo, opened from its print (`holiday_card_memories`): the whole screen, dark like a photo viewer.
//  It grows out of the print it was opened from and goes back into it. Pinch or double-tap enlarges it, up to the
//  photo's own size and past it; a finger moves around it; pulling it down, ✕ or the screen reader's escape closes it.
//  Its bytes are the print's (the card's reader-checked routes, kept in memory only), so a photo that is still covered
//  never opens here.
//

import AVFoundation
import SwiftUI
import UIKit

/// The photo a card's print opens.
struct CardPhotoOpened: Equatable {
    let source: CardMediaSource
    /// The photo's shape, width over height.
    var aspect: CGFloat = 4 / 3
    /// The sender's description, read by screen readers.
    var alt: String?
    /// The sender's name, for the spoken label; empty for the reader's own photo.
    var fromName = ""
    /// A Live Photo: where its moving part is read from, and what it is.
    var live: CardMediaSource?
    var liveType: String?
    /// Where the print's photo lies on the screen, and how it's turned: the photo grows from there. Nil fades it in.
    var origin: CGRect?
    var originTilt: Double = 0
}

struct CardPhotoViewer: View {
    let photo: CardPhotoOpened
    let onClose: () -> Void

    @State private var image: UIImage?
    @State private var failed = false
    /// Grown to the whole screen; false while it's still (or again) the print's size.
    @State private var open = false
    /// How far it has been pulled down, to close it.
    @State private var pull: CGFloat = 0
    @State private var closing = false
    @State private var clip = CardLiveClip()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(photo: CardPhotoOpened, onClose: @escaping () -> Void) {
        self.photo = photo
        self.onClose = onClose
        // The print has just drawn it, so it's in memory: nothing to wait for.
        _image = State(initialValue: HolidayCardMediaStore.shared.cached(photo.source.fileId).flatMap { UIImage(data: $0) })
    }

    var body: some View {
        GeometryReader { geo in
            let insets = geo.safeAreaInsets
            let screen = CGSize(
                width: geo.size.width + insets.leading + insets.trailing,
                height: geo.size.height + insets.top + insets.bottom
            )
            ZStack(alignment: .topLeading) {
                Color.black
                    .opacity(open ? Double(1 - pullProgress * 0.75) : 0)
                picture(screen)
                    .frame(width: screen.width, height: screen.height)
                    .modifier(GrownFromPrint(photo: photo, screen: screen, grown: open || reduceMotion))
                    .opacity(open || photo.origin != nil && !reduceMotion ? 1 : 0)
                CardTableRoundButton(icon: .x, label: "Close the photo", identifier: "cardPhotoClose", action: close)
                    .padding(.top, insets.top + 10)
                    .padding(.leading, max(12, insets.leading))
                    .opacity(open ? Double(1 - pullProgress) : 0)
                if photo.live != nil, clip.player != nil {
                    liveButton
                        .padding(.leading, max(12, insets.leading))
                        .padding(.bottom, insets.bottom + 14)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                        .opacity(open ? Double(1 - pullProgress) : 0)
                }
            }
            .frame(width: screen.width, height: screen.height, alignment: .topLeading)
            .ignoresSafeArea()
        }
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityAction(.escape, close)
        .accessibilityIdentifier("cardPhotoViewer")
        .task { await load() }
        .task { await prepareLive() }
        .onAppear {
            withAnimation(reduceMotion ? .easeOut(duration: 0.2) : .spring(duration: 0.42, bounce: 0.12)) { open = true }
        }
        .onDisappear { clip.close() }
    }

    /// Plays the Live Photo once more, with its sound. 44 pt to touch.
    private var liveButton: some View {
        Button {
            clip.playOnce(muted: false)
        } label: {
            CardLiveMark(size: 12)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Play the Live Photo")
        .accessibilityIdentifier("cardPhotoLive")
    }

    /// A Live Photo moves once as it opens, without its sound (nothing should startle); holding it, or LIVE, plays it
    /// with sound. With Reduce Motion it waits to be asked.
    private func prepareLive() async {
        guard let live = photo.live else { return }
        await clip.prepare(live, mimeType: photo.liveType)
        guard clip.player != nil, !reduceMotion, !Task.isCancelled else { return }
        try? await Task.sleep(nanoseconds: 550_000_000)
        if !Task.isCancelled, !closing { clip.playOnce(muted: true) }
    }

    /// 0 at rest, 1 once it's pulled well down.
    private var pullProgress: CGFloat {
        min(1, pull / 140)
    }

    @ViewBuilder
    private func picture(_: CGSize) -> some View {
        if let image {
            CardPhotoZoom(
                image: image,
                player: clip.player,
                moving: clip.showing,
                onPull: { pull = closing ? pull : $0 },
                onPulledAway: close,
                onHold: clip.hold
            )
            .accessibilityElement()
            .accessibilityLabel(spokenLabel)
            .accessibilityAddTraits(.isImage)
            .accessibilityHint("Double-tap with two fingers and hold, then pinch, to enlarge it.")
            .accessibilityIdentifier("cardPhotoFull")
        } else if failed {
            VStack(spacing: Spacing.s3) {
                Text("This photo couldn’t be loaded. Check your connection.")
                    .font(.system(size: 15))
                    .foregroundStyle(MailPaper.tableCream)
                    .multilineTextAlignment(.center)
                Button("Try again") { Task { await load() } }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(MailPaper.tableCream)
                    .padding(.horizontal, 24)
                    .frame(minHeight: 44)
                    .background { CardTableGlass(shape: Capsule()) }
                    .accessibilityIdentifier("cardPhotoRetry")
            }
            .padding(Spacing.s5)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ProgressView()
                .tint(MailPaper.tableCream)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel("Loading the photo")
        }
    }

    private var spokenLabel: String {
        let kind = photo.live == nil ? "Photo" : "Live Photo"
        if let alt = photo.alt, !alt.isEmpty { return "\(kind): \(alt)" }
        let first = HolidayCardWords.firstName(photo.fromName)
        return first.isEmpty ? "\(kind), yours" : "\(kind) from \(first)"
    }

    private func load() async {
        guard image == nil else { return }
        failed = false
        do {
            let data = try await HolidayCardMediaStore.shared.data(for: photo.source)
            guard !Task.isCancelled else { return }
            if let made = UIImage(data: data) { image = made } else { failed = true }
        } catch {
            guard !Task.isCancelled else { return }
            failed = true
        }
    }

    /// Back into the print, then gone.
    private func close() {
        guard !closing else { return }
        closing = true
        clip.stop()
        let time = reduceMotion ? 0.18 : 0.3
        withAnimation(reduceMotion ? .easeOut(duration: time) : .spring(duration: time, bounce: 0)) {
            open = false
            pull = 0
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(time * 1_000_000_000))
            onClose()
        }
    }
}

/// The photo at the print's place and size until it's grown, then the whole screen.
private struct GrownFromPrint: ViewModifier {
    let photo: CardPhotoOpened
    let screen: CGSize
    let grown: Bool

    func body(content: Content) -> some View {
        let from = start
        content
            .scaleEffect(grown ? 1 : from.scale)
            .rotationEffect(.degrees(grown ? 0 : photo.originTilt))
            .offset(grown ? .zero : from.offset)
    }

    /// The scale and shift that put the photo, fitted to the screen, exactly over the print's photo.
    private var start: (scale: CGFloat, offset: CGSize) {
        guard let origin = photo.origin, origin.width > 0, screen.width > 0, screen.height > 0 else { return (0.94, .zero) }
        let aspect = max(photo.aspect, 0.05)
        let fitted = min(screen.width, screen.height * aspect)
        return (
            origin.width / fitted,
            CGSize(width: origin.midX - screen.width / 2, height: origin.midY - screen.height / 2)
        )
    }
}

// MARK: - Pinch, double-tap, move around, pull down

/// The photo in a scroll view, which gives the pinch, the double-tap and the moving around their real feel. At its
/// resting size a pull down on it reports how far, and past a short pull says it was pulled away.
private struct CardPhotoZoom: UIViewRepresentable {
    let image: UIImage
    /// A Live Photo's moving part, drawn over the still (so it's enlarged and moved with it) while `moving`.
    var player: AVPlayer?
    var moving = false
    let onPull: (CGFloat) -> Void
    let onPulledAway: () -> Void
    /// A finger holds the photo still, or lets go.
    var onHold: (Bool) -> Void = { _ in }

    func makeUIView(context _: Context) -> CardPhotoScrollView {
        let view = CardPhotoScrollView(image: image)
        view.onPull = onPull
        view.onPulledAway = onPulledAway
        view.onHold = onHold
        view.showMoving(player, now: moving)
        return view
    }

    func updateUIView(_ view: CardPhotoScrollView, context _: Context) {
        view.onPull = onPull
        view.onPulledAway = onPulledAway
        view.onHold = onHold
        view.showMoving(player, now: moving)
        if view.imageView.image !== image { view.show(image) }
    }
}

final class CardPhotoScrollView: UIScrollView, UIScrollViewDelegate {
    let imageView = UIImageView()
    var onPull: (CGFloat) -> Void = { _ in }
    var onPulledAway: () -> Void = {}
    var onHold: (Bool) -> Void = { _ in }
    private let movingLayer = AVPlayerLayer()
    private var laidOutFor: CGSize = .zero
    private var wasEnlarged = false

    init(image: UIImage) {
        super.init(frame: .zero)
        delegate = self
        backgroundColor = .clear
        showsVerticalScrollIndicator = false
        showsHorizontalScrollIndicator = false
        contentInsetAdjustmentBehavior = .never
        decelerationRate = .fast
        alwaysBounceVertical = true
        // A photo reaches every edge of the screen as it is: none of the system's soft blur under the clock.
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            topEdgeEffect.isHidden = true
            bottomEdgeEffect.isHidden = true
            leftEdgeEffect.isHidden = true
            rightEdgeEffect.isHidden = true
        }
        #endif
        imageView.contentMode = .scaleAspectFit
        imageView.image = image
        // Enlarged past its own pixels, it stays smooth.
        imageView.layer.minificationFilter = .trilinear
        addSubview(imageView)
        let twice = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
        twice.numberOfTapsRequired = 2
        addGestureRecognizer(twice)
        // A Live Photo's moving part lies over the still, in the same view, so it is enlarged and moved with it.
        movingLayer.videoGravity = .resizeAspect
        movingLayer.opacity = 0
        imageView.layer.addSublayer(movingLayer)
        let hold = UILongPressGestureRecognizer(target: self, action: #selector(held(_:)))
        hold.minimumPressDuration = 0.28
        addGestureRecognizer(hold)
    }

    /// The moving part to draw, and whether it shows now.
    func showMoving(_ player: AVPlayer?, now moving: Bool) {
        if movingLayer.player !== player { movingLayer.player = player }
        let opacity: Float = moving && player != nil ? 1 : 0
        if movingLayer.opacity != opacity { movingLayer.opacity = opacity }
    }

    @objc private func held(_ press: UILongPressGestureRecognizer) {
        switch press.state {
        case .began: onHold(true)
        case .ended, .cancelled, .failed: onHold(false)
        default: break
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func show(_ image: UIImage) {
        imageView.image = image
        laidOutFor = .zero
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.size != laidOutFor, bounds.width > 0, bounds.height > 0, let image = imageView.image,
              image.size.width > 0, image.size.height > 0 else { return }
        laidOutFor = bounds.size
        zoomScale = 1
        let fit = min(bounds.width / image.size.width, bounds.height / image.size.height)
        let size = CGSize(width: image.size.width * fit, height: image.size.height * fit)
        imageView.frame = CGRect(origin: .zero, size: size)
        // Without the layer's own slide: it's the photo's size at once.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        movingLayer.frame = CGRect(origin: .zero, size: size)
        CATransaction.commit()
        contentSize = size
        minimumZoomScale = 1
        // Up to twice the photo's own size on this screen, and never less than three times the fitted one.
        let ownSize = image.size.width * image.scale / max(1, size.width * traitCollection.displayScale)
        maximumZoomScale = max(3, ownSize * 2)
        centre()
    }

    /// Smaller than the screen in either direction, it stays in the middle.
    private func centre() {
        let across = max(0, (bounds.width - contentSize.width) / 2)
        let down = max(0, (bounds.height - contentSize.height) / 2)
        contentInset = UIEdgeInsets(top: down, left: across, bottom: down, right: across)
    }

    private var isResting: Bool {
        zoomScale <= minimumZoomScale + 0.01
    }

    /// How far it's been pulled down from where it rests.
    private var pulledDown: CGFloat {
        max(0, -(contentOffset.y + contentInset.top))
    }

    @objc private func doubleTapped(_ tap: UITapGestureRecognizer) {
        if !isResting {
            setZoomScale(minimumZoomScale, animated: true)
            return
        }
        let scale = min(maximumZoomScale, 2.5)
        let point = tap.location(in: imageView)
        let size = CGSize(width: bounds.width / scale, height: bounds.height / scale)
        zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height), animated: true)
    }

    func viewForZooming(in _: UIScrollView) -> UIView? {
        imageView
    }

    func scrollViewDidZoom(_: UIScrollView) {
        centre()
        // Enlarged, a drag moves around the photo: whatever pull was under way is over.
        let enlarged = !isResting
        guard enlarged != wasEnlarged else { return }
        wasEnlarged = enlarged
        if enlarged { onPull(0) }
    }

    func scrollViewDidScroll(_: UIScrollView) {
        guard isResting, isTracking || isDecelerating, !isZooming else { return }
        onPull(pulledDown)
    }

    func scrollViewWillEndDragging(
        _: UIScrollView,
        withVelocity velocity: CGPoint,
        targetContentOffset _: UnsafeMutablePointer<CGPoint>
    ) {
        guard isResting, !isZooming else { return }
        // The scroll view's own resistance already shortens the pull: 56 here is about a hand's width of finger.
        if pulledDown > 56 || (pulledDown > 16 && velocity.y < -1.1) { onPulledAway() }
    }

    func scrollViewDidEndDragging(_: UIScrollView, willDecelerate decelerate: Bool) {
        if isResting, !decelerate { onPull(0) }
    }

    func scrollViewDidEndDecelerating(_: UIScrollView) {
        if isResting { onPull(0) }
    }
}
