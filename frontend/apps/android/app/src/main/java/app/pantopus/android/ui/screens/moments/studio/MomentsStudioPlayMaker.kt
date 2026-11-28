@file:Suppress("MagicNumber", "TooManyFunctions")

package app.pantopus.android.ui.screens.moments.studio

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentPlayItemDto
import app.pantopus.android.data.api.models.moments.MomentPlayKinds
import app.pantopus.android.data.api.models.moments.MomentPlayLimits
import app.pantopus.android.ui.screens.moments.components.card
import app.pantopus.android.ui.screens.moments.compose.MomentsComposeUiState
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import java.time.Duration
import java.time.Instant

/*
 * "Pulse, reinvented" phase 2, the Stamps and Play tray's polls and countdowns in the Studio (CONTRACT 7b; board B5; as on
 * iPhone): a question with two to four answers, or a title and the time it counts down to. Placed on the picture as a
 * card, dragged, pinched and turned; a tap opens it again to change or remove it. They go out in `play`; they can't be
 * changed after posting (the answers would mean something else).
 */

/** The kinds made here besides moving words, with the tray's words for each. */
internal val STUDIO_PLAY_KINDS =
    listOf(
        Triple(MomentPlayKinds.POLL, "Poll", "Ask a question with up to four answers. Others vote and see everyone's share."),
        Triple(MomentPlayKinds.COUNTDOWN, "Countdown", "Count down to a time, up to 30 days ahead."),
    )

/** A poll or a countdown may be added here: a photo or a video, inside the four items in all. */
internal val MomentsComposeUiState.offersPlayCards: Boolean
    get() = media != null && items.size + (if (studioPair != null) 1 else 0) < 4

/** A poll or countdown as it goes out: its words trimmed and inside the limits; null when it isn't whole. */
internal fun MomentPlayItemDto.sentCard(now: Instant = Instant.now()): MomentPlayItemDto? =
    when (kind) {
        MomentPlayKinds.POLL -> {
            val question = question?.trim()?.take(MomentPlayLimits.QUESTION_LETTERS).orEmpty()
            val options = options.orEmpty().map { it.trim().take(MomentPlayLimits.OPTION_LETTERS) }.filter { it.isNotEmpty() }
            copy(question = question, options = options).takeIf { question.isNotEmpty() && options.size in 2..MomentPlayLimits.MOST_OPTIONS }
        }
        MomentPlayKinds.COUNTDOWN -> {
            val title = title?.trim()?.take(MomentPlayLimits.TITLE_LETTERS).orEmpty()
            val ends = endsAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
            val inTime = ends != null && ends.isAfter(now) && ends.isBefore(now.plus(Duration.ofDays(MomentPlayLimits.COUNTDOWN_DAYS)))
            copy(title = title).takeIf { title.isNotEmpty() && inTime }
        }
        else -> null
    }?.takeIf { it.card }

/** The tray's Play row for one kind: its name and what it does in one line. */
@Composable
internal fun StudioPlayRow(
    name: String,
    line: String,
    tag: String,
    onMake: () -> Unit,
) {
    val shape = RoundedCornerShape(19.dp)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Row(
            modifier =
                Modifier
                    .height(38.dp)
                    .clip(shape)
                    .background(PantopusColors.studioPillFill)
                    .border(1.dp, PantopusColors.studioPillOutline, shape)
                    .clickable(role = Role.Button, onClick = onMake)
                    .padding(horizontal = 12.dp)
                    .testTag(tag)
                    .semantics(mergeDescendants = true) { contentDescription = name },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            PantopusIconImage(icon = PantopusIcon.Sparkles, contentDescription = null, size = 16.dp, strokeWidth = 2.2f, tint = Color.White)
            Text(text = name, color = Color.White, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        Text(text = line, color = PantopusColors.studioPillSecondary, fontSize = 13.sp)
    }
}

/** The form for a poll or a countdown over the Studio: [kind] for a new one, or [editing] the item's id. */
@Composable
internal fun StudioPlayPanel(
    visible: Boolean,
    kind: String?,
    editing: String?,
    items: List<MomentPlayItemDto>,
    onItems: (List<MomentPlayItemDto>) -> Unit,
    onDone: () -> Unit,
) {
    BackHandler(enabled = visible, onBack = onDone)
    Box(modifier = Modifier.fillMaxSize()) {
        AnimatedVisibility(visible = visible, enter = fadeIn(), exit = fadeOut()) {
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .background(PantopusColors.momentDim)
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDone)
                        .semantics {
                            contentDescription = "Close"
                            role = Role.Button
                        },
            )
        }
        AnimatedVisibility(
            visible = visible,
            enter = slideInVertically { it },
            exit = slideOutVertically { it },
            modifier = Modifier.align(Alignment.BottomCenter),
        ) {
            Column(
                modifier =
                    Modifier
                        .windowInsetsPadding(WindowInsets.ime.exclude(WindowInsets.navigationBars))
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                        .background(Color.Black)
                        .background(PantopusColors.studioBar)
                        .verticalScroll(rememberScrollState())
                        .navigationBarsPadding()
                        .padding(start = Spacing.s4, end = Spacing.s4, top = Spacing.s5, bottom = Spacing.s5)
                        .testTag("moments.studio.play"),
                verticalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                val item = items.firstOrNull { it.id == editing }
                when (item?.kind ?: kind) {
                    MomentPlayKinds.POLL -> PollForm(item, items, onItems, onDone)
                    MomentPlayKinds.COUNTDOWN -> CountdownForm(item, items, onItems, onDone)
                }
            }
        }
    }
}

@Composable
private fun PollForm(
    item: MomentPlayItemDto?,
    items: List<MomentPlayItemDto>,
    onItems: (List<MomentPlayItemDto>) -> Unit,
    onDone: () -> Unit,
) {
    var question by rememberSaveable(item?.id) { mutableStateOf(item?.question.orEmpty()) }
    var options by rememberSaveable(item?.id) { mutableStateOf(item?.options ?: listOf("", "")) }
    Heading("Poll", "Two to four answers")
    Field(question, "Your question", "moments.studio.play.question") { question = it.take(MomentPlayLimits.QUESTION_LETTERS) }
    options.forEachIndexed { at, option ->
        Field(option, "Answer ${at + 1}", "moments.studio.play.option$at") { typed ->
            options = options.mapIndexed { i, o -> if (i == at) typed.take(MomentPlayLimits.OPTION_LETTERS) else o }
        }
    }
    if (options.size < MomentPlayLimits.MOST_OPTIONS) {
        Pill("Add an answer", tag = "moments.studio.play.addOption") { options = options + "" }
    }
    val made = (item ?: newPlayItem(MomentPlayKinds.POLL, items)).copy(question = question, options = options)
    SaveRow(item, made.sentCard() != null, items, made, onItems, onDone)
}

/** How far ahead a countdown may be set, with its words. */
private val COUNTDOWN_CHOICES =
    listOf("1 hour" to Duration.ofHours(1), "3 hours" to Duration.ofHours(3), "1 day" to Duration.ofDays(1), "3 days" to Duration.ofDays(3), "1 week" to Duration.ofDays(7))

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CountdownForm(
    item: MomentPlayItemDto?,
    items: List<MomentPlayItemDto>,
    onItems: (List<MomentPlayItemDto>) -> Unit,
    onDone: () -> Unit,
) {
    var title by rememberSaveable(item?.id) { mutableStateOf(item?.title.orEmpty()) }
    var ahead by rememberSaveable(item?.id) { mutableStateOf<String?>(null) }
    Heading("Countdown", "Up to 30 days ahead")
    Field(title, "What it counts down to", "moments.studio.play.title") { title = it.take(MomentPlayLimits.TITLE_LETTERS) }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.s2), verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        COUNTDOWN_CHOICES.forEach { (words, _) ->
            Pill(words, on = ahead == words, tag = "moments.studio.play.ends.${words.replace(' ', '_')}") { ahead = words }
        }
    }
    val ends =
        COUNTDOWN_CHOICES.firstOrNull { it.first == ahead }?.let { Instant.now().plus(it.second).toString() } ?: item?.endsAt
    val made = (item ?: newPlayItem(MomentPlayKinds.COUNTDOWN, items)).copy(title = title, endsAt = ends)
    SaveRow(item, made.sentCard() != null, items, made, onItems, onDone)
}

@Composable
private fun SaveRow(
    item: MomentPlayItemDto?,
    ready: Boolean,
    items: List<MomentPlayItemDto>,
    made: MomentPlayItemDto,
    onItems: (List<MomentPlayItemDto>) -> Unit,
    onDone: () -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Pill(if (item == null) "Add" else "Done", on = ready, tag = "moments.studio.play.save") {
            if (!ready) return@Pill
            onItems(if (item == null) items + made else items.map { if (it.id == made.id) made else it })
            onDone()
        }
        if (item != null) {
            Pill("Remove", tag = "moments.studio.play.remove") {
                onItems(items.filterNot { it.id == item.id })
                onDone()
            }
        }
    }
    Text("Drag it where it goes; pinch and turn with two fingers.", color = PantopusColors.studioPillSecondary, fontSize = 13.sp)
}

/** A new item of [kind] with an id not taken, a little lower on the picture for each item already there. */
internal fun newPlayItem(
    kind: String,
    items: List<MomentPlayItemDto>,
): MomentPlayItemDto {
    val taken = items.map { it.id }.toSet()
    val id = (1..9).map { "$kind-$it" }.first { it !in taken }
    return MomentPlayItemDto(id = id, kind = kind, x = 0.5, y = 0.35 + 0.15 * (items.size % 3))
}

@Composable
private fun Heading(
    name: String,
    line: String,
) {
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Text(name, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Text(line, color = PantopusColors.studioPillSecondary, fontSize = 13.sp)
    }
}

@Composable
private fun Field(
    value: String,
    placeholder: String,
    tag: String,
    onChange: (String) -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = true,
        textStyle = TextStyle(color = Color.White, fontSize = 15.sp),
        cursorBrush = SolidColor(Color.White),
        modifier = Modifier.fillMaxWidth().testTag(tag).semantics { contentDescription = placeholder },
        decorationBox = { field ->
            Box(
                contentAlignment = Alignment.CenterStart,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(44.dp)
                        .clip(shape)
                        .background(PantopusColors.studioPillFill)
                        .border(1.dp, PantopusColors.studioPillOutline, shape)
                        .padding(horizontal = 12.dp),
            ) {
                if (value.isEmpty()) Text(placeholder, color = PantopusColors.studioPillSecondary, fontSize = 15.sp)
                field()
            }
        },
    )
}

@Composable
private fun Pill(
    words: String,
    on: Boolean = false,
    tag: String,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(19.dp)
    Text(
        text = words,
        color = if (on) PantopusColors.studioBar else Color.White,
        fontSize = 14.5.sp,
        fontWeight = FontWeight.SemiBold,
        modifier =
            Modifier
                .clip(shape)
                .background(if (on) Color.White else PantopusColors.studioPillFill)
                .border(1.dp, PantopusColors.studioPillOutline, shape)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 14.dp, vertical = Spacing.s2)
                .semantics { selected = on }
                .testTag(tag),
    )
}
