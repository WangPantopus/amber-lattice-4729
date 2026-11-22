@file:Suppress("PackageNaming", "MagicNumber")

package app.pantopus.android.ui.screens.mailbox.cards

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import app.pantopus.android.data.api.models.mailbox.HolidayCardDesign
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import app.pantopus.android.ui.theme.rememberReduceMotion

// ── Press and hold a card for a large preview (card shelves SPEC B8) ─────────────────────────

/**
 * A card on the shelves: a tap opens it on the card rack ([onTap]), as `clickable` would, with the same press ripple;
 * pressed and held ([onHold] true), the card shows large over the page until the finger lifts ([onHold] false), with a
 * tick of the phone. A drag scrolls the row or the page as before. A screen reader keeps the tap (the rack is where a
 * card is seen large).
 */
internal fun Modifier.tapOrHold(
    onTap: () -> Unit,
    onHold: (Boolean) -> Unit,
): Modifier =
    composed {
        val latestTap by rememberUpdatedState(onTap)
        val latestHold by rememberUpdatedState(onHold)
        val interactions = remember { MutableInteractionSource() }
        val haptics = LocalHapticFeedback.current
        indication(interactions, LocalIndication.current)
            .pointerInput(Unit) {
                detectTapGestures(
                    onPress = { at ->
                        val press = PressInteraction.Press(at)
                        interactions.emit(press)
                        val lifted = tryAwaitRelease()
                        latestHold(false)
                        interactions.emit(if (lifted) PressInteraction.Release(press) else PressInteraction.Cancel(press))
                    },
                    onLongPress = {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        latestHold(true)
                    },
                    onTap = { latestTap() },
                )
            }
    }

/** The whole window, from its top left: the preview covers the page. */
private object WholeWindow : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset = IntOffset.Zero
}

/**
 * The held card, large, over the page dimmed by the table's night: as wide as the screen allows (88%) while it fits in
 * two thirds of its height, its caption under it. It grows in from a little smaller (at once with animations off). It
 * takes no touches: the finger that holds the card lifts it away.
 */
@Composable
internal fun HoldPreview(design: HolidayCardDesign) {
    val reduceMotion = rememberReduceMotion()
    val shown = remember { Animatable(if (reduceMotion) 1f else 0f) }
    LaunchedEffect(Unit) { if (!reduceMotion) shown.animateTo(1f, tween(140)) }
    Popup(popupPositionProvider = WholeWindow, properties = PopupProperties(focusable = false, clippingEnabled = false)) {
        BoxWithConstraints(
            modifier =
                Modifier
                    .fillMaxSize()
                    .graphicsLayer { alpha = shown.value }
                    .background(PantopusColors.tableNight.copy(alpha = 0.84f))
                    .clearAndSetSemantics {},
            contentAlignment = Alignment.Center,
        ) {
            val aspect = HolidayCardArt.pictureAspect(design.id, design.height)
            val width = min(maxWidth * 0.88f, maxHeight * 0.66f * aspect)
            Column(
                modifier =
                    Modifier.width(width).graphicsLayer {
                        val scale = 0.92f + 0.08f * shown.value
                        scaleX = scale
                        scaleY = scale
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                PickPicture(design, selected = false, thumb = false)
                Text(
                    design.caption,
                    fontSize = 17.sp,
                    lineHeight = 23.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PantopusColors.cardWaxText,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = Spacing.s2),
                )
            }
        }
    }
}
