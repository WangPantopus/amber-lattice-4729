@file:Suppress("LongMethod", "MagicNumber", "CyclomaticComplexMethod")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.screens.profile.profileLargeText
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/** The chart's drawing units (board 7, `fan_chart`): 358 across, the baseline at 184, the bands from 26 to 172. */
private const val CHART_W = 358f
private const val CHART_H = 206f
private const val BASE_Y = 184f
private const val R0 = 26f
private const val R1 = 172f

/** Year chips' key for pieces with no month: they still have a chip, so none is out of reach. */
private const val NO_YEAR = 0

/**
 * The work line card (board 7): "<n> years of work · <m> pieces", the work rings opened flat with a dot a piece in its
 * ink, the key, and, when the tab's full list of pieces follows ([list]), the year chips, All / Did / Built and that
 * year's pieces. [known] is every piece on the tab, so a dot can take its piece's ink when the server sends none.
 */
@Composable
internal fun WorkLineCard(
    rings: ProfileBlock.WorkRings,
    list: ProfileBlock.Pieces?,
    known: List<WorkPiece>,
    firstName: String,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    val inks = remember(known) { known.associate { it.id to it.line.ink } }
    val total = rings.years.sumOf { it.second }.takeIf { it > 0 } ?: list?.pieces?.size ?: 0
    val years =
        remember(rings, list) {
            val counted = rings.years.filter { it.second > 0 }.sortedByDescending { it.first }
            val undated = list?.pieces?.count { it.year == null } ?: 0
            if (undated > 0) counted + (NO_YEAR to undated) else counted
        }
    var chosenYear by rememberSaveable(rings.id) { mutableStateOf(years.firstOrNull()?.first) }
    var chosenKind by rememberSaveable(rings.id) { mutableStateOf("all") }
    Column(Modifier.sourcesCard().padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = if (list != null) 6.dp else 12.dp)) {
        Box(Modifier.padding(horizontal = 4.dp)) {
            BlockTitle(title = rings.title, trailing = total.takeIf { it > 0 }?.let { if (it == 1) "1 piece" else "$it pieces" })
        }
        WorkLineChart(rings, inks, firstName)
        WorkLineKey()
        if (list != null) {
            if (years.size > 1 || (years.size == 1 && years.first().first == NO_YEAR)) {
                YearChips(years, chosenYear) { chosenYear = it }
            }
            val kinds = kindOptions(list)
            if (kinds.size > 1) KindSwitch(kinds, chosenKind) { chosenKind = it }
            val shown =
                list.pieces.filter { piece ->
                    val inYear = chosenYear == null || (piece.year ?: NO_YEAR) == chosenYear
                    inYear && (chosenKind == "all" || piece.kind == chosenKind)
                }
            if (shown.isEmpty()) {
                Text(
                    text = "Nothing ${kindWordLower(chosenKind)}in ${yearWord(chosenYear)}.",
                    style = SourcesType.caption,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 14.dp),
                )
            }
            shown.forEachIndexed { index, piece ->
                if (index > 0) SourcesDivider()
                WorkLineRow(piece, byYear = chosenYear != null && chosenYear != NO_YEAR, open = open)
            }
            list.more?.let { more ->
                val onMore = open(more.link)
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .then(if (onMore != null) Modifier.clickable(role = Role.Button, onClick = onMore) else Modifier),
                    contentAlignment = Alignment.Center,
                ) { Text(more.text, style = SourcesType.link) }
            }
        }
    }
}

/**
 * The work rings opened flat: a half band a year from the first at the centre to this year outside (lit), months left
 * to right, the work line in its inks, a dot a piece (filled Seen, ringed Signed, dashed Said), and under it "Jan" and
 * the years at their bands' feet.
 */
@Composable
private fun WorkLineChart(
    block: ProfileBlock.WorkRings,
    inks: Map<String, ProfileInk>,
    firstName: String,
) {
    val rings = block.rings
    val years = rings.years
    val grid = rings.lane(ProfileLane.Work)
    BoxWithConstraints(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        val widthPx = with(LocalDensity.current) { maxWidth.toPx() }
        val unit = widthPx / CHART_W
        val pitch = (R1 - R0) / years.size.coerceAtLeast(1)

        fun radius(i: Int) = (R0 + i * pitch + pitch / 2) * unit
        Column {
            Canvas(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(CHART_W / CHART_H)
                        .semantics {
                            contentDescription =
                                "$firstName's work rings opened flat: each band is a year from ${years.first()} at the centre to " +
                                "${years.last()} outside, months run left to right, and each dot is a piece."
                        },
            ) {
                val cx = size.width / 2
                val cy = BASE_Y * unit
                val color = PantopusColors.business
                years.forEachIndexed { i, year ->
                    val r = radius(i)
                    drawArc(
                        if (year == rings.now.year) PantopusColors.businessBg else PantopusColors.appSurfaceSunken,
                        180f,
                        180f,
                        false,
                        Offset(cx - r, cy - r),
                        Size(r * 2, r * 2),
                        style = Stroke(width = (pitch - 2.2f) * unit),
                    )
                }
                years.forEachIndexed { i, year ->
                    val r = radius(i)
                    val growing = year == rings.now.year
                    for (run in ringRuns(grid[i], rings.nowFraction.takeIf { growing })) {
                        val stroke =
                            when (run.ink) {
                                ProfileInk.Seen -> Stroke(width = 3f * unit, cap = StrokeCap.Butt)
                                ProfileInk.Signed -> Stroke(width = 1.3f * unit, cap = StrokeCap.Butt)
                                ProfileInk.Said ->
                                    Stroke(
                                        width = 1.5f * unit,
                                        cap = StrokeCap.Round,
                                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(0.01f, 3.5f * unit)),
                                    )
                            }
                        drawArc(
                            color,
                            180f + run.start * 15f,
                            (run.end - run.start) * 15f,
                            false,
                            Offset(cx - r, cy - r),
                            Size(r * 2, r * 2),
                            style = stroke,
                        )
                    }
                }
                block.dots.forEach { dot ->
                    val i = years.indexOf(dot.year)
                    if (i < 0) return@forEach
                    val r = radius(i)
                    val a = Math.toRadians(180.0 + 15.0 * (dot.month + 0.5))
                    val p = Offset(cx + r * cos(a).toFloat(), cy + r * sin(a).toFloat())
                    drawCircle(PantopusColors.appSurface, radius = 4.7f * unit, center = p)
                    when (dot.ink ?: inks[dot.pieceId] ?: ProfileInk.Said) {
                        ProfileInk.Seen -> drawCircle(color, radius = 3.3f * unit, center = p)
                        ProfileInk.Signed -> {
                            drawCircle(color, radius = 3.1f * unit, center = p, style = Stroke(width = 1.2f * unit))
                            drawCircle(color, radius = 1.3f * unit, center = p)
                        }
                        ProfileInk.Said ->
                            drawCircle(
                                color,
                                radius = 3.1f * unit,
                                center = p,
                                style =
                                    Stroke(
                                        width = 1.1f * unit,
                                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(1.4f * unit, 1.4f * unit)),
                                    ),
                            )
                    }
                }
                drawLine(
                    PantopusColors.appBorderStrong,
                    Offset(cx - (R1 + 4f) * unit, cy),
                    Offset(cx + (R1 + 4f) * unit, cy),
                    strokeWidth = unit,
                )
            }
            // "Jan" at the outer band's left foot; the first, a middle and this year at their bands' right feet. At the
            // largest text the middle one is left out, so no two labels run into each other.
            val middle = if (profileLargeText()) null else years.size / 2
            val labelled = listOfNotNull(0, middle, years.lastIndex).distinct().filter { years.size > 1 || it == years.lastIndex }
            Box(Modifier.fillMaxWidth().clearAndSetSemantics { }) {
                val cx = widthPx / 2
                Text("Jan", style = SourcesType.caption, modifier = Modifier.centredAt(cx - radius(years.lastIndex)))
                labelled.forEach { i ->
                    val now = years[i] == rings.now.year
                    Text(
                        text = years[i].toString(),
                        style =
                            if (now) {
                                SourcesType.caption.copy(color = PantopusColors.business, fontWeight = FontWeight.SemiBold)
                            } else {
                                SourcesType.caption
                            },
                        modifier = Modifier.centredAt(cx + radius(i)),
                    )
                }
            }
        }
    }
}

/** Places a label with its middle at [x] px along the row, kept inside the row. */
private fun Modifier.centredAt(x: Float): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(constraints.copy(minWidth = 0))
        layout(constraints.maxWidth, placeable.height) {
            val left = (x - placeable.width / 2f).roundToInt().coerceIn(0, (constraints.maxWidth - placeable.width).coerceAtLeast(0))
            placeable.place(left, 0)
        }
    }

/** The key under the chart: the three inks, each with its word, and "A dot is a piece". */
@Composable
private fun WorkLineKey() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProfileInk.entries.forEach { ink ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                InkGlyph(ink, color = PantopusColors.business)
                Text(ink.word, style = SourcesType.caption)
            }
        }
        Text("A dot is a piece", style = SourcesType.caption)
    }
}

/** The years as chips ("2026 · 5"), the chosen one dark (board 7). */
@Composable
private fun YearChips(
    years: List<Pair<Int, Int>>,
    chosen: Int?,
    onChoose: (Int) -> Unit,
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).selectableGroup(),
        contentPadding = PaddingValues(horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(years, key = { it.first }) { (year, count) ->
            val selected = year == chosen
            Box(
                modifier =
                    Modifier
                        .heightIn(min = 48.dp)
                        .selectable(selected = selected, role = Role.Tab, onClick = { onChoose(year) })
                        .semantics { contentDescription = "${yearWord(year)}, ${if (count == 1) "1 piece" else "$count pieces"}" },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "${if (year == NO_YEAR) "No date" else year} · $count",
                    style =
                        SourcesType.secondary.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = if (selected) PantopusColors.appTextInverse else PantopusColors.appText,
                        ),
                    modifier =
                        Modifier
                            .clip(RoundedCornerShape(50))
                            .background(if (selected) PantopusColors.appText else PantopusColors.appSurfaceSunken)
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
    }
}

/** All / Did / Built (board 7): one segment a kind the list has. */
@Composable
private fun KindSwitch(
    kinds: List<String>,
    chosen: String,
    onChoose: (String) -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(start = 4.dp, end = 4.dp, top = 4.dp, bottom = 4.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(PantopusColors.appSurfaceSunken)
                .padding(3.dp)
                .selectableGroup(),
    ) {
        kinds.forEach { kind ->
            val selected = kind == chosen
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .then(
                            if (selected) {
                                Modifier
                                    .background(PantopusColors.appSurface)
                                    .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(10.dp))
                            } else {
                                Modifier
                            },
                        )
                        .selectable(selected = selected, role = Role.Tab, onClick = { onChoose(kind) }),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = kindWord(kind),
                    style =
                        SourcesType.rowTitle.copy(
                            color = if (selected) PantopusColors.appText else PantopusColors.appTextSecondary,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        ),
                )
            }
        }
    }
}

/** A piece in the work line's list: its picture, title, and "● Seen · Built · August" (the ink's word first). */
@Composable
private fun WorkLineRow(
    piece: WorkPiece,
    byYear: Boolean,
    open: (ProfilePageLink?) -> (() -> Unit)?,
) {
    val onOpen = open(piece.line.link ?: ProfilePageLink.Piece(piece.id))
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
                .padding(horizontal = 4.dp, vertical = 12.dp)
                .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // A piece with no picture keeps the soft tinted tile with the tool mark (as on iPhone).
        Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(PantopusColors.businessBg).clearAndSetSemantics { }) {
            PieceImage(piece.coverUrl, iconSize = 20.dp)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(piece.title, style = SourcesType.rowTitle)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                InkGlyph(piece.line.ink)
                Text(
                    text =
                        listOfNotNull(
                            piece.line.ink.word,
                            pieceKindWord(piece.kind),
                            if (byYear) piece.monthWord else piece.whenText,
                            // Only the owner is sent these: the piece reaches nobody else yet.
                            "Draft".takeIf { piece.draft },
                            "Hidden".takeIf { piece.hidden },
                        ).joinToString(" · "),
                    style = SourcesType.caption,
                )
            }
        }
        if (onOpen != null) {
            PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 18.dp, tint = PantopusColors.appTextMuted)
        }
    }
}

/** The kinds to choose from: the server's, else All and each kind the list has, when it has more than one. */
private fun kindOptions(list: ProfileBlock.Pieces): List<String> {
    if (list.filters.isNotEmpty()) return (listOf("all") + list.filters).distinct()
    val kinds = listOf("did", "built", "owns").filter { kind -> list.pieces.any { it.kind == kind } }
    return if (kinds.size > 1) listOf("all") + kinds else emptyList()
}

private fun kindWord(kind: String): String = pieceKindWord(kind) ?: "All"

private fun kindWordLower(kind: String): String =
    when (kind) {
        "did" -> "done "
        "built" -> "built "
        "owns" -> "owned "
        else -> ""
    }

private fun yearWord(year: Int?): String = if (year == null || year == NO_YEAR) "no year" else year.toString()
