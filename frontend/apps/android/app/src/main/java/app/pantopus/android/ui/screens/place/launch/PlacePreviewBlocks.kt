@file:Suppress("MatchingDeclarationName")

package app.pantopus.android.ui.screens.place.launch

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.ScrollableState
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.place.PlaceMoneyFigure
import app.pantopus.android.data.api.models.place.PlaceMoneyTrend
import app.pantopus.android.data.api.models.place.PlacePreviewAhaTone
import app.pantopus.android.data.api.models.place.PlacePreviewGlanceRow
import app.pantopus.android.data.api.models.place.PlacePreviewMoney
import app.pantopus.android.data.api.models.place.PlacePreviewNotChecked
import app.pantopus.android.ui.screens.place.components.placeCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

// ─── LOOKUPORDER: the glance card, the money card and the could-not-check line ───

/**
 * Where the lookup's section cards sit, so a glance line can take the page to its card (LOOKUPORDER 1.2). Works for
 * the launch preview's scrolling column and the saved-address root's list alike: both scroll a [ScrollableState].
 */
@Stable
internal class PreviewJumps(private val scrollable: ScrollableState) {
    private val tops = HashMap<String, Float>()
    private var viewportTop = 0f

    /** On the scrolling container itself (outside its scroll): where the visible page starts. */
    fun viewport(): Modifier = Modifier.onGloballyPositioned { viewportTop = it.positionInWindow().y }

    /** On a card a glance line can go to. */
    fun anchor(sectionId: String): Modifier = Modifier.onGloballyPositioned { tops[sectionId] = it.positionInWindow().y }

    fun canJump(sectionId: String?): Boolean = sectionId != null && sectionId in tops

    /** Scrolls [sectionId]'s card to the top of the page, a little below its edge. */
    suspend fun jump(
        sectionId: String,
        margin: Float,
    ) {
        val top = tops[sectionId] ?: return
        scrollable.animateScrollBy(top - viewportTop - margin)
    }
}

@Composable
internal fun rememberPreviewJumps(scrollable: ScrollableState): PreviewJumps = remember(scrollable) { PreviewJumps(scrollable) }

private fun glanceDot(tone: PlacePreviewAhaTone) =
    when (tone) {
        PlacePreviewAhaTone.ALERT -> PantopusColors.error
        PlacePreviewAhaTone.WATCH -> PantopusColors.warning
        PlacePreviewAhaTone.CALM -> PantopusColors.success
        PlacePreviewAhaTone.INFO -> PantopusColors.info
    }

private fun glanceToneWord(tone: PlacePreviewAhaTone) =
    when (tone) {
        PlacePreviewAhaTone.ALERT -> "Stands out"
        PlacePreviewAhaTone.WATCH -> "Worth a look"
        PlacePreviewAhaTone.CALM -> "Calm"
        PlacePreviewAhaTone.INFO -> null
    }

/** "At a glance": every check in one card, worst first, a toned dot each (LOOKUPORDER 1.2). */
@Composable
internal fun PreviewGlanceCard(
    rows: List<PlacePreviewGlanceRow>,
    onTap: ((PlacePreviewGlanceRow) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth().placeCard().padding(vertical = Spacing.s3).testTag("place.preview.glance"),
    ) {
        Text(
            "At a glance",
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = PantopusColors.appText,
            modifier = Modifier.padding(horizontal = Spacing.s4).padding(bottom = Spacing.s1).semantics { heading() },
        )
        rows.forEach { row ->
            val tap = onTap?.takeIf { row.sectionId != null }
            val tone = row.toneEnum
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .then(if (tap != null) Modifier.clickable(role = Role.Button) { tap(row) } else Modifier)
                        .semantics(mergeDescendants = true) {
                            contentDescription = listOfNotNull(row.label, row.value, glanceToneWord(tone)).joinToString(", ")
                        }
                        .heightIn(min = 40.dp)
                        .padding(horizontal = Spacing.s4, vertical = 7.dp)
                        .testTag("place.preview.glance.${row.id}"),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(glanceDot(tone)))
                Text(row.label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
                // The value takes the rest of the line and wraps under itself at large text sizes.
                Text(
                    row.value,
                    fontSize = 13.5.sp,
                    lineHeight = 18.sp,
                    color = PantopusColors.appTextSecondary,
                    textAlign = TextAlign.End,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

private fun dollars(amount: Double): String =
    NumberFormat.getCurrencyInstance(Locale.US).apply { maximumFractionDigits = 0 }.format(amount.roundToInt())

/** "+148%", "−2%": a whole percent, a true minus sign for a fall. */
private fun wholePercent(pct: Double): String {
    val n = pct.roundToInt()
    val sign =
        when {
            n > 0 -> "+"
            n < 0 -> "−"
            else -> ""
        }
    return "$sign${abs(n)}%"
}

/** "+3.1%", "−2.0%": one decimal, a true minus sign for a fall. */
private fun tenthPercent(pct: Double): String {
    val text = String.format(Locale.US, "%.1f", abs(pct))
    val sign =
        when {
            text == "0.0" -> ""
            pct > 0 -> "+"
            else -> "−"
        }
    return "$sign$text%"
}

private val PlaceMoneyTrend.isZip: Boolean get() = scope == "zip"

/** The county's last yearly change; an answer without the county's own figure has it as the last change. */
private val PlaceMoneyTrend.countyLastChange: Double? get() = countyLastChangePct ?: lastChangePct?.takeIf { !isZip }

/** "+167% since 2011" and "+2.1% in 2025": always the county's, as the curve is. Each only when its figures are held. */
internal fun trendLabels(trend: PlaceMoneyTrend): List<String> =
    listOfNotNull(
        trend.sinceChangePct?.let { pct -> trend.sinceYear?.let { "${wholePercent(pct)} since $it" } },
        trend.countyLastChange?.let { pct -> trend.year?.let { "${tenthPercent(pct)} in $it" } },
    )

/** "ZIP 98607: −2.7% in 2025", where the ZIP has its own figure for the last year. */
private fun trendZipLine(trend: PlaceMoneyTrend): String? {
    val name = trend.areaName?.trim()?.takeIf { trend.isZip && it.isNotEmpty() }
    val pct = trend.lastChangePct
    val year = trend.year
    if (name == null || pct == null || year == null) return null
    val area = if (name.all(Char::isDigit)) "ZIP $name" else name
    return "$area: ${tenthPercent(pct)} in $year"
}

/** "Home prices across Clark County, FHFA price index": the county the curve draws. */
private fun trendCaption(trend: PlaceMoneyTrend): String? {
    val county = trend.countyName?.trim()?.takeIf { it.isNotEmpty() } ?: trend.areaName?.trim()?.takeIf { it.isNotEmpty() && !trend.isZip }
    return county?.let { "Home prices across $it, FHFA price index" }
}

/**
 * "Money here" (LOOKUPORDER 1.7): the area's typical home value and property tax, its price curve over the years,
 * the sources, then the line into the home's full record. Area figures, never this home's own.
 */
@Composable
internal fun PreviewMoneyCard(
    money: PlacePreviewMoney,
    onOpenRecord: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth().placeCard().padding(Spacing.s4).testTag("place.preview.money"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(PantopusColors.homeBg),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(PantopusIcon.DollarSign, null, size = 19.dp, strokeWidth = 2f, tint = PantopusColors.home)
            }
            Text(
                "Money here",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = PantopusColors.appText,
                modifier = Modifier.semantics { heading() },
            )
        }
        val figures =
            listOfNotNull(
                money.value?.takeIf { it.amount != null }?.let { MoneyFigure(it, "Typical home value", "place.preview.money.value") },
                money.tax?.takeIf { it.amount != null }?.let { MoneyFigure(it, "Typical property tax a year", "place.preview.money.tax") },
            )
        if (figures.isNotEmpty()) MoneyFigures(figures)
        money.trend?.takeIf { it.isDrawable }?.let { MoneyCurve(it) }
        val sources =
            listOfNotNull(money.value?.source, money.tax?.source, money.trend?.source)
                .map(String::trim)
                .filter(String::isNotEmpty)
                .distinct()
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (sources.isNotEmpty()) {
                Text(
                    sources.joinToString(" · "),
                    fontSize = 11.5.sp,
                    lineHeight = 16.sp,
                    color = PantopusColors.appTextMuted,
                    modifier = Modifier.testTag("place.preview.money.sources"),
                )
            }
            Text(
                "Area figures, not this home.",
                fontSize = 11.5.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.Medium,
                color = PantopusColors.appTextMuted,
                modifier = Modifier.testTag("place.preview.money.scope"),
            )
        }
        val recordLine = money.recordLine?.trim()?.takeIf { it.isNotEmpty() }
        if (recordLine != null && onOpenRecord != null) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Button, onClick = onOpenRecord)
                        .heightIn(min = 44.dp)
                        .testTag("place.preview.money.record"),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    recordLine,
                    fontSize = 13.5.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PantopusColors.primary600,
                    modifier = Modifier.weight(1f, fill = false),
                )
                PantopusIconImage(PantopusIcon.ChevronRight, null, size = 14.dp, strokeWidth = 2.25f, tint = PantopusColors.primary600)
            }
        }
    }
}

/** A typical dollar figure, the words under it when the server sends none, and its test tag. */
private class MoneyFigure(val figure: PlaceMoneyFigure, val fallbackLabel: String, val tag: String)

/** The value and the tax side by side; one under the other at large text sizes, so neither figure breaks. */
@Composable
private fun MoneyFigures(figures: List<MoneyFigure>) {
    val stacked = LocalDensity.current.fontScale > STACK_FIGURES_FONT_SCALE
    val figure: @Composable (MoneyFigure, Modifier) -> Unit = { f, mod ->
        Column(modifier = mod.testTag(f.tag)) {
            Text(
                dollars(f.figure.amount ?: 0.0),
                fontSize = 22.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.3).sp,
                color = PantopusColors.appText,
            )
            Text(
                f.figure.label?.trim()?.takeIf { it.isNotEmpty() } ?: f.fallbackLabel,
                fontSize = 12.5.sp,
                lineHeight = 17.sp,
                color = PantopusColors.appTextSecondary,
            )
        }
    }
    if (stacked || figures.size == 1) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) { figures.forEach { figure(it, Modifier) } }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) { figures.forEach { figure(it, Modifier.weight(1f)) } }
    }
}

/** The price curve: a drawn line of the county's yearly index as percent change since the first year. */
@Composable
private fun MoneyCurve(trend: PlaceMoneyTrend) {
    val points = trend.changeSinceFirstPct.orEmpty()
    val labels = trendLabels(trend)
    val line = PantopusColors.primary600
    val fill = PantopusColors.primary50
    val firstYear = trend.years?.firstOrNull() ?: trend.sinceYear
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
        Canvas(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(68.dp)
                    .semantics {
                        contentDescription =
                            (listOfNotNull(trendCaption(trend)) + labels + listOfNotNull(trendZipLine(trend))).joinToString(". ")
                    }
                    .testTag("place.preview.money.curve"),
        ) {
            val low = minOf(0.0, points.min())
            val high = maxOf(points.max(), low + 1.0)
            val inset = 4.dp.toPx()
            val w = size.width - inset * 2
            val h = size.height - inset * 2
            val at = { i: Int ->
                Offset(
                    x = inset + w * i / (points.size - 1),
                    y = inset + h * (1f - ((points[i] - low) / (high - low)).toFloat()),
                )
            }
            val path = Path().apply { points.indices.forEach { i -> at(i).let { if (i == 0) moveTo(it.x, it.y) else lineTo(it.x, it.y) } } }
            val area =
                Path().apply {
                    addPath(path)
                    lineTo(at(points.lastIndex).x, size.height)
                    lineTo(at(0).x, size.height)
                    close()
                }
            drawPath(area, color = fill)
            drawPath(path, color = line, style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            drawCircle(color = line, radius = 3.5.dp.toPx(), center = at(points.lastIndex))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2), verticalAlignment = Alignment.Top) {
            firstYear?.let { Text("$it", fontSize = 11.5.sp, color = PantopusColors.appTextMuted) }
            if (labels.isNotEmpty()) {
                Text(
                    labels.joinToString(" · "),
                    fontSize = 12.5.sp,
                    lineHeight = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PantopusColors.appText,
                    textAlign = TextAlign.End,
                    modifier = Modifier.weight(1f).testTag("place.preview.money.change"),
                )
            }
        }
        trendZipLine(trend)?.let {
            Text(
                it,
                fontSize = 12.5.sp,
                lineHeight = 17.sp,
                color = PantopusColors.appTextSecondary,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth().testTag("place.preview.money.zip"),
            )
        }
        trendCaption(trend)?.let { Text(it, fontSize = 11.5.sp, lineHeight = 16.sp, color = PantopusColors.appTextMuted) }
    }
}

/** "Could not check today: Homes here, Next election." One line in place of the empty cards (LOOKUPORDER 1.3). */
@Composable
internal fun PreviewNotCheckedLine(
    items: List<PlacePreviewNotChecked>,
    modifier: Modifier = Modifier,
) {
    val labels = items.map { it.label.trim() }.filter(String::isNotEmpty).distinct()
    if (labels.isEmpty()) return
    Text(
        "Could not check today: ${labels.joinToString(", ")}.",
        fontSize = 13.sp,
        lineHeight = 18.sp,
        color = PantopusColors.appTextSecondary,
        modifier = modifier.fillMaxWidth().padding(horizontal = Spacing.s1).testTag("place.preview.notChecked"),
    )
}

/** Above this text scale the money card stacks its two figures. */
private const val STACK_FIGURES_FONT_SCALE = 1.3f
