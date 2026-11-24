@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.profile.sources

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.auth.AuthRepository
import app.pantopus.android.data.profile.ProfileMark
import app.pantopus.android.data.profile.ProfileMarks
import app.pantopus.android.ui.theme.PantopusColors
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import javax.inject.Inject

/**
 * Set by `RootTabScreen` while the profile with sources is on: the outer ring of each person's mark. [want] says a
 * circle showing that person is on screen. Null while it is off: no marks are drawn and nothing is asked.
 */
class ProfileMarksEntry(
    val marks: StateFlow<Map<String, ProfileMark>>,
    val want: (userId: String) -> Unit,
)

object ProfileMarksHolder {
    var current: ProfileMarksEntry? by mutableStateOf(null)
}

/** Binds [ProfileMarks] to the signed-in person for [ProfileMarksHolder]. */
@HiltViewModel
class ProfileMarksGateViewModel
    @Inject
    constructor(
        private val marks: ProfileMarks,
        private val auth: AuthRepository,
    ) : ViewModel() {
        val entry: ProfileMarksEntry =
            ProfileMarksEntry(marks = marks.marks) { userId ->
                marks.want(userId, (auth.state.value as? AuthRepository.State.SignedIn)?.user?.id)
            }
    }

/** `RootTabScreen`'s entry for [ProfileMarksHolder]: the gate's, kept for the whole session. */
@Composable
fun rememberProfileMarksEntry(): ProfileMarksEntry = hiltViewModel<ProfileMarksGateViewModel>().entry

/**
 * The ring's width for a mark on a 40 dp avatar (board 6, `.rg`), in steps shared with the web (DECISIONS 11-23):
 * under a year on record 1 dp, one to under five years 2.5 dp, five years and more 4 dp. Years only add.
 */
internal fun markRingWidth(
    since: YearMonth,
    now: YearMonth = YearMonth.now(),
): Float {
    val years = ChronoUnit.MONTHS.between(since, now).coerceAtLeast(0) / 12f
    return when {
        years < 1f -> 1f
        years < 5f -> 2.5f
        else -> MARK_WIDEST
    }
}

/** The widest the ring can be on a picture [size] across (five years and more), for room kept beside the picture. */
internal fun markRingMaxWidth(size: Dp): Dp = (MARK_WIDEST * (size.value / MARK_AVATAR_DP).coerceIn(0.5f, 1.2f)).dp

/** The ring's drawn width in pixels for [mark] on a picture [sizePx] across (it narrows on pictures under 40 dp). */
internal fun markRingWidthPx(
    mark: ProfileMark,
    sizePx: Float,
    density: Float,
): Float {
    val scale = (sizePx / (MARK_AVATAR_DP * density)).coerceIn(0.5f, 1.2f)
    return (if (mark.seen) markRingWidth(mark.since) else 1.5f) * scale * density
}

private const val MARK_AVATAR_DP = 40f
private const val MARK_WIDEST = 4f

/**
 * The outer ring of a person's mark around their picture (board 6): thicker with years on record, dotted until
 * something is seen. Drawn outside the picture ([gap] away, as the board's 2 pt padding), so the picture keeps its size
 * and place; on a picture smaller than the board's 40 dp the ring narrows with it. It hugs the picture, and the
 * Moments ring, when there is one, moves out just beyond it (as on iPhone). Nothing is drawn for someone the server
 * didn't answer for, or while the switch is off. Decorative: the person's name beside the picture says who it is.
 */
fun Modifier.profileMarkRing(
    userId: String?,
    gap: Dp = 2.dp,
): Modifier =
    composed {
        val entry = ProfileMarksHolder.current
        if (entry == null || userId.isNullOrBlank()) {
            this
        } else {
            LaunchedEffect(entry, userId) { entry.want(userId) }
            val marks by entry.marks.collectAsStateWithLifecycle()
            val mark = marks[userId]
            if (mark == null) {
                this
            } else {
                drawWithContent {
                    drawContent()
                    val width = markRingWidthPx(mark, size.minDimension, density)
                    val radius = size.minDimension / 2 + gap.toPx() + width / 2
                    if (mark.seen) {
                        drawCircle(PantopusColors.appText, radius = radius, center = center, style = Stroke(width = width))
                    } else {
                        drawCircle(
                            PantopusColors.appTextMuted,
                            radius = radius,
                            center = center,
                            style =
                                Stroke(
                                    width = width,
                                    cap = StrokeCap.Round,
                                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(0.01f, width * 2.2f)),
                                ),
                        )
                    }
                }
            }
        }
    }
