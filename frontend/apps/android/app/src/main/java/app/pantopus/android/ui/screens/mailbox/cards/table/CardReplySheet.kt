@file:Suppress("PackageNaming", "MagicNumber", "LongParameterList", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.mailbox.cards.table

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.mailbox.CardSignature
import app.pantopus.android.ui.screens.mailbox.cards.CardButton
import app.pantopus.android.ui.screens.mailbox.cards.CardButtonKind
import app.pantopus.android.ui.screens.mailbox.cards.DeskInk
import app.pantopus.android.ui.screens.mailbox.cards.HolidayCardBack
import app.pantopus.android.ui.screens.mailbox.cards.LocalOnCloth
import app.pantopus.android.ui.screens.mailbox.cards.letterCount
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.Spacing
import app.pantopus.android.ui.theme.rememberReduceMotion

/** A reply on its way: the words under the sheet once it's gone, and whether it can still be taken back. */
internal data class CardReplySent(
    /** "{Name} gets it with their 7 a.m. mail on {day}." */
    val arrives: String,
    val canTakeBack: Boolean,
)

/**
 * "Write back to {first name}" (plan Part 3): a cream sheet the size of the card's back comes up on the card's own cloth.
 * It is the back's own drawing, its rules and the pen at Part 1's sizes, FROM and the signature, with "Dear {first
 * name}," as its faint first line. Under it "Only you and {first name} can see this." and the letter count; the main
 * button is "Send with the morning mail". Sent, the sheet slides up off the table, and "On its way to {first name}.",
 * when it arrives and Take it back are left. ✕ or Back put the sheet away.
 */
@Composable
internal fun CardReplySheet(
    card: CardOnTable,
    /** The replier's own name, written beside FROM. */
    myName: String,
    signature: CardSignature?,
    message: String,
    limit: Int,
    onMessage: (String) -> Unit,
    busy: Boolean,
    problem: String?,
    sent: CardReplySent?,
    onSend: () -> Unit,
    onTakeBack: () -> Unit,
    onClose: () -> Unit,
) {
    BackHandler(onBack = onClose)
    val first = card.fromFirst
    val reduceMotion = rememberReduceMotion()
    // The sheet slides up off the table once it's sent (with animations off it just goes).
    val away = remember { Animatable(0f) }
    val sounds = rememberCardSounds()
    LaunchedEffect(sent != null) {
        if (sent != null) {
            // "The sheet slides up off the table with the paper sound."
            sounds.play(TableSound.Slide)
            if (reduceMotion) away.snapTo(1f) else away.animateTo(1f, tween(520))
        } else {
            away.snapTo(0f)
        }
    }
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(PantopusColors.tableNight)
                .semantics { paneTitle = "Write back to $first" }
                .testTag("cardReplySheet"),
    ) {
        // The card's own cloth under the whole sheet, edge to edge, as at the table.
        ReplyCloth(card.table)
        CompositionLocalProvider(LocalOnCloth provides true) {
            Column(modifier = Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(bottom = 28.dp)) {
                Row(modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(start = 8.dp, end = 8.dp, top = 6.dp)) {
                    RoundButton(PantopusIcon.X, "Close", "cardReplyClose", enabled = !busy, onClick = onClose)
                    Spacer(Modifier.weight(1f))
                }
                if (sent == null || away.value < 1f) {
                    ReplyPaper(
                        card = card,
                        myName = myName,
                        signature = signature,
                        message = message,
                        onMessage = onMessage,
                        editable = sent == null && !busy,
                        modifier = Modifier.graphicsLayer { translationY = -size.height * 1.4f * away.value },
                    )
                }
                if (sent == null) {
                    Writing(first, message, limit, busy, problem, onSend)
                } else {
                    Gone(first, sent, onTakeBack)
                }
            }
        }
    }
}

/** The reply's sheet: the card's back drawn as cream paper, written on in the pen, a little turned. */
@Composable
private fun ReplyPaper(
    card: CardOnTable,
    myName: String,
    signature: CardSignature?,
    message: String,
    onMessage: (String) -> Unit,
    editable: Boolean,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(3.dp)
    Box(
        modifier =
            modifier
                .padding(start = Spacing.s5, end = Spacing.s5, top = Spacing.s3)
                .widthIn(max = 520.dp)
                .fillMaxWidth()
                .aspectRatio(5f / 6f)
                .rotate(-0.6f)
                .shadow(14.dp, shape)
                .clip(shape),
    ) {
        HolidayCardBack(
            paper = null,
            fromName = myName,
            year = card.year,
            design = card.design,
            signature = signature,
            writing = { style ->
                BasicTextField(
                    value = message,
                    onValueChange = onMessage,
                    enabled = editable,
                    textStyle = style,
                    cursorBrush = SolidColor(PantopusColors.cardNoteInk),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    modifier =
                        Modifier
                            .fillMaxSize()
                            .semantics { contentDescription = "Your note to ${card.fromFirst}" }
                            .testTag("cardReplyNote"),
                    decorationBox = { inner ->
                        Box {
                            if (message.isEmpty()) {
                                Text("Dear ${card.fromFirst},", style = style.copy(color = PantopusColors.cardNoteInk.copy(alpha = 0.45f)))
                            }
                            inner()
                        }
                    },
                )
            },
        )
    }
}

/** Under the sheet while it's written: who can see it, the letters counted, and "Send with the morning mail". */
@Composable
private fun Writing(
    first: String,
    message: String,
    limit: Int,
    busy: Boolean,
    problem: String?,
    onSend: () -> Unit,
) {
    val count = message.letterCount()
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = Spacing.s4, end = Spacing.s4, top = Spacing.s4),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Only you and $first can see this.",
                fontSize = 14.sp,
                lineHeight = 20.sp,
                color = DeskInk.body,
                modifier = Modifier.weight(1f).testTag("cardReplyPrivate"),
            )
            Text(
                "$count of $limit letters",
                fontSize = 13.sp,
                color = DeskInk.quiet,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("cardReplyCount"),
            )
        }
        problem?.let {
            Text(
                it,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                color = DeskInk.alert,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }.testTag("cardReplyError"),
            )
        }
        CardButton(
            "Send with the morning mail",
            onClick = onSend,
            enabled = message.isNotBlank(),
            busy = busy,
            modifier = Modifier.padding(top = Spacing.s2).testTag("cardReplySend"),
        )
    }
}

/** Once it's gone: on its way, when it comes, and Take it back until the pickup. */
@Composable
private fun Gone(
    first: String,
    sent: CardReplySent,
    onTakeBack: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = Spacing.s4, end = Spacing.s4, top = Spacing.s10),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text(
            "On its way to $first.",
            style = tableWordsStyle,
            modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }.testTag("cardReplyGone"),
        )
        Text(
            sent.arrives,
            fontSize = 15.sp,
            lineHeight = 21.sp,
            color = DeskInk.body,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().testTag("cardReplyArrives"),
        )
        if (sent.canTakeBack) {
            CardButton(
                "Take it back",
                onClick = onTakeBack,
                kind = CardButtonKind.Words,
                fill = false,
                modifier = Modifier.testTag("cardReplyTakeBack"),
            )
        }
    }
}
