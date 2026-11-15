@file:Suppress("PackageNaming", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.feed.pulse

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.feed.FeedRepostedBy
import app.pantopus.android.ui.components.ToastAction
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing

/**
 * The words of Pulse's Save, Repost, Hide and "Not helpful here" (contract 2026-11-14 §1, §5–§7), shared by the feed,
 * the post page and a profile's cards so each says the same thing.
 */
internal object PulsePostCopy {
    const val REPOSTED = "Reposted. Your connections see it, and it's on your profile."
    const val REPOST_REMOVED = "Repost removed."
    const val REPOST_FAILED = "Could not update repost."
    const val SAVED = "Saved."
    const val UNSAVED = "Removed from Saved."
    const val SAVE_FAILED = "Couldn't update Saved. Try again."
    const val SAVE_LABEL = "Save post"
    const val REMOVE_SAVED_LABEL = "Remove from Saved"
    const val HIDDEN = "Post hidden."
    const val HIDE_FAILED = "Couldn't hide that post."
    const val UNDO_FAILED = "Couldn't undo. Try again."
    const val NOT_HELPFUL_HIDDEN = "Thanks. You won't see this post again."
    const val NOT_HELPFUL_KEPT = "Thanks for telling us."
    const val NOT_HELPFUL_FAILED = "Couldn't send that feedback."
    const val REPOST = "Repost"
    const val UNDO_REPOST = "Undo repost"
    const val REPOST_WITH_WORDS = "Repost with your words"
    const val QUOTED_UNAVAILABLE = "This post isn't available."
    const val QUOTED_GONE = "This post isn't available anymore."

    /** The test tag (iPhone's accessibility identifier) on a toast's action button. */
    const val TOAST_ACTION_TAG = "pulseFeedToastAction"
}

/** A toast's one action: "View" opens My posts on the Saved tab; "Undo" brings back a post just hidden. */
@Immutable
sealed interface PulseToastAction {
    val label: String

    data object ViewSaved : PulseToastAction {
        override val label: String = "View"
    }

    /** Undo on "Post hidden." and on "Thanks. You won't see this post again." (`DELETE /api/posts/hide/:id`). */
    data class UndoHide(val postId: String) : PulseToastAction {
        override val label: String = "Undo"
    }
}

/**
 * The action that goes with a toast's words. It shows only while the toast still says [message], so any later toast
 * (which sets only its words) leaves it behind. [serial] tells two equal toasts apart (two posts hidden in a row).
 */
@Immutable
data class PulseToastActionFor(
    val message: String,
    val action: PulseToastAction,
    val serial: Long = 0,
)

/** The toast button for [action] (contract §10's `pulseFeedToastAction`), or null when the toast has no action. */
internal fun PulseToastActionFor?.toastButton(
    shownMessage: String?,
    onAction: (PulseToastAction) -> Unit,
): ToastAction? =
    this?.takeIf { it.message == shownMessage }?.let { pending ->
        ToastAction(label = pending.action.label, onClick = { onAction(pending.action) }, testTag = PulsePostCopy.TOAST_ACTION_TAG)
    }

/** How long a toast with an action stays: long enough to reach its button. */
internal const val PULSE_ACTION_TOAST_MILLIS = 5_000L

/**
 * The "reposted" line after the viewer reposts ([reposted] true) or undoes it, in place (contract §1): no line becomes
 * "You reposted", "Ben C. reposted" becomes "You and Ben C. reposted"; an undo drops "You" (no names left, no line).
 */
internal fun FeedRepostedBy?.afterViewerRepost(reposted: Boolean): FeedRepostedBy? {
    val line = this
    val viewerIn = line?.viewer == true || line?.names?.firstOrNull() == VIEWER_NAME
    return when {
        reposted && viewerIn -> line
        reposted ->
            FeedRepostedBy(
                names = (listOf(VIEWER_NAME) + line?.names.orEmpty()).take(MAX_REPOSTED_NAMES),
                count = (line?.count ?: 0).coerceAtLeast(line?.names?.size ?: 0) + 1,
                viewer = true,
            )
        !viewerIn -> line
        else -> {
            val names = line?.names.orEmpty().filterIndexed { index, name -> !(index == 0 && name == VIEWER_NAME) }
            val count = ((line?.count ?: 0) - 1).coerceAtLeast(names.size)
            if (names.isEmpty() || count <= 0) null else FeedRepostedBy(names = names, count = count, viewer = false)
        }
    }
}

private const val VIEWER_NAME = "You"
private const val MAX_REPOSTED_NAMES = 2

/**
 * The Repost chooser (contract §2), drawn as the card's "Post options" sheet: Repost (or Undo repost), Repost with your
 * words, Cancel. [onQuote] null leaves "Repost with your words" out (a screen with no composer to open).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PulseRepostChooserSheet(
    isReposted: Boolean,
    onToggleRepost: () -> Unit,
    onQuote: (() -> Unit)?,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appBg,
        modifier = Modifier.testTag("pulseRepostChooser"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(Spacing.s4),
            verticalArrangement = Arrangement.spacedBy(Spacing.s1),
        ) {
            Text(text = PulsePostCopy.REPOST, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = PantopusColors.appText)
            ChooserRow(
                label = if (isReposted) PulsePostCopy.UNDO_REPOST else PulsePostCopy.REPOST,
                testTag = if (isReposted) "pulseRepostChooserUndo" else "pulseRepostChooserRepost",
                onClick = onToggleRepost,
            )
            onQuote?.let { quote ->
                ChooserRow(label = PulsePostCopy.REPOST_WITH_WORDS, testTag = "pulseRepostChooserQuote", onClick = quote)
            }
            ChooserRow(label = "Cancel", testTag = "pulseRepostChooserCancel", onClick = onDismiss)
            Spacer(modifier = Modifier.height(Spacing.s6))
        }
    }
}

/** One row, as the feed's "Post options" draws its own. */
@Composable
private fun ChooserRow(
    label: String,
    testTag: String,
    onClick: () -> Unit,
) {
    TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth().testTag(testTag)) {
        Text(text = label, color = PantopusColors.appText, modifier = Modifier.fillMaxWidth())
    }
}
