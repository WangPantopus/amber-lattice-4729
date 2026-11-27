package app.pantopus.android.ui.screens.feed.reinvented

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.ui.components.Toast
import app.pantopus.android.ui.components.ToastAppearance
import app.pantopus.android.ui.components.rememberShareTextWithCompletion
import app.pantopus.android.ui.components.toastDurationMillis
import app.pantopus.android.ui.screens.feed.pulse.PulsePostCardContent
import app.pantopus.android.ui.screens.feed.pulse.PulseRepostChooserSheet
import app.pantopus.android.ui.screens.profile.ProfilePostCardActions
import app.pantopus.android.ui.screens.profile.ProfilePostCards
import app.pantopus.android.ui.screens.profile.ProfilePostOptionsSheet
import app.pantopus.android.ui.screens.profile.ProfilePostReportDialog
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusTextStyle
import kotlinx.coroutines.delay

/** Every control on a post's card, through [cards]; a tap on the card opens its post page ([onOpenPost]). */
internal fun reinventedCardActions(
    cards: ProfilePostCards,
    onOpenPost: (String) -> Unit,
): ProfilePostCardActions =
    ProfilePostCardActions(
        onOpen = onOpenPost,
        onReact = cards::tapReaction,
        onChooseReaction = cards::chooseReaction,
        onOptions = cards::openOptions,
        onToggleSave = cards::toggleSave,
        // ↻ opens the Repost chooser, as on a Pulse card (Repost / Repost with your words).
        onToggleRepost = cards::openRepostChooser,
        onOpenQuoted = onOpenPost,
    )

/**
 * A post card's sheets in the new Pulse, as on Today's Around you: "Post options" (Share…, Report post), the Repost
 * chooser (Repost, Repost with your words: the composer with the post quoted, [onQuotePost]) and the report reasons.
 */
@Composable
internal fun ReinventedCardSheets(
    cards: ProfilePostCards,
    shown: List<PulsePostCardContent>,
    onQuotePost: ((String) -> Unit)?,
) {
    val optionsId by cards.optionsPostId.collectAsStateWithLifecycle()
    val reportingId by cards.reportingPostId.collectAsStateWithLifecycle()
    val chooserId by cards.repostChooserPostId.collectAsStateWithLifecycle()
    val shareText = rememberShareTextWithCompletion()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    optionsId?.let { id -> shown.firstOrNull { it.id == id } }?.let { card ->
        ProfilePostOptionsSheet(
            card = card,
            onShare = {
                cards.dismissOptions()
                cards.shareExternally(card.id) { url, onCompleted ->
                    lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && shareText(url, onCompleted)
                }
            },
            onReport = { cards.beginReport(card.id) },
            onDismiss = { cards.dismissOptions() },
        )
    }
    chooserId?.let { id -> shown.firstOrNull { it.id == id } }?.let { card ->
        PulseRepostChooserSheet(
            isReposted = card.actions.isReposted,
            onToggleRepost = { cards.toggleRepost(card.id) },
            onQuote =
                onQuotePost?.let { quote ->
                    {
                        cards.prepareQuote(card.id)
                        quote(card.id)
                    }
                },
            onDismiss = { cards.dismissRepostChooser() },
        )
    }
    reportingId?.let { id ->
        ProfilePostReportDialog(onReport = { reason -> cards.report(id, reason) }, onDismiss = { cards.cancelReport() })
    }
}

/** What a card's tap left to say ("Saved."), over the bottom of the screen for a few seconds. */
@Composable
internal fun ReinventedToast(
    toast: String?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(toast) {
        if (toast != null) {
            delay(toastDurationMillis(toast, minimumMillis = TOAST_MIN_MS))
            onDismiss()
        }
    }
    val message = toast ?: return
    Toast(
        text = message,
        appearance =
            ToastAppearance(
                background = PantopusColors.appText.copy(alpha = TOAST_ALPHA),
                foreground = PantopusColors.appTextInverse,
                textStyle = PantopusTextStyle.small,
            ),
        modifier = modifier.padding(bottom = 100.dp),
    )
}

private const val TOAST_MIN_MS = 2_000L
private const val TOAST_ALPHA = 0.9f
