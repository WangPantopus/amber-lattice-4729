package app.pantopus.android.ui.screens.moments.components

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput

/**
 * "Pulse, reinvented": something on a switch-on reader's picture holds a finger now (before and after's curtain,
 * [MomentBeforeAfterView]; a dot or its card, [MomentDotsLayer]). The viewer's own gestures (next, back, the page turn)
 * read every touch on the picture, so while this is set they leave that finger alone and only hold the Moment still.
 * Nothing sets it outside those layers.
 */
object MomentCurtainGrab {
    @Volatile
    var held: Boolean = false
        internal set
}

/**
 * Marks every finger that lands here as held ([MomentCurtainGrab]) until it lifts, before the viewer reads it; what is
 * under it (a dot, a card's buttons) still gets its taps.
 */
fun Modifier.holdsItsFinger(): Modifier =
    pointerInput(Unit) {
        awaitEachGesture {
            awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            MomentCurtainGrab.held = true
            try {
                do {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                } while (event.changes.any { it.pressed })
            } finally {
                MomentCurtainGrab.held = false
            }
        }
    }
