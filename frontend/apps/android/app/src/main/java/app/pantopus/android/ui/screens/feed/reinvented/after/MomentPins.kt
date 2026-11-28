@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.reinvented.after

import android.content.Context
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.reinvented.MomentPinDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.displayMessage
import app.pantopus.android.data.pulse.TogetherRepository
import app.pantopus.android.ui.screens.feed.pulseReportReasons
import app.pantopus.android.ui.screens.moments.components.MomentSignal
import app.pantopus.android.ui.screens.moments.components.stampFrame
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import coil.compose.AsyncImage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.roundToInt

/*
 * "Pulse, reinvented" phase 3, pins on the photo (PHASE-3 piece 4, founder's decision 3; CONTRACT 8b; iPhone's
 * `MomentPins.swift` and `MomentPinsOverlay.swift`). Where a Moment's replies show (8a), a reader drops one of the five
 * signals on a spot of the picture; voice bubbles and cutouts others dropped are drawn (a voice plays on a tap; a cutout
 * still being checked reads "Checking…" to its sender). A pin is a reply: it counts in the replies chip, today's screens
 * and older apps see it as a plain reply, and remove and report are the replies' own. One toggle on this phone hides
 * them on every Moment. The viewer holds still while a pin is being dropped or one is open.
 */

/** What holds the viewer still while pins are in hand. */
internal object MomentPinsState {
    /** "Drop a pin" was tapped: the next tap on the picture marks a spot. */
    val dropping = mutableStateOf(false)

    /** The spot marked, waiting for a signal (shares of the picture). */
    val spot = mutableStateOf<Offset?>(null)

    /** The pin whose card is open. */
    val open = mutableStateOf<String?>(null)

    val holds by derivedStateOf { dropping.value || spot.value != null || open.value != null }

    fun reset() {
        dropping.value = false
        spot.value = null
        open.value = null
    }
}

data class MomentPinsUi(
    val momentId: String? = null,
    val pins: List<MomentPinDto> = emptyList(),
    val sending: Boolean = false,
    val note: String? = null,
)

@HiltViewModel
class MomentPinsViewModel
    @Inject
    constructor(
        private val repository: TogetherRepository,
        @ApplicationContext context: Context,
    ) : ViewModel() {
        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        private val _ui = MutableStateFlow(MomentPinsUi())
        val ui: StateFlow<MomentPinsUi> = _ui.asStateFlow()

        /** The one toggle on this phone: pins hidden on every Moment. */
        val hidden = mutableStateOf(prefs.getBoolean(HIDDEN, false))

        fun setHidden(on: Boolean) {
            hidden.value = on
            prefs.edit().putBoolean(HIDDEN, on).apply()
        }

        /** Reads a Moment's pins (again). */
        fun read(momentId: String) {
            if (_ui.value.momentId != momentId) _ui.value = MomentPinsUi(momentId = momentId)
            viewModelScope.launch {
                val answer = repository.pins(momentId)
                if (answer is NetworkResult.Success && _ui.value.momentId == momentId) _ui.update { it.copy(pins = answer.data) }
            }
        }

        /** Drops [signal] on the marked spot. */
        fun drop(signal: MomentSignal) {
            val id = _ui.value.momentId ?: return
            val spot = MomentPinsState.spot.value ?: return
            if (_ui.value.sending) return
            _ui.update { it.copy(sending = true, note = null) }
            viewModelScope.launch {
                when (val answer = repository.dropReaction(id, spot.x.toDouble(), spot.y.toDouble(), signal.wire)) {
                    is NetworkResult.Success -> {
                        _ui.update { it.copy(pins = it.pins + answer.data, sending = false) }
                        MomentPinsState.reset()
                    }
                    is NetworkResult.Failure ->
                        _ui.update { it.copy(sending = false, note = answer.error.displayMessage("Couldn't drop it. Try again.")) }
                }
            }
        }

        fun remove(pin: MomentPinDto) {
            val id = _ui.value.momentId ?: return
            viewModelScope.launch {
                when (val answer = repository.remove(id, pin.id)) {
                    is NetworkResult.Success -> {
                        _ui.update { it.copy(pins = it.pins.filterNot { p -> p.id == pin.id }) }
                        MomentPinsState.open.value = null
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(note = answer.error.displayMessage("Couldn't remove it. Try again.")) }
                }
            }
        }

        fun report(
            pin: MomentPinDto,
            reason: String,
        ) {
            val id = _ui.value.momentId ?: return
            viewModelScope.launch {
                val answer = repository.report(id, pin.id, reason)
                _ui.update {
                    it.copy(
                        note =
                            if (answer is NetworkResult.Failure) {
                                answer.error.displayMessage(
                                    "Couldn't report it. Try again.",
                                )
                            } else {
                                "Reported. Thanks."
                            },
                    )
                }
                if (answer is NetworkResult.Success) MomentPinsState.open.value = null
            }
        }

        fun clearNote() = _ui.update { it.copy(note = null) }

        private companion object {
            const val PREFS = "pantopus.pulseReinvented.pins"
            const val HIDDEN = "hidden"
        }
    }

/**
 * Beside the replies chip: "Drop a pin" where the reader may reply, and, once there are pins, "Hide pins" or
 * "Show pins (N)". Nothing where the Moment's replies don't show.
 */
@Composable
internal fun MomentPinsControls(
    moment: MomentDto,
    shown: Boolean,
    viewModel: MomentPinsViewModel = hiltViewModel(),
) {
    val state = moment.replies ?: return
    if (!shown) return
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val count = if (ui.momentId == moment.id) ui.pins.size else state.pins
    val hidden by viewModel.hidden
    if (state.canReply) {
        PinChip("Drop a pin", PantopusIcon.Pin, "moments.viewer.pins.drop") {
            viewModel.setHidden(false)
            MomentPinsState.open.value = null
            MomentPinsState.spot.value = null
            MomentPinsState.dropping.value = true
        }
    }
    if (count > 0) {
        PinChip(
            if (hidden) "Show pins ($count)" else "Hide pins",
            if (hidden) PantopusIcon.Eye else PantopusIcon.EyeOff,
            "moments.viewer.pins.toggle",
        ) {
            viewModel.setHidden(!hidden)
            MomentPinsState.open.value = null
        }
    }
}

@Composable
private fun PinChip(
    title: String,
    icon: PantopusIcon,
    tag: String,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .padding(start = Spacing.s2)
                .clip(RoundedCornerShape(percent = 50))
                .background(PantopusColors.momentCaptionPill)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 10.dp, vertical = 7.dp)
                .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        PantopusIconImage(icon = icon, contentDescription = null, size = 14.dp, strokeWidth = 2.2f, tint = Color.White)
        Text(title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * The pins over the Moment's picture, in today's viewer while the switch is on (the caller's `studio`); nothing unless
 * the server says the Moment's replies show. Placed as the stamps are (shares of the picture as it fills the screen).
 */
@Composable
fun MomentPinsOverlay(
    moment: MomentDto,
    viewModel: MomentPinsViewModel = hiltViewModel(),
) {
    val state = moment.replies ?: return
    if (!state.shown) return
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    LaunchedEffect(moment.id) { viewModel.read(moment.id) }
    DisposableEffect(moment.id) { onDispose { MomentPinsState.reset() } }
    val hidden by viewModel.hidden
    val dropping by MomentPinsState.dropping
    val spot by MomentPinsState.spot
    val openId by MomentPinsState.open
    val picture = moment.width?.let { w -> moment.height?.let { h -> IntSize(w, h) } }?.takeIf { moment.kind != "text" }
    val pins = if (ui.momentId == moment.id) ui.pins else emptyList()
    BoxWithConstraints(Modifier.fillMaxSize().testTag("moments.viewer.pins")) {
        val box = IntSize(constraints.maxWidth, constraints.maxHeight)
        val frame = stampFrame(picture, box.width.toFloat(), box.height.toFloat())
        PinSurface(dropping || spot != null, openId != null, frame, box)
        if (!hidden) {
            pins.forEach { pin -> PinMark(pin, pointOf(pin.x, pin.y, frame)) { tapPin(pin.id, openId) } }
        }
        if (dropping && spot == null) {
            Hint("Tap a spot on the picture", Modifier.align(Alignment.Center))
        }
        spot?.let { at ->
            val point = pointOf(at.x.toDouble(), at.y.toDouble(), frame)
            SpotMarker(point)
            PinCard(point, box) { DropCard(ui, viewModel) }
        }
        pins.firstOrNull { it.id == openId && !hidden }?.let { pin ->
            PinCard(pointOf(pin.x, pin.y, frame), box) { OpenPinCard(pin, ui.note, viewModel) }
        }
    }
}

/**
 * What takes a tap on the picture while pins are in hand: while dropping, the next tap marks the spot; while a pin's card
 * is open, a tap anywhere else closes it (a moment later, so that tap doesn't turn the page).
 */
@Composable
private fun PinSurface(
    dropping: Boolean,
    cardOpen: Boolean,
    frame: Rect,
    box: IntSize,
) {
    if (dropping) {
        Box(
            Modifier.fillMaxSize().pointerInput(frame) {
                detectTapGestures { at -> shareOf(at, frame, box)?.let { MomentPinsState.spot.value = it } }
            }.testTag("moments.viewer.pins.surface"),
        )
    } else if (cardOpen) {
        Box(Modifier.fillMaxSize().pointerInput(Unit) { detectTapGestures { later { MomentPinsState.open.value = null } } })
    }
}

/** A tap on a pin opens its card, or closes it when it is the one open. */
private fun tapPin(
    id: String,
    openId: String?,
) {
    MomentPinsState.dropping.value = false
    MomentPinsState.spot.value = null
    if (openId == id) later { MomentPinsState.open.value = null } else MomentPinsState.open.value = id
}

/**
 * Lets go of the viewer's hold a moment later: the tap that closes a card or cancels a drop is also seen by the viewer,
 * which turns the page on a tap unless pins are in hand. Run now, that same tap would turn it.
 */
private fun later(block: () -> Unit) {
    Handler(Looper.getMainLooper()).post(block)
}

/** A tap on the screen as shares of the picture; null outside it (or off the screen). */
private fun shareOf(
    at: Offset,
    frame: Rect,
    box: IntSize,
): Offset? {
    val onScreen = at.x in 0f..box.width.toFloat() && at.y in 0f..box.height.toFloat()
    if (!onScreen || frame.width <= 0f || frame.height <= 0f) return null
    val x = (at.x - frame.left) / frame.width
    val y = (at.y - frame.top) / frame.height
    return if (x in 0f..1f && y in 0f..1f) Offset(x, y) else null
}

private fun pointOf(
    x: Double,
    y: Double,
    frame: Rect,
): Offset = Offset(frame.left + x.toFloat() * frame.width, frame.top + y.toFloat() * frame.height)

/** One pin on the picture: the signal (or the emoji), a voice bubble, or the cutout. */
@Composable
private fun PinMark(
    pin: MomentPinDto,
    at: Offset,
    onTap: () -> Unit,
) {
    val size = if (pin.kind == "cutout") 64.dp else 38.dp
    val half = with(LocalDensity.current) { (size / 2).roundToPx() }
    val name = pin.author?.firstName ?: pin.author?.name ?: "Someone"
    Box(
        modifier =
            Modifier
                .offset { IntOffset(at.x.roundToInt() - half, at.y.roundToInt() - half) }
                .size(size)
                .shadow(4.dp, if (pin.kind == "cutout") RoundedCornerShape(10.dp) else CircleShape)
                .clip(if (pin.kind == "cutout") RoundedCornerShape(10.dp) else CircleShape)
                .background(Color.White)
                .clickable(role = Role.Button, onClick = onTap)
                .clearAndSetSemantics { contentDescription = pinWords(pin, name) }
                .testTag("moments.viewer.pin.${pin.id}"),
        contentAlignment = Alignment.Center,
    ) {
        val signal = MomentSignal.of(pin.signal)
        when {
            pin.kind == "cutout" && pin.checking -> Text("Checking…", fontSize = 10.sp, color = PantopusColors.appTextSecondary)
            pin.kind == "cutout" -> AsyncImage(model = pin.imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
            pin.kind == "voice" ->
                PantopusIconImage(
                    icon = PantopusIcon.Mic,
                    contentDescription = null,
                    size = 18.dp,
                    tint = PantopusColors.primary600,
                )
            signal != null ->
                PantopusIconImage(
                    icon = signal.icon,
                    contentDescription = null,
                    size = 18.dp,
                    strokeWidth = 2.2f,
                    tint = PantopusColors.primary600,
                )
            else -> Text(pin.emoji ?: "•", fontSize = 18.sp)
        }
    }
}

private fun pinWords(
    pin: MomentPinDto,
    name: String,
): String {
    val who = if (pin.mine) "Your" else "$name's"
    return when (pin.kind) {
        "voice" -> "$who voice bubble" + (pin.text?.let { ": $it" } ?: "")
        "cutout" -> if (pin.checking) "$who cutout, being checked" else "$who cutout"
        else -> "$who reaction: " + (MomentSignal.of(pin.signal)?.title ?: pin.emoji ?: "")
    }
}

/** Where the next pin goes, while a signal is picked. */
@Composable
private fun SpotMarker(at: Offset) {
    val half = with(LocalDensity.current) { 14.dp.roundToPx() }
    Box(
        Modifier
            .offset { IntOffset(at.x.roundToInt() - half, at.y.roundToInt() - half) }
            .size(28.dp)
            .clip(CircleShape)
            .background(PantopusColors.primary600)
            .padding(3.dp)
            .clip(CircleShape)
            .background(Color.White)
            .testTag("moments.viewer.pins.spot"),
    )
}

@Composable
private fun Hint(
    words: String,
    modifier: Modifier,
) {
    Text(
        words,
        color = Color.White,
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
        modifier =
            modifier.clip(
                RoundedCornerShape(percent = 50),
            ).background(PantopusColors.momentCaptionPill).padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

/**
 * A card beside its pin or spot: above it in the lower half of the screen, below it in the upper half, and always
 * whole inside what shows on the screen (a 9:16 video is wider than the screen, so its picture runs off both sides).
 */
@Composable
private fun PinCard(
    at: Offset,
    box: IntSize,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    var heightPx by remember { mutableIntStateOf(0) }
    val width = CARD_WIDTH
    val (x, y) =
        with(density) {
            val w = width.roundToPx()
            val edge = 16.dp.roundToPx()
            val gap = 26.dp.roundToPx()
            val left = (at.x.roundToInt() - w / 2).coerceIn(edge, (box.width - w - edge).coerceAtLeast(edge))
            val top = if (at.y > box.height / 2f) at.y.roundToInt() - gap - heightPx else at.y.roundToInt() + gap
            left to top.coerceIn(edge, (box.height - heightPx - edge).coerceAtLeast(edge))
        }
    Column(
        modifier =
            Modifier
                .offset { IntOffset(x, y) }
                .width(width)
                .shadow(8.dp, RoundedCornerShape(16.dp))
                .clip(RoundedCornerShape(16.dp))
                .background(PantopusColors.appSurface)
                .padding(Spacing.s3)
                .onSizeChanged { heightPx = it.height }
                .testTag("moments.viewer.pins.card"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) { content() }
}

private val CARD_WIDTH: Dp = 280.dp

/** "Drop a reaction here": the five signals, and Cancel. */
@Composable
private fun DropCard(
    ui: MomentPinsUi,
    viewModel: MomentPinsViewModel,
) {
    Text("Drop a reaction here", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        MomentSignal.entries.forEach { signal ->
            Box(
                modifier =
                    Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(PantopusColors.appBg)
                        .clickable(role = Role.Button, enabled = !ui.sending) { viewModel.drop(signal) }
                        .clearAndSetSemantics { contentDescription = signal.title }
                        .testTag("moments.viewer.pins.signal.${signal.wire}"),
                contentAlignment = Alignment.Center,
            ) {
                PantopusIconImage(
                    icon = signal.icon,
                    contentDescription = null,
                    size = 20.dp,
                    strokeWidth = 2.2f,
                    tint = PantopusColors.primary600,
                )
            }
        }
    }
    ui.note?.let { Text(it, fontSize = 13.sp, color = PantopusColors.appTextSecondary) }
    Text(
        "Cancel",
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = PantopusColors.primary600,
        modifier =
            Modifier.clickable(role = Role.Button) {
                viewModel.clearNote()
                later { MomentPinsState.reset() }
            }.padding(vertical = 4.dp).testTag("moments.viewer.pins.cancel"),
    )
}

/** An open pin: who dropped it, its voice to play, Remove (its writer and the Moment's author), Report (not one's own). */
@Composable
private fun OpenPinCard(
    pin: MomentPinDto,
    note: String?,
    viewModel: MomentPinsViewModel,
) {
    val name = pin.author?.firstName ?: pin.author?.name ?: "Someone"
    Text(
        if (pin.mine) "Your pin" else name,
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
        color = PantopusColors.appText,
        modifier = Modifier.testTag("moments.viewer.pins.card.name"),
    )
    when (pin.kind) {
        "voice" -> VoicePlay(pin)
        "cutout" -> if (pin.checking) Text("Checking…", fontSize = 13.sp, color = PantopusColors.appTextSecondary)
        else -> MomentSignal.of(pin.signal)?.let { Text(it.title, fontSize = 14.sp, color = PantopusColors.appTextSecondary) }
    }
    note?.let { Text(it, fontSize = 13.sp, color = PantopusColors.appTextSecondary) }
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s4)) {
        if (pin.canRemove) CardAction("Remove", "moments.viewer.pins.remove") { viewModel.remove(pin) }
        if (!pin.mine) ReportAction(pin, viewModel)
    }
}

@Composable
private fun CardAction(
    title: String,
    tag: String,
    onClick: () -> Unit,
) {
    Text(
        title,
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = PantopusColors.primary600,
        modifier = Modifier.clickable(role = Role.Button, onClick = onClick).padding(vertical = 4.dp).testTag(tag),
    )
}

@Composable
private fun ReportAction(
    pin: MomentPinDto,
    viewModel: MomentPinsViewModel,
) {
    var menu by remember { mutableStateOf(false) }
    Box {
        CardAction("Report", "moments.viewer.pins.report") { menu = true }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            pulseReportReasons.forEach { (key, label) ->
                DropdownMenuItem(text = { Text(label) }, onClick = {
                    menu = false
                    viewModel.report(pin, key)
                })
            }
        }
    }
}

/** A voice bubble's words and a Play that plays it once. */
@Composable
private fun VoicePlay(pin: MomentPinDto) {
    val player = remember(pin.id) { mutableStateOf<MediaPlayer?>(null) }
    DisposableEffect(pin.id) { onDispose { player.value?.release() } }
    pin.text?.let { Text("“$it”", fontSize = 14.sp, color = PantopusColors.appText) }
    val url = pin.audioUrl ?: return
    CardAction("Play", "moments.viewer.pins.play") {
        player.value?.release()
        player.value =
            runCatching {
                MediaPlayer().apply {
                    setDataSource(url)
                    setOnPreparedListener { it.start() }
                    prepareAsync()
                }
            }.getOrNull()
    }
}
