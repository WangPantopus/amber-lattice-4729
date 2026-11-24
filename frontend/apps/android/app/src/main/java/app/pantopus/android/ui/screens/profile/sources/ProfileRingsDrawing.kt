@file:Suppress("MagicNumber", "LongMethod", "LongParameterList")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.theme.PantopusColors
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.sin

/*
 * The rings, drawn from month data as `design-src/gen/make_assets.py` draws them (SPEC §2 "Rings"): one ring a year,
 * January at the top, clockwise; thick where a month has something seen, thin where signed, dotted where said.
 * Geometry is in the drawings' own units (a 176-unit mark, a 384-unit chart) and scaled to the space given.
 */

/** Degrees of one month on a ring. */
private const val MONTH_DEGREES = 30f

/** January's start: the top of the ring. */
private const val TOP_DEGREES = -90f

/** One ink's stroke on a ring: thick for Seen, thin for Signed, dots for Said. */
private fun DrawScope.inkArc(
    center: Offset,
    radius: Float,
    run: RingRun,
    color: Color,
    seenWidth: Float,
    thinWidth: Float,
    alpha: Float = 1f,
) {
    val sweep = (run.end - run.start) * MONTH_DEGREES
    val start = TOP_DEGREES + run.start * MONTH_DEGREES
    val stroke =
        when (run.ink) {
            ProfileInk.Seen -> Stroke(width = seenWidth, cap = StrokeCap.Butt)
            ProfileInk.Signed -> Stroke(width = thinWidth, cap = StrokeCap.Butt)
            ProfileInk.Said ->
                Stroke(
                    width = thinWidth * 1.15f,
                    cap = StrokeCap.Round,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(0.01f, thinWidth * 2.7f)),
                )
        }
    drawArc(
        color = color,
        startAngle = start,
        sweepAngle = sweep,
        useCenter = false,
        topLeft = Offset(center.x - radius, center.y - radius),
        size = Size(radius * 2, radius * 2),
        alpha = alpha,
        style = stroke,
    )
}

/** A point on a ring at [degrees] (0 = three o'clock, clockwise). */
private fun pointOn(
    center: Offset,
    radius: Float,
    degrees: Float,
): Offset {
    val a = degrees * PI.toFloat() / 180f
    return Offset(center.x + radius * cos(a), center.y + radius * sin(a))
}

/**
 * The mark around a portrait (board 1, `header_mark`): one line a year in the text colour, the strongest ink per month,
 * a faint guide circle under each year, and a sky dot where today is. The portrait sits in the middle ([content]); the
 * mark is [size] across (176 on the board, with an 80 portrait).
 */
@Composable
fun ProfileRingMark(
    rings: ProfileRings,
    contentDescription: String,
    modifier: Modifier = Modifier,
    size: Dp = 176.dp,
    content: @Composable () -> Unit = {},
) {
    val merged = remember(rings) { rings.merged() }
    val years = rings.years
    Box(
        modifier =
            modifier
                .size(size)
                .semantics { this.contentDescription = contentDescription }
                .testTag("profileSources.ringMark"),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(size)) {
            val unit = this.size.minDimension / MARK_UNITS
            val c = center
            val n = years.size
            val rIn = 47f
            val rOut = 83f
            val pitch = if (n > 1) minOf(5.6f, (rOut - rIn) / (n - 1)) else 0f
            val seenW = if (n > 1) (pitch * 0.62f).coerceIn(1.7f, 2.6f) else 2.6f
            val thinW = minOf(1.2f, seenW * 0.5f)
            drawCircle(PantopusColors.appSurface, radius = (MARK_UNITS / 2 - 1) * unit, center = c)
            var nowPoint: Offset? = null
            years.forEachIndexed { i, year ->
                val r = (rIn + i * pitch) * unit
                drawCircle(PantopusColors.appBorder, radius = r, center = c, style = Stroke(width = 0.8f * unit))
                val growing = year == rings.now.year
                for (run in ringRuns(merged[i], rings.nowFraction.takeIf { growing })) {
                    inkArc(c, r, run, PantopusColors.appText, seenW * unit, thinW * unit)
                }
                if (growing) nowPoint = pointOn(c, r, TOP_DEGREES + MONTH_DEGREES * rings.nowFraction)
            }
            nowPoint?.let { p ->
                drawCircle(PantopusColors.appSurface, radius = (3.6f + 1.6f) * unit, center = p)
                drawCircle(PantopusColors.profileRecordNow, radius = 3.6f * unit, center = p)
            }
        }
        content()
    }
}

private const val MARK_UNITS = 176f

/** A month on the full chart: the year (calendar year) and the month (0 = January). */
data class RecordMonth(
    val year: Int,
    val month: Int,
)

/** The full chart's layout for [yearCount] rings, in chart units (`full_chart`, kept to the board's 12-year look). */
private class ChartGeometry(
    yearCount: Int,
) {
    val outer = 160f
    val pitch = minOf((outer - 30f) / yearCount.coerceAtLeast(1), 14f)
    val inner = outer - pitch * yearCount.coerceAtLeast(1)
    val lanePitch = pitch * 0.27f
    val band = lanePitch * 2 + 3f

    fun laneRadius(
        yearIndex: Int,
        laneIndex: Int,
    ) = inner + yearIndex * pitch + 1.2f + laneIndex * lanePitch

    fun bandRadius(yearIndex: Int) = inner + yearIndex * pitch + lanePitch + 1.2f
}

private const val CHART_UNITS = 384f

/**
 * The Record chart (board 12, `full_chart`): three lines a year, home inside, work, with others outside, in the app's
 * home, business and personal colours; the year's band behind them; month ticks with Jan, Apr, Jul, Oct; the first
 * year in the middle; a sky dot at today. [lanes] are the lanes this viewer may see (the server drops a line whose
 * part is off; SPEC §4.3), so a hidden lane is simply not drawn. With [selected], that year is lit, the others dim,
 * and the month is marked (board 13). A tap opens the month under the finger ([onOpenMonth]); TalkBack reads
 * [contentDescription] and offers "Open this month" for today's month.
 */
@Composable
fun ProfileRecordChart(
    rings: ProfileRings,
    lanes: Set<ProfileLane>,
    contentDescription: String,
    modifier: Modifier = Modifier,
    selected: RecordMonth? = null,
    onOpenMonth: ((RecordMonth) -> Unit)? = null,
) {
    val years = rings.years
    val grids = remember(rings) { ProfileLane.entries.associateWith { rings.lane(it) } }
    val measurer = rememberTextMeasurer()
    val geometry = remember(years.size) { ChartGeometry(years.size) }
    val tap =
        if (onOpenMonth == null) {
            Modifier
        } else {
            Modifier.pointerInput(years, geometry) {
                detectTapGestures { offset ->
                    val unit = size.width.toFloat() / CHART_UNITS
                    monthAt(offset, Offset(size.width / 2f, size.height / 2f), unit, geometry, years, rings)?.let(onOpenMonth)
                }
            }
        }
    Canvas(
        modifier =
            modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .then(tap)
                .semantics {
                    this.contentDescription = contentDescription
                    if (onOpenMonth != null) {
                        customActions =
                            listOf(
                                CustomAccessibilityAction("Open this month") {
                                    onOpenMonth(RecordMonth(rings.now.year, rings.now.monthValue - 1))
                                    true
                                },
                            )
                    }
                }.testTag("profileSources.recordChart"),
    ) {
        val unit = size.minDimension / CHART_UNITS
        val c = center
        val g = geometry
        years.forEachIndexed { i, year ->
            val fill =
                when {
                    selected == null -> PantopusColors.profileRecordYearBand
                    year == selected.year -> PantopusColors.personalBg
                    else -> PantopusColors.appSurfaceSunken
                }
            drawCircle(fill, radius = g.bandRadius(i) * unit, center = c, style = Stroke(width = g.band * unit))
        }
        for (m in 0 until ProfileRings.MONTHS) {
            val deg = TOP_DEGREES + MONTH_DEGREES * m
            val from = pointOn(c, (g.outer + 3f) * unit, deg)
            val to = pointOn(c, (g.outer + if (m % 3 == 0) 8f else 6f) * unit, deg)
            drawLine(PantopusColors.profileRecordTick, from, to, strokeWidth = 1f * unit)
        }
        drawMonthLabels(measurer, c, (g.outer + 9f) * unit, unit)
        var nowRadius = 0f
        years.forEachIndexed { i, year ->
            val alpha = if (selected != null && year != selected.year) 0.32f else 1f
            val growing = year == rings.now.year
            ProfileLane.entries.forEachIndexed { li, lane ->
                val r = g.laneRadius(i, li) * unit
                if (lane in lanes) {
                    for (run in ringRuns(grids.getValue(lane)[i], rings.nowFraction.takeIf { growing })) {
                        inkArc(c, r, run, lane.color, 2.9f * unit, 1.5f * unit, alpha)
                    }
                }
                if (growing && li == ProfileLane.entries.lastIndex) nowRadius = r
            }
        }
        if (selected != null) {
            drawMonthWedge(c, g, unit, selected.month)
        } else if (nowRadius > 0f) {
            val p = pointOn(c, nowRadius + 4.5f * unit, TOP_DEGREES + MONTH_DEGREES * rings.nowFraction)
            drawCircle(PantopusColors.appSurface, radius = (3.6f + 1.6f) * unit, center = p)
            drawCircle(PantopusColors.profileRecordNow, radius = 3.6f * unit, center = p)
        }
        val core = minOf(g.inner - 7f, 23f).coerceAtLeast(14f) * unit
        drawCircle(PantopusColors.appSurfaceSunken, radius = core, center = c)
        val label =
            measurer.measure(
                years.first().toString(),
                TextStyle(fontSize = (10f * unit).toSp(), fontWeight = FontWeight.Bold, color = PantopusColors.appTextSecondary),
            )
        drawText(label, topLeft = Offset(c.x - label.size.width / 2f, c.y - label.size.height / 2f))
    }
}

private fun DrawScope.drawMonthLabels(
    measurer: TextMeasurer,
    center: Offset,
    radius: Float,
    unit: Float,
) {
    val style = TextStyle(fontSize = (10f * unit).toSp(), fontWeight = FontWeight.SemiBold, color = PantopusColors.appTextMuted)
    listOf("Jan" to -90f, "Apr" to 0f, "Jul" to 90f, "Oct" to 180f).forEach { (word, deg) ->
        val text = measurer.measure(word, style)
        val p = pointOn(center, radius, deg)
        val w = text.size.width.toFloat()
        val h = text.size.height.toFloat()
        val topLeft =
            when (deg) {
                -90f -> Offset(p.x - w / 2, p.y - h - 1f * unit)
                0f -> Offset(p.x + 3f * unit, p.y - h / 2)
                90f -> Offset(p.x - w / 2, p.y + 1f * unit)
                else -> Offset(p.x - w - 3f * unit, p.y - h / 2)
            }
        drawText(text, topLeft = topLeft)
    }
}

private fun DrawScope.drawMonthWedge(
    center: Offset,
    g: ChartGeometry,
    unit: Float,
    month: Int,
) {
    val a0 = TOP_DEGREES + MONTH_DEGREES * month
    val inner = (g.inner - 6f).coerceAtLeast(4f) * unit
    val outer = (g.outer + 2f) * unit
    val path =
        Path().apply {
            val start = pointOn(center, inner, a0)
            moveTo(start.x, start.y)
            val outerStart = pointOn(center, outer, a0)
            lineTo(outerStart.x, outerStart.y)
            arcTo(
                rect = Rect(center, outer),
                startAngleDegrees = a0,
                sweepAngleDegrees = MONTH_DEGREES,
                forceMoveTo = false,
            )
            val innerEnd = pointOn(center, inner, a0 + MONTH_DEGREES)
            lineTo(innerEnd.x, innerEnd.y)
            arcTo(
                rect = Rect(center, inner),
                startAngleDegrees = a0 + MONTH_DEGREES,
                sweepAngleDegrees = -MONTH_DEGREES,
                forceMoveTo = false,
            )
            close()
        }
    drawPath(path, PantopusColors.profileRecordNow, alpha = 0.10f, style = Fill)
    drawPath(path, PantopusColors.profileRecordNow, style = Stroke(width = 1.2f * unit))
}

/** The month under a tap on the full chart, or null outside the rings or after today. */
private fun monthAt(
    tap: Offset,
    center: Offset,
    unit: Float,
    g: ChartGeometry,
    years: List<Int>,
    rings: ProfileRings,
): RecordMonth? {
    val dx = tap.x - center.x
    val dy = tap.y - center.y
    val r = hypot(dx, dy) / unit
    if (r < g.inner - 6f || r > g.outer + 8f) return null
    val index = floor((r - g.inner) / g.pitch).toInt().coerceIn(0, years.lastIndex)
    var deg = atan2(dy, dx) * 180f / PI.toFloat() - TOP_DEGREES
    while (deg < 0f) deg += 360f
    val month = (deg / MONTH_DEGREES).toInt().coerceIn(0, ProfileRings.MONTHS - 1)
    val picked = RecordMonth(years[index], month)
    val nowMonth = RecordMonth(rings.now.year, rings.now.monthValue - 1)
    return picked.takeIf { it.year < nowMonth.year || (it.year == nowMonth.year && it.month <= nowMonth.month) }
}
