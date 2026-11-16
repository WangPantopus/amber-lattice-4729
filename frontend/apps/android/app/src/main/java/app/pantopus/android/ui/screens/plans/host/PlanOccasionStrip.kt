package app.pantopus.android.ui.screens.plans.host

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanOccasionDto
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.ui.screens.plans.colors
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.icon
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * "Coming up" on the kind picker (Plans for the holidays, board 2, spec A2): a grid of three across, one tile an
 * occasion the server answers, in its order, each a small square in the occasion's kind color with its glyph and the
 * occasion's name on the quiet surface; then the line about what each fills in. Two across at the largest text sizes.
 */
@Composable
internal fun PlanOccasionStrip(
    occasions: List<PlanOccasionDto>,
    large: Boolean,
    onOccasion: (PlanOccasionDto) -> Unit,
) {
    val across = if (large) 2 else 3
    Column(modifier = Modifier.testTag("planOccasions"), verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        PlanOverline("Coming up")
        occasions.chunked(across).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                row.forEach { occasion -> OccasionTile(occasion, Modifier.weight(1f)) { onOccasion(occasion) } }
                repeat(across - row.size) { Spacer(modifier = Modifier.weight(1f)) }
            }
        }
        Text(
            text = "Each one starts a plan with the usual things filled in: a headcount with kids, a bring list, the right words.",
            style = PantopusTextStyle.small,
            color = PantopusColors.appTextSecondary,
        )
    }
}

@Composable
private fun OccasionTile(
    occasion: PlanOccasionDto,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val kind = PlanKind.from(occasion.kind) ?: return
    Column(
        modifier =
            modifier
                .heightIn(min = 96.dp)
                .clip(RoundedCornerShape(Radii.lg))
                .background(PantopusColors.appSurfaceSunken)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(Spacing.s3)
                .semantics(mergeDescendants = true) { role = Role.Button }
                .testTag("planOccasion.${occasion.key}"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PlanIconTile(occasionIcon(occasion.key, kind), kind.colors.tint, kind.colors.accent, size = 32.dp, glyph = 18.dp, corner = 9.dp)
        Text(
            text = occasion.text,
            style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
        )
    }
}

/**
 * The occasion's glyph (06-screens A2): Thanksgiving dinner its kind's, Friendsgiving two people, Holiday party a tree,
 * Gift exchange a gift, New Year's Eve a sparkle, Birthday a party popper (the app's icon set has no cake).
 */
internal fun occasionIcon(
    key: String,
    kind: PlanKind,
): PantopusIcon =
    when (key) {
        "friendsgiving" -> PantopusIcon.Users
        "holiday_party" -> PantopusIcon.Trees
        "gift_exchange" -> PantopusIcon.Gift
        "new_years_eve" -> PantopusIcon.Sparkles
        "birthday" -> PantopusIcon.PartyPopper
        else -> kind.icon
    }
