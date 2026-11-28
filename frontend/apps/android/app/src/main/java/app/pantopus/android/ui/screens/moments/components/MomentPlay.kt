@file:Suppress("MagicNumber", "TooManyFunctions")

package app.pantopus.android.ui.screens.moments.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.MomentPlayAnswerBody
import app.pantopus.android.data.api.models.moments.MomentPlayItemDto
import app.pantopus.android.data.api.models.moments.MomentPlayKinds
import app.pantopus.android.data.api.models.moments.MomentPlayLimits
import app.pantopus.android.data.api.models.moments.beforeAfter
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.pulse.StudioRepository
import app.pantopus.android.ui.theme.PantopusColors
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import javax.inject.Inject
import kotlin.math.roundToInt

/*
 * "Pulse, reinvented" phase 2, playable items in the viewer (CONTRACT 7b; as on iPhone): a poll a reader votes in (and
 * sees everyone's share once they have), and a countdown to its time. Each sits where the author placed it, at its size
 * and turn. The viewer holds still while the reader has one to answer. Only for a reader whose switch is on: the server
 * sends `play` only then, and the viewer draws this layer only then.
 */

/** The card's width on a 402 dp picture, scaled with the picture and the item's own size (as on iPhone). */
private const val CARD_DP = 268f
private const val BASE_WIDTH_DP = 402f

/** An item this app draws as a card: a kind it knows with what that kind needs. */
val MomentPlayItemDto.card: Boolean
    get() =
        when (kind) {
            MomentPlayKinds.POLL -> !question.isNullOrBlank() && (options?.size ?: 0) in 2..MomentPlayLimits.MOST_OPTIONS
            MomentPlayKinds.COUNTDOWN -> !title.isNullOrBlank() && endsAt != null
            else -> false
        }

/** Answering and taking back, for the viewer's cards. */
@HiltViewModel
class MomentPlayViewModel
    @Inject
    constructor(
        private val studio: StudioRepository,
    ) : ViewModel() {
        suspend fun answer(
            momentId: String,
            itemId: String,
            body: MomentPlayAnswerBody,
        ): MomentPlayItemDto? = (studio.answerPlay(momentId, itemId, body) as? NetworkResult.Success)?.data

        suspend fun takeBack(
            momentId: String,
            itemId: String,
        ): Boolean = studio.takeBackPlay(momentId, itemId)
    }

/**
 * The viewer's cards over [moment]'s picture. Its author is never asked: the server sends their items `open: false`
 * with the results.
 */
@Composable
fun MomentPlayLayer(
    moment: MomentDto,
    modifier: Modifier = Modifier,
    play: MomentPlayViewModel = hiltViewModel(),
) {
    // What the server answered since the Moment came, by item: the reader's own answer and the results it shows.
    var answered by remember(moment.id) { mutableStateOf(emptyMap<String, MomentPlayItemDto>()) }
    val items = moment.play.orEmpty().map { answered[it.id] ?: it }.filter { it.card }
    val waiting = items.any { it.kind in MomentPlayLimits.ANSWERED && it.open == true && it.mine == null }
    // The viewer holds still while the reader has an item to answer (as on iPhone).
    DisposableEffect(moment.id, waiting) {
        MomentLayerHold.hold("play", if (waiting) moment.id else null)
        onDispose { MomentLayerHold.release("play", moment.id) }
    }
    if (items.isEmpty()) return
    val picture =
        moment.width
            ?.let { w -> moment.height?.let { h -> IntSize(w, h) } }
            ?.takeIf { moment.kind != "text" }
            ?.let { if (moment.beforeAfter != null) halfOf(it) else it }
    val scope = rememberCoroutineScope()
    BoxWithConstraints(modifier = modifier.fillMaxSize().testTag("moments.viewer.play")) {
        val box = constraints.maxWidth.toFloat()
        val frame = stampFrame(picture, box, constraints.maxHeight.toFloat())
        val density = LocalDensity.current.density
        val unit = minOf(frame.width, box) / density / BASE_WIDTH_DP
        val edge = 60 * density
        items.forEach { item ->
            val x = (frame.left + item.x.toFloat() * frame.width).coerceIn(edge, (box - edge).coerceAtLeast(edge))
            val y = frame.top + item.y.toFloat() * frame.height
            MomentPlayCard(
                item = item,
                mine = false,
                onAnswer = { body ->
                    scope.launch {
                        play.answer(moment.id, item.id, body)?.let { answered = answered + (item.id to it) }
                    }
                },
                onTakeBack = {
                    scope.launch {
                        if (play.takeBack(moment.id, item.id)) {
                            answered = answered + (item.id to item.copy(mine = null, results = null, open = true))
                        }
                    }
                },
                modifier =
                    Modifier
                        .centredAt(x, y)
                        .graphicsLayer {
                            val size = (item.scale.toFloat() * unit).coerceIn(0.4f, 2.5f)
                            scaleX = size
                            scaleY = size
                            rotationZ = item.rotation.toFloat()
                        }.holdsItsFinger(),
            )
        }
    }
}

/**
 * One item's card: a dark rounded panel holding the kind's own controls. [onAnswer] and [onTakeBack] are null where the
 * card only shows (the Studio's preview).
 */
@Composable
fun MomentPlayCard(
    item: MomentPlayItemDto,
    mine: Boolean,
    modifier: Modifier = Modifier,
    onAnswer: ((MomentPlayAnswerBody) -> Unit)? = null,
    onTakeBack: (() -> Unit)? = null,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier =
            modifier
                .width(CARD_DP.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Color.Black)
                .background(PantopusColors.studioBar)
                .padding(horizontal = 14.dp, vertical = 12.dp)
                .testTag("moments.play.${item.kind}"),
    ) {
        when (item.kind) {
            MomentPlayKinds.POLL -> PollCard(item, mine, onAnswer, onTakeBack)
            MomentPlayKinds.COUNTDOWN -> CountdownCard(item)
        }
    }
}

@Composable
private fun CardTitle(words: String) {
    Text(
        text = words,
        color = Color.White,
        fontSize = 15.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun PollCard(
    item: MomentPlayItemDto,
    mine: Boolean,
    onAnswer: ((MomentPlayAnswerBody) -> Unit)?,
    onTakeBack: (() -> Unit)?,
) {
    CardTitle(item.question.orEmpty())
    val options = item.options.orEmpty()
    val results = item.results
    val counts = results?.counts
    val total = results?.total ?: counts?.sum() ?: 0
    val choice = item.mine?.choice
    options.forEachIndexed { at, option ->
        if (counts != null) {
            ShareRow(option, counts.getOrElse(at) { 0 }, total, picked = choice == at)
        } else {
            val answers = onAnswer.takeIf { item.open == true && !mine }
            Text(
                text = option,
                color = Color.White,
                fontSize = 14.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(PantopusColors.studioPillFill)
                        .then(if (answers != null) Modifier.clickable(role = Role.Button) { answers(MomentPlayAnswerBody(choice = at)) } else Modifier)
                        .padding(horizontal = 12.dp, vertical = 9.dp)
                        .testTag("moments.play.poll.option$at"),
            )
        }
    }
    if (counts != null) {
        Note(if (total == 1) "1 vote" else "$total votes")
    } else if (mine) {
        Note("Your poll: the votes show here.")
    }
    if (choice != null && item.open == true && onTakeBack != null) {
        SmallButton("Take my vote back", "moments.play.takeBack", onTakeBack)
    }
}

/** An option with everyone's share of the votes as a bar behind it; [picked]: the reader's own. */
@Composable
private fun ShareRow(
    option: String,
    count: Int,
    total: Int,
    picked: Boolean,
) {
    val share = if (total > 0) count.toFloat() / total else 0f
    val percent = (share * 100).roundToInt()
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(38.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(PantopusColors.studioPillFill)
                .semantics { contentDescription = "$option: $percent percent${if (picked) ", your vote" else ""}" }
                .testTag("moments.play.poll.share"),
    ) {
        Box(
            modifier =
                Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(share.coerceIn(0f, 1f))
                    .background(if (picked) PantopusColors.primary600 else PantopusColors.studioPillOutline),
        )
        Row(
            modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = option,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = if (picked) FontWeight.Bold else FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(text = "$percent%", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CountdownCard(item: MomentPlayItemDto) {
    CardTitle(item.title.orEmpty())
    val ends = remember(item.endsAt) { item.endsAt?.let { runCatching { Instant.parse(it) }.getOrNull() } }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(ends) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }
    val left = ends?.let { Duration.ofMillis(it.toEpochMilli() - now) }
    Text(
        text = left?.let { countdownWords(it) } ?: "",
        color = Color.White,
        fontSize = 26.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.testTag("moments.play.countdown.left"),
    )
}

/** "3d 4h", "4h 12m", "12m 05s", or "It's time" once it has passed. */
fun countdownWords(left: Duration): String {
    if (left.isNegative || left.isZero) return "It's time"
    val days = left.toDays()
    val hours = left.toHours() % 24
    val minutes = left.toMinutes() % 60
    val seconds = left.seconds % 60
    return when {
        days > 0 -> "${days}d ${hours}h"
        hours > 0 -> "${hours}h ${minutes}m"
        else -> "${minutes}m ${seconds.toString().padStart(2, '0')}s"
    }
}

@Composable
private fun Note(words: String) {
    Text(words, color = PantopusColors.studioPillSecondary, fontSize = 13.sp)
}

@Composable
private fun SmallButton(
    words: String,
    tag: String,
    onClick: () -> Unit,
) {
    Text(
        text = words,
        color = Color.White,
        fontSize = 13.5.sp,
        fontWeight = FontWeight.SemiBold,
        modifier =
            Modifier
                .clip(RoundedCornerShape(16.dp))
                .background(PantopusColors.studioPillFill)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 7.dp)
                .testTag(tag),
    )
}
