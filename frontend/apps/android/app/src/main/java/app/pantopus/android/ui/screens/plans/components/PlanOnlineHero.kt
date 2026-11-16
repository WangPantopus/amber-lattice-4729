@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.plans.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.ui.screens.plans.colors
import app.pantopus.android.ui.screens.plans.planPinInk
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage

/**
 * Where an online plan would show its map (Plans step 3, board Online "onhero"): the kind's soft color with a rounded
 * tile in the kind's color and the video glyph. No map, no area, no pin: an online plan has no place to show. Drawn
 * only; the words around it say "Online".
 */
@Composable
fun PlanOnlineHero(
    kind: PlanKind,
    modifier: Modifier = Modifier,
    ring: Dp = 84.dp,
    corner: Dp = 28.dp,
    glyph: Dp = 40.dp,
    /** Moves the tile down from the middle (the plan page's round buttons sit over the top of it). */
    lowered: Dp = 0.dp,
) {
    val colors = kind.colors
    Box(modifier = modifier.background(colors.tint).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
        Box(
            modifier =
                Modifier
                    .padding(top = lowered)
                    .size(ring)
                    .clip(RoundedCornerShape(corner))
                    .background(colors.accent),
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(icon = PantopusIcon.Video, contentDescription = null, size = glyph, tint = planPinInk)
        }
    }
}
