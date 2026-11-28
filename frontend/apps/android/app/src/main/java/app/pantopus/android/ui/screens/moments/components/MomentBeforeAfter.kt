@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.components

import android.graphics.drawable.BitmapDrawable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.beforeAfter
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import coil.imageLoader
import coil.request.SuccessResult
import kotlin.math.roundToInt

/*
 * "Pulse, reinvented": before and after (CONTRACT 7g; LEAD 05:19 answer 1). The picture is the two photos side by side,
 * the same size and shape (left before, right after): that is what today's screens, the apps in the stores and anyone
 * whose switch is off see. Here, for a reader whose switch is on (and in the Studio), the two halves are cut from that
 * one picture and shown one over the other, filling the frame as a photo does, with a curtain between them that a finger
 * drags. A tap away from the curtain is left to the screen under it (the viewer's next and back). Stamps sit on one
 * half's frame ([halfOf]), so they stay put as the curtain moves.
 */

/** The frame stamps, items and dots are placed on for a side-by-side picture of [picture]'s size: one half. */
fun halfOf(picture: IntSize): IntSize = IntSize(maxOf(1, picture.width / 2), picture.height)

/** [typed], trimmed, or [fallback] when nothing is left ("Before", "After"). */
fun beforeAfterWord(
    typed: String?,
    fallback: String,
): String = typed?.trim()?.takeIf { it.isNotEmpty() } ?: fallback

/**
 * The two halves of [picture] one over the other with a curtain at [startAt] (how much of the before shows, from the
 * left). [still]: drawn at the middle with nothing to drag (the 15-minute edit).
 */
@Composable
fun MomentBeforeAfterView(
    picture: ImageBitmap,
    before: String,
    after: String,
    modifier: Modifier = Modifier,
    still: Boolean = false,
) {
    var at by remember(picture) { mutableFloatStateOf(0.5f) }
    val half = maxOf(1, picture.width / 2)
    val left = remember(picture) { BitmapPainter(picture, IntOffset.Zero, IntSize(half, picture.height)) }
    val right = remember(picture) { BitmapPainter(picture, IntOffset(picture.width - half, 0), IntSize(half, picture.height)) }
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val width = constraints.maxWidth.toFloat().coerceAtLeast(1f)
        Image(
            painter = right,
            contentDescription = after,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        Image(
            painter = left,
            contentDescription = before,
            contentScale = ContentScale.Crop,
            modifier =
                Modifier
                    .fillMaxSize()
                    .drawWithContent { clipRect(right = size.width * at) { this@drawWithContent.drawContent() } },
        )
        BeforeAfterWords(before, after, at, width)
        Curtain(
            at = at,
            width = width,
            still = still,
            before = before,
            after = after,
            onMove = { at = it },
        )
    }
}

/** "Before" and "After" beside the knob, each fading as the curtain nears its own edge. */
@Composable
private fun BeforeAfterWords(
    before: String,
    after: String,
    at: Float,
    width: Float,
) {
    val density = LocalDensity.current
    val beforeAlpha by animateFloatAsState(if (at < 0.18f) 0f else 1f, tween(150), label = "beforeWord")
    val afterAlpha by animateFloatAsState(if (at > 0.82f) 0f else 1f, tween(150), label = "afterWord")
    val line = with(density) { (width * at).toDp() }
    Box(modifier = Modifier.fillMaxSize().clearAndSetSemantics {}) {
        Box(
            contentAlignment = Alignment.CenterEnd,
            modifier = Modifier.width((line - 34.dp).coerceAtLeast(0.dp)).fillMaxHeight().graphicsLayer { alpha = beforeAlpha },
        ) { WordChip(before) }
        Box(
            contentAlignment = Alignment.CenterStart,
            modifier =
                Modifier
                    .offset(x = line + 34.dp)
                    .width((with(density) { width.toDp() } - line - 34.dp).coerceAtLeast(0.dp))
                    .fillMaxHeight()
                    .graphicsLayer { alpha = afterAlpha },
        ) { WordChip(after) }
    }
}

@Composable
private fun WordChip(words: String) {
    Text(
        text = words,
        color = Color.White,
        fontSize = 12.5.sp,
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier =
            Modifier
                .clip(RoundedCornerShape(50))
                .background(Color.Black.copy(alpha = 0.6f))
                .padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

/** The line, its knob halfway down, and a 44 dp strip around it to grab. */
@Composable
private fun Curtain(
    at: Float,
    width: Float,
    still: Boolean,
    before: String,
    after: String,
    onMove: (Float) -> Unit,
) {
    val density = LocalDensity.current
    val strip = with(density) { 44.dp.toPx() }
    val current by rememberUpdatedState(at)
    Box(
        contentAlignment = Alignment.Center,
        modifier =
            Modifier
                .offset { IntOffset((width * at - strip / 2).roundToInt(), 0) }
                .width(44.dp)
                .fillMaxHeight()
                .then(
                    if (still) {
                        Modifier
                    } else {
                        Modifier.pointerInput(width) {
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                down.consume()
                                MomentCurtainGrab.held = true
                                try {
                                    drag(down.id) { change ->
                                        onMove((current + change.positionChange().x / width).coerceIn(0f, 1f))
                                        change.consume()
                                    }
                                } finally {
                                    MomentCurtainGrab.held = false
                                }
                            }
                        }
                    },
                ).testTag("moments.beforeAfter.curtain")
                .clearAndSetSemantics {
                    contentDescription = "Curtain between ${before.lowercase()} and ${after.lowercase()}"
                    stateDescription = "${(current * 100).roundToInt()} percent ${before.lowercase()}"
                    progressBarRangeInfo = ProgressBarRangeInfo(current, 0f..1f, steps = 9)
                    if (!still) {
                        setProgress { value ->
                            onMove(value.coerceIn(0f, 1f))
                            true
                        }
                    }
                },
    ) {
        Box(modifier = Modifier.width(2.dp).fillMaxHeight().shadow(3.dp).background(Color.White))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier =
                Modifier
                    .size(38.dp)
                    .shadow(4.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color.White)
                    .padding(horizontal = 3.dp),
        ) {
            listOf(PantopusIcon.ChevronLeft, PantopusIcon.ChevronRight).forEach { icon ->
                PantopusIconImage(icon = icon, contentDescription = null, size = 14.dp, strokeWidth = 2.6f, tint = Color.Black)
            }
        }
    }
}

/**
 * The viewer's before and after: over a posted Moment's side-by-side photo, for a reader whose switch is on (the server
 * sends `play` only then), the halves with the curtain. Until the photo is read the side-by-side photo shows under it.
 */
@Composable
fun MomentBeforeAfterLayer(
    moment: MomentDto,
    modifier: Modifier = Modifier,
    still: Boolean = false,
) {
    val item = moment.beforeAfter ?: return
    val request = rememberMomentImage(moment.mediaUrl, MomentImages.mediaKey(moment.id)) ?: return
    val context = LocalContext.current
    val picture by produceState<ImageBitmap?>(null, request) {
        val drawable = (context.imageLoader.execute(request) as? SuccessResult)?.drawable
        value = (drawable as? BitmapDrawable)?.bitmap?.takeIf { it.width >= 2 }?.asImageBitmap()
    }
    picture?.let {
        MomentBeforeAfterView(
            picture = it,
            before = beforeAfterWord(item.before, "Before"),
            after = beforeAfterWord(item.after, "After"),
            modifier = modifier.testTag("moments.viewer.beforeAfter"),
            still = still,
        )
    }
}
