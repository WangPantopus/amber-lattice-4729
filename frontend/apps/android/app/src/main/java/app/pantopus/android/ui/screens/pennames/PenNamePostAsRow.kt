@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.pennames

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.screens.shared.feed.FeedAvatar
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * "Post as": the person's own name ("your name and profile") and their made-up name ("others can't see it's you"),
 * in the composer and in the reply box. When the made-up name can't be used here the row says why and it can't be
 * chosen; once the reply box is fixed to a voice, only that one shows.
 */
@Composable
fun PenNamePostAsRow(
    state: PenNamePostAsUi,
    onChoose: (PenNameVoice) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth().testTag("penNamePostAs"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text(
            text = PenNameCopy.POST_AS,
            style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            if (state.fixedBy != PenNameVoice.MadeUp) {
                VoiceOption(
                    title = state.ownName ?: PenNameCopy.OWN_NAME_FALLBACK,
                    detail = PenNameCopy.OWN_DETAIL,
                    selected = !state.isMadeUp,
                    enabled = true,
                    picture = { FeedAvatar(initials = initialsOf(state.ownName), size = 24.dp) },
                    testTag = "penNamePostAs_own",
                    onClick = { onChoose(PenNameVoice.Own) },
                    modifier = Modifier.weight(1f),
                )
            }
            if (state.fixedBy != PenNameVoice.Own) {
                VoiceOption(
                    title = state.penName?.name ?: PenNameCopy.A_MADE_UP_NAME,
                    detail = PenNameCopy.MADE_UP_DETAIL,
                    selected = state.isMadeUp,
                    enabled = state.refusal == null,
                    picture = { PenNamePicture(url = state.penName?.avatarUrl, size = 24.dp) },
                    testTag = "penNamePostAs_madeUp",
                    onClick = { onChoose(PenNameVoice.MadeUp) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
        state.refusal?.takeIf { it.isNotEmpty() }?.let { sentence ->
            Text(
                text = sentence,
                style = PantopusTextStyle.caption,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.testTag("penNamePostAsRefusal"),
            )
        }
    }
}

@Composable
@Suppress("LongParameterList")
private fun VoiceOption(
    title: String,
    detail: String,
    selected: Boolean,
    enabled: Boolean,
    picture: @Composable () -> Unit,
    testTag: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(Radii.md)
    Row(
        modifier =
            modifier
                .heightIn(min = 48.dp)
                .clip(shape)
                .background(if (selected) PantopusColors.slateBg else PantopusColors.appSurface)
                .border(
                    width = if (selected) 1.5.dp else 1.dp,
                    color = if (selected) PantopusColors.slate else PantopusColors.appBorder,
                    shape = shape,
                )
                .clickable(enabled = enabled, role = Role.RadioButton, onClick = onClick)
                .alpha(if (enabled) 1f else DISABLED_ALPHA)
                .padding(horizontal = Spacing.s2, vertical = Spacing.s2)
                .semantics {
                    this.selected = selected
                    contentDescription = "$title, $detail"
                }.testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        picture()
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = PantopusColors.appText,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(text = detail, fontSize = 11.sp, color = PantopusColors.appTextSecondary, maxLines = 2)
        }
    }
}

/**
 * The composer's bottom bar while "Post as" shows: `/check`'s warning above the button, and the button naming the one
 * the post will carry ("Post as Night Gardener", "Post as Maria Lopez").
 */
@Composable
fun PenNamePostBar(
    label: String,
    warning: String?,
    isEnabled: Boolean,
    isSaving: Boolean,
    onCommit: () -> Unit,
    /** The server's sentence for the last made-up-name refusal, as it is. */
    refusal: String? = null,
) {
    Column {
        HorizontalDivider(color = PantopusColors.appBorderSubtle, thickness = 1.dp)
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .background(PantopusColors.appSurface)
                    .padding(horizontal = Spacing.s4, vertical = Spacing.s3),
            verticalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            warning?.let { sentence ->
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(Radii.md))
                            .background(PantopusColors.warningBg)
                            .padding(Spacing.s2)
                            .testTag("penNameCheckWarning"),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                ) {
                    PantopusIconImage(
                        icon = PantopusIcon.AlertCircle,
                        contentDescription = null,
                        size = 16.dp,
                        tint = PantopusColors.warning,
                    )
                    Text(text = sentence, style = PantopusTextStyle.caption, color = PantopusColors.appText)
                }
            }
            refusal?.let { sentence ->
                Text(
                    text = sentence,
                    style = PantopusTextStyle.caption,
                    color = PantopusColors.error,
                    modifier = Modifier.testTag("penNameRefusal"),
                )
            }
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clip(RoundedCornerShape(Radii.lg))
                        .background(if (isEnabled) PantopusColors.primary600 else PantopusColors.appBorderStrong)
                        .clickable(enabled = isEnabled && !isSaving, role = Role.Button, onClick = onCommit)
                        .semantics { contentDescription = label }
                        .testTag("penNamePostButton"),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (isSaving) {
                    CircularProgressIndicator(
                        color = PantopusColors.appTextInverse,
                        strokeWidth = 2.dp,
                        modifier = Modifier.heightIn(max = 20.dp),
                    )
                } else {
                    Text(
                        text = label,
                        style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                        color = PantopusColors.appTextInverse,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** "Posting as Night Gardener" at the top of the composer, in the made-up name's look. */
@Composable
fun PenNamePostingAsBanner(
    text: String,
    pictureUrl: String?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.md))
                .background(PantopusColors.slateBg)
                .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                .testTag("penNamePostingAs"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PenNamePicture(url = pictureUrl, size = 28.dp)
        Column {
            Text(text = text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.slate)
            Text(text = PenNameCopy.ONLY_YOU, fontSize = 11.sp, color = PantopusColors.appTextSecondary)
        }
    }
}

private fun initialsOf(name: String?): String =
    name.orEmpty().split(" ").filter { it.isNotEmpty() }.take(2).mapNotNull { it.firstOrNull()?.toString() }.joinToString("").uppercase()

private const val DISABLED_ALPHA = 0.45f
