package app.pantopus.android.ui.guidance

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.screens.shared.content_detail.ContentDetailShell
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/** Help & Support's “Tips for each screen” row title (spec §4). */
const val GUIDANCE_TIPS_TITLE = "Tips for each screen"

/**
 * “Tips for each screen” (spec §4), opened from the Help Center's “Getting started” group: a plain list of the tab cards
 * on for this account, each by its title. A tap shows that centre card again; it doesn't change the card's count.
 */
@Composable
@OptIn(ExperimentalComposeUiApi::class)
fun GuidanceTipsScreen(onBack: () -> Unit) {
    val host = LocalGuidance.current
    val cards = remember(host) { host?.tipsCards().orEmpty() }
    ContentDetailShell(
        title = GUIDANCE_TIPS_TITLE,
        onBack = onBack,
        header = {},
        body = {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.s4, vertical = Spacing.s2)
                        .clip(RoundedCornerShape(Radii.lg))
                        .background(PantopusColors.appSurface)
                        .semantics { testTagsAsResourceId = true }
                        .testTag("guidance.tips"),
            ) {
                cards.forEachIndexed { index, card ->
                    if (index > 0) {
                        Box(
                            modifier =
                                Modifier.fillMaxWidth().padding(
                                    start = Spacing.s4,
                                ).height(1.dp).background(PantopusColors.appBorderSubtle),
                        )
                    }
                    Row(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 52.dp)
                                .clickable(role = Role.Button) { host?.replay(card) }
                                .testTag("guidance.tips.${card.id}")
                                .padding(horizontal = Spacing.s4, vertical = Spacing.s3),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
                    ) {
                        Text(card.title, style = PantopusTextStyle.body, color = PantopusColors.appText, modifier = Modifier.weight(1f))
                        PantopusIconImage(
                            PantopusIcon.ChevronRight,
                            contentDescription = null,
                            size = 16.dp,
                            tint = PantopusColors.appTextMuted,
                        )
                    }
                }
            }
        },
    )
}
