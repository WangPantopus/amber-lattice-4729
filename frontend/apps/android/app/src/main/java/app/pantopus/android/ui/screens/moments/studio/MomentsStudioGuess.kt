package app.pantopus.android.ui.screens.moments.studio

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.screens.moments.compose.MomentsComposeUiState
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing

/*
 * "Guess the spot" in the Studio ("Pulse, reinvented" phase 0 step 8; CONTRACT 5a), as on iPhone
 * (`MomentsStudioGuess.swift`): in the Play part of the "Stamps and Play" tray. A photo or video with a place, never at
 * its author's home (the answer would point at it): others see the picture but not where it was taken, drop a pin, and
 * learn how far off they were. Sent as `guess: true`.
 */

/** "Guess the spot" may be made here: a photo or video with a place, away from home. The server checks again. */
val MomentsComposeUiState.offersGuess: Boolean
    get() = media != null && !noLocationOn && pin != null && place?.atHome == false

/** `guess: true` for the post when it was picked and may be made here; null (left out) otherwise. */
internal val MomentsComposeUiState.sentGuess: Boolean?
    get() = true.takeIf { guess && offersGuess }

/** The tray's Play row: "Guess the spot", on or off, with what it does in one line. */
@Composable
internal fun StudioGuessRow(
    on: Boolean,
    onToggle: () -> Unit,
) {
    val shape = RoundedCornerShape(19.dp)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Text(
            text = "Play",
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        Row(
            modifier =
                Modifier
                    .height(38.dp)
                    .clip(shape)
                    .background(if (on) PantopusColors.primary600 else PantopusColors.studioPillFill)
                    .then(if (on) Modifier else Modifier.border(1.dp, PantopusColors.studioPillOutline, shape))
                    .clickable(role = Role.Button, onClick = onToggle)
                    .padding(horizontal = 12.dp)
                    .testTag("moments.studio.tray.guess")
                    .clearAndSetSemantics {
                        contentDescription = "Guess the spot"
                        role = Role.Button
                        selected = on
                    },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            PantopusIconImage(icon = PantopusIcon.MapPin, contentDescription = null, size = 16.dp, strokeWidth = 2.2f, tint = Color.White)
            Text(text = "Guess the spot", color = Color.White, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        Text(
            text = "Others see the picture, not where it was taken, and drop a pin to guess. They learn how far off they were.",
            color = PantopusColors.studioPillSecondary,
            fontSize = 13.sp,
        )
    }
}

/** The note and its space over the caption, only while "Guess the spot" is picked and may be made here. */
@Composable
internal fun StudioGuessLine(state: MomentsComposeUiState) {
    if (!state.guess || !state.offersGuess) return
    StudioGuessNote(modifier = Modifier.padding(horizontal = Spacing.s4))
    Spacer(Modifier.height(Spacing.s3))
}

/** Over the caption while "Guess the spot" is on: what others will see. */
@Composable
internal fun StudioGuessNote(modifier: Modifier = Modifier) {
    Row(
        modifier =
            modifier
                .clip(RoundedCornerShape(14.dp))
                .background(PantopusColors.momentCaptionPill)
                .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                .testTag("moments.studio.guessNote")
                .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(icon = PantopusIcon.MapPin, contentDescription = null, size = 16.dp, strokeWidth = 2.2f, tint = Color.White)
        Text(
            text = "Guess the spot: others won't see where this was until they guess.",
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
