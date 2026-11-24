package app.pantopus.android.ui.screens.homes.record

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.BuildConfig
import app.pantopus.android.data.api.models.homerecord.HomeRecordAction
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import timber.log.Timber

/**
 * A buyer's actions under the header (SPEC section 8, `design/Buyer.dc.html`): "Save this home" leads, filled; the
 * others are outlined. The decoder has already left out an id this app doesn't know.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun RecordActions(
    actions: List<HomeRecordAction>,
    onAction: (HomeRecordAction) -> Unit,
) {
    FlowRow(
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp).testTag("homeRecord.actions"),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
        // Two to a row, as drawn: save and share side by side, the claim under them.
        maxItemsInEachRow = 2,
    ) {
        actions.forEach { action ->
            val filled = action.id == "save"
            val shape = RoundedCornerShape(Radii.lg)
            val ink = if (filled) PantopusColors.appTextInverse else PantopusColors.primary600
            Row(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 46.dp)
                        .clip(shape)
                        .then(
                            if (filled) {
                                Modifier.background(PantopusColors.primary600)
                            } else {
                                Modifier.background(PantopusColors.appSurface).border(1.dp, PantopusColors.appBorderStrong, shape)
                            },
                        ).clickable(role = Role.Button) { onAction(action) }
                        .padding(horizontal = Spacing.s3, vertical = 10.dp)
                        .testTag("homeRecord.action.${action.id}"),
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PantopusIconImage(actionIcon(action.id), null, size = 17.dp, strokeWidth = 2f, tint = ink)
                Text(action.label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ink, maxLines = 1)
            }
        }
    }
}

private fun actionIcon(id: String): PantopusIcon =
    when (id) {
        "save" -> PantopusIcon.Bookmark
        "share" -> PantopusIcon.Share
        else -> PantopusIcon.KeyRound
    }

/** The share sheet with this record's link: the server's https page, or its path on the web's own host. */
internal fun shareRecordLink(
    context: Context,
    url: String,
) {
    val link =
        when {
            url.startsWith("https://") -> url
            url.startsWith("/") && !url.startsWith("//") -> BuildConfig.PANTOPUS_WEB_BASE_URL.trimEnd('/') + url
            else -> return
        }
    val send =
        Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, link)
        }
    runCatching { context.startActivity(Intent.createChooser(send, "Share this home’s record")) }
        .onFailure { Timber.w(it, "No app could share the home record's link") }
}
