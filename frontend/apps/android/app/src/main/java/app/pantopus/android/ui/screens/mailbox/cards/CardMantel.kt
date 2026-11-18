@file:Suppress("PackageNaming", "MagicNumber", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.mailbox.cards

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import app.pantopus.android.R
import app.pantopus.android.ui.screens.mailbox.cards.table.CardSeed
import app.pantopus.android.ui.screens.mailbox.cards.table.cardNumber
import app.pantopus.android.ui.screens.mailbox.components.MailPieceModel
import app.pantopus.android.ui.theme.PantopusColors
import coil.compose.AsyncImage
import java.time.Instant
import java.time.LocalDate

/** One opened Christmas card standing on the mantel (plan Part 7). */
data class MantelCard(
    val id: String,
    val design: String,
    val number: Int,
    val caption: String,
    val paper: String?,
    val year: Int,
    val from: String,
    val openedAt: Instant?,
)

/**
 * The mantel's cards from the pieces the list has loaded (plan Part 7): this season's opened Christmas cards that came
 * to this person, newest opened at the left, 30 at most. Not unopened or sealed cards, replies or cards they sent. The
 * season runs through January 6 by the phone's own clock; after that, none.
 */
fun mantelCards(
    pieces: List<MailPieceModel>,
    today: LocalDate = LocalDate.now(),
): List<MantelCard> {
    if (today.monthValue == 1 && today.dayOfMonth > LAST_DAY_IN_JANUARY) return emptyList()
    val season = if (today.monthValue == 1) today.year - 1 else today.year
    return pieces
        .mapNotNull { piece ->
            val card = piece.card ?: return@mapNotNull null
            // Opened and open, and one that came to this person: not one they sent, and not a reply (plan Part 3).
            if (!piece.opened || card.sealed) return@mapNotNull null
            if (card.sentTo != null || card.replyFrom != null) return@mapNotNull null
            if ((card.year ?: season) != season) return@mapNotNull null
            MantelCard(
                id = piece.id,
                design = card.design,
                number = cardNumber(card.number, card.design),
                caption = card.caption.orEmpty(),
                paper = card.paper,
                year = card.year ?: season,
                from = piece.from,
                openedAt = HolidayCardTimes.parse(card.openedAt),
            )
        }.distinctBy { it.id }
        .sortedByDescending { it.openedAt ?: Instant.EPOCH }
        .take(MOST_ON_THE_MANTEL)
}

/**
 * This season's opened cards standing on a wooden shelf at the top of the Mailbox, as cards stand on a mantel at home
 * (plan Part 7, the founder's approved sample of November 17). The shelf stays still while the cards and the fir sprig
 * scroll sideways under the finger. Tapping a card opens it on its table, already out of its envelope. A screen reader
 * hears a list, "Your Christmas cards, 4", and each card as "Card from Maya: Come finish our snowman."
 */
@Composable
fun CardMantel(
    cards: List<MantelCard>,
    onOpen: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (cards.isEmpty()) return
    val shelf = ImageBitmap.imageResource(R.drawable.card_mantel_shelf)
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .height(STRIP_HEIGHT.dp)
                .clipToBounds()
                .drawBehind {
                    drawGlow(PantopusColors.mantelGlow)
                    // The shelf: its left end 12 in, its top 143 down, running off the right edge; it doesn't scroll.
                    drawImage(
                        shelf,
                        dstOffset = IntOffset(12.dp.roundToPx(), 143.dp.roundToPx()),
                        dstSize = IntSize(1200.dp.roundToPx(), 50.dp.roundToPx()),
                    )
                }.testTag("mailMantel"),
    ) {
        val count = cards.size
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .fillMaxHeight()
                    .horizontalScroll(rememberScrollState())
                    .semantics { contentDescription = "Your Christmas cards, $count" },
        ) {
            Row(
                modifier = Modifier.fillMaxHeight().padding(start = 74.dp, end = 16.dp, bottom = 38.dp),
                horizontalArrangement = Arrangement.spacedBy(13.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                cards.forEach { card -> MantelCardStanding(card, onOpen) }
            }
            // The fir sprig lies on the shelf at its left end, in front of the cards, and scrolls with them.
            Image(
                painter = painterResource(R.drawable.card_mantel_sprig),
                contentDescription = null,
                contentScale = ContentScale.FillBounds,
                modifier = Modifier.offset(y = 90.dp).size(104.dp, 68.dp),
            )
        }
    }
}

/** The lamp's warm pool behind the cards: centred 46% across and 62% down, 62% wide and 70% tall, gone at 72%. */
private fun DrawScope.drawGlow(glow: Color) {
    // The sample's light reaches 30 above the strip, out of sight: its box is the strip and 30 more on top.
    val top = -30.dp.toPx()
    val boxHeight = size.height - top
    val center = Offset(size.width * 0.46f, top + boxHeight * 0.62f)
    val rx = size.width * 0.62f
    val ry = boxHeight * 0.70f
    scale(scaleX = 1f, scaleY = ry / rx, pivot = center) {
        drawCircle(
            brush = Brush.radialGradient(0f to glow, 0.72f to glow.copy(alpha = 0f), center = center, radius = rx),
            radius = rx,
            center = center,
        )
    }
}

/**
 * One card on the shelf: the small card face, tipped back 11° about its lower edge and turned by its own number (as
 * the note's words are), its shadow on the wall, and the dark where it stands.
 */
@Composable
private fun MantelCardStanding(
    card: MantelCard,
    onOpen: (String) -> Unit,
) {
    val turn = remember(card.number) { mantelTurn(card.number) }
    val shadow = remember { android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG) }
    val paper = HolidayCardArt.paper(card.paper).toArgb()
    val first = card.from.trim().substringBefore(' ').ifEmpty { "Someone" }
    val words = "Card from $first: ${card.caption.ifBlank { "A Christmas card" }}"
    Box(
        modifier =
            Modifier
                .size(CARD_WIDTH.dp, CARD_HEIGHT.dp)
                .drawBehind {
                    // Where it stands: an ellipse 88 by 7 under its lower edge, 38% black at the middle.
                    val foot = Size(size.width, 7.dp.toPx())
                    val middle = Offset(size.width / 2f, size.height - 2.dp.toPx() + foot.height / 2f)
                    scale(scaleX = 1f, scaleY = foot.height / foot.width, pivot = middle) {
                        val fade = PantopusColors.mantelFootShadow
                        val reach = foot.width / 2f
                        drawCircle(
                            brush = Brush.radialGradient(0f to fade, 1f to fade.copy(alpha = 0f), center = middle, radius = reach),
                            radius = reach,
                            center = middle,
                        )
                    }
                }.graphicsLayer {
                    transformOrigin = TransformOrigin(0.5f, 1f)
                    rotationX = LEAN_DEGREES
                    rotationZ = turn
                    // CSS's perspective(520px): the camera's distance is in Skia's 72-a-unit inches of screen pixels.
                    cameraDistance = PERSPECTIVE_DP * density / SKIA_CAMERA_UNIT
                }.drawBehind {
                    // Its shadow on the wall (7 right, 2 down, 5 soft) and a small dark under its edge.
                    drawIntoCanvas { canvas ->
                        shadow.color = paper
                        shadow.setShadowLayer(5.dp.toPx(), 7.dp.toPx(), 2.dp.toPx(), PantopusColors.mantelWallShadow.toArgb())
                        canvas.nativeCanvas.drawRect(0f, 0f, size.width, size.height, shadow)
                        shadow.setShadowLayer(1.dp.toPx(), 0f, 1.dp.toPx(), PantopusColors.mantelEdgeShadow.toArgb())
                        canvas.nativeCanvas.drawRect(0f, 0f, size.width, size.height, shadow)
                    }
                }.clickable(role = Role.Button) { onOpen(card.id) }
                .clearAndSetSemantics {
                    contentDescription = words
                    role = Role.Button
                    onClick {
                        onOpen(card.id)
                        true
                    }
                }.testTag("mailMantelCard"),
    ) {
        MantelFace(card)
    }
}

/** The card's own small face: its picture, its caption by hand on the strip under it, CHRISTMAS and the year. */
@Composable
private fun MantelFace(card: MantelCard) {
    val u = CARD_WIDTH / 100f
    val shape = RoundedCornerShape((0.7f * u).dp)
    val verse = HolidayCardArt.captionIsVerse(card.number, card.caption)
    Box(
        modifier =
            Modifier
                .size(CARD_WIDTH.dp, CARD_HEIGHT.dp)
                .clip(shape)
                .background(HolidayCardArt.paper(card.paper))
                .border(0.5.dp, PantopusColors.tableEdgeShade, shape),
    ) {
        AsyncImage(
            model = HolidayCardArt.picture(card.design, thumb = true),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.offset((1.7f * u).dp, (1.7f * u).dp).size((96.6f * u).dp, (103f * u).dp),
        )
        Text(
            card.caption,
            style =
                TextStyle(
                    fontFamily = if (verse) FontFamily.Serif else HolidayCardArt.captionHand,
                    fontStyle = if (verse) FontStyle.Italic else FontStyle.Normal,
                    color = PantopusColors.cardCaptionInk,
                ).copyFixed(if (verse) 4.4f * u else 4.8f * u),
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.offset((4.2f * u).dp, (106.6f * u).dp),
        )
        Text(
            "CHRISTMAS, ${card.year}",
            style = TextStyle(fontFamily = FontFamily.Serif, color = PantopusColors.cardYearInk).copyFixed(2.2f * u, spacing = 0.42f),
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.offset((4.2f * u).dp, (113.8f * u).dp),
        )
    }
}

/** A text style at a size in dp, whatever the phone's text size: the printing on a card never grows. */
@Composable
private fun TextStyle.copyFixed(
    sizeDp: Float,
    spacing: Float = 0f,
): TextStyle {
    // Dp to sp undoes the font scale, and the line height is set too, so nothing here grows with the text size.
    return with(LocalDensity.current) {
        copy(fontSize = sizeDp.dp.toSp(), lineHeight = sizeDp.dp.toSp(), letterSpacing = (sizeDp * spacing).dp.toSp())
    }
}

/**
 * A card's turn on the shelf, −2.4° to +2.4°: the second draw of the note's own seed (number × 7 + 3), the draw its first
 * word's turn takes, as on the web. The first draw barely moves for small seeds and would lean every card the same way.
 */
private fun mantelTurn(number: Int): Float {
    val seed = CardSeed(number * 7 + 3)
    seed.next()
    return (seed.next() - 0.5f) * 4.8f
}

private const val STRIP_HEIGHT = 182
private const val CARD_WIDTH = 88f
private const val CARD_HEIGHT = 105.6f
private const val LEAN_DEGREES = 11f
private const val PERSPECTIVE_DP = 520f
private const val SKIA_CAMERA_UNIT = 72f
private const val MOST_ON_THE_MANTEL = 30
private const val LAST_DAY_IN_JANUARY = 6
