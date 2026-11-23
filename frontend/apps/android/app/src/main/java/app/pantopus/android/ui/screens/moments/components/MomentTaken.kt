@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.MomentWeatherDto
import app.pantopus.android.data.api.models.place.WeatherConditionCode
import app.pantopus.android.ui.screens.place.detail.conditionIcon
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

/*
 * Any photo or video in the album can be a Moment (founder, 2026-11-11). One taken more than a day before it's posted
 * says when it was taken, on the Post sheet and for everyone watching, so an old photo never reads as something
 * happening now. The server keeps the same rule (contract v3.3: `taken_at` is set only then).
 */

/** More than this before posting, a photo or video says when it was taken. */
private val TAKEN_SHOWN_AFTER: Duration = Duration.ofHours(24)

/** Whether a photo or video taken at [takenAt] says so when posted at [now]. */
internal fun takenLongAgo(
    takenAt: Instant?,
    now: Instant = Instant.now(),
): Boolean = takenAt != null && Duration.between(takenAt, now) > TAKEN_SHOWN_AFTER

/** "Taken Oct 3", or "Taken Oct 3, 2024" when it isn't this year (the viewer's own calendar). */
internal fun takenLabel(
    takenAt: Instant,
    now: Instant = Instant.now(),
    zone: ZoneId = ZoneId.systemDefault(),
): String {
    val date = takenAt.atZone(zone).toLocalDate()
    val pattern = if (date.year == now.atZone(zone).year) "MMM d" else "MMM d, yyyy"
    return "Taken " + DateTimeFormatter.ofPattern(pattern, Locale.getDefault()).format(date)
}

/** The server's `taken_at` as the viewer's label, or null (none, or unreadable). */
internal fun takenLabel(iso: String?): String? = momentInstant(iso)?.let { takenLabel(it) }

/** A time from the server, as `2026-11-20T11:32:45.911Z` or `2026-11-20T11:17:45.911+00:00`; null when unreadable. */
internal fun momentInstant(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it.replace("+00:00", "Z")) }.getOrNull() }

/*
 * The Live mark and the weather stamp (API v4.1, boards L2 and L3). A photo or video the app's own camera took at its
 * spot reads "Live from here" until its `live_until` (15 minutes after it was posted, counted on the server), then
 * "Taken here", turning over by itself while it's on screen. One shared later has no `live_until` and reads "Taken
 * here" from the start. Beside it, the weather when it was posted, if its author showed it.
 */

/** "Live from here" while the Moment is live, then "Taken here". */
internal const val LIVE_FROM_HERE = "Live from here"
internal const val TAKEN_HERE = "Taken here"

/** How often a live pill looks at the clock again: a phone asleep past `live_until` turns it over soon after waking. */
private const val LIVE_RECHECK_MS = 15_000L

/** "31°F · Snow", and how TalkBack reads it ("Weather, 31 degrees Fahrenheit, Snow"); null without a temperature or words. */
internal fun MomentWeatherDto.line(): Pair<String, String>? {
    val degrees = tempF?.takeIf { it.isFinite() }?.roundToInt() ?: return null
    val words = label?.takeIf { it.isNotBlank() } ?: return null
    return "$degrees°F · $words" to "Weather, $degrees degrees Fahrenheit, $words"
}

/** The weather glyph for the server's kind, as Today draws its sky by day; a cloud for a kind this app doesn't know. */
internal fun weatherIcon(kind: String?): PantopusIcon {
    val code = WeatherConditionCode.entries.firstOrNull { it.name.equals(kind, ignoreCase = true) } ?: WeatherConditionCode.UNKNOWN
    return conditionIcon(code, night = false)
}

/** Whether [liveUntil] is still ahead, moved on by itself when it passes (no read of the Moment needed). */
@Composable
private fun rememberLive(liveUntil: Instant?): Boolean {
    var live by remember(liveUntil) { mutableStateOf(liveUntil?.isAfter(Instant.now()) == true) }
    LaunchedEffect(liveUntil) {
        val until = liveUntil ?: return@LaunchedEffect
        while (live) {
            val left = Duration.between(Instant.now(), until).toMillis()
            if (left <= 0) {
                live = false
            } else {
                delay(left.coerceAtMost(LIVE_RECHECK_MS))
            }
        }
    }
    return live
}

/**
 * The pills under the viewer's header: "Live from here" or "Taken here" and the weather for a Moment taken here, or
 * "Taken Oct 3" for an old photo from the album (the server never sends both). Nothing for any other Moment.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun MomentMetaPills(
    moment: MomentDto,
    modifier: Modifier = Modifier,
) {
    val stamp = moment.weather?.takeIf { moment.takenHere }
    val weather = stamp?.line()
    val taken = if (moment.takenHere) null else takenLabel(moment.takenAt)
    if (!moment.takenHere && taken == null) return
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (moment.takenHere) {
            MomentLivePill(live = rememberLive(momentInstant(moment.liveUntil)))
            weather?.let { (line, spoken) -> MomentWeatherPill(line = line, spoken = spoken, icon = weatherIcon(stamp?.kind)) }
        } else if (taken != null) {
            MomentTakenPill(label = taken)
        }
    }
}

/** "Live from here" with the green mark, or "Taken here" with a pin once it isn't live. */
@Composable
private fun MomentLivePill(live: Boolean) {
    val label = if (live) LIVE_FROM_HERE else TAKEN_HERE
    MomentStagePill(label = label, tag = "moments.viewer.live") {
        if (live) {
            LiveGlyph(color = PantopusColors.momentLiveOnStage, size = 14.dp)
        } else {
            PantopusIconImage(icon = PantopusIcon.MapPin, contentDescription = null, size = 13.dp, strokeWidth = 2.2f, tint = Color.White)
        }
    }
}

/** "31°F · Snow" with the sky's glyph. */
@Composable
private fun MomentWeatherPill(
    line: String,
    spoken: String,
    icon: PantopusIcon,
) {
    MomentStagePill(label = line, tag = "moments.viewer.weather", spoken = spoken) {
        PantopusIconImage(icon = icon, contentDescription = null, size = 13.dp, strokeWidth = 2.2f, tint = Color.White)
    }
}

/** The Live mark's glyph (boards L1–L3): a soft ring around a dot. */
@Composable
internal fun LiveGlyph(
    color: Color,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val unit = this.size.minDimension / 24f
        drawCircle(color = color.copy(alpha = 0.55f), radius = 10f * unit, style = Stroke(width = 2.4f * unit))
        drawCircle(color = color, radius = 5f * unit)
    }
}

/** The small dark pill over a Moment that says when it was taken (the viewer, under the header). */
@Composable
internal fun MomentTakenPill(
    label: String,
    modifier: Modifier = Modifier,
) {
    MomentStagePill(label = label, tag = "moments.viewer.taken", modifier = modifier) {
        PantopusIconImage(icon = PantopusIcon.Calendar, contentDescription = null, size = 13.dp, strokeWidth = 2.2f, tint = Color.White)
    }
}

/** One of the viewer's small dark pills: a glyph and a few words, read aloud as [spoken]. */
@Composable
private fun MomentStagePill(
    label: String,
    tag: String,
    modifier: Modifier = Modifier,
    spoken: String = label,
    glyph: @Composable () -> Unit,
) {
    Row(
        modifier =
            modifier
                .clip(RoundedCornerShape(Radii.pill))
                .background(PantopusColors.momentCaptionPill)
                .padding(horizontal = 10.dp, vertical = 5.dp)
                .testTag(tag)
                .clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        glyph()
        Text(text = label, color = Color.White, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}
