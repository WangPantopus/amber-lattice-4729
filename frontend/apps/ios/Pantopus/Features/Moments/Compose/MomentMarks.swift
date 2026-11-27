//
//  MomentMarks.swift
//  Pantopus
//
//  Text and Draw on a Moment's photo (boards T1–T3, plan of 2026-11-20): the
//  lines and labels drawn on it, in the picture's own coordinates. x and y run
//  from 0 to 1 across and down the picture; a line's width and a label's
//  letter size are a share of the picture's width. Never screen points, so
//  the marks land in the same place on the picture whatever frame shows it,
//  and the phone draws them into the photo before it goes up: the server and
//  every app see an ordinary picture. Android keeps the same model.
//

import CoreGraphics
import Foundation

struct MomentMarks: Equatable {
    /// A line drawn with a finger: its points in picture coordinates, its ink, and its width as a share of the
    /// picture's width.
    struct Stroke: Equatable {
        var points: [CGPoint]
        var ink: Ink
        var width: CGFloat
        /// The Studio's Draw (`MomentMarks+Studio`): what drew it, and an ink taken from the photo in the six inks'
        /// place. Today's editor never sets them: a pen line in one of the six inks, drawn as before.
        var pen = Pen.marker
        var tint: Tint?
    }

    /// Words on the picture (Text): where its middle is, in picture coordinates, its letter size as a share of the
    /// picture's width, and its turn about its middle (step R3).
    struct Label: Equatable, Identifiable {
        let id: UUID
        var text: String
        var style: Style
        var ink: Ink
        var center: CGPoint
        var size: CGFloat
        /// Degrees clockwise, in (-180, 180]; 0 when made.
        var turn: CGFloat = 0
        /// The Studio's Text (`MomentMarks+Studio`): its letters, and an ink taken from the photo in the six inks'
        /// place. Today's editor never sets them: bold system letters in one of the six inks, drawn as before.
        var font = Typeface.standard
        var tint: Tint?
    }

    /// The six inks (boards T2, T3); the colors are `MomentsPalette.ink(_:)`.
    enum Ink: String, CaseIterable {
        case white, black, yellow, red, sky, green

        var name: String {
            self == .sky ? "Sky blue" : rawValue.capitalized
        }
    }

    /// The three line widths, as drawn on the screen showing the picture: a new line keeps its share of the
    /// picture's width, so it is as thick on every phone relative to the picture.
    enum Width: String, CaseIterable {
        case thin, medium, thick

        var points: CGFloat {
            switch self {
            case .thin: 3
            case .medium: 5.5
            case .thick: 10
            }
        }

        var name: String {
            "\(rawValue.capitalized) line"
        }
    }

    /// A label's three looks (board T2): plain letters, letters on a dark label, dark letters on a yellow sign.
    enum Style: String, CaseIterable {
        case plain, label, sign
    }

    var strokes: [Stroke] = []
    var labels: [Label] = []

    var isEmpty: Bool {
        strokes.isEmpty && labels.isEmpty
    }

    // MARK: - Limits

    static let maxLabels = 5
    static let maxLetters = 80
    /// The most lines one picture keeps: Undo goes back one at a time, and the drawing stays cheap to redraw.
    static let maxStrokes = 200
    /// The smallest letters a label may have on a picture `aspect` wide (width over height), as a share of its
    /// width: 16 px in the copy the picture check reads, which is 1024 px on its longest side (0.016 of a landscape
    /// picture's width, 0.028 of a 9:16 one's).
    static func minLetterSize(aspect: CGFloat) -> CGFloat {
        16 * max(1, 1 / max(aspect, 0.01)) / 1024
    }

    /// The largest letters, as a share of the picture's width.
    static let maxLetterSize: CGFloat = 0.15
    /// A new label's letters, on the screen showing the picture (board T2).
    static let newLetterPoints: CGFloat = 22

    // MARK: - What every phone shows

    /// The narrowest frame a viewer shows a Moment in (a 9:21 phone, the whole screen on Android) and the widest
    /// (iPhone's shortest: an iPhone SE's screen less the reply bar, about 0.63). Tablets and unfolded phones are
    /// not promised.
    static let narrowestFrame: CGFloat = 9.0 / 21.0
    static let widestFrame: CGFloat = 0.63
    /// The most of a viewer's frame its top covers: the bars, face, name and place, and one row of pills under them
    /// (Live or Taken here or Taken on a date, and the weather). Measured with both pills, the row ends at 19.5% on an
    /// iPhone 17 and 19.2% on an iPhone SE; the tallest is about 21% (a 720 x 1280 Android phone). This leaves a few
    /// points more. A second row, when the pills wrap on the narrowest phones, isn't covered.
    static let topBar: CGFloat = 0.23

    /// Where a label may go on a picture `aspect` wide (width over height), in picture coordinates: the part every
    /// phone's viewer shows (a centered box, as wide as the narrowest frame shows and as tall as the widest one does),
    /// below the lowest line any viewer's top bar reaches in it. The whole label stays inside; drawing is not held to
    /// it. The editor's dashed line is its top.
    static func safeBox(aspect: CGFloat) -> CGRect {
        guard aspect > 0 else { return CGRect(x: 0, y: 0, width: 1, height: 1) }
        let width = min(1, narrowestFrame / aspect)
        let height = min(1, aspect / widestFrame)
        let top = 0.5 - (0.5 - topBar) * height
        return CGRect(x: (1 - width) / 2, y: top, width: width, height: 0.5 + height / 2 - top)
    }

    /// Where a picture `image` big lands when it fills `frame` (centered, cropped, as the viewer shows it), in the
    /// frame's points.
    static func fill(_ image: CGSize, in frame: CGSize) -> CGRect {
        guard image.width > 0, image.height > 0 else { return CGRect(origin: .zero, size: frame) }
        let scale = max(frame.width / image.width, frame.height / image.height)
        let size = CGSize(width: image.width * scale, height: image.height * scale)
        return CGRect(x: (frame.width - size.width) / 2, y: (frame.height - size.height) / 2, width: size.width, height: size.height)
    }
}
