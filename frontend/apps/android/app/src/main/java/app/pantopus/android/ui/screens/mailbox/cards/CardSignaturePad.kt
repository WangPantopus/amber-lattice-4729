package app.pantopus.android.ui.screens.mailbox.cards

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.pantopus.android.data.api.models.mailbox.CardSignature
import app.pantopus.android.data.api.models.mailbox.HolidayCardsResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.mailbox.HolidayCardsRepository
import app.pantopus.android.ui.screens.mailbox.cards.table.CardSignatureInk
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The dashed line to sign on runs between these, in box units (the box is 400 wide). */
private const val PAD_LINE_FROM = 12f
private const val PAD_LINE_TO = 388f

/** Its dashes and gaps, in box units. */
private val padDash = floatArrayOf(4f, 5f)

/**
 * The account's saved signature on the pad (founder, 2026-11-16): whether Done with "Keep this signature" ticked failed
 * to keep it (this card is still signed), and "Forget my saved signature" as it goes.
 */
data class SignatureKeeping(
    val keepFailed: Boolean = false,
    val forget: Forget = Forget.Idle,
) {
    enum class Forget { Idle, Busy, Done, Failed }
}

/**
 * The account keeps one signature for the next cards (founder, 2026-11-16; `GET /api/mailbox/cards` `signature.saves`
 * and `saved`): the send flow's side of it. [signed] signs the card ([sign]) and, with "Keep this signature" ticked, saves
 * it on the account; [forget] forgets the saved one. The repository puts what's saved into the cards as read.
 */
class SavedSignatureKeeper(
    private val repo: HolidayCardsRepository,
    private val scope: CoroutineScope,
    private val cards: StateFlow<HolidayCardsResponse?>,
    /** A screen opened fresh (nothing saved with it yet): its card starts signed with the saved signature. */
    private var fresh: Boolean,
    private val sign: (CardSignature) -> Unit,
) {
    private val _state = MutableStateFlow(SignatureKeeping())
    val state: StateFlow<SignatureKeeping> = _state.asStateFlow()

    /** The account keeps one signature for the next cards. */
    val saves: Boolean get() = cards.value?.signature?.saves == true

    /** The signature the account keeps, when this app can draw it. */
    val saved: CardSignature? get() = cards.value?.signature?.saved?.takeIf { it.drawable }

    /**
     * The cards were [read] (or are at hand from before): a fresh screen's card, still unsigned ([current] null), takes the
     * saved signature, once. A signature saved on another device comes with the cards read now.
     */
    fun cardsRead(
        read: Boolean,
        current: CardSignature?,
    ) {
        if (!fresh || !read) return
        fresh = false
        if (current == null) saved?.let(sign)
    }

    /** The pad opened: "Forget my saved signature" starts over. */
    fun opened() {
        _state.update { it.copy(forget = SignatureKeeping.Forget.Idle) }
    }

    /** Signed on the pad: the card takes it, and with "Keep this signature" ticked the account keeps it too. */
    fun signed(
        signature: CardSignature,
        keep: Boolean,
    ) {
        sign(signature)
        _state.update { it.copy(keepFailed = false) }
        if (!keep || !saves || signature == saved) return
        scope.launch {
            if (repo.saveSignature(signature) is NetworkResult.Failure) _state.update { it.copy(keepFailed = true) }
        }
    }

    /** Forget the account's saved signature; the card keeps its own. */
    fun forget() {
        if (_state.value.forget == SignatureKeeping.Forget.Busy) return
        _state.update { it.copy(forget = SignatureKeeping.Forget.Busy) }
        scope.launch {
            val forgotten = repo.forgetSignature() is NetworkResult.Success
            _state.update { it.copy(forget = if (forgotten) SignatureKeeping.Forget.Done else SignatureKeeping.Forget.Failed) }
        }
    }
}

/**
 * The account keeps one signature for the next cards (founder, 2026-11-16): the saved one ([saved], null when none), the
 * pad's state for it, and what Done ([onSigned], with "Keep this signature" ticked or not), "Forget my saved signature"
 * and opening the pad do.
 */
internal data class CardSignKeeping(
    val saved: CardSignature?,
    val state: SignatureKeeping,
    val onSigned: (CardSignature, Boolean) -> Unit,
    val onForget: () -> Unit,
    val onOpened: () -> Unit,
)

/**
 * Sign your name (plan 8.2): a strip of the card's paper, four times as wide as it is tall, to sign with a finger or a
 * pen. Done keeps it (not until there's ink); Use my typed name puts the typed first name back; Close, a tap above the
 * sheet or Back leave it as it was. What's drawn stays on the phone until the card is sent.
 *
 * With [keeping]: "Keep this signature for my next cards", ticked, under the paper, so Done also saves it for the next
 * card on any app; and, while one is saved, "Forget my saved signature".
 */
@Composable
internal fun CardSignaturePad(
    initial: CardSignature?,
    /** The signature, and whether "Keep this signature" was ticked (always false without [keeping]). */
    onDone: (CardSignature, Boolean) -> Unit,
    onTyped: () -> Unit,
    onClose: () -> Unit,
    keeping: CardSignKeeping? = null,
) {
    var keep by remember { mutableStateOf(true) }
    val forget = keeping?.state?.forget
    LaunchedEffect(forget) { if (forget == SignatureKeeping.Forget.Done) keep = false }
    val strokes =
        remember {
            mutableStateListOf<List<Float>>().apply {
                initial?.strokes?.forEach { stroke -> add(stroke.map(Int::toFloat)) }
            }
        }
    val live = remember { mutableStateListOf<Float>() }
    var tooLong by remember { mutableStateOf(false) }
    val hasInk = strokes.isNotEmpty() || live.isNotEmpty()
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        // The pad is paper, also over the card's cloth: its words and buttons take the paper's ink.
        CompositionLocalProvider(LocalOnCloth provides false) {
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
                contentAlignment = Alignment.BottomCenter,
            ) {
                Column(
                    modifier =
                        Modifier
                            .widthIn(max = 560.dp)
                            .fillMaxWidth()
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                            .background(PantopusColors.cardNotePaper, RoundedCornerShape(topStart = Radii.lg, topEnd = Radii.lg))
                            .navigationBarsPadding()
                            .padding(Spacing.s4)
                            .testTag("cardSignPad"),
                ) {
                    PadHeading(onClose)
                    PadStrip(strokes, live, hasInk, onInk = { tooLong = false })
                    if (tooLong) {
                        Text(
                            "Sign a little more simply, or leave your name typed.",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = PantopusColors.cardTextProblem,
                            modifier = Modifier.padding(top = Spacing.s2).semantics { liveRegion = LiveRegionMode.Assertive },
                        )
                    }
                    if (keeping != null) {
                        KeepRow(keep = keep, onKeep = { keep = it }, keeping = keeping)
                    }
                    PadButtons(
                        hasInk = hasInk,
                        signedBefore = initial != null,
                        onClear = {
                            strokes.clear()
                            live.clear()
                            tooLong = false
                        },
                        onDone = {
                            when (val fit = CardSignatureInk.fit(strokes.toList())) {
                                is CardSignatureInk.Fit.Signed -> onDone(fit.signature, keeping != null && keep)
                                CardSignatureInk.Fit.TooLong -> tooLong = true
                                CardSignatureInk.Fit.Empty -> Unit
                            }
                        },
                        onTyped = onTyped,
                    )
                }
            }
        }
    }
}

@Composable
private fun PadHeading(onClose: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            "Sign your name",
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.cardTextStrong,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        CardButton(
            "Close",
            onClick = onClose,
            kind = CardButtonKind.Words,
            fill = false,
            modifier = Modifier.testTag("cardSignClose"),
        )
    }
    Text(
        "Sign with your finger or a pen. It goes beside FROM, in the card’s ink.",
        fontSize = 14.sp,
        lineHeight = 20.sp,
        color = PantopusColors.cardTextQuiet,
        modifier = Modifier.padding(top = Spacing.s1),
    )
}

/** The paper strip: the line to sign on, the strokes kept, and the one being drawn ([live]). */
@Composable
private fun PadStrip(
    strokes: SnapshotStateList<List<Float>>,
    live: SnapshotStateList<Float>,
    hasInk: Boolean,
    onInk: () -> Unit,
) {
    Canvas(
        modifier =
            Modifier
                .padding(top = Spacing.s3)
                .fillMaxWidth()
                .aspectRatio(CardSignature.WIDTH.toFloat() / CardSignature.HEIGHT)
                .background(PantopusColors.cardPaper, RoundedCornerShape(Radii.xs))
                .border(1.dp, PantopusColors.cardNoteEdge, RoundedCornerShape(Radii.xs))
                .semantics { contentDescription = if (hasInk) "Your signature" else "Space to sign your name" }
                .testTag("cardSignArea")
                .pointerInput(Unit) { sign(live, onInk) { strokes.add(it) } },
    ) {
        val unit = size.width / CardSignature.WIDTH
        val line = CardSignatureInk.LINE * unit
        drawLine(
            PantopusColors.cardRule,
            start = Offset(PAD_LINE_FROM * unit, line),
            end = Offset(PAD_LINE_TO * unit, line),
            strokeWidth = 1.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(padDash.map { it * unit }.toFloatArray()),
        )
        val drawn = if (live.isEmpty()) strokes.toList() else strokes.toList() + listOf(live.toList())
        val path = CardSignatureInk.path(drawn).asComposePath()
        scale(unit, pivot = Offset.Zero) {
            drawPath(
                path,
                color = PantopusColors.tablePen,
                style = Stroke(width = CardSignatureInk.STROKE, cap = StrokeCap.Round, join = StrokeJoin.Round),
            )
        }
    }
}

/**
 * Each finger down to up is one stroke ([onStroke]), in box units ([box] wide and high: the signature's 400 × 100 here,
 * 0 to 1 on a Moment's photo), every point the phone saw (its history too, for smooth ink); [live] holds the stroke
 * being drawn.
 */
@OptIn(ExperimentalComposeUiApi::class)
internal suspend fun PointerInputScope.sign(
    live: SnapshotStateList<Float>,
    onInk: () -> Unit,
    box: Size = Size(CardSignature.WIDTH.toFloat(), CardSignature.HEIGHT.toFloat()),
    onStroke: (List<Float>) -> Unit,
) {
    fun add(at: Offset) {
        live += (at.x / size.width * box.width).coerceIn(0f, box.width)
        live += (at.y / size.height * box.height).coerceIn(0f, box.height)
    }
    awaitEachGesture {
        val down = awaitFirstDown()
        down.consume()
        onInk()
        live.clear()
        add(down.position)
        do {
            val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id }
            change?.historical?.forEach { add(it.position) }
            change?.let {
                add(it.position)
                it.consume()
            }
        } while (change?.pressed == true)
        onStroke(live.toList())
        live.clear()
    }
}

/** "Keep this signature for my next cards" and, while one is saved, "Forget my saved signature". */
@Composable
private fun KeepRow(
    keep: Boolean,
    onKeep: (Boolean) -> Unit,
    keeping: CardSignKeeping,
) {
    val label = "Keep this signature for my next cards"
    Row(
        modifier =
            Modifier
                .padding(top = Spacing.s2)
                .heightIn(min = 48.dp)
                .clickable { onKeep(!keep) }
                .semantics(mergeDescendants = true) {
                    role = Role.Checkbox
                    contentDescription = label
                    stateDescription = if (keep) "Checked" else "Not checked"
                }.testTag("cardSignKeep"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Box(
            modifier =
                Modifier
                    .size(20.dp)
                    .clip(RoundedCornerShape(Radii.xs))
                    .background(if (keep) PantopusColors.cardWax else PantopusColors.cardPaper)
                    .border(
                        1.5.dp,
                        if (keep) PantopusColors.cardWax else PantopusColors.cardNoteEdge,
                        RoundedCornerShape(Radii.xs),
                    ),
            contentAlignment = Alignment.Center,
        ) {
            if (keep) {
                PantopusIconImage(
                    icon = PantopusIcon.Check,
                    contentDescription = null,
                    size = 13.dp,
                    tint = PantopusColors.cardWaxText,
                )
            }
        }
        Text(label, fontSize = 14.sp, color = PantopusColors.cardTextStrong)
    }
    when {
        keeping.state.forget == SignatureKeeping.Forget.Done ->
            Text(
                "Saved signature forgotten.",
                fontSize = 13.sp,
                color = PantopusColors.cardTextQuiet,
                modifier =
                    Modifier
                        .heightIn(min = 48.dp)
                        .wrapContentHeight(Alignment.CenterVertically)
                        .semantics { liveRegion = LiveRegionMode.Polite }
                        .testTag("cardSignForgotten"),
            )
        keeping.saved != null ->
            CardButton(
                "Forget my saved signature",
                onClick = keeping.onForget,
                kind = CardButtonKind.Words,
                fill = false,
                enabled = keeping.state.forget != SignatureKeeping.Forget.Busy,
                modifier = Modifier.testTag("cardSignForget"),
            )
    }
    if (keeping.state.forget == SignatureKeeping.Forget.Failed) {
        Text(
            "Couldn’t forget it just now. Try again in a moment.",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = PantopusColors.cardTextProblem,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }.testTag("cardSignForgetFailed"),
        )
    }
}

@Composable
private fun PadButtons(
    hasInk: Boolean,
    signedBefore: Boolean,
    onClear: () -> Unit,
    onDone: () -> Unit,
    onTyped: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = Spacing.s3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        CardButton(
            "Clear",
            onClick = onClear,
            kind = CardButtonKind.Paper,
            fill = false,
            enabled = hasInk,
            modifier = Modifier.testTag("cardSignClear"),
        )
        Spacer(Modifier.weight(1f))
        CardButton("Done", onClick = onDone, fill = false, enabled = hasInk, modifier = Modifier.testTag("cardSignDone"))
    }
    if (signedBefore) {
        CardButton(
            "Use my typed name",
            onClick = onTyped,
            kind = CardButtonKind.Words,
            fill = false,
            modifier = Modifier.padding(top = Spacing.s1).testTag("cardSignTyped"),
        )
    }
}
