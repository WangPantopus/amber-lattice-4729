package app.pantopus.android.ui.screens.feed.reinvented

import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.MomentRingDto
import app.pantopus.android.data.api.models.reinvented.ReinventedBandDto
import app.pantopus.android.data.pulse.ReinventedBox
import app.pantopus.android.data.pulse.ReinventedPoint
import app.pantopus.android.ui.screens.feed.pulse.PulseIntent
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCardContent
import app.pantopus.android.ui.screens.profile.ProfilePostCardActions
import java.time.Instant

/** One row of the new Pulse's list: a band's line, a Moment that fades, a kept Moment, or a post that stays. */
sealed interface ReinventedRow {
    val key: String

    data class Band(
        val band: ReinventedBandDto,
    ) : ReinventedRow {
        override val key: String get() = "band-${band.band}"
    }

    /** A Moment that fades; [kept] draws it as a post that stays ("Keep this?"). */
    data class Moment(
        val moment: MomentDto,
        val kept: Boolean,
    ) : ReinventedRow {
        override val key: String get() = "moment-${moment.id}"
    }

    data class Post(
        val card: PulsePostCardContent,
    ) : ReinventedRow {
        override val key: String get() = "post-${card.id}"
    }

    /** Explore's "Today, elsewhere" and "New elsewhere". */
    data class Heading(
        val words: String,
    ) : ReinventedRow {
        override val key: String get() = "heading-$words"
    }

    /** "Why am I seeing this?", answered in one line under an Explore item. */
    data class Why(
        val itemKey: String,
        val words: String,
    ) : ReinventedRow {
        override val key: String get() = "why-$itemKey"
    }
}

/** The list as drawn: each band's line where the band changes, then its items; a post shows once its card is made. */
internal fun ReinventedPulseState.rows(cards: List<PulsePostCardContent>): List<ReinventedRow> {
    val byId = cards.associateBy { it.id }
    val rows = mutableListOf<ReinventedRow>()
    var lastBand: String? = null
    val explore = reach == ReinventedPulseViewModel.EXPLORE
    // A Retake is one row (CONTRACT 8e): its first frame in the list opens the whole Retake.
    val retakes = mutableSetOf<String>()
    for ((index, item) in items.withIndex()) {
        val retake = item.moment?.retake
        if (retake != null && !retakes.add(retake.startId)) continue
        if (explore && pickedCount > 0 && index == 0) rows += ReinventedRow.Heading("Today, elsewhere")
        if (explore && pickedCount > 0 && index == pickedCount) rows += ReinventedRow.Heading("New elsewhere")
        val before = rows.size
        val line = item.band?.takeIf { it != lastBand }?.let { band -> bands.firstOrNull { it.band == band } }
        if (line != null) {
            rows += ReinventedRow.Band(line)
            lastBand = line.band
        }
        val moment = item.moment
        val post = item.post
        when {
            item.type == ReinventedPulseViewModel.MOMENT && moment != null -> rows += ReinventedRow.Moment(moment, item.kept)
            post != null -> byId[post.id]?.let { rows += ReinventedRow.Post(it) }
        }
        val why = item.why
        if (explore && why != null && rows.size > before) rows += ReinventedRow.Why(item.type + item.id, why)
    }
    return rows
}

/** The status line over a post that stays, from the kinds today's Pulse has; null for the rest. */
internal fun reinventedStatus(card: PulsePostCardContent): String? =
    when (card.intent) {
        PulseIntent.Ask ->
            when {
                card.actions.isSolved -> "Solved"
                card.commentCount == 1 -> "Question, 1 answer"
                else -> "Question, ${card.commentCount} answers"
            }
        PulseIntent.Recommend -> "Spot"
        PulseIntent.Event -> card.reaction.likeCount.let { going -> if (going > 0) "Plan, $going going" else "Plan" }
        PulseIntent.Lost -> "Lost and found"
        PulseIntent.Alert -> "Heads-up"
        else -> null
    }

/** "5h left", "40m left": a Moment's time left, from its end; empty when it can't be read. */
internal fun momentTimeLeft(
    expiresAt: String?,
    nowMs: Long,
): String {
    val end = expiresAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return ""
    val minutes = ((end - nowMs) / MINUTE_MS).coerceAtLeast(0)
    return if (minutes >= MINUTES_IN_HOUR) "${minutes / MINUTES_IN_HOUR}h left" else "${minutes}m left"
}

/** The words a chip shows. */
internal fun reinventedChipTitle(chip: String): String =
    when (chip) {
        "all" -> "All"
        "live" -> "Live"
        "learn" -> "Learn"
        "spots" -> "Spots"
        "ask" -> "Ask"
        "plans" -> "Plans"
        "sports" -> "Sports"
        else -> chip.replaceFirstChar { it.titlecase() }
    }

/** Nothing here: what there is to do. */
internal fun reinventedEmptyTitle(reach: String): String =
    when (reach) {
        ReinventedPulseViewModel.CLOSE -> "Nothing from your circle right now"
        ReinventedPulseViewModel.EXPLORE -> "Nothing from elsewhere yet today"
        else -> "Quiet around here right now"
    }

internal fun reinventedEmptyLine(reach: String): String =
    if (reach == ReinventedPulseViewModel.EXPLORE) {
        "Explore shows only what people chose to share with everyone. Check back later today."
    } else {
        "Post a Moment with + and it shows here first. Or widen what Pulse shows from the pill at the top."
    }

private const val MINUTE_MS = 60_000L
private const val MINUTES_IN_HOUR = 60L

/** What the list's rows do when tapped. */
data class ReinventedListActions(
    val cards: ProfilePostCardActions,
    val onOpenMoment: (MomentDto) -> Unit,
    val onRefresh: () -> Unit,
    val onLoadMore: () -> Unit,
    /** "Show my circle instead", where Around me has no place. */
    val onShowCircle: () -> Unit,
    /** The end line's "Keep exploring?": Explore. */
    val onExplore: () -> Unit = {},
    /** Explore's pause: its next page. */
    val onKeepExploring: () -> Unit = {},
    /** A row's place: the map glides there. */
    val onShowOnMap: (ReinventedPoint) -> Unit = {},
)

/** What a tile of the strip opens. */
data class ReinventedStripActions(
    val onOpenMoment: (MomentDto) -> Unit,
    val onOpenPlan: (String) -> Unit,
    val onOpenRing: (MomentRingDto) -> Unit,
)

/** My Atlas in the new Pulse: whether it shows, the person's kept Moments in view as pins, and what its taps do. */
data class ReinventedAtlasHook(
    val on: Boolean = false,
    val pins: List<ReinventedMapItem> = emptyList(),
    val onToggle: (Boolean) -> Unit = {},
    val onMoved: (ReinventedBox) -> Unit = {},
    val onOpen: (MomentDto) -> Unit = {},
)
