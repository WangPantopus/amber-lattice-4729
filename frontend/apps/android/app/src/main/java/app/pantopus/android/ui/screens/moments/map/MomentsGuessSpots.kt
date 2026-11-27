package app.pantopus.android.ui.screens.moments.map

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.api.models.moments.MomentDailySpotDto
import app.pantopus.android.data.api.models.moments.MomentGuessSpotDto
import app.pantopus.android.ui.screens.moments.MomentOpenHolder
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import coil.compose.AsyncImage

/*
 * Guess the spot on the Moments map ("Pulse, reinvented" step 8; CONTRACT 5d), as on iPhone (`MomentsGuessSpots.swift`),
 * only while the switch is on for the person. The map's read brings `guess_spots`: the live guess-the-spot Moments they
 * may see in the area, with no point. They are a list, never marks on the map, and say no more than the town. Today's
 * spot (`GET /api/moments/daily-spot`) comes first. A row opens the Moment in the viewer, where the guess is made.
 */

/**
 * Under the map's top row while the switch is on and there is a spot to guess: "Guess the spot · 3". It opens the
 * list. Nothing at all while the switch is off.
 */
@Composable
fun MomentsGuessSpotsChip(
    center: MomentsCenter?,
    modifier: Modifier = Modifier,
    guesses: MomentsGuessSpotsViewModel = hiltViewModel(),
) {
    val on by guesses.on.collectAsStateWithLifecycle()
    if (!on) return
    val spots by guesses.spots.collectAsStateWithLifecycle()
    val daily by guesses.daily.collectAsStateWithLifecycle()
    LaunchedEffect(center?.latitude, center?.longitude) { center?.let { guesses.readDaily(it.latitude, it.longitude) } }
    val count = spots.size + if (daily != null && spots.none { it.momentId == daily?.momentId }) 1 else 0
    if (count == 0) return
    var open by remember { mutableStateOf(false) }
    Row(
        modifier =
            modifier
                .height(36.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(18.dp))
                .clickable(role = Role.Button) { open = true }
                .padding(horizontal = 12.dp)
                .testTag("moments.guessSpots")
                .clearAndSetSemantics {
                    contentDescription = "Guess the spot, $count"
                    role = Role.Button
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PantopusIconImage(
            icon = PantopusIcon.MapPin,
            contentDescription = null,
            size = 16.dp,
            strokeWidth = 2.2f,
            tint = PantopusColors.primary600,
        )
        Text(text = "Guess the spot · $count", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
    }
    if (open) {
        GuessSpotsSheet(spots = spots, daily = daily, onDismiss = { open = false }) { id ->
            open = false
            MomentOpenHolder.current?.invoke(id) {}
        }
    }
}

/** The spots for the area in view: a small picture, who made it, and whether you guessed. Never where they are. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GuessSpotsSheet(
    spots: List<MomentGuessSpotDto>,
    daily: MomentDailySpotDto?,
    onDismiss: () -> Unit,
    onOpen: (String) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = PantopusColors.appSurface) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = Spacing.s4).testTag("moments.guessSpots.list"),
            verticalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            Text(
                text = "Guess the spot",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = PantopusColors.appText,
                modifier = Modifier.padding(horizontal = Spacing.s5),
            )
            Text(
                text = "Others' photos from around here, without their place. Open one and drop a pin.",
                fontSize = 14.sp,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.padding(horizontal = Spacing.s5),
            )
            val dailyId = daily?.momentId
            if (daily != null && dailyId != null && spots.none { it.momentId == dailyId }) {
                SpotRow(title = "Today's spot", subtitle = dailyLine(daily), thumb = null, tag = "daily") { onOpen(dailyId) }
            }
            // Today's spot first, then the rest as the server listed them (newest first).
            spots.sortedByDescending { it.daily || it.momentId == dailyId }.forEach { spot ->
                val id = spot.momentId ?: return@forEach
                val today = spot.daily || id == dailyId
                SpotRow(
                    title = if (today) "Today's spot" else spot.author?.firstName ?: spot.author?.name ?: "Someone",
                    subtitle = if (spot.guessed) "You guessed" else "Not guessed yet",
                    thumb = spot.thumbUrl,
                    tag = id,
                ) { onOpen(id) }
            }
        }
    }
}

private fun dailyLine(daily: MomentDailySpotDto): String =
    (if (daily.guessed) "You guessed" else "Not guessed yet") + (daily.town?.let { " · $it" } ?: "")

@Composable
private fun SpotRow(
    title: String,
    subtitle: String,
    thumb: String?,
    tag: String,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = Spacing.s5, vertical = Spacing.s2)
                .testTag("moments.guessSpots.row.$tag")
                .clearAndSetSemantics {
                    contentDescription = "$title, $subtitle"
                    role = Role.Button
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(
            modifier = Modifier.size(48.dp).clip(RoundedCornerShape(10.dp)).background(PantopusColors.primary100),
            contentAlignment = Alignment.Center,
        ) {
            if (thumb != null) {
                AsyncImage(model = thumb, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(48.dp))
            } else {
                PantopusIconImage(icon = PantopusIcon.MapPin, contentDescription = null, size = 20.dp, tint = PantopusColors.primary600)
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText, maxLines = 1)
            Text(text = subtitle, fontSize = 13.sp, color = PantopusColors.appTextSecondary, maxLines = 1)
        }
    }
}
