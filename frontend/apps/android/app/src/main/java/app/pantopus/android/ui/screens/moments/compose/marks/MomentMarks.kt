@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.compose.marks

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import app.pantopus.android.ui.theme.PantopusColors
import kotlin.math.min

/*
 * Text and Draw on a Moment's photo (plan part 1, boards T2 and T3). Marks live in the picture's own coordinates, the
 * same on iPhone: x and y run 0 to 1 across the upright picture's width and down its height, and a line's width or a
 * label's letters are a share of the picture's width. Never screen points: the picture is cropped differently on every
 * phone. They are drawn into the photo on the phone, so the server and every app receive an ordinary JPEG.
 */

/** The six inks (boards T2 and T3), the same on iPhone; [key] is the test id's last part. */
enum class MomentInk(
    val key: String,
    val spoken: String,
) {
    White("white", "White"),
    Black("black", "Black"),
    Yellow("yellow", "Yellow"),
    Red("red", "Red"),
    Sky("sky", "Sky blue"),
    Green("green", "Green"),
    ;

    val color: Color
        get() =
            when (this) {
                White -> PantopusColors.momentInkWhite
                Black -> PantopusColors.momentInkBlack
                Yellow -> PantopusColors.momentInkYellow
                Red -> PantopusColors.momentInkRed
                Sky -> PantopusColors.momentInkSky
                Green -> PantopusColors.momentInkGreen
            }
}

/**
 * Draw's three line widths, in dp on the screen showing the picture (as iPhone's points): a new line keeps that share of
 * the picture's width as shown, so it looks the same whatever the picture's shape.
 */
enum class MomentLineWidth(
    val key: String,
    val spoken: String,
    val points: Float,
) {
    Thin("thin", "Thin line", 3f),
    Medium("medium", "Medium line", 5.5f),
    Thick("thick", "Thick line", 10f),
}

/** Text's three styles (board T2): words alone, words on a dark box, dark words on a box of the ink. */
enum class MomentLabelStyle(
    val key: String,
    val spoken: String,
) {
    Plain("plain", "Plain"),
    Label("label", "Label"),
    Sign("sign", "Sign"),
}

/** One line drawn with a finger. */
@Immutable
data class MomentStroke(
    /** x0, y0, x1, y1, …: 0 to 1 across the picture's width and down its height. */
    val points: List<Float>,
    val ink: MomentInk,
    /** The line's width as a share of the picture's width. */
    val width: Float,
)

/** One label written on the picture. */
@Immutable
data class MomentLabel(
    /** Tells labels apart while they move (unique within one picture's marks). */
    val id: Int,
    val text: String,
    /** Its middle: 0 to 1 across the picture's width and down its height. */
    val x: Float,
    val y: Float,
    /** Letter size as a share of the picture's width. */
    val size: Float,
    val style: MomentLabelStyle,
    val ink: MomentInk,
)

/** Everything written and drawn on one picture. */
@Immutable
data class MomentMarks(
    val strokes: List<MomentStroke> = emptyList(),
    val labels: List<MomentLabel> = emptyList(),
) {
    /** Nothing that would show: no line, and no label with words. */
    val isEmpty: Boolean get() = strokes.isEmpty() && labels.none { it.text.isNotBlank() }
}

/** Which tool the editor opened with: the Post screen's "Text" or "Draw" pill. */
enum class MomentMarksTool { Text, Draw }

/**
 * The marks editor while it is open: the marks as they are now, as they were when it opened (the X goes back to those),
 * and the ink and width picked. Kept on the view model, so turning the phone keeps all of it.
 */
@Immutable
data class MomentMarksEditing(
    val tool: MomentMarksTool,
    val marks: MomentMarks,
    val atOpen: MomentMarks,
    val ink: MomentInk = MomentInk.Yellow,
    val width: MomentLineWidth = MomentLineWidth.Medium,
) {
    /** Something changed in this visit: the X asks before it drops it. */
    val changed: Boolean get() = marks != atOpen

    /** A line drawn: [points] in picture coordinates, [width] a share of the picture's width. */
    fun drawn(
        points: List<Float>,
        width: Float,
    ): MomentMarksEditing =
        if (points.size < 2 || marks.strokes.size >= MomentMarkRules.MAX_STROKES) {
            this
        } else {
            copy(marks = marks.copy(strokes = marks.strokes + MomentStroke(points, ink, width)))
        }

    /** Undo: the last line goes. */
    fun undone(): MomentMarksEditing = copy(marks = marks.copy(strokes = marks.strokes.dropLast(1)))
}

/** The limits both phones keep, and the part of a picture every phone shows (the same numbers as iPhone's). */
object MomentMarkRules {
    const val MAX_LABELS = 5
    const val MAX_LABEL_CHARS = 80

    /** The most lines one picture keeps: Undo goes back one at a time, and the drawing stays cheap to redraw. */
    const val MAX_STROKES = 200

    /**
     * The smallest letters, as a share of the picture's width: about 14 px on a tall photo in the 1024-px copy the
     * picture check reads.
     */
    const val SMALLEST_LETTERS = 0.025f

    /** A new label's letters, in dp on the screen showing the picture (board T2). */
    const val NEW_LABEL_POINTS = 22f

    /** The narrowest frame a viewer shows a Moment in (a 9:21 phone) and the widest (iPhone SE's, less its reply bar). */
    private const val NARROWEST_FRAME = 9f / 21f
    private const val WIDEST_FRAME = 0.63f

    /**
     * The part of a picture every phone shows, centred, as shares of its width and height: as wide as a 9:21 screen
     * shows and as tall as iPhone's shortest viewer frame shows. Labels stay inside it; drawing doesn't. Tablets and
     * unfolded phones are not promised.
     */
    fun everyPhoneShows(
        pictureWidth: Int,
        pictureHeight: Int,
    ): Pair<Float, Float> {
        val aspect = pictureWidth.toFloat() / pictureHeight.coerceAtLeast(1)
        return min(1f, NARROWEST_FRAME / aspect) to min(1f, aspect / WIDEST_FRAME)
    }
}
