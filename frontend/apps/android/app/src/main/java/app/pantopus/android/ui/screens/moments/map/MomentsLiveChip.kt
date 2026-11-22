@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentRingDto
import app.pantopus.android.ui.screens.moments.components.LiveGlyph
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import java.time.Instant

/*
 * "Live now" on the Moments map (board L3, API v4.1): only rings with a Moment the app's camera took at its spot in the
 * last 15 minutes show, as the time filter's chip hides older ones (nothing is dimmed). Each ring says until when it is
 * live (`live_until`, null at home, on an area and with no location), so the map filters what it already read. The
 * choice lasts while the app runs, like the time filter's. As on iPhone.
 */

/** The empty card's line while "Live now" is on and nothing is live in view. */
internal const val LIVE_NOW_EMPTY_LINE = "Nothing live right now. Turn off Live now to see other Moments."

/** Whether the ring is live at [now]: its `live_until` is still ahead. */
internal fun MomentRingDto.liveAt(now: Instant): Boolean = liveUntil?.let(::parseMomentInstant)?.isAfter(now) == true

/** The chip: the Live mark and "Live now", filled with a check while it's on, as "Elevation" is. */
@Composable
internal fun MomentsLiveChip(
    on: Boolean,
    onToggle: () -> Unit,
) {
    val ink = if (on) Color.White else PantopusColors.appText
    Row(
        modifier =
            Modifier
                .then(if (on) Modifier.filled(CircleShape) else Modifier.glassChip(CircleShape))
                .toggleable(value = on, role = Role.Switch, onValueChange = { onToggle() })
                .height(CHIP_HEIGHT)
                .padding(start = 12.dp, end = 14.dp)
                .testTag("moments.liveChip")
                .clearAndSetSemantics {
                    contentDescription = "Live now"
                    stateDescription = if (on) "On" else "Off"
                    role = Role.Switch
                    onClick(label = if (on) "Show every Moment" else "Show only Moments taken on the spot just now") {
                        onToggle()
                        true
                    }
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        LiveGlyph(color = if (on) Color.White else PantopusColors.momentLive, size = 16.dp)
        Text(text = "Live now", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = ink, maxLines = 1)
        if (on) PantopusIconImage(icon = PantopusIcon.Check, contentDescription = null, size = 14.dp, strokeWidth = 2.75f, tint = ink)
    }
}
