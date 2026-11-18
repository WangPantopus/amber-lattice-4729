package app.pantopus.android.ui.guidance

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * The outlined icons beside a centre card's lines, drawn from Lucide's own shapes (ISC licence, lucide 0.575) at the
 * drawings' 1.75 stroke, as the approved drawings and the web show them. The app's [app.pantopus.android.ui.theme
 * .PantopusIcon] set draws most of these names as filled Material glyphs, and the cards ask for outlines.
 */
@Suppress("MagicNumber")
enum class GuidanceIcon(
    /** Lucide's name for the icon (spec §5). */
    val lucideName: String,
    private val paths: List<String>,
) {
    House(
        "house",
        listOf(
            "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
            "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        ),
    ),
    Lock("lock", listOf(rect(3f, 11f, 18f, 11f, 2f), "M7 11V7a5 5 0 0 1 10 0v4")),
    PanelBottom("panel-bottom", listOf(rect(3f, 3f, 18f, 18f, 2f), "M3 15h18")),
    PanelLeft("panel-left", listOf(rect(3f, 3f, 18f, 18f, 2f), "M9 3v18")),
    ListIcon("list", listOf("M3 5h.01", "M3 12h.01", "M3 19h.01", "M8 5h13", "M8 12h13", "M8 19h13")),
    Sun(
        "sun",
        listOf(
            circle(12f, 12f, 4f),
            "M12 2v2",
            "M12 20v2",
            "m4.93 4.93 1.41 1.41",
            "m17.66 17.66 1.41 1.41",
            "M2 12h2",
            "M20 12h2",
            "m6.34 17.66-1.41 1.41",
            "m19.07 4.93-1.41 1.41",
        ),
    ),
    CircleCheck("circle-check", listOf(circle(12f, 12f, 10f), "m9 12 2 2 4-4")),
    Newspaper(
        "newspaper",
        listOf(
            "M15 18h-5",
            "M18 14h-8",
            "M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2",
            rect(10f, 6f, 8f, 4f, 1f),
        ),
    ),
    Mail("mail", listOf("m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7", rect(2f, 4f, 20f, 16f, 2f))),
    Inbox(
        "inbox",
        listOf(
            "M22 12 L16 12 L14 15 L10 15 L8 12 L2 12",
            "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
        ),
    ),
    Pencil(
        "pencil",
        listOf(
            "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352" +
                "a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
            "m15 5 4 4",
        ),
    ),
    Ellipsis("ellipsis", listOf(circle(12f, 12f, 1f), circle(19f, 12f, 1f), circle(5f, 12f, 1f))),
    Activity(
        "activity",
        listOf(
            "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
        ),
    ),
    MapIcon(
        "map",
        listOf(
            "M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0" +
                "l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z",
            "M15 5.764v15",
            "M9 3.236v15",
        ),
    ),
    Users(
        "users",
        listOf(
            "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
            "M16 3.128a4 4 0 0 1 0 7.744",
            "M22 21v-2a4 4 0 0 0-3-3.87",
            circle(9f, 7f, 4f),
        ),
    ),
    CircleDashed(
        "circle-dashed",
        listOf(
            "M10.1 2.182a10 10 0 0 1 3.8 0",
            "M13.9 21.818a10 10 0 0 1-3.8 0",
            "M17.609 3.721a10 10 0 0 1 2.69 2.7",
            "M2.182 13.9a10 10 0 0 1 0-3.8",
            "M20.279 17.609a10 10 0 0 1-2.7 2.69",
            "M21.818 10.1a10 10 0 0 1 0 3.8",
            "M3.721 6.391a10 10 0 0 1 2.7-2.69",
            "M6.391 20.279a10 10 0 0 1-2.69-2.7",
        ),
    ),
    MapPin(
        "map-pin",
        listOf(
            "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
            circle(12f, 10f, 3f),
        ),
    ),
    Plus("plus", listOf("M5 12h14", "M12 5v14")),
    Calendar("calendar", listOf("M8 2v4", "M16 2v4", rect(3f, 4f, 18f, 18f, 2f), "M3 10h18")),
    Link(
        "link",
        listOf(
            "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
            "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
        ),
    ),
    Bell(
        "bell",
        listOf(
            "M10.268 21a2 2 0 0 0 3.464 0",
            "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
        ),
    ),
    ShieldCheck(
        "shield-check",
        listOf(
            "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 " +
                "1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
            "m9 12 2 2 4-4",
        ),
    ),
    MessageCircle(
        "message-circle",
        listOf(
            "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
        ),
    ),
    Clock("clock", listOf(circle(12f, 12f, 10f), "M12 6v6l4 2")),
    Send(
        "send",
        listOf(
            "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5" +
                "a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
            "m21.854 2.147-10.94 10.939",
        ),
    ),
    X("x", listOf("M18 6 6 18", "m6 6 12 12")),
    ;

    /** The icon as a 24-unit outline; the caller's tint colours it. */
    val vector: ImageVector by lazy {
        val builder =
            ImageVector.Builder(
                name = "guidance.$lucideName",
                defaultWidth = 24.dp,
                defaultHeight = 24.dp,
                viewportWidth = 24f,
                viewportHeight = 24f,
            )
        paths.forEach { d ->
            builder.addPath(
                pathData = addPathNodes(d),
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = STROKE,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        builder.build()
    }

    private companion object {
        const val STROKE = 1.75f
    }
}

/** A circle as path data (SVG `<circle>`): two half arcs. */
@Suppress("MagicNumber")
private fun circle(
    cx: Float,
    cy: Float,
    r: Float,
): String = "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0"

/** A rounded rectangle as path data (SVG `<rect rx>`). */
@Suppress("MagicNumber")
private fun rect(
    x: Float,
    y: Float,
    w: Float,
    h: Float,
    rx: Float,
): String {
    val iw = w - 2 * rx
    val ih = h - 2 * rx
    return "M${x + rx} ${y}h${iw}a$rx $rx 0 0 1 $rx ${rx}v${ih}a$rx $rx 0 0 1 ${-rx} ${rx}h${-iw}" +
        "a$rx $rx 0 0 1 ${-rx} ${-rx}v${-ih}a$rx $rx 0 0 1 $rx ${-rx}z"
}
