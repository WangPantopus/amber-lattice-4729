package app.pantopus.android.sharein

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.theme.PantopusColors
import coil.compose.AsyncImage

/*
 * ShareInActivity's one screen, a sheet at the bottom over the app that shared: "Sharing as <name>", then a card for
 * each place in Pantopus the shared thing can go, each a small picture of how it will look there with its button
 * underneath. Nobody signed in: a line saying so and "Open Pantopus". Parity twin of iOS `SharePicker.swift`; the
 * test tags are the iPhone's accessibility identifiers.
 */

private val CardShape = RoundedCornerShape(8.dp)
private val SheetShape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
private val Ghost = PantopusColors.appBorder
private const val CARD_TALL = 1.75f
private const val MOST_CARDS_ACROSS = 4

/** Under this width a card's button takes smaller words (five across on a phone). */
private val SMALL_CARD = 76.dp

@Composable
fun ShareInSheet(
    ui: ShareInUi,
    onPick: (ShareInDestination) -> Unit,
    onOpenApp: () -> Unit,
    onCancel: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.4f))
                // A tap outside the sheet closes it, as on any sheet.
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onCancel),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            modifier =
                Modifier
                    .widthIn(max = 560.dp)
                    .fillMaxWidth()
                    .clip(SheetShape)
                    .background(PantopusColors.appBg)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = {})
                    .navigationBarsPadding()
                    .testTag("shareIn.sheet"),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Header(ui, onCancel)
            Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(PantopusColors.appBorder))
            Box(modifier = Modifier.fillMaxWidth().heightIn(min = 300.dp).padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                when {
                    !ui.signedIn ->
                        Message("Sign in to Pantopus first", "Open Pantopus and sign in, then share again.", "Open Pantopus", onOpenApp)
                    ui.failure != null -> Message(ui.failure, null, "Close", onCancel)
                    ui.goingTo != null ->
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            CircularProgressIndicator(color = PantopusColors.primary600)
                            Text("Opening ${ui.goingTo}", fontSize = 15.sp, color = PantopusColors.appTextSecondary)
                        }
                    else -> Cards(ui, onPick)
                }
            }
        }
    }
}

@Composable
private fun Header(
    ui: ShareInUi,
    onCancel: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
        Text(
            text = "Cancel",
            fontSize = 16.sp,
            color = PantopusColors.primary600,
            modifier =
                Modifier
                    .align(Alignment.CenterStart)
                    .clickable(role = Role.Button, onClick = onCancel)
                    .padding(vertical = 12.dp)
                    .testTag("shareIn.cancel"),
        )
        val name = ui.name?.takeIf { it.isNotBlank() }
        Text(
            text =
                if (name == null) {
                    buildAnnotatedString { withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append("Pantopus") } }
                } else {
                    buildAnnotatedString {
                        append("Sharing as ")
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(name) }
                    }
                },
            fontSize = 16.sp,
            color = PantopusColors.appText,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 72.dp).testTag("shareIn.sharingAs"),
        )
    }
}

@Composable
private fun Cards(
    ui: ShareInUi,
    onPick: (ShareInDestination) -> Unit,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        // All of them show at once: four across at the size of the phone's own share cards, five a little smaller and
        // closer. Sized for four when there are fewer, so two or three aren't oversized.
        val across = ui.destinations.size.coerceIn(MOST_CARDS_ACROSS, MOST_CARDS_ACROSS + 1)
        val gap = if (across > MOST_CARDS_ACROSS) 8.dp else 12.dp
        val width = minOf(96.dp, (maxWidth - 32.dp - gap * (across - 1)) / across)
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(gap, Alignment.CenterHorizontally),
        ) {
            ui.destinations.forEach { destination ->
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier =
                        Modifier
                            .clickable(enabled = ui.sending == null, role = Role.Button) { onPick(destination) }
                            .semantics(mergeDescendants = true) { contentDescription = destination.spoken }
                            .testTag("shareIn.${destination.tag}"),
                ) {
                    Box(
                        modifier =
                            Modifier
                                .size(width, width * CARD_TALL)
                                .shadow(6.dp, CardShape)
                                .clip(CardShape)
                                .background(PantopusColors.appSurface)
                                .border(0.5.dp, PantopusColors.appBorder, CardShape),
                    ) {
                        Mock(destination, ui.thumbnail, width)
                    }
                    Box(
                        modifier = Modifier.size(width, 34.dp).clip(CircleShape).background(PantopusColors.primary600),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (ui.sending == destination) {
                            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                        } else {
                            Text(
                                text = destination.title,
                                fontSize = if (width < SMALL_CARD) 13.sp else 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color.White,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** How the shared thing will look in one place, drawn small: the picture where it goes, grey bars for the rest. */
@Composable
private fun Mock(
    destination: ShareInDestination,
    thumbnail: Any?,
    width: Dp,
) {
    when (destination) {
        // Full screen, a time bar and the author across the top.
        ShareInDestination.Moments ->
            Box(modifier = Modifier.fillMaxSize()) {
                val chalk = Color.White.copy(alpha = 0.85f)
                Picture(thumbnail, Modifier.fillMaxSize())
                Column(modifier = Modifier.padding(6.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(modifier = Modifier.fillMaxWidth().height(2.dp).clip(CircleShape).background(chalk))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(modifier = Modifier.size(9.dp).clip(CircleShape).background(chalk))
                        Box(modifier = Modifier.size(part(width, fraction = 0.3f), 3.dp).clip(CircleShape).background(chalk))
                    }
                }
            }
        // A post: who, the picture, a line of words.
        ShareInDestination.Pulse ->
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier.padding(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(Ghost))
                    Bar(part(width, fraction = 0.35f))
                }
                Picture(thumbnail, Modifier.fillMaxWidth().height(part(width * CARD_TALL, fraction = 0.56f)))
                Column(modifier = Modifier.padding(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Bar(part(width, fraction = 0.7f))
                    Bar(part(width, fraction = 0.45f))
                }
            }
        // A chat: bubbles on both sides, the picture as the last one sent.
        ShareInDestination.Messages ->
            Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                val bar = part(width * CARD_TALL, fraction = 0.12f)
                Box(modifier = Modifier.fillMaxWidth().height(bar).background(Ghost.copy(alpha = 0.6f)))
                Bubble(part(width, fraction = 0.4f), leading = true)
                Bubble(part(width, fraction = 0.5f), leading = false)
                Bubble(part(width, fraction = 0.55f), leading = true)
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp), horizontalArrangement = Arrangement.End) {
                    val sent = Modifier.size(part(width, fraction = 0.55f), part(width, fraction = 0.42f))
                    Picture(thumbnail, sent.clip(RoundedCornerShape(5.dp)))
                }
            }
        // A card: the picture on it, a stamp in the corner, the note's lines below.
        ShareInDestination.Mail ->
            Column(modifier = Modifier.fillMaxSize().padding(7.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    Box(modifier = Modifier.size(11.dp, 13.dp).border(1.dp, PantopusColors.primary600, RoundedCornerShape(2.dp)))
                }
                Picture(thumbnail, Modifier.fillMaxWidth().height(part(width * CARD_TALL, fraction = 0.45f)).clip(RoundedCornerShape(3.dp)))
                Bar(part(width, fraction = 0.6f))
                Bar(part(width, fraction = 0.5f))
                Bar(part(width, fraction = 0.3f))
            }
        // A plan: its day and name on top, the picture in the plan's chat.
        ShareInDestination.Plans ->
            Column(modifier = Modifier.fillMaxSize().padding(7.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(modifier = Modifier.size(14.dp, 15.dp).clip(RoundedCornerShape(3.dp)).background(PantopusColors.primary600))
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Bar(part(width, fraction = 0.45f))
                        Bar(part(width, fraction = 0.3f))
                    }
                }
                Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(PantopusColors.appBorder))
                Box(modifier = Modifier.size(part(width, fraction = 0.45f), 9.dp).clip(CircleShape).background(Ghost))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    val sent = Modifier.size(part(width, fraction = 0.6f), part(width, fraction = 0.46f))
                    Picture(thumbnail, sent.clip(RoundedCornerShape(5.dp)))
                }
            }
    }
}

/** The shared picture, or a grey block for a link or words. */
@Composable
private fun Picture(
    thumbnail: Any?,
    modifier: Modifier,
) {
    if (thumbnail == null) {
        Box(modifier = modifier.background(Ghost))
    } else {
        AsyncImage(model = thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = modifier.background(Ghost))
    }
}

/** A share of the card's width or height: the small picture is drawn in proportions, whatever size the card is. */
private fun part(
    of: Dp,
    fraction: Float,
): Dp = of * fraction

@Composable
private fun Bar(width: Dp) {
    Box(modifier = Modifier.size(width, 4.dp).clip(CircleShape).background(Ghost))
}

@Composable
private fun Bubble(
    width: Dp,
    leading: Boolean,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp),
        horizontalArrangement = if (leading) Arrangement.Start else Arrangement.End,
    ) {
        Box(modifier = Modifier.size(width, 9.dp).clip(CircleShape).background(Ghost))
    }
}

@Composable
private fun Message(
    title: String,
    detail: String?,
    button: String,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier.padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText, textAlign = TextAlign.Center)
        if (detail != null) {
            Text(detail, fontSize = 15.sp, color = PantopusColors.appTextSecondary, textAlign = TextAlign.Center)
        }
        Spacer(modifier = Modifier.height(8.dp))
        PrimaryButton(title = button, onClick = onClick, modifier = Modifier.width(220.dp).testTag("shareIn.messageButton"))
    }
}

/** The line the card flow shows while a shared photo waits: it says where the photo will go. */
@Composable
fun ShareInCardPhotoNote() {
    val waiting by ShareInCardPhoto.waiting.collectAsStateWithLifecycle()
    if (waiting != null) {
        Text(
            text = "Your photo goes on the card when you write on the back.",
            fontSize = 13.sp,
            color = PantopusColors.appTextSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("shareIn.cardPhotoNote"),
        )
    }
}
