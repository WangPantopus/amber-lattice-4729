package app.pantopus.android.ui.screens.compose.pulse

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.sky.SkyFloatingIcon
import app.pantopus.android.ui.sky.SkyWords
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/** The Sky's place line: the town the post floats over, the venue it pins at (else null), and "Pin it at a place". */
internal data class PulseSkyLine(
    val area: String,
    val pinnedAt: String?,
    val onPin: () -> Unit,
)

/**
 * The Pulse composer's place line under the Sky (phase A, contract section 10.2, board 9), in place of "Posting to …":
 * "Around Camas, WA" with a small "Pin it at a place" button that opens the place picker, or "At Esther Short
 * Park" when a venue is tagged and a photo taken there pins the post.
 */
@Composable
internal fun PulseSkyPlaceLine(
    line: PulseSkyLine,
    onChangeTarget: (() -> Unit)?,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s4, vertical = Spacing.s1).testTag("composePulsePostingBanner"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        val pinnedAt = line.pinnedAt
        if (pinnedAt == null) {
            SkyFloatingIcon(color = PantopusColors.primary600)
        } else {
            PantopusIconImage(icon = PantopusIcon.MapPin, contentDescription = null, size = 16.dp, tint = PantopusColors.primary600)
        }
        Text(
            text = pinnedAt?.let(SkyWords::at) ?: SkyWords.floatingOver(line.area),
            fontSize = 15.sp,
            color = PantopusColors.appText,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).testTag("composePulseSkyLine"),
        )
        if (pinnedAt == null) {
            Text(
                text = SkyWords.PIN_AT_PLACE,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = PantopusColors.primary600,
                modifier =
                    Modifier
                        .clip(CircleShape)
                        .border(1.dp, PantopusColors.primary200, CircleShape)
                        .clickable(role = Role.Button, onClick = line.onPin)
                        .heightIn(min = 32.dp)
                        .padding(horizontal = Spacing.s3, vertical = 6.dp)
                        .testTag("composePulseSkyPin"),
            )
        }
        onChangeTarget?.let { change ->
            Text(
                text = "Change",
                style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.primary600,
                modifier =
                    Modifier
                        .clickable(onClickLabel = "Change who sees it", role = Role.Button, onClick = change)
                        .testTag("composePulseChangeTarget"),
            )
        }
    }
}
