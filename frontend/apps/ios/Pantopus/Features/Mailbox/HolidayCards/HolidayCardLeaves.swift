//
//  HolidayCardLeaves.swift
//  Pantopus
//
//  A long note's two leaves on a card that turns over off the table: Look it
//  over's card and Sent's (launch key `card_table`, plan Part 9). Turn it
//  over shows the first leaf lying on the card's back; Read on lifts it from
//  its foot about its top edge, and the card's own back has the rest under
//  Turn it back. The stills beside them keep the note on one side.
//

import SwiftUI

/// The two leaves of a long note on a card that turns over off the table.
enum HolidayCardLeaves {
    /// The note runs onto a second leaf (only with the card table's pen and rules).
    static func has(_ note: String) -> Bool {
        LaunchFeatures.cardTable && CardTableNoteLayout.leaves(note) != nil
    }

    /// The card's button: Turn it over, Read on while the first leaf is up, then Turn it back.
    static func title(showBack: Bool, readsOn: Bool) -> String {
        showBack ? (readsOn ? "Read on" : "Turn it back") : "Turn it over"
    }

    static let spokenReadOn = "Read on, the note continues on a second leaf"

    /// Read on: 0.45 s easing in, or a 0.2 s fade with Reduce Motion.
    static func lift(_ lift: Binding<Double>, reduceMotion: Bool) {
        withAnimation(reduceMotion ? .linear(duration: 0.2) : .timingCurve(0.42, 0, 1, 1, duration: 0.45)) {
            lift.wrappedValue = 1
        }
    }

    /// The first leaf back in place at once, while the picture side is up.
    static func putBack(_ lift: Binding<Double>) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { lift.wrappedValue = 0 }
    }
}

/// The back of a card that turns over, with its shadow: a long note on two leaves, any other on one side.
struct HolidayCardTurningBack<Back: View>: View {
    let note: String
    let lift: Double
    @ViewBuilder let back: (CardTableLeaf) -> Back

    var body: some View {
        Group {
            if HolidayCardLeaves.has(note) {
                HolidayCardLeafBack(lift: lift, back: back)
            } else {
                back(.whole)
            }
        }
        .shadow(color: MailPaper.cardShadow.opacity(0.28), radius: 15, x: 0, y: 14)
    }
}

/// The button under a card that turns over: Turn it over, Read on while a long note's first leaf is up, Turn it back.
struct HolidayCardTurnButton: View {
    @Binding var showBack: Bool
    @Binding var leafLift: Double
    let note: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let readsOn = showBack && leafLift == 0 && HolidayCardLeaves.has(note)
        HolidayCardPaperButton(title: HolidayCardLeaves.title(showBack: showBack, readsOn: readsOn), isPressed: showBack) {
            if readsOn {
                HolidayCardLeaves.lift($leafLift, reduceMotion: reduceMotion)
            } else {
                // Turning it over always starts at the first leaf.
                if !showBack { HolidayCardLeaves.putBack($leafLift) }
                showBack.toggle()
            }
        }
        .accessibilityLabel(readsOn ? HolidayCardLeaves.spokenReadOn : HolidayCardLeaves.title(showBack: showBack, readsOn: false))
    }
}

/// The card's own back (the second leaf) with the first leaf lying on it, lifted as far as `lift` says.
struct HolidayCardLeafBack<Back: View>: View {
    /// 0 lying on the back, 1 lifted and gone.
    let lift: Double
    @ViewBuilder let back: (CardTableLeaf) -> Back
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        back(.second)
            .overlay {
                back(.first)
                    .modifier(HolidayCardLeafLift(progress: lift, fades: reduceMotion))
            }
    }
}

/// The first leaf lifting from its foot about its top edge, 0° to 90°, darkening up to 22%, gone at 90°; or fading.
private struct HolidayCardLeafLift: ViewModifier, Animatable {
    var progress: Double
    let fades: Bool

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        content
            .overlay {
                Color.black.opacity(fades ? 0 : 0.22 * progress)
                    .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
            }
            .rotation3DEffect(.degrees(fades ? 0 : 90 * progress), axis: (x: 1, y: 0, z: 0), anchor: .top, perspective: 0.23)
            .opacity(fades ? 1 - progress : (progress >= 0.999 ? 0 : 1))
            .allowsHitTesting(false)
    }
}
