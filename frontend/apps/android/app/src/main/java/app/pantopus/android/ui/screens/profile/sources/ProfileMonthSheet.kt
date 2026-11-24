@file:Suppress("LongMethod", "MagicNumber")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.components.Shimmer
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import java.time.Month
import java.time.format.TextStyle
import java.util.Locale

/** "August 2026" for a chart month. */
internal fun RecordMonth.words(): String = "${Month.of(month + 1).getDisplayName(TextStyle.FULL, Locale.US)} $year"

/** The month before or after [from] that has something in a shown lane; null when there is none. */
internal fun ProfileRings.adjacentShownMonth(
    from: RecordMonth,
    lanes: Set<ProfileLane>,
    step: Int,
): RecordMonth? {
    var year = from.year
    var month = from.month
    val last = RecordMonth(now.year, now.monthValue - 1)
    repeat(years.size * ProfileRings.MONTHS) {
        month += step
        if (month < 0) {
            month = ProfileRings.MONTHS - 1
            year -= 1
        } else if (month >= ProfileRings.MONTHS) {
            month = 0
            year += 1
        }
        if (year < years.first() || year > last.year || (year == last.year && month > last.month)) return null
        val candidate = RecordMonth(year, month)
        if (hasShownMonth(candidate, lanes)) return candidate
    }
    return null
}

/**
 * One month opened (board 13): its title and count, back and forward to the months around it that have something, and
 * its lines with their lane's dot. The chart behind lights the year and marks the month.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProfileMonthSheet(
    state: ProfileMonthState,
    chart: ProfileBlock.RecordChart,
    onOpenMonth: (RecordMonth) -> Unit,
    onOpenLink: (ProfilePageLink) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val at = state.at
    val previous = chart.rings.adjacentShownMonth(at, chart.lanes, -1)
    val next = chart.rings.adjacentShownMonth(at, chart.lanes, 1)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = PantopusColors.appSurface,
        modifier = Modifier.testTag("profileSources.monthSheet"),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(start = 16.dp, end = 16.dp, bottom = 28.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(Modifier.weight(1f).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite }) {
                    val title = (state as? ProfileMonthState.Ready)?.content?.title ?: at.words()
                    Text(title, style = SourcesType.h3, modifier = Modifier.semantics { heading() })
                    (state as? ProfileMonthState.Ready)?.content?.subtitle?.let { Text(it, style = SourcesType.caption) }
                }
                MonthStep(
                    icon = PantopusIcon.ChevronLeft,
                    label = previous?.words(),
                    onClick = previous?.let { { onOpenMonth(it) } },
                    tag = "profileSources.monthPrevious",
                )
                MonthStep(
                    icon = PantopusIcon.ChevronRight,
                    label = next?.words(),
                    onClick = next?.let { { onOpenMonth(it) } },
                    tag = "profileSources.monthNext",
                )
            }
            when (state) {
                is ProfileMonthState.Loading ->
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        repeat(3) { Shimmer(width = 320.dp, height = 40.dp, cornerRadius = 8.dp, modifier = Modifier.fillMaxWidth()) }
                    }
                is ProfileMonthState.Ready ->
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        state.content.lines.forEach { line ->
                            InkLineRow(line = line, showLane = true, onOpen = line.link?.let { { onOpenLink(it) } })
                        }
                    }
                is ProfileMonthState.Empty -> Unit
            }
        }
    }
}

/** Back or forward a month: 40 dp on the board, a 48 dp target; named by the month it opens. */
@Composable
private fun MonthStep(
    icon: PantopusIcon,
    label: String?,
    onClick: (() -> Unit)?,
    tag: String,
) {
    Box(
        modifier =
            Modifier
                .size(48.dp)
                .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
                .semantics { if (label != null) contentDescription = label }
                .testTag(tag)
                .alpha(if (onClick != null) 1f else 0.35f),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(PantopusColors.appSurfaceSunken),
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(icon = icon, contentDescription = null, size = 20.dp, tint = PantopusColors.appText)
        }
    }
}
