@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.map

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentRingDto
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import java.time.Instant

/**
 * How far back the Moments map shows Moments from (founder, 2026-11-16): the last 30 minutes, the last hour or the last
 * 24 hours, "All" to begin with. The pins, the bubbles, the row of faces and Play all follow it. It works on what the
 * map already reads (each Moment's posting time), so nothing changes on the server.
 *
 * The choice lasts while the app runs and is "All" again after a relaunch: a filter left on from days ago would hide
 * Moments without anyone remembering why. As on iPhone (`MomentsTimeFilter.swift`).
 */
enum class MomentsTimeFilter(
    /** How far back, in seconds; null for all of them. */
    val seconds: Long?,
    /** The menu's words. */
    val title: String,
    /** The chip's words: short, so the chip stays small over the map. */
    val chipTitle: String,
    /** The empty card's line while the filter is on. */
    val emptyLine: String?,
) {
    ALL(null, "All", "All", null),
    HALF_HOUR(30 * 60, "Last 30 minutes", "30 min", "Nothing posted in the last 30 minutes. Choose All to see older Moments."),
    HOUR(60 * 60, "Last hour", "1 hour", "Nothing posted in the last hour. Choose All to see older Moments."),
    DAY(24 * 60 * 60, "Last 24 hours", "24 hours", "Nothing posted in the last 24 hours. Choose All to see older Moments."),
    ;

    /** The oldest posting time shown; null for all of them. */
    fun since(now: Instant): Instant? = seconds?.let { now.minusSeconds(it) }
}

/** Keeps only the Moments posted since then (all of them for null); null when none is left. */
internal fun MomentRingDto.postedSince(since: Instant?): MomentRingDto? {
    if (since == null) return this
    // A Moment whose time can't be read stays: hiding it would look like it was never posted.
    val kept = moments.filter { brief -> brief.createdAt?.let(::parseMomentInstant)?.isBefore(since) != true }
    return if (kept.isEmpty()) null else copy(moments = kept)
}

internal fun parseMomentInstant(value: String): Instant? = runCatching { Instant.parse(value.replace("+00:00", "Z")) }.getOrNull()

/** The chip: a clock, how far back, and a menu. Filled while it hides something, like "Elevation" while it's on. */
@Composable
internal fun MomentsTimeChip(
    filter: MomentsTimeFilter,
    onChoose: (MomentsTimeFilter) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val on = filter != MomentsTimeFilter.ALL
    val ink = if (on) Color.White else PantopusColors.appText
    Box {
        Row(
            modifier =
                Modifier
                    .then(if (on) Modifier.filled(CircleShape) else Modifier.glassChip(CircleShape))
                    .clickable(role = Role.Button) { open = true }
                    .height(CHIP_HEIGHT)
                    .padding(horizontal = 14.dp)
                    .testTag("moments.timeFilter")
                    .clearAndSetSemantics {
                        contentDescription = "Show Moments from"
                        stateDescription = if (on) filter.title else "All times"
                        role = Role.Button
                    },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            PantopusIconImage(icon = PantopusIcon.Clock, contentDescription = null, size = 16.dp, strokeWidth = 2.25f, tint = ink)
            Text(text = filter.chipTitle, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = ink, maxLines = 1)
            PantopusIconImage(
                icon = PantopusIcon.ChevronDown,
                contentDescription = null,
                size = 14.dp,
                strokeWidth = 2.25f,
                tint = if (on) Color.White else PantopusColors.appTextSecondary,
            )
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            MomentsTimeFilter.entries.forEach { choice ->
                DropdownMenuItem(
                    text = { Text(choice.title) },
                    trailingIcon = {
                        if (choice == filter) {
                            PantopusIconImage(icon = PantopusIcon.Check, contentDescription = "Chosen", size = 16.dp, strokeWidth = 2.5f)
                        }
                    },
                    onClick = {
                        open = false
                        onChoose(choice)
                    },
                    modifier = Modifier.testTag("moments.timeFilter.${choice.name.lowercase()}"),
                )
            }
        }
    }
}
