@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.studio

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.MomentEditBody
import app.pantopus.android.data.api.models.moments.MomentStampKinds
import app.pantopus.android.data.api.models.moments.MomentStampValueDto
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.moments.serverCode
import app.pantopus.android.data.pulse.StudioRepository
import app.pantopus.android.ui.screens.moments.components.MomentImages
import app.pantopus.android.ui.screens.moments.components.rememberMomentImage
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import coil.compose.AsyncImage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

/*
 * "Pulse, reinvented": the 15-minute edit (CONTRACT 3; LEAD-2's words of 2026-11-27 01:12), as on iPhone
 * (`MomentsStudioEdit.swift`). "Edit" in Moment options on one's own photo or video Moment, while the switch is on and
 * `editable_until` holds, opens the Studio on it: the picture as posted (it can't change, so no Text, Draw or Resize),
 * its stamps to move, size, turn, add or take off, the caption, and Nearby or Friends. "Save" sends only what changed.
 * Nobody is told, and nothing marks it as edited for others.
 */

/**
 * A screen drawn over the viewer takes every touch itself, so none falls through to the viewer under it (which would
 * turn to the next Moment or close).
 */
fun Modifier.takesEveryTouch(): Modifier = pointerInput(Unit) { detectTapGestures { } }

/** Edit is offered on one's own photo or video Moment while its window holds (the server sends it only then). */
fun MomentDto.editableNow(now: Instant = Instant.now()): Boolean =
    kind != "text" && editableUntil?.let { runCatching { Instant.parse(it) }.getOrNull() }?.isAfter(now) == true

/** What a save came to. */
sealed interface EditOutcome {
    data class Saved(
        val moment: MomentDto,
    ) : EditOutcome

    /** Refused for a reason the person can fix: a line over the bar, and the edit stays open. */
    data class Stays(
        val line: String,
    ) : EditOutcome

    /** The edit can't go on (the window closed, the Moment ended, the switch is off): these words, then it closes. */
    data class Closed(
        val words: String,
    ) : EditOutcome
}

@HiltViewModel
class MomentsStudioEditViewModel
    @Inject
    constructor(
        private val studio: StudioRepository,
    ) : ViewModel() {
        /** Sends what changed and says how it went. */
        fun save(
            momentId: String,
            body: MomentEditBody,
            onDone: (EditOutcome) -> Unit,
        ) {
            viewModelScope.launch {
                onDone(
                    when (val result = studio.edit(momentId, body)) {
                        is NetworkResult.Success -> EditOutcome.Saved(result.data)
                        is NetworkResult.Failure -> result.error.outcome()
                    },
                )
            }
        }
    }

private fun NetworkError.outcome(): EditOutcome =
    when {
        code == 409 || serverCode == "MOMENT_EDIT_CLOSED" -> EditOutcome.Closed("The 15 minutes are up. Your Moment stays as it was.")
        code == 410 || serverCode == "MOMENT_ENDED" -> EditOutcome.Closed("This Moment has ended.")
        serverCode == StudioRepository.SWITCH_OFF -> EditOutcome.Closed("This isn't on for you right now.")
        code == 404 -> EditOutcome.Closed("This Moment isn't there any more.")
        else -> EditOutcome.Stays(message.takeIf { it.isNotBlank() } ?: "Couldn't save that. Try again.")
    }

/** The edit's own choices, from the Moment as posted. */
private class EditDraft(
    moment: MomentDto,
) {
    val firstCaption = moment.caption.orEmpty().trim()
    val firstStamps = moment.stamps.orEmpty().mapNotNull { it.placement }
    var caption by mutableStateOf(moment.caption.orEmpty())
    var stamps by mutableStateOf(firstStamps)

    // Mentions (CONTRACT 7h): who the caption names now; none under a made-up name.
    private val madeUp = moment.author.madeUpName
    private val firstMentions = moment.mentions.orEmpty().mapNotNull { m -> m.name?.let { StudioMention(m.id, it) } }
    var mentions by mutableStateOf(firstMentions)

    /** The ids whose "@Name" is still in the caption. */
    private fun named(): List<String> =
        if (madeUp) emptyList() else mentions.filter { mentionPlaces(caption, it.name).isNotEmpty() }.map { it.id }.distinct().take(5)

    var audience by mutableStateOf(moment.audience)
    var picked by mutableStateOf<String?>(null)
    var tray by mutableStateOf(false)
    var saving by mutableStateOf(false)
    var asksDiscard by mutableStateOf(false)
    var line by mutableStateOf<String?>(null)
    var closing by mutableStateOf<String?>(null)

    private val firstAudience = moment.audience

    val changed: Boolean
        get() = caption.trim() != firstCaption || stamps != firstStamps || audience != firstAudience || mentionsChanged

    private val firstNamed: List<String> = firstMentions.map { it.id }

    private val mentionsChanged: Boolean get() = named() != firstNamed

    /** Only what changed: the caption ("" clears it), the whole stamps list, who sees it. */
    fun body(): MomentEditBody =
        MomentEditBody(
            caption = caption.trim().takeIf { it != firstCaption },
            stamps = stamps.takeIf { it != firstStamps },
            audience = audience.takeIf { it != firstAudience },
            mentions = named().takeIf { mentionsChanged },
        )
}

/**
 * The edit over the viewer. [onSaved] gets the Moment as the server now has it; [onClose] closes without a change (or
 * after the words of a refusal that ends the edit).
 */
@Composable
fun MomentsStudioEdit(
    moment: MomentDto,
    onSaved: (MomentDto) -> Unit,
    onClose: () -> Unit,
    edit: MomentsStudioEditViewModel = hiltViewModel(),
) {
    val draft = remember(moment.id) { EditDraft(moment) }
    val values = remember(moment.id) { moment.editValues() }
    val picture = moment.width?.let { w -> moment.height?.let { h -> IntSize(w, h) } }
    val screen = rememberScreenSize()
    val wet =
        remember(moment.id) {
            moment.takenHere && moment.liveUntil?.let { runCatching { Instant.parse(it) }.getOrNull() }?.isAfter(Instant.now()) == true
        }
    val close = { if (draft.changed) draft.asksDiscard = true else onClose() }
    BackHandler(enabled = !draft.tray) { close() }
    Box(modifier = Modifier.fillMaxSize().background(Color.Black).takesEveryTouch().testTag("moments.studio.edit")) {
        AsyncImage(
            model = rememberMomentImage(moment.mediaUrl ?: moment.posterUrl, MomentImages.mediaKey(moment.id)),
            contentDescription = "Your Moment",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        StampsOnPicture(
            shown = draft.stamps.filter { it.kind in values },
            all = draft.stamps,
            values = values,
            picture = picture,
            wet = wet,
            enabled = !draft.saving,
            picked = draft.picked,
            onPick = { draft.picked = it },
            onStamps = { draft.stamps = it },
        )
        EditFades()
        EditClose(onClick = close, modifier = Modifier.statusBarsPadding().padding(start = Spacing.s4, top = 11.dp))
        // The one tool an edit has: the picture can't change, so no Text, Draw or Resize.
        if (values.isNotEmpty()) {
            EditRail(
                enabled = !draft.saving,
                onOpen = { draft.tray = true },
                modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(end = Spacing.s4, top = 11.dp),
            )
        }
        EditBottom(moment = moment, draft = draft, modifier = Modifier.align(Alignment.BottomCenter)) {
            draft.saving = true
            draft.line = null
            edit.save(moment.id, draft.body()) { outcome ->
                draft.saving = false
                when (outcome) {
                    is EditOutcome.Saved -> onSaved(outcome.moment)
                    is EditOutcome.Stays -> draft.line = outcome.line
                    is EditOutcome.Closed -> draft.closing = outcome.words
                }
            }
        }
        StampTray(
            visible = draft.tray,
            reading = StampReading.Read,
            offered = values,
            placed = draft.stamps,
            onRetry = {},
            onDone = { draft.tray = false },
        ) { kind, placed ->
            if (placed) {
                draft.stamps = draft.stamps.filterNot { it.kind == kind }
                if (draft.picked == kind) draft.picked = null
            } else {
                draft.stamps = draft.stamps + firstSpot(kind, draft.stamps, picture, screen)
                draft.picked = kind
                draft.tray = false
            }
        }
    }
    EditDialogs(draft = draft, onClose = onClose)
}

/**
 * The value each stamp shows in an edit: the ones the server kept for an edit (`stamp_choices`), and those already
 * placed, in the tray's order.
 */
private fun MomentDto.editValues(): Map<String, MomentStampValueDto> {
    val kept = stampChoices.orEmpty().mapNotNull { (kind, value) -> value?.let { kind to it } }.toMap()
    val placed = stamps.orEmpty().mapNotNull { stamp -> stamp.placement?.kind?.let { kind -> stamp.value?.let { kind to it } } }.toMap()
    val all = kept + placed
    return MomentStampKinds.ALL.mapNotNull { kind -> all[kind]?.let { kind to it } }.toMap()
}

@Composable
private fun EditFades() {
    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .background(Brush.verticalGradient(listOf(PantopusColors.momentTopFade, Color.Transparent)))
                    .clearAndSetSemantics {},
        )
        Box(
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(320.dp)
                    .background(Brush.verticalGradient(listOf(Color.Transparent, PantopusColors.momentDim)))
                    .clearAndSetSemantics {},
        )
    }
}

/** The rail with Stamps and Play alone. */
@Composable
private fun EditRail(
    enabled: Boolean,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        RailTool(label = "Stamps and Play", spoken = "Stamps and Play", enabled = enabled, tag = "stamps", onClick = onOpen) {
            PantopusIconImage(icon = PantopusIcon.Stamp, contentDescription = null, size = 20.dp, strokeWidth = 2.2f, tint = Color.White)
        }
    }
}

/** The X at the top left: closes the edit (asking first when something changed). */
@Composable
private fun EditClose(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(PantopusColors.momentCameraChip)
                .clickable(role = Role.Button, onClick = onClick)
                .testTag("moments.studio.close")
                .clearAndSetSemantics {
                    contentDescription = "Close"
                    role = Role.Button
                },
        contentAlignment = Alignment.Center,
    ) {
        PantopusIconImage(icon = PantopusIcon.X, contentDescription = null, size = 22.dp, strokeWidth = 2.2f, tint = Color.White)
    }
}

/**
 * The bottom of the edit: why a save was refused, the caption, how long it can still change, then the bar with who
 * sees it, the pill (time left and the place as posted; it opens nothing in an edit) and Save.
 */
@Composable
private fun EditBottom(
    moment: MomentDto,
    draft: EditDraft,
    modifier: Modifier = Modifier,
    onSave: () -> Unit,
) {
    val now by produceState(Instant.now()) {
        while (true) {
            delay(15_000)
            value = Instant.now()
        }
    }
    Column(modifier = modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.ime.exclude(WindowInsets.navigationBars))) {
        draft.line?.let { line ->
            Text(
                text = line,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier =
                    Modifier
                        .padding(horizontal = Spacing.s4)
                        .clip(RoundedCornerShape(12.dp))
                        .background(PantopusColors.momentCaptionPill)
                        .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                        .testTag("moments.studio.error"),
            )
            Spacer(Modifier.height(Spacing.s3))
        }
        // After "@" at the end of the caption: the author's connections (none under a made-up name).
        StudioMentionRow(
            caption = draft.caption,
            madeUp = moment.author.madeUpName,
            onPick = { person ->
                draft.caption = captionWithMention(draft.caption, person).take(100)
                draft.mentions = (draft.mentions + person).distinctBy { it.id }
            },
            modifier = Modifier.padding(start = Spacing.s4, end = Spacing.s4, bottom = Spacing.s2),
        )
        StudioCaption(
            caption = draft.caption,
            enabled = !draft.saving,
            onCaption = { draft.caption = it.take(100) },
            modifier = Modifier.padding(horizontal = Spacing.s4),
        )
        Spacer(Modifier.height(Spacing.s3))
        Text(
            text = windowLine(moment, now),
            color = PantopusColors.studioPillSecondary,
            fontSize = 13.sp,
            modifier = Modifier.padding(horizontal = Spacing.s4).testTag("moments.studio.window"),
        )
        Spacer(Modifier.height(Spacing.s3))
        EditBar(moment = moment, draft = draft, now = now, onSave = onSave)
    }
}

/** "You can change this for 12 more minutes" (LEAD-2's words). */
private fun windowLine(
    moment: MomentDto,
    now: Instant,
): String {
    val until = moment.editableUntil?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return ""
    val seconds = until.epochSecond - now.epochSecond
    if (seconds < 60) return "Less than a minute left to change this"
    val minutes = seconds / 60
    return if (minutes == 1L) "You can change this for 1 more minute" else "You can change this for $minutes more minutes"
}

@Composable
private fun EditBar(
    moment: MomentDto,
    draft: EditDraft,
    now: Instant,
    onSave: () -> Unit,
) {
    // A Moment with no location goes only to connections; one under a made-up name only to people nearby.
    val audiences =
        when {
            moment.noLocation -> listOf("connections" to "Friends")
            moment.author.madeUpName -> listOf("nearby" to "Nearby")
            else -> listOf("nearby" to "Nearby", "connections" to "Friends")
        }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(PantopusColors.studioBar)
                .navigationBarsPadding()
                .padding(start = Spacing.s4, end = Spacing.s4, top = Spacing.s4, bottom = Spacing.s3)
                .testTag("moments.studio.bar"),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            audiences.forEach { (key, text) ->
                StudioChip(
                    text = text,
                    on = draft.audience == key,
                    usable = !draft.saving,
                    tag = if (key == "connections") "friends" else key,
                    onClick = { draft.audience = key },
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            EditPill(moment = moment, now = now, modifier = Modifier.weight(1f))
            EditSave(enabled = draft.changed && !draft.saving, saving = draft.saving, onClick = onSave)
        }
    }
}

/** The time left and the place as posted ("Fades in 23 hours" over "Lacamas Lake"). */
@Composable
private fun EditPill(
    moment: MomentDto,
    now: Instant,
    modifier: Modifier = Modifier,
) {
    val end = moment.expiresAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
    val minutes = end?.let { ((it.epochSecond - now.epochSecond) / 60).coerceAtLeast(0) } ?: 0
    val first =
        when {
            end == null -> "Shows for ${moment.hours} hours"
            minutes < 60 -> if (minutes == 1L) "Fades in 1 minute" else "Fades in $minutes minutes"
            else -> ((minutes + 30) / 60).let { if (it == 1L) "Fades in 1 hour" else "Fades in $it hours" }
        }
    val second = if (moment.noLocation) "No location" else moment.placeLabel.orEmpty()
    Row(
        modifier =
            modifier
                .height(56.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(PantopusColors.studioPillFill)
                .border(1.dp, PantopusColors.studioPillOutline, RoundedCornerShape(18.dp))
                .padding(horizontal = 14.dp)
                .testTag("moments.studio.pill")
                .clearAndSetSemantics { contentDescription = "$first, $second" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PantopusIconImage(icon = PantopusIcon.Clock, contentDescription = null, size = 22.dp, strokeWidth = 2.2f, tint = Color.White)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = first,
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = second,
                color = PantopusColors.studioPillSecondary,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun EditSave(
    enabled: Boolean,
    saving: Boolean,
    onClick: () -> Unit,
) {
    val label = if (saving) "Saving…" else "Save"
    Box(
        modifier =
            Modifier
                .height(56.dp)
                .alpha(if (enabled || saving) 1f else 0.5f)
                .clip(RoundedCornerShape(28.dp))
                .background(PantopusColors.primary600)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = 26.dp)
                .testTag("moments.studio.save")
                .clearAndSetSemantics {
                    contentDescription = label
                    role = Role.Button
                },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = label, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** "Discard your changes?" when the X would lose something, and the words of a refusal that ends the edit. */
@Composable
private fun EditDialogs(
    draft: EditDraft,
    onClose: () -> Unit,
) {
    if (draft.asksDiscard) {
        AlertDialog(
            onDismissRequest = { draft.asksDiscard = false },
            title = { Text("Discard your changes?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        draft.asksDiscard = false
                        onClose()
                    },
                    modifier = Modifier.testTag("moments.studio.discard"),
                ) { Text("Discard", color = PantopusColors.error) }
            },
            dismissButton = {
                TextButton(onClick = { draft.asksDiscard = false }, modifier = Modifier.testTag("moments.studio.keep")) {
                    Text("Keep editing")
                }
            },
        )
    }
    draft.closing?.let { words ->
        AlertDialog(
            onDismissRequest = onClose,
            text = { Text(words) },
            confirmButton = { TextButton(onClick = onClose, modifier = Modifier.testTag("moments.studio.closed")) { Text("OK") } },
        )
    }
}
