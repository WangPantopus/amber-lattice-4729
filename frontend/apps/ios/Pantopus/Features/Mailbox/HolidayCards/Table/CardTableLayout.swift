//
//  CardTableLayout.swift
//  Pantopus
//
//  Fitting the card to the screen (launch key `card_table`): the card as wide
//  as the phone (9 pt of table at each side), kept clear of the round buttons
//  above it and the buttons below it (at least 12 pt clear of any paper). The
//  open envelope lies behind it, its flap rising above the card by at least 13%
//  of the card's width; on a phone the flap's tip may run off the top of the
//  screen, as an envelope bigger than the screen would. If the screen is too
//  short, the card shrinks. A card with its own photo or voice greeting lies
//  lower while its picture is up and moves up as it's turned over, which leaves
//  the table under it for them: what a full-size card leaves, at least 124 pt
//  (110 on a short screen). Open on the iPhone Duo, the two pages of the
//  folded card meet at the hinge.
//

import CoreGraphics

/// Where the mail lies, for the room it has.
struct CardTableLayout: Equatable {
    /// The whole screen.
    let screen: CGSize
    /// The room left of any side strip (the closed Duo's); it runs from the screen's left edge.
    let width: CGFloat
    let height: CGFloat
    let safeTop: CGFloat
    /// What the buttons take at the bottom, with the safe area.
    let bottomControls: CGFloat
    /// The table kept under the turned-over card for its own photo and voice greeting; 0 without them.
    let mediaRoom: CGFloat
    /// The card.
    let cardWidth: CGFloat
    let cardHeight: CGFloat
    let cardX: CGFloat
    /// Laid down, picture side up.
    let cardTop: CGFloat
    /// Laid down, note side up: higher when its photo or greeting lies under it.
    let cardTopBack: CGFloat
    /// The card just out of the envelope, before it's laid down.
    let cardTopOut: CGFloat
    /// The envelope.
    let envelopeWidth: CGFloat
    let envelopeHeight: CGFloat
    let flapDepth: CGFloat
    let envelopeX: CGFloat
    /// Shut, a little above the middle of the free space.
    let envelopeTop: CGFloat
    /// With the flap open, low enough that the tip stays on a short screen.
    let envelopeTopOpen: CGFloat
    /// Sunk as the card rises out.
    let envelopeTopOut: CGFloat
    /// Laid down behind the card: picture side up, and note side up.
    let envelopeTopFinal: CGFloat
    let envelopeTopFinalBack: CGFloat

    /// The widest the card gets in this much width: 470 on a phone, 560 from 560 wide, growing to 640 on tablets and
    /// wide windows (plan 6.3), so the open Duo upright gets one card about 600 wide (plan 6.4). The height can make it
    /// smaller.
    static func cardCap(width: CGFloat) -> CGFloat {
        width < 560 ? 470 : min(640, max(560, (width * 0.9).rounded()))
    }

    /// The least of the open flap that shows above the laid-down card, as a share of the card's width.
    static let leastPeek: CGFloat = 0.13
    /// How far the round buttons at the top reach below the safe area (10 + 40), the gap under them, and 4 for the
    /// card's small turn, which lifts a corner.
    static let underTopButtons: CGFloat = 62
    /// The least and the most table kept under a turned-over card for its own photo and greeting: a little less on a
    /// short screen, where the card needs every point.
    static func mediaRoom(height: CGFloat) -> ClosedRange<CGFloat> {
        (height < 720 ? 110 : 124)...160
    }

    /// - Parameters:
    ///   - screen: the whole screen.
    ///   - trailingStrip: the system strip down one side (the closed Duo's), to keep clear of.
    ///   - safeTop: the top of the safe area.
    ///   - bottomControls: how much the buttons take at the bottom, with the safe area.
    ///   - keepsMediaRoom: the card's own photo or voice greeting lies under it once it's turned over.
    ///   - wordsBottom: how far down the words at the top reach, from the screen's top.
    init(
        screen: CGSize,
        trailingStrip: CGFloat,
        safeTop: CGFloat,
        bottomControls: CGFloat,
        keepsMediaRoom: Bool = false,
        wordsBottom: CGFloat
    ) {
        self.screen = screen
        self.safeTop = safeTop
        self.bottomControls = bottomControls
        let width = screen.width - trailingStrip
        let height = screen.height
        self.width = width
        self.height = height
        // The buttons start at least 12 pt below the lowest paper edge (plan 1.7), and 4 more for the
        // envelope's and the card's small turns, which lower a corner.
        let bottom = bottomControls + 12 + 4
        let topGap = safeTop + 6
        let underButtons = safeTop + Self.underTopButtons
        let room = height - topGap - bottom
        let side: CGFloat = width < 560 ? 9 : 14
        // The card is as wide as the screen lets it be. Turned over, with its photo or greeting under it, it needs
        // its own height below the round buttons and the least of the flap above it. Shut, the envelope sits at least
        // 88 pt below the safe area (under the words when there's room; at the largest text sizes the words get their
        // own glass instead), with nothing under it but the buttons. If the screen is too short for any of these, the
        // card shrinks.
        let widest = min(width - side * 2, Self.cardCap(width: width))
        let shutRoom = height - safeTop - bottom - 88
        let shutLimit = shutRoom / (1.012 * 1392 / 1200)
        func fitted(above mediaRoom: CGFloat) -> CGFloat {
            max(0, min(
                widest,
                (room - mediaRoom) / (1.2 + Self.leastPeek),
                (height - underButtons - bottom - mediaRoom) / 1.2,
                shutLimit
            ))
        }
        // The card comes first: its photo and greeting get what a full-size card leaves under it, up to 160 pt (a
        // tap opens the photo over the whole screen, so its print can be small). Only where the least isn't left does
        // the card give way.
        let kept = Self.mediaRoom(height: height)
        let mediaRoom = keepsMediaRoom
            ? min(kept.upperBound, max(kept.lowerBound, height - underButtons - bottom - fitted(above: 0) * 1.2))
            : 0
        self.mediaRoom = mediaRoom
        let cardWidth = fitted(above: mediaRoom)
        // Laid down, the envelope's body ends at the card's lower edge, so its flap rises 0.406 card widths above the
        // card: past the top of the screen where the card nearly fills it. With more room than that (a small card on
        // a tall screen), the card lies lower and all of the flap shows, up to 47% of the card's width above it.
        let flapAbove = (1.012 * (512 + 1392) / 1200 - 1.2) * cardWidth
        func laid(in room: CGFloat) -> (card: CGFloat, envelopeTip: CGFloat) {
            let peek = min(max(room - cardWidth * 1.2, cardWidth * Self.leastPeek), cardWidth * 0.47)
            let spare = max(0, room - cardWidth * 1.2 - peek)
            let top = max(topGap + spare * 0.46 + peek, underButtons)
            return (top, top - max(peek, flapAbove))
        }
        let front = laid(in: room)
        let back = laid(in: room - mediaRoom)
        let envelopeWidth = cardWidth * 1.012
        let envelopeHeight = envelopeWidth * 1392 / 1200
        let flapDepth = envelopeWidth * 512 / 1200
        let free = height - safeTop - bottom
        let envelopeTop = safeTop + max(88, min(max((free - envelopeHeight) * 0.56, wordsBottom - safeTop + 8), free - envelopeHeight))
        let envelopeTopOut = min(height - envelopeHeight * 0.5, cardWidth * 1.2 * 0.8 + 8)
        self.cardWidth = cardWidth
        cardHeight = cardWidth * 1.2
        cardX = (width - cardWidth) / 2
        cardTop = front.card
        cardTopBack = back.card
        cardTopOut = envelopeTopOut - cardWidth * 1.2 * 1.02 - 8
        self.envelopeWidth = envelopeWidth
        self.envelopeHeight = envelopeHeight
        self.flapDepth = flapDepth
        envelopeX = (width - envelopeWidth) / 2
        self.envelopeTop = envelopeTop
        envelopeTopOpen = max(envelopeTop, safeTop + flapDepth * 0.9 + 4)
        self.envelopeTopOut = envelopeTopOut
        envelopeTopFinal = front.envelopeTip + flapDepth
        envelopeTopFinalBack = back.envelopeTip + flapDepth
    }

    /// The laid-down card's top edge for how far it's turned over: 0 picture side up, 1 note side up.
    func cardTop(turned: CGFloat) -> CGFloat {
        cardTop + (cardTopBack - cardTop) * turned
    }
}

/// How the iPhone Duo is holding the folded card.
enum CardTableFold: Equatable {
    /// One page at a time, as on any phone.
    case single
    /// Open sideways: the hinge runs down the screen, at this x. Half closed is `halfClosed`.
    case sideways(hingeX: CGFloat, halfClosed: Bool)
    /// Upright: the hinge runs across the screen, at this y. Only half closed (tabletop): flat, the fold reader says
    /// `single` (plan 6.4).
    case upright(hingeY: CGFloat, halfClosed: Bool)

    var isSpread: Bool {
        self != .single
    }

    var isHalfClosed: Bool {
        switch self {
        case .single: false
        case let .sideways(_, halfClosed), let .upright(_, halfClosed): halfClosed
        }
    }

    /// The two pages and the flap above them, for this fold on a screen this wide. `bottomRoom`: when a button can
    /// show under the open card, the pages end this far above the bottom (the buttons start 12 pt below the paper).
    func pages(screen: CGSize, bottomRoom: CGFloat? = nil) -> CardTablePages? {
        switch self {
        case .single:
            return nil
        case let .sideways(hingeX, _):
            // Each page is as big as the whole card on an iPhone, from just under the top.
            var width: CGFloat = 391
            let top = min(100, max(0, screen.height - width * 1.2 - 100))
            if let bottomRoom { width = min(width, max(200, (screen.height - top - bottomRoom) / 1.2)) }
            let height = width * 1.2
            return CardTablePages(
                pictureFrame: CGRect(x: hingeX - width, y: top, width: width, height: height),
                noteFrame: CGRect(x: hingeX, y: top, width: width, height: height),
                spine: hingeX,
                isSideways: true,
                flapWidth: 430,
                flapTop: 9
            )
        case let .upright(hingeY, _):
            // Half closed (tabletop; flat it's one card): each page about 366 wide in the middle of the screen, the
            // picture standing on the top half and the note lying on the bottom one, meeting at the hinge with no gap
            // so it reads as one folded card; the crease is shaded (plan 6.5).
            let gap: CGFloat = 0
            var width: CGFloat = 366
            if let bottomRoom { width = min(width, max(200, (screen.height - hingeY - gap - bottomRoom) / 1.2)) }
            let height = width * 1.2
            let x = (screen.width - width) / 2
            return CardTablePages(
                pictureFrame: CGRect(x: x, y: hingeY - gap - height, width: width, height: height),
                noteFrame: CGRect(x: x, y: hingeY + gap, width: width, height: height),
                spine: hingeY,
                isSideways: false,
                flapWidth: nil,
                flapTop: 0
            )
        }
    }
}

/// The folded card's two pages on the open Duo.
struct CardTablePages: Equatable {
    let pictureFrame: CGRect
    let noteFrame: CGRect
    /// The hinge: x sideways, y upright.
    let spine: CGFloat
    let isSideways: Bool
    /// The flap's width above the pages (sideways only).
    let flapWidth: CGFloat?
    let flapTop: CGFloat
}
