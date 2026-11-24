package app.pantopus.android.ui.screens.moments.components

import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.api.models.moments.MomentRingDto
import app.pantopus.android.ui.screens.moments.MomentRingsHolder
import app.pantopus.android.ui.screens.profile.sources.ProfileMarksHolder
import app.pantopus.android.ui.screens.profile.sources.markRingMaxWidth
import app.pantopus.android.ui.screens.profile.sources.markRingWidthPx
import app.pantopus.android.ui.screens.profile.sources.profileMarkRing
import kotlinx.coroutines.delay
import java.time.Instant

/** A circle that stays on screen asks about its person again this often. */
private const val RECHECK_MS = 61_000L

/** The gap between a ring's segments, on the 64-unit pin the boards measure. */
private const val SEGMENT_GAP = 8f
private const val PIN_UNITS = 64f

/** The space between the mark's outer ring and the Moments ring beyond it. */
private val MARK_TO_MOMENTS = 1.5.dp

/**
 * The Moments ring around a person's profile picture, anywhere it shows (a Pulse post, Messages, a chat, Connections,
 * their profile): sky to green while one of their Moments is new to you, gray once you've watched them all, one
 * segment per Moment, as on the Moments map. A tap on a picture with a ring plays their Moments; without a ring the
 * picture does what it did before. Who has a ring is the server's answer, by the map's rules
 * (`MomentsPeopleRings`). The ring is drawn outside the picture ([gap] away), so the picture keeps its size and place:
 * put this first in the picture's modifiers, before anything that clips.
 *
 * While the profile with sources is on, the outer ring of the person's mark (board 6, [profileMarkRing]) travels with
 * the same picture: it hugs the picture, and the Moments ring moves out just beyond it.
 */
fun Modifier.momentsRing(
    userId: String?,
    stroke: Dp = 2.dp,
    gap: Dp = 2.dp,
    /** False where the picture already sits inside the whole mark (the profile with sources' header). */
    withMark: Boolean = true,
): Modifier =
    composed {
        val entry = MomentRingsHolder.current
        // The mark's outer ring hugs the picture; the Moments ring moves out beyond it (board 6, as on iPhone).
        val markEntry = ProfileMarksHolder.current?.takeIf { withMark }
        val marks = markEntry?.marks?.collectAsStateWithLifecycle()
        val mark = userId?.let { marks?.value?.get(it) }
        if (entry == null || userId.isNullOrBlank()) {
            this.profileMarkRing(userId.takeIf { withMark }, gap)
        } else {
            LaunchedEffect(entry, userId) {
                while (true) {
                    entry.want(userId)
                    delay(RECHECK_MS)
                }
            }
            val rings by entry.rings.collectAsStateWithLifecycle()
            val watched by entry.watched.collectAsStateWithLifecycle()
            val ring = rings[userId]?.withoutEnded()
            if (ring == null) {
                this.profileMarkRing(userId.takeIf { withMark }, gap)
            } else {
                // Your own ring keeps its color (the server says your Moments are "seen"; `mine` styles it), as on the map.
                val seen = ring.moments.map { !ring.mine && (it.seen || it.id in watched) }
                drawWithContent {
                    drawContent()
                    val width = stroke.toPx()
                    val outside = mark?.let { markRingWidthPx(it, size.minDimension, density) + MARK_TO_MOMENTS.toPx() } ?: 0f
                    val radius = size.minDimension / 2 + gap.toPx() + outside + width / 2
                    drawMomentRing(seen, center, radius, width, SEGMENT_GAP * (radius * 2 / PIN_UNITS))
                }
                    .clickable(onClickLabel = "Play Moments", role = Role.Button) { entry.play(ring) }
                    .testTag("moments.profileRing.$userId")
                    .profileMarkRing(userId.takeIf { withMark }, gap)
            }
        }
    }

/**
 * How far [momentsRing] may draw beyond a picture [size] across while the profile with sources is on: the mark's
 * widest ring and, while Moments is on, the Moments ring beyond it. A card whose picture sits at the card's inset keeps
 * this much room beside the picture, so both rings clear the card's edge by that same inset. Zero while the profile with
 * sources is off, so those screens stay as they were.
 */
@Composable
fun momentsRingReach(
    size: Dp,
    stroke: Dp = 2.dp,
    gap: Dp = 2.dp,
): Dp {
    if (ProfileMarksHolder.current == null) return 0.dp
    val moments = if (MomentRingsHolder.current != null) MARK_TO_MOMENTS + stroke else 0.dp
    return gap + markRingMaxWidth(size) + moments
}

/** The ring without the Moments that have ended since it was read; null when nothing is left. */
private fun MomentRingDto.withoutEnded(): MomentRingDto? {
    val now = Instant.now()
    val live =
        moments.filter { brief ->
            brief.expiresAt?.let { runCatching { Instant.parse(it.replace("+00:00", "Z")) }.getOrNull()?.isAfter(now) } ?: true
        }
    return if (live.isEmpty()) null else copy(moments = live)
}
