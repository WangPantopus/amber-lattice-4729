//
//  TodaySkyHouseSpots.swift
//  Pantopus
//
//  The house on Today (JOURNEYS, founder approval 2026-11-21, boards H0 to
//  H5): the "Now" card's ground is drawn larger and three true things join
//  the picture, each drawn only while it is true and never saying who: a
//  mailbox whose flag is up while unopened mail waits, a note on the door
//  while something needs the person, and a lantern on the far hill while
//  Today's Plans cards show a plan. This file says where the larger ground
//  stands in the card and where each thing is, for the painter and for the
//  buttons laid over the picture (`TodaySkyHouseButtons.swift`), and draws
//  the three. The numbers match the web's `houseSpots.ts`; Android has the
//  same twins. The Today widget compiles this file with the painter (it
//  draws no things).
//

import SwiftUI

/// What is true now, for the picture. All false draws only the larger ground.
struct SkyHouseThings: Equatable {
    enum Thing: CaseIterable {
        case flag
        case note
        case lantern
    }

    /// The mailbox stands by the house (the Mailbox is on).
    var mailbox = false
    /// Its flag is up: mail came and is not opened yet.
    var flagUp = false
    /// A note on the door: the "Needs you" list has an item.
    var note = false
    /// A lantern on the far hill: Today's Plans cards show a plan.
    var lantern = false
    /// How far each has faded in, 0 to 1 (300 ms; 1 at once with Reduce Motion).
    var shown: [Thing: Double] = [:]

    func has(_ thing: Thing) -> Bool {
        switch thing {
        case .flag: mailbox && flagUp
        case .note: note
        case .lantern: lantern
        }
    }

    func opacity(_ thing: Thing) -> Double {
        has(thing) ? shown[thing] ?? 1 : 0
    }

    /// While an hour ahead is picked: what waits now says nothing about then, so only the mailbox itself stays.
    var atAnotherHour: SkyHouseThings {
        SkyHouseThings(mailbox: mailbox)
    }
}

/// Where the larger ground stands in a card, in points.
struct SkyHouseSpots {
    /// The ground is drawn this many times larger, so a first house is about 130 points across its roof.
    static let fullScale = 2.6
    /// Between the centres of two things that can be tapped, so 44-point targets never overlap.
    static let apart = 56.0

    let scale: Double
    let horizon: Double
    /// The door's foot.
    let door: CGPoint
    /// The roof's left edge: the reading's chips stay left of it.
    let left: Double
    /// The mailbox post's foot, and the middle of its target.
    let mailboxFoot: CGPoint
    let mailbox: CGPoint
    /// The note's middle, on the door.
    let note: CGPoint
    /// The lantern stem's foot on the far hill, and the lamp's middle.
    let lanternFoot: CGPoint
    let lantern: CGPoint
    private let reach: Double

    init(size: CGSize, home: SkyHome) {
        let width = Double(size.width)
        horizon = Double(size.height) * 0.82
        // A tall home on a low card is drawn a little smaller so its roof stays inside.
        let fits = (horizon - 8) / max(Self.height(home) - 7, 1)
        let scale = max(1, min(Self.fullScale, fits))
        let reach = home.leftReach
        let y = horizon + 7 * scale
        // Up to three bins stand past the home's left edge; the mailbox keeps clear of the widest row.
        let binsMiddle = (reach + 2 + 12.5) * scale
        let mailboxLeft = binsMiddle + Self.apart + 2
        // Room on the right for the garage and the round tree; on the left for the mailbox's target.
        let rightNeed = (home.rightReach + 22) * scale + 4
        let leftNeed = mailboxLeft + 22 + 4
        let x = max(leftNeed, min(width * 0.7, width - rightNeed))
        self.scale = scale
        self.reach = reach
        door = CGPoint(x: x, y: y)
        left = x - reach * scale
        mailboxFoot = CGPoint(x: x - mailboxLeft, y: y + 4 * scale)
        mailbox = CGPoint(x: mailboxFoot.x, y: mailboxFoot.y - 20)
        note = CGPoint(x: x, y: y - 7 * scale)
        // The lantern stands on the far hill behind where the bins wait: over 56 points above them.
        let lanternX = x - binsMiddle
        let hill = horizon + Self.farHill(at: lanternX / scale, width: width / scale) * scale
        lanternFoot = CGPoint(x: lanternX, y: hill + 2)
        lantern = CGPoint(x: lanternX, y: hill + 2 - 14 - 5.5)
    }

    /// The bins' middle, where the scene stands them when they are out.
    func bins(count: Int) -> CGPoint {
        let middle = (reach + 2 + (Double(max(count, 1)) * 9 - 2) / 2) * scale
        return CGPoint(x: Double(door.x) - middle, y: Double(door.y) + 3 * scale)
    }

    /// The scene the ground is painted in, `scale` times smaller, so a context scaled up by it draws the ground larger.
    func scaled(_ scene: TodaySkyPainter.Scene) -> TodaySkyPainter.Scene {
        TodaySkyPainter.Scene(
            size: CGSize(width: scene.width / scale, height: scene.height / scale),
            time: scene.time,
            sky: scene.sky,
            rise: scene.rise,
            ground: horizon / scale,
            door: Double(door.x) / scale
        )
    }

    /// How tall the home stands above its door's foot, roof and chimney included, at the scene's own size.
    private static func height(_ home: SkyHome) -> Double {
        switch home.kind {
        case .apartment: 54
        case .townhouse: 44
        case .mobile: 22
        case .house: home.wallHeight + (home.roof == .flat ? 14 : 22)
        }
    }

    /// The far hill's top at `x`, as points above (negative) or below the horizon: the left curve
    /// `TodaySkyGround.paintHills` draws, from the card's edge to 60% across.
    private static func farHill(at x: Double, width: Double) -> Double {
        let xs = [0, width * 0.22, width * 0.42, width * 0.6]
        let ys = [4.0, -16, -2, -10]
        var low = 0.0
        var high = 1.0
        for _ in 0..<12 {
            let middle = (low + high) / 2
            if bezier(xs, at: middle) < x { low = middle } else { high = middle }
        }
        return bezier(ys, at: (low + high) / 2)
    }

    private static func bezier(_ p: [Double], at t: Double) -> Double {
        let u = 1 - t
        return u * u * u * p[0] + 3 * u * u * t * p[1] + 3 * u * t * t * p[2] + t * t * t * p[3]
    }
}

// MARK: - Drawing the three

extension TodaySkyGround {
    /// The mailbox, the note and the lantern at their real sizes, over the larger ground. Silhouettes follow
    /// the horizon's colour as the house does; the flag, the note and the lantern keep their own colours, with
    /// a thin outline in the horizon's colour by day.
    func paintThings(_ context: GraphicsContext, _ things: SkyHouseThings, at spots: SkyHouseSpots) {
        let tone = tones.house
        let lit = moment.phase == .dusk || night
        let outline = StrokeStyle(lineWidth: 0.8)
        if things.mailbox { paintMailbox(context, things, at: spots.mailboxFoot, tone: tone, lit: lit) }
        if things.note {
            var layer = context
            layer.opacity = things.opacity(.note)
            let paper = Path(roundedRect: CGRect(x: spots.note.x - 5, y: spots.note.y - 4, width: 10, height: 8), cornerRadius: 1)
            layer.fill(paper, with: .color(SkyPalette.doorNote.color(opacity: night ? 0.92 : 1)))
            if !lit { layer.stroke(paper, with: .color(tone.color), style: outline) }
        }
        if things.lantern {
            var layer = context
            layer.opacity = things.opacity(.lantern)
            let foot = spots.lanternFoot
            let lamp = TodaySkyPainter.circle(Double(spots.lantern.x), Double(spots.lantern.y), 5.5)
            if lit {
                let glow = Gradient(colors: [SkyPalette.lantern.color(opacity: 0.4), SkyPalette.lantern.color(opacity: 0)])
                layer.fill(
                    TodaySkyPainter.circle(Double(spots.lantern.x), Double(spots.lantern.y), 16),
                    with: .radialGradient(glow, center: spots.lantern, startRadius: 0, endRadius: 16)
                )
            }
            layer.fill(Path(CGRect(x: foot.x - 1, y: foot.y - 14, width: 2, height: 14)), with: .color(tone.color))
            layer.fill(lamp, with: .color(SkyPalette.lantern.color))
            if !lit { layer.stroke(lamp, with: .color(tone.color), style: outline) }
        }
    }

    /// A box 22 by 12 on a 24-point post; its flag, 10 by 6 on a 13-point staff, stands up while mail waits
    /// and lies along the box when it doesn't.
    private func paintMailbox(_ context: GraphicsContext, _ things: SkyHouseThings, at foot: CGPoint, tone: SkyRGB, lit: Bool) {
        let x = Double(foot.x)
        let y = Double(foot.y)
        context.fill(Path(CGRect(x: x - 1.5, y: y - 24, width: 3, height: 24)), with: .color(tone.color))
        let box = Path(roundedRect: CGRect(x: x - 11, y: y - 36, width: 22, height: 12), cornerRadius: 3.5)
        // Paler than the silhouette so it reads against the hill behind it, night and day.
        context.fill(box, with: .color(tone.mixed(with: SkyPalette.white, by: night ? 0.5 : 0.62).color))
        context.fill(Path(CGRect(x: x - 11, y: y - 31, width: 4, height: 1.2)), with: .color(tone.color(opacity: 0.55)))
        let up = things.opacity(.flag)
        if up < 1 {
            // Down: the flag lies along the box, in the silhouette's colour.
            var down = context
            down.opacity = 1 - up
            down.fill(Path(CGRect(x: x + 2, y: y - 37.6, width: 9, height: 1.6)), with: .color(tone.color))
        }
        if up > 0 {
            var layer = context
            layer.opacity = up
            layer.fill(Path(CGRect(x: x + 6, y: y - 49, width: 1.6, height: 13)), with: .color(tone.color))
            let flag = Path(CGRect(x: x + 7.6, y: y - 49, width: 10, height: 6))
            layer.fill(flag, with: .color(SkyPalette.mailFlag.color))
            if !lit { layer.stroke(flag, with: .color(tone.color), style: StrokeStyle(lineWidth: 0.8)) }
        }
    }
}
