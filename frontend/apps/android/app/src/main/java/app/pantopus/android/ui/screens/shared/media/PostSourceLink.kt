@file:Suppress("PackageNaming")

package app.pantopus.android.ui.screens.shared.media

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.posts.PostSource
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * "Read at The Columbian": where a post's story was published ([PostSource]), under its text on the Pulse card and on
 * the post page. A tap opens the story in a browser tab, as Around you's headlines open. Parity twin of iOS
 * `PostSourceLink`.
 */
@Composable
fun PostSourceLink(
    source: PostSource,
    testTag: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val shape = RoundedCornerShape(Radii.md)
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurfaceSunken)
                .border(1.dp, PantopusColors.appBorder, shape)
                .clickable(role = Role.Button, onClickLabel = "Open the story where it was published") {
                    try {
                        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(source.url))
                    } catch (_: ActivityNotFoundException) {
                        // No browser on this phone: the post stays readable.
                    }
                }
                .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                .testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(icon = PantopusIcon.Link, contentDescription = null, size = 14.dp, tint = PantopusColors.primary600)
        Text(
            text = source.label,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.primary600,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        PantopusIconImage(icon = PantopusIcon.ExternalLink, contentDescription = null, size = 13.dp, tint = PantopusColors.primary600)
    }
}
