@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.pennames

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import coil.compose.AsyncImage

/**
 * A made-up name's marks under the name: a small "Made-up name" mark, the post's time and town ([meta]) when given,
 * and, when the server says so, "Verified home nearby". No distance and no profile go with them.
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
fun PenNameMarks(
    verifiedHome: Boolean,
    testTagSuffix: String,
    modifier: Modifier = Modifier,
    meta: String? = null,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = PenNameCopy.MARK,
            fontSize = 10.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.slate,
            modifier =
                Modifier
                    .align(Alignment.CenterVertically)
                    .clip(RoundedCornerShape(Radii.pill))
                    .background(PantopusColors.slateBg)
                    .padding(horizontal = 6.dp, vertical = 1.dp)
                    .testTag("penNameMark_$testTagSuffix"),
        )
        meta?.takeIf { it.isNotEmpty() }?.let {
            Text(
                text = it,
                fontSize = 11.sp,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.align(Alignment.CenterVertically),
            )
        }
        if (verifiedHome) {
            Row(
                modifier = Modifier.align(Alignment.CenterVertically).testTag("penNameVerifiedHome_$testTagSuffix"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                PantopusIconImage(icon = PantopusIcon.ShieldCheck, contentDescription = null, size = 11.dp, tint = PantopusColors.success)
                Text(text = PenNameCopy.VERIFIED_HOME, fontSize = 11.sp, color = PantopusColors.appTextSecondary)
            }
        }
    }
}

/** "Only you can see this is you", under the writer's own made-up name. */
@Composable
fun PenNameOnlyYouLine(
    testTagSuffix: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.testTag("penNameOnlyYou_$testTagSuffix"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        PantopusIconImage(icon = PantopusIcon.EyeOff, contentDescription = null, size = 11.dp, tint = PantopusColors.appTextSecondary)
        Text(text = PenNameCopy.ONLY_YOU, fontSize = 11.sp, color = PantopusColors.appTextSecondary)
    }
}

/** A made-up name's picture, always drawn by the server; a drawn sky stands in until there is one. */
@Composable
fun PenNamePicture(
    url: String?,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.size(size).clip(CircleShape).background(PantopusColors.slateBg),
        contentAlignment = Alignment.Center,
    ) {
        // The drawn sky shows until the picture loads, and stays when it can't.
        PantopusIconImage(icon = PantopusIcon.Sunrise, contentDescription = null, size = size / 2, tint = PantopusColors.slate)
        if (!url.isNullOrEmpty()) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size).clip(CircleShape),
            )
        }
    }
}
