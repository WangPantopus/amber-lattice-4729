@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.components

import android.provider.Settings
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.MomentMovingWords
import app.pantopus.android.data.api.models.moments.MomentPlayItemDto
import app.pantopus.android.data.api.models.moments.MomentPlayKinds
import app.pantopus.android.data.api.models.moments.beforeAfter
import app.pantopus.android.ui.screens.moments.compose.marks.MomentFont
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin

/*
 * "Pulse, reinvented", moving words (CONTRACT 7k; DESIGN row 2, "moving text" under Aa; as on iPhone #5176 and the web
 * #5163): the author's own line over the photo, in one of the Studio's letterings, moving in one of four ways. Drift
 * floats up and down, pulse grows and shrinks a little, wave lifts the letters one after another, type shows them one by
 * one, holds, and starts again. With the system's animations off (Settings > Accessibility > Remove animations), the
 * words stand still. Never drawn into the picture; nothing to tap.
 */

/** The picture width the words' size is set against (iPhone's 402 points): 28 at that width, scaled with it. */
private const val BASE_WIDTH_DP = 402f
private const val BASE_SIZE = 28f

/** A moving-words item this app draws: on a photo, with words. */
val MomentPlayItemDto.movingWords: Boolean
    get() = kind == MomentPlayKinds.MOVING_WORDS && !text.isNullOrBlank()

/** The words' colour from its `#RRGGBB`, white when unreadable. */
fun movingWordsColor(hex: String?): Color =
    hex
        ?.takeIf { it.length == 7 && it.startsWith("#") }
        ?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() }
        ?: Color.White

/** The lettering's font by its shared id: today's bold system font for `classic` and anything unknown. */
fun movingWordsFont(lettering: String?): MomentFont = MomentFont.entries.firstOrNull { it.key == lettering } ?: MomentFont.Classic

/** Whether the system's animations are off (Remove animations): the words then stand still. */
@Composable
fun rememberStillMotion(): Boolean {
    val context = LocalContext.current
    return remember {
        runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
            .getOrDefault(false)
    }
}

/**
 * The words of [item], moving; [shownWidth] is the width of the picture that is on screen, in px, so the words keep
 * their share of it on every phone. Rotated by the item's turn; centred where it is placed by the caller.
 */
@Composable
fun MomentMovingWordsText(
    item: MomentPlayItemDto,
    shownWidth: Float,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val words = remember(item.text) { item.text.orEmpty().replace('\n', ' ').trim() }
    val still = rememberStillMotion()
    val unit = shownWidth / density.density / BASE_WIDTH_DP
    val scale = item.scale.toFloat().coerceIn(0.25f, 4f)
    val style =
        remember(item.lettering, item.color, unit, scale) {
            val font = movingWordsFont(item.lettering)
            val color = movingWordsColor(item.color)
            TextStyle(
                color = color,
                fontFamily = FontFamily(font.typeface),
                fontWeight = font.weight,
                fontSize = with(density) { (BASE_SIZE * unit * scale).dp.toSp() },
                shadow = Shadow(Color.Black.copy(alpha = if (color == Color.White) 0.45f else 0.2f), blurRadius = 4f),
            )
        }
    val clock = remember { mutableFloatStateOf(0f) }
    if (!still) {
        LaunchedEffect(Unit) {
            val start = withFrameMillis { it }
            while (true) withFrameMillis { clock.floatValue = (it - start) / 1000f }
        }
    }
    val lift = unit * density.density
    val motion = if (still) "still" else item.motion ?: "drift"
    val count = words.length
    LetterRows(
        widest = 0.86f * shownWidth * scale,
        spaces = remember(words) { words.map { it == ' ' } },
        modifier =
            modifier
                .graphicsLayer {
                    rotationZ = item.rotation.toFloat()
                    val t = clock.floatValue
                    when (motion) {
                        "pulse" ->
                            (1f + 0.06f * sin(t * 2.4f)).let {
                                scaleX = it
                                scaleY = it
                            }
                        "drift" -> translationY = 6f * lift * sin(t * 1.3f)
                        else -> Unit
                    }
                }.clearAndSetSemantics { contentDescription = words }
                .testTag("moments.movingWords"),
    ) {
        words.forEachIndexed { index, letter ->
            Text(
                text = letter.toString(),
                style = style,
                modifier =
                    Modifier.graphicsLayer {
                        val t = clock.floatValue
                        when (motion) {
                            "wave" -> translationY = -7f * lift * max(0f, sin(t * 3f - index * 0.45f))
                            "type" -> {
                                val cycle = count * 0.09f + 1.6f
                                val shown = minOf(count, ((t % cycle) / 0.09f).toInt())
                                alpha = if (index < shown) 1f else 0f
                            }
                            else -> Unit
                        }
                    },
            )
        }
    }
}

/**
 * Letters in rows no wider than [widest] px, each row centred: a row breaks at a space (dropped at the row's ends), and
 * inside a word only when that word alone is wider than a row (as iPhone's `MomentWordsLayout` and the web's CSS).
 */
@Composable
private fun LetterRows(
    widest: Float,
    spaces: List<Boolean>,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Layout(content = content, modifier = modifier) { measurables, _ ->
        val placeables = measurables.map { it.measure(Constraints()) }
        val rows = letterRows(placeables.map { it.width }, spaces, widest.roundToInt().coerceAtLeast(1))
        val rowWidths = rows.map { row -> row.sumOf { placeables[it].width } }
        val rowHeights = rows.map { row -> row.maxOfOrNull { placeables[it].height } ?: 0 }
        val total = rowWidths.maxOrNull() ?: 0
        layout(total, rowHeights.sum()) {
            var top = 0
            rows.forEachIndexed { r, row ->
                var left = (total - rowWidths[r]) / 2
                row.forEach {
                    placeables[it].place(left, top)
                    left += placeables[it].width
                }
                top += rowHeights[r]
            }
        }
    }
}

/**
 * The letters' rows, as indexes, for letters [widths] px wide: a row breaks at a space (dropped at the row's ends), and
 * inside a word only when that word alone is wider than [limit].
 */
private fun letterRows(
    widths: List<Int>,
    spaces: List<Boolean>,
    limit: Int,
): List<List<Int>> {
    val rows = mutableListOf<MutableList<Int>>(mutableListOf())
    var width = 0
    var at = 0

    fun breakRow() {
        rows.add(mutableListOf())
        width = 0
    }
    while (at < widths.size) {
        if (spaces.getOrElse(at) { false }) {
            // A space: kept inside a row, dropped where a row would start with it.
            if (rows.last().isNotEmpty()) {
                rows.last().add(at)
                width += widths[at]
            }
            at++
            continue
        }
        val end = wordEnd(at, spaces, widths.size)
        val wordWidth = (at until end).sumOf { widths[it] }
        if (width + wordWidth > limit && rows.last().any { !spaces[it] }) {
            trimSpaces(rows.last(), spaces)
            breakRow()
        }
        for (letter in at until end) {
            if (width + widths[letter] > limit && rows.last().isNotEmpty()) breakRow()
            rows.last().add(letter)
            width += widths[letter]
        }
        at = end
    }
    trimSpaces(rows.last(), spaces)
    return rows
}

/** Where the word starting at [from] ends (the next space, or the end). */
private fun wordEnd(
    from: Int,
    spaces: List<Boolean>,
    count: Int,
): Int {
    var end = from
    while (end < count && !spaces.getOrElse(end) { false }) end++
    return end
}

/** Drops spaces at a row's end. */
private fun trimSpaces(
    row: MutableList<Int>,
    spaces: List<Boolean>,
) {
    while (row.isNotEmpty() && spaces[row.last()]) row.removeAt(row.lastIndex)
}

/** Places what follows with its centre at ([x], [y]) px in the parent; it takes only its own size for touches. */
fun Modifier.centredAt(
    x: Float,
    y: Float,
): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(constraints.copy(minWidth = 0, minHeight = 0))
        layout(constraints.maxWidth, constraints.maxHeight) {
            placeable.place((x - placeable.width / 2f).roundToInt(), (y - placeable.height / 2f).roundToInt())
        }
    }

/** The viewer's moving words over [moment]'s photo, for a reader whose switch is on (the server sends `play` only then). */
@Composable
fun MomentMovingWordsLayer(
    moment: MomentDto,
    modifier: Modifier = Modifier,
) {
    if (moment.kind != "photo" || moment.beforeAfter != null) return
    val items = moment.play.orEmpty().filter { it.movingWords }.take(MomentMovingWords.MOST)
    if (items.isEmpty()) return
    val picture = moment.width?.let { w -> moment.height?.let { h -> IntSize(w, h) } }
    BoxWithConstraints(modifier = modifier.fillMaxSize().testTag("moments.viewer.movingWords")) {
        val box = constraints.maxWidth.toFloat()
        val frame = stampFrame(picture, box, constraints.maxHeight.toFloat())
        items.forEach { item ->
            MomentMovingWordsText(
                item = item,
                shownWidth = minOf(frame.width, box),
                modifier =
                    Modifier.centredAt(
                        frame.left + item.x.toFloat() * frame.width,
                        frame.top + item.y.toFloat() * frame.height,
                    ),
            )
        }
    }
}
