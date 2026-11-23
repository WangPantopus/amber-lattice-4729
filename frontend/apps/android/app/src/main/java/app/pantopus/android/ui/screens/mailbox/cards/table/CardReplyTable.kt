@file:Suppress("PackageNaming", "MagicNumber", "LongParameterList", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.mailbox.cards.table

import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RectF
import android.view.HapticFeedbackConstants
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import app.pantopus.android.data.api.models.mailbox.CardExchange
import app.pantopus.android.data.api.models.mailbox.CardSignature
import app.pantopus.android.ui.components.toastDurationMillis
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.rememberReduceMotion
import kotlinx.coroutines.delay
import java.time.Year
import kotlin.math.min

/** The joined card (plan Part 3): the card that was sent, and the reply written back on it. */
internal data class JoinedCard(
    /** The card it answers, drawn picture side up. */
    val card: CardOnTable,
    /** The reply's note, in the pen on its cream sheet. */
    val replyNote: String,
    /** Who wrote back, the first name beside FROM; [replySignature] in their own hand when they keep one. */
    val replyFrom: String,
    val replySignature: CardSignature?,
    /** The page's title for TalkBack (no words are drawn at the top): "Maya wrote back." or "You wrote back to Juniper." */
    val words: String,
    /** The day the reply was sent ("YYYY-MM-DD"), for "Read it in print". */
    val replySentOn: String? = null,
)

/** The joined card from the server's read; [viewerWrote]: the words speak to the one who wrote back. Null without both. */
internal fun CardExchange.joined(viewerWrote: Boolean): JoinedCard? {
    val sent = original ?: return null
    val back = reply ?: return null
    val face = sent.card ?: return null
    val card =
        CardOnTable(
            id = sent.id,
            design = face.design,
            number = face.number,
            slug = face.slug,
            table = face.table,
            caption = face.caption.orEmpty(),
            paper = face.paper,
            year = face.year ?: Year.now().value,
            mailedOn = sent.sentOn,
            note = sent.note.orEmpty(),
            from = sent.fromName.orEmpty(),
            to = sent.toName,
            sealed = false,
            opensIn = null,
            daysUntilOpen = null,
            verse = face.verse,
            signature = face.signature?.takeIf { it.drawable },
            mood = face.mood,
        )
    val writer = back.fromName.orEmpty().trim().substringBefore(' ').ifEmpty { "Someone" }
    val words = if (viewerWrote) "You wrote back to ${card.fromFirst}." else "$writer wrote back."
    return JoinedCard(card, back.note.orEmpty(), writer, back.cardReply?.signature?.takeIf { it.drawable }, words, back.sentOn)
}

/**
 * The joined card on the table (plan Part 3): no envelope. The card that was sent lies picture side up, and the reply
 * sheet lands on its lower part with the set-down sound and one tap you can feel, turned 2°. Tapping the card brings it
 * to the front; tapping the sheet brings it back. Both are drawn at about two thirds of the table's card, inside the
 * card's own room, so the table's words and buttons stay clear. ✕ or Back leave; ⋯ holds Report and Block.
 */
@Composable
internal fun CardReplyTable(
    joined: JoinedCard,
    onClose: () -> Unit,
    menu: List<CardTableMenuItem> = emptyList(),
    /** Quiet buttons at the foot: "Take it back" on the writer's own waiting reply. */
    actions: List<CardTableSendBack> = emptyList(),
    /** What ✕ says, where it goes: "Back to the Mailbox", "Back to Sent", or "Close" back to the page under it. */
    closeLabel: String = BACK_TO_THE_MAILBOX,
    /** A word from the page under it (an action's result, "Filed in Medical."), shown as the table's toast. */
    message: String? = null,
) {
    FullScreenWindow(onDismissRequest = onClose) { JoinedCardView(joined, onClose, menu, actions, closeLabel, message) }
}

/** [CardReplyTable]'s table, also laid over a card's own table ("You wrote back · {day}"). */
@Composable
internal fun JoinedCardView(
    joined: JoinedCard,
    onClose: () -> Unit,
    menu: List<CardTableMenuItem> = emptyList(),
    actions: List<CardTableSendBack> = emptyList(),
    closeLabel: String = BACK_TO_THE_MAILBOX,
    message: String? = null,
) {
    BackHandler(onBack = onClose)
    var menuOpen by remember { mutableStateOf(false) }
    BackHandler(enabled = menuOpen) { menuOpen = false }
    // "Read it in print" on a reply too (plan Part 2): the reply's words on the same bookmark.
    var printOpen by rememberSaveable { mutableStateOf(false) }
    BackHandler(enabled = printOpen) { printOpen = false }
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(PantopusColors.tableNight)
                .semantics { paneTitle = joined.words }
                .testTag("cardReplyTable"),
    ) {
        ReplyCloth(joined.card.table)
        val sounds = rememberCardSounds()
        JoinedPair(joined, sounds::play)
        Row(modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(start = 8.dp, end = 8.dp, top = 6.dp)) {
            RoundButton(PantopusIcon.X, closeLabel, "cardReplyTableClose", enabled = true, onClick = onClose)
            Spacer(Modifier.weight(1f))
            if (menu.isNotEmpty()) {
                RoundButton(PantopusIcon.MoreHorizontal, "More", "cardReplyTableMore", enabled = true) { menuOpen = !menuOpen }
            }
        }
        Column(
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (joined.replyNote.isNotBlank()) {
                Text(
                    READ_IT_IN_PRINT,
                    style = tableVerseLinkStyle,
                    modifier =
                        Modifier
                            .heightIn(min = 48.dp)
                            .clickable(role = Role.Button) { printOpen = true }
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                            .testTag("cardReplyReadInPrint"),
                )
            }
            actions.forEach { action ->
                Text(
                    action.title,
                    style = tableQuietStyle,
                    modifier =
                        Modifier
                            .heightIn(min = 48.dp)
                            .clickable(role = Role.Button, onClick = action.onClick)
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                            .testTag("cardReplyTableAction"),
                )
            }
        }
        if (menuOpen && menu.isNotEmpty()) ReplyMenu(menu, onPicked = { menuOpen = false })
        JoinedToast(message)
        if (printOpen) {
            val reply = joined.card.copy(from = joined.replyFrom, note = joined.replyNote, mailedOn = joined.replySentOn)
            NoteBookmark(reply, bottom = 0.dp, onClose = { printOpen = false })
        }
    }
}

private const val BACK_TO_THE_MAILBOX = "Back to the Mailbox"

/** A word from the page under the joined card, as the table's toast: it fades after a moment and a screen reader reads it. */
@Composable
private fun JoinedToast(message: String?) {
    var words by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(message) {
        if (message != null) {
            words = message
            delay(toastDurationMillis(message, minimumMillis = 2_600))
            words = null
        }
    }
    val shown = words ?: return
    Box(modifier = Modifier.fillMaxSize().statusBarsPadding(), contentAlignment = Alignment.TopCenter) {
        Text(
            shown,
            fontSize = 13.5.sp,
            lineHeight = 1.35.em,
            color = PantopusColors.tableCream,
            textAlign = TextAlign.Center,
            modifier =
                Modifier
                    .padding(start = 28.dp, end = 28.dp, top = 62.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(PantopusColors.tableToast)
                    .padding(horizontal = 15.dp, vertical = 9.dp)
                    .semantics { liveRegion = LiveRegionMode.Polite }
                    .testTag("cardReplyTableToast"),
        )
    }
}

/** The table's sounds for a page of its own (the joined card, the reply's sheet), let go when it leaves. */
@Composable
internal fun rememberCardSounds(): CardSounds {
    val context = LocalContext.current
    val sounds = remember { CardSounds(context) }
    DisposableEffect(sounds) { onDispose { sounds.release() } }
    return sounds
}

/** The card's own cloth under the window's light, as at the table. */
@Composable
internal fun ReplyCloth(table: String?) {
    val art = rememberCardTableArt()
    val tint = remember(table) { clothTint(table) }
    val paint =
        remember(tint) {
            Paint(Paint.FILTER_BITMAP_FLAG).apply { colorFilter = PorterDuffColorFilter(tint.toArgb(), PorterDuff.Mode.MULTIPLY) }
        }
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(tint)
                .drawBehind {
                    val sheet = art?.cloth ?: return@drawBehind
                    drawIntoCanvas { drawCover(it.nativeCanvas, sheet, RectF(0f, 0f, size.width, size.height), paint) }
                },
    ) {
        art?.let { RoomLight(it, Modifier.fillMaxSize()) }
    }
}

/** The card and the sheet over its lower part; the one tapped last lies on top. */
@Composable
private fun JoinedPair(
    joined: JoinedCard,
    onSound: (TableSound) -> Unit,
) {
    val view = LocalView.current
    val reduceMotion = rememberReduceMotion()
    var sheetOnTop by rememberSaveable { mutableStateOf(true) }
    // The sheet lands: from a little above, settling down onto the card, then the sound and the tap.
    val land = remember { Animatable(if (reduceMotion) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (!reduceMotion) land.animateTo(1f, tween(420))
        onSound(TableSound.Down)
        view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
    }
    val room = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(top = 64.dp, bottom = 112.dp)
    BoxWithConstraints(modifier = room) {
        // The whole picture shows (the founder, November 17): the sheet, 90% of the card wide, lies over only the
        // printed strip, its top at 86% of the card's height. Card and sheet are fitted together, as large as that allows.
        val tall = CARD_RATIO * SHEET_TOP + CARD_RATIO * SHEET_WIDTH
        val cardWidth = min(maxWidth.value * 0.9f, maxHeight.value / tall)
        val cardHeight = cardWidth * CARD_RATIO
        val left = (maxWidth.value - cardWidth) / 2f
        val top = (maxHeight.value - cardWidth * tall) / 2f
        val card = joined.card
        val shape = RoundedCornerShape(3.dp)
        Box(
            modifier =
                Modifier
                    .offset(left.dp, top.dp)
                    .size(cardWidth.dp, cardHeight.dp)
                    .zIndex(if (sheetOnTop) 0f else 1f)
                    .rotate(-1f)
                    .shadow(12.dp, shape)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { sheetOnTop = false }
                    .clearAndSetSemantics {
                        contentDescription = "Card from ${card.fromFirst}: ${card.caption.ifBlank { "A Christmas card" }}"
                        role = Role.Button
                        onClick {
                            sheetOnTop = false
                            true
                        }
                    }.testTag("cardReplyTableCard"),
        ) {
            CardTableFront(design = card.design, caption = card.caption, paper = card.paper, year = card.year, mailedOn = card.mailedOn)
        }
        Box(
            modifier =
                Modifier
                    .offset((left + cardWidth * 0.08f).dp, (top + cardHeight * SHEET_TOP).dp)
                    .size((cardWidth * SHEET_WIDTH).dp, (cardWidth * SHEET_WIDTH * CARD_RATIO).dp)
                    .zIndex(if (sheetOnTop) 1f else 0f)
                    .graphicsLayer {
                        val fall = 1f - land.value
                        translationY = -28.dp.toPx() * fall
                        scaleX = 1f + 0.05f * fall
                        scaleY = 1f + 0.05f * fall
                        alpha = 0.2f + 0.8f * land.value
                        rotationZ = 2f
                    }.shadow(14.dp, shape)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { sheetOnTop = true }
                    .clearAndSetSemantics {
                        contentDescription = "${joined.replyFrom.trim().substringBefore(' ')} wrote back: ${joined.replyNote}"
                        role = Role.Button
                        onClick {
                            sheetOnTop = true
                            true
                        }
                    }.testTag("cardReplyTableSheet"),
        ) {
            CardTableBack(
                design = card.design,
                paper = null,
                fromName = joined.replyFrom,
                year = card.year,
                message = joined.replyNote,
                writing = null,
                signature = joined.replySignature,
            )
        }
    }
}

/** The ⋯ menu over the joined card: Report and Block for the other person. */
@Composable
private fun ReplyMenu(
    menu: List<CardTableMenuItem>,
    onPicked: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onPicked),
    ) {
        Column(
            modifier =
                Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(end = 12.dp, top = 58.dp)
                    .shadow(12.dp, RoundedCornerShape(14.dp))
                    .background(PantopusColors.tableMenu, RoundedCornerShape(14.dp))
                    .padding(6.dp)
                    .testTag("cardReplyTableMenu"),
        ) {
            menu.forEach { item ->
                Text(
                    item.title,
                    color = PantopusColors.tableCream,
                    modifier =
                        Modifier
                            .clickable {
                                onPicked()
                                item.onClick()
                            }.padding(horizontal = 12.dp, vertical = 14.dp)
                            .testTag(item.tag),
                )
            }
        }
    }
}

/** A card's height for its width (5:6). */
private const val CARD_RATIO = 1.2f

/** Where the reply sheet's top lies on the card: at 86% of its height, over the printed strip (the picture ends at 87%). */
private const val SHEET_TOP = 0.86f

/** The reply sheet's width, as a share of the card's. */
private const val SHEET_WIDTH = 0.9f
