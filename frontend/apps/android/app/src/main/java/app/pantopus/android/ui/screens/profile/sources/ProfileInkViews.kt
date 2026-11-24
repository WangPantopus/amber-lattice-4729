@file:Suppress("MagicNumber", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.theme.PantopusColors

/*
 * The three inks on screen (SPEC §2, boards 1, 12, 13). The glyph is never the only sign of an ink: every line also
 * carries the word (Seen, Signed or Said) in its "how" line (SPEC §4.16).
 */

/** The board's type, in `sp` so it follows the system font size (PRF: 200% Android font). */
internal object SourcesType {
    /** `.b` — 15/21 regular. */
    val body = TextStyle(fontSize = 15.sp, lineHeight = 21.sp, color = PantopusColors.appText)

    /** `.t` — 15/21 semibold. */
    val title = TextStyle(fontSize = 15.sp, lineHeight = 21.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)

    /** `.t14` — 14/20 semibold. */
    val rowTitle = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)

    /** `.s` — 13/18. */
    val secondary = TextStyle(fontSize = 13.sp, lineHeight = 18.sp, color = PantopusColors.appTextSecondary)

    /** `.c` and `.how` — 12/16. */
    val caption = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, color = PantopusColors.appTextMuted)

    /** `.link` — 13/18 semibold sky. */
    val link = TextStyle(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.primary600)

    /** `.over` — 11/16 semibold, +0.06em, upper case at the call site. */
    val over =
        TextStyle(
            fontSize = 11.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.06.em,
            color = PantopusColors.appTextSecondary,
        )

    /** `.said` — the person's own words: serif italic 16/22. */
    val said =
        TextStyle(
            fontFamily = FontFamily.Serif,
            fontStyle = FontStyle.Italic,
            fontSize = 16.sp,
            lineHeight = 22.sp,
            color = PantopusColors.appTextStrong,
        )

    /** `.h1` — the name, 30/36 bold. */
    val name =
        TextStyle(
            fontSize = 30.sp,
            lineHeight = 36.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.02).em,
            color = PantopusColors.appText,
        )

    /** `.h3` — 20/28 semibold (a month's title). */
    val h3 = TextStyle(fontSize = 20.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
}

/**
 * The ink's glyph (`.g`): Seen a solid dot, Signed a ring with a centre, Said a dotted ring. Decorative: the word
 * beside it says the ink.
 */
@Composable
fun InkGlyph(
    ink: ProfileInk,
    modifier: Modifier = Modifier,
    size: Dp = 10.dp,
    color: Color = PantopusColors.appText,
) {
    Canvas(modifier.size(size).clearAndSetSemantics { }) {
        val r = this.size.minDimension / 2
        val unit = this.size.minDimension / 10f
        when (ink) {
            ProfileInk.Seen -> drawCircle(color, radius = r)
            ProfileInk.Signed -> {
                drawCircle(PantopusColors.appSurface, radius = r)
                drawCircle(color, radius = r - 0.75f * unit, style = Stroke(width = 1.5f * unit))
                drawCircle(color, radius = 1.8f * unit)
            }
            ProfileInk.Said -> {
                drawCircle(PantopusColors.appSurface, radius = r)
                drawCircle(
                    PantopusColors.appTextMuted,
                    radius = r - 0.75f * unit,
                    style =
                        Stroke(
                            width = 1.5f * unit,
                            cap = StrokeCap.Round,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(0.01f, 2.6f * unit)),
                        ),
                )
            }
        }
    }
}

/** "Seen · by mail, June 2026", or just "Seen" when the server sent no how. */
fun inkHow(
    ink: ProfileInk,
    how: String?,
): String = how?.trim()?.takeIf { it.isNotEmpty() }?.let { "${ink.word} · $it" } ?: ink.word

/**
 * One line with its ink (`.ink`): the glyph in a 16 dp column, the text (Said lines in the person's serif), and under
 * it the how line, which always starts with the ink's word. With [showLane] the how line leads with the lane's colour
 * dot (board 13). A line with a [onOpen] opens like a row, with a 48 dp target.
 */
@Composable
fun InkLineRow(
    line: ProfileLine,
    modifier: Modifier = Modifier,
    showLane: Boolean = false,
    onOpen: (() -> Unit)? = null,
) {
    val open =
        if (onOpen != null) {
            Modifier.heightIn(min = 48.dp).clickable(role = Role.Button, onClick = onOpen)
        } else {
            Modifier
        }
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .then(open)
                .semantics(mergeDescendants = true) { }
                .testTag("profileSources.line"),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(16.dp).padding(top = 5.5.dp, start = 3.dp)) { InkGlyph(line.ink) }
        Column(Modifier.weight(1f)) {
            Text(
                text = line.text,
                style = if (line.ink == ProfileInk.Said) SourcesType.said else SourcesType.body,
            )
            Row(
                modifier = Modifier.padding(top = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val lane = line.lane
                if (showLane && lane != null) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(lane.color).clearAndSetSemantics { })
                }
                Text(text = inkHow(line.ink, line.how), style = SourcesType.caption)
            }
        }
    }
}

/** An over-line title (`.over`): upper case, the board's quiet grey, or a lane's colour on the record. */
@Composable
fun SourcesOverline(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = PantopusColors.appTextSecondary,
) {
    Text(
        text = text.uppercase(),
        style = SourcesType.over.copy(color = color),
        modifier = modifier.semantics { heading() },
    )
}

/**
 * The record meter (`.meter`, board 1): a thick part for the months seen, a thin part for signed, dots for said,
 * each as long as its share of the months shown. Decorative beside [InkCounts], which says the same in words.
 */
@Composable
fun InkMeter(
    summary: ProfileSummary,
    modifier: Modifier = Modifier,
) {
    val total = summary.totalMonths.coerceAtLeast(1).toFloat()
    val parts =
        listOf(
            ProfileInk.Seen to summary.seenMonths,
            ProfileInk.Signed to summary.signedMonths,
            ProfileInk.Said to summary.saidMonths,
        ).filter { it.second > 0 }
    Canvas(
        modifier
            .fillMaxWidth()
            .height(8.dp)
            .clearAndSetSemantics { }
            .testTag("profileSources.meter"),
    ) {
        val gap = 3.dp.toPx()
        val usable = size.width - gap * (parts.size - 1).coerceAtLeast(0)
        var x = 0f
        val mid = size.height / 2
        parts.forEachIndexed { i, (ink, months) ->
            // Each part is at least a few dots long, so a small share still shows.
            val w = maxOf(usable * months / total, 6.dp.toPx())
            val end = if (i == parts.lastIndex) size.width else minOf(x + w, size.width)
            when (ink) {
                ProfileInk.Seen -> drawLine(PantopusColors.appText, Offset(x, mid), Offset(end, mid), strokeWidth = 5.dp.toPx())
                ProfileInk.Signed -> drawLine(PantopusColors.appText, Offset(x, mid), Offset(end, mid), strokeWidth = 1.5.dp.toPx())
                ProfileInk.Said ->
                    drawLine(
                        PantopusColors.appTextMuted,
                        Offset(x, mid),
                        Offset(end, mid),
                        strokeWidth = 2.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 3.dp.toPx())),
                    )
            }
            x = end + gap
        }
    }
}

/** The three counts under the meter: each ink's glyph and word, and how long ("8 months", "9 years"). */
@Composable
fun InkCounts(
    summary: ProfileSummary,
    modifier: Modifier = Modifier,
) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
            ProfileInk.Seen to summary.seenMonths,
            ProfileInk.Signed to summary.signedMonths,
            ProfileInk.Said to summary.saidMonths,
        ).forEach { (ink, months) ->
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .semantics(mergeDescendants = true) {
                            contentDescription = "${ink.word}, ${monthsInWords(months)}"
                        },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    InkGlyph(ink)
                    Text(ink.word, style = SourcesType.caption.copy(fontWeight = FontWeight.SemiBold, color = PantopusColors.appTextStrong))
                }
                Text(monthsInWords(months), style = SourcesType.caption)
            }
        }
    }
}

/** "How to read a line" (board 12): the three inks in words. */
@Composable
fun HowToReadLines(
    firstName: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(PantopusColors.appSurfaceSunken)
                .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SourcesOverline("How to read a line")
        listOf(
            ProfileInk.Seen to "Pantopus's own records show it happened.",
            ProfileInk.Signed to "The named person, business or issuer confirmed it.",
            ProfileInk.Said to "$firstName's own words. They fade with age until they are confirmed again.",
        ).forEach { (ink, words) ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.semantics(mergeDescendants = true) { }) {
                Box(Modifier.width(16.dp).padding(top = 4.dp, start = 3.dp)) { InkGlyph(ink) }
                Text(
                    text =
                        buildAnnotatedString {
                            pushStyle(SpanStyle(fontWeight = FontWeight.Bold))
                            append("${ink.word}.")
                            pop()
                            append(" $words")
                        },
                    style = SourcesType.secondary.copy(color = PantopusColors.appText),
                )
            }
        }
    }
}

/** A plain spacer between a card's groups (`.hr`). */
@Composable
internal fun SourcesDivider(modifier: Modifier = Modifier) {
    Spacer(modifier.fillMaxWidth().height(1.dp).background(PantopusColors.appBorderSubtle))
}
