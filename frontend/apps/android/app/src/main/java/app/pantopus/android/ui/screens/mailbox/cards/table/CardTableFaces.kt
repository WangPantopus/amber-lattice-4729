@file:Suppress("PackageNaming", "MagicNumber", "LongParameterList")

package app.pantopus.android.ui.screens.mailbox.cards.table

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseIn
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.LineHeightStyle
import app.pantopus.android.R
import app.pantopus.android.data.api.models.mailbox.CardSignature
import app.pantopus.android.ui.screens.mailbox.cards.CardLeaves
import app.pantopus.android.ui.screens.mailbox.cards.HolidayCardArt
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.rememberReduceMotion

/** The note's pen as a font: La Belle Aurore (SIL Open Font License, `assets/licenses`). */
internal val cardPen = FontFamily(Font(R.font.la_belle_aurore))

/**
 * The picture side at the card's own 5:6 shape (launch key `card_table`), the same drawing as on the table: for the
 * large look on Pick a card, Look it over and Sent.
 */
@Composable
internal fun CardTableFront(
    design: String,
    caption: String?,
    paper: String?,
    year: Int,
    mailedOn: String?,
    modifier: Modifier = Modifier,
) {
    val art = rememberCardFaceArt()
    val density = LocalDensity.current.density
    val painter = remember(art, density) { art?.let { CardFacePainter(it, density) } }
    val picture = rememberCardPicture(design)
    val words =
        remember(design, caption, paper, year, mailedOn) {
            CardFaceWords(
                number = cardNumber(null, design),
                caption = caption.orEmpty(),
                paper = cardPaperColor(paper),
                year = year,
                postmarkDay = cardPostmarkDay(mailedOn),
                note = "",
                from = "",
            )
        }
    val loaded = (picture as? CardPictureState.Loaded)?.picture
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .aspectRatio(5f / 6f)
                .background(HolidayCardArt.paper(paper))
                .drawBehind {
                    val face = painter ?: return@drawBehind
                    drawIntoCanvas { face.drawFront(it.nativeCanvas, size.width, words, loaded) }
                },
    )
}

/**
 * The back at the card's own shape: its rules, who it's from and the foot, with the note in the pen, or [writing] (the
 * writing box) on the same rules, in the same pen and at the same size, so what's written is what arrives. While
 * writing, the pen's size follows [message] as it's typed (plan Part 1): it starts large and steps down a size when
 * the next line wouldn't fit. With [leaves] (a card that can be turned, plan Part 9) a long note goes over two leaves:
 * the first lies on this back until "Read on" lifts it.
 */
@Composable
internal fun CardTableBack(
    design: String?,
    paper: String?,
    fromName: String,
    year: Int,
    message: String?,
    writing: (@Composable (TextStyle) -> Unit)?,
    modifier: Modifier = Modifier,
    signature: CardSignature? = null,
    leaves: CardLeaves? = null,
) {
    val art = rememberCardFaceArt()
    val density = LocalDensity.current
    val painter = remember(art, density.density) { art?.let { CardFacePainter(it, density.density) } }
    val first = remember(fromName) { fromName.trim().substringBefore(' ').removeSuffix(",") }
    val words =
        remember(design, paper, first, year, message, writing == null, signature, leaves != null) {
            CardFaceWords(
                number = cardNumber(null, design.orEmpty()),
                caption = "",
                paper = cardPaperColor(paper),
                year = year,
                postmarkDay = "",
                note = message.orEmpty(),
                from = first,
                signature = signature,
                writing = writing != null,
                leaves = leaves != null && writing == null,
            )
        }
    BoxWithConstraints(
        modifier =
            modifier
                .fillMaxSize()
                .background(HolidayCardArt.paper(paper))
                .drawBehind {
                    val face = painter ?: return@drawBehind
                    // Off the table there's no lamp to brighten it: the grain at a quarter keeps the back bright cream.
                    val grain = art?.paperQuarter ?: return@drawBehind
                    drawIntoCanvas { face.drawBack(it.nativeCanvas, size.width, words, grain) }
                },
    ) {
        if (writing != null) {
            val u = constraints.maxWidth.toFloat() / 100f
            // The painter's own choice, so the box and the rules behind it agree; greedy lines, as the painter lays them.
            val pen = painter?.penNote(words, u)
            val style =
                TextStyle(
                    fontFamily = cardPen,
                    fontSize = with(density) { (pen?.size ?: (u * 6f)).toSp() },
                    lineHeight = with(density) { (pen?.pitch ?: (u * 7.6f)).toSp() },
                    lineHeightStyle = LineHeightStyle(alignment = LineHeightStyle.Alignment.Center, trim = LineHeightStyle.Trim.None),
                    lineBreak = LineBreak.Simple,
                    color = PantopusColors.tablePen,
                )
            Box(
                modifier =
                    Modifier
                        .padding(
                            start = with(density) { (u * 8f).toDp() },
                            end = with(density) { (u * 7f).toDp() },
                            top = with(density) { (u * 9f).toDp() },
                        ).height(with(density) { (u * (83.6f + UNDER_THE_RULES)).toDp() }),
            ) { writing(style) }
        }
        if (leaves != null && painter != null && writing == null) {
            val u = constraints.maxWidth.toFloat() / 100f
            val two = remember(painter, words, u) { painter.twoLeaves(words, u) }
            LaunchedEffect(two) { leaves.two = two }
            if (two) LiftingLeaf(leaves, painter, words)
        }
    }
}

/**
 * The first leaf off the table (plan Part 9), as on it: lifted from its foot about its top edge, 90° in 0.45 s easing
 * in, with the card's own turn's depth, darkening by up to 22% and gone at 90°; with animations off it fades in 0.2 s.
 * Turned back to its picture, the card has it in place again.
 */
@Composable
private fun BoxScope.LiftingLeaf(
    leaves: CardLeaves,
    painter: CardFacePainter,
    words: CardFaceWords,
) {
    val reduceMotion = rememberReduceMotion()
    val art = rememberCardFaceArt()
    val run = remember { Animatable(if (leaves.lifted) 1f else 0f) }
    LaunchedEffect(leaves.lifted) {
        if (leaves.lifted) {
            run.animateTo(1f, if (reduceMotion) tween(LEAF_FADE_MS, easing = LinearEasing) else tween(LEAF_LIFT_MS, easing = EaseIn))
        } else {
            run.snapTo(0f)
        }
    }
    val density = LocalDensity.current.density
    Box(
        Modifier
            .matchParentSize()
            .graphicsLayer {
                val p = run.value
                alpha = if (reduceMotion) 1f - p else if (p >= 1f) 0f else 1f
                // A positive X turn about the top edge brings the foot up toward you (seen on the emulator).
                rotationX = if (reduceMotion) 0f else 90f * p
                transformOrigin = TransformOrigin(0.5f, 0f)
                cameraDistance = 16f * density
            }.drawBehind {
                val grain = art?.paperQuarter ?: return@drawBehind
                drawIntoCanvas { painter.drawFirstLeaf(it.nativeCanvas, size.width, words, grain) }
                val shade = if (reduceMotion) 0f else run.value * LEAF_SHADE
                if (shade > 0.001f) {
                    val corner = size.width * 0.007f
                    drawRoundRect(Color.Black.copy(alpha = shade), cornerRadius = CornerRadius(corner, corner))
                }
            },
    )
}

private const val LEAF_LIFT_MS = 450
private const val LEAF_FADE_MS = 200
private const val LEAF_SHADE = 0.22f

/**
 * [message] on [design]'s card would go over two leaves on a card [widthPx] wide, as the reader's table lays it out (plan
 * Part 9): the writing step's quiet line. False until the pen is read and the card has a width.
 */
@Composable
internal fun rememberSecondLeaf(
    message: String,
    design: String,
    widthPx: Int,
): Boolean {
    val art = rememberCardFaceArt()
    val density = LocalDensity.current.density
    // Its own painter: the writing box's lays the note on one side, and each keeps its own layout.
    val painter = remember(art, density) { art?.let { CardFacePainter(it, density) } }
    return remember(painter, message, design, widthPx) {
        val words =
            CardFaceWords(
                number = cardNumber(null, design),
                caption = "",
                paper = 0,
                year = 0,
                postmarkDay = "",
                note = message,
                from = "",
                leaves = true,
            )
        painter != null && widthPx > 0 && painter.twoLeaves(words, widthPx / 100f)
    }
}

/**
 * Room under the writing box's last rule, above FROM: the pen's last line, its descenders and the cursor run just past
 * the rules when the note fills them, and the box mustn't scroll then (plan Part 1).
 */
private const val UNDER_THE_RULES = 4f
