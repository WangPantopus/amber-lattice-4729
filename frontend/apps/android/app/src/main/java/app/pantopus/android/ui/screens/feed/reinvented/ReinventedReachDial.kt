@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.reinvented

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import kotlin.math.roundToInt

/**
 * The reach dial (PHASE-1 §2 piece 9; board B15), opened from the scope pill: Close circle and Around me (1 to 25
 * miles), each with one line saying what it shows and how it is ordered. Close circle is the people the person is
 * connected with (circles of 2 to 8 are phase 3).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReinventedReachDial(
    reach: String,
    miles: Int,
    onPick: (String, Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var picked by remember { mutableFloatStateOf(miles.toFloat()) }
    val shownMiles = picked.roundToInt()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appBg,
        modifier = Modifier.testTag("reinventedPulse.dial"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s5).padding(bottom = Spacing.s5).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            Text(
                "What Pulse shows",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = PantopusColors.appText,
                modifier =
                    Modifier.semantics {
                        heading()
                    },
            )
            DialOption(
                key = ReinventedPulseViewModel.CLOSE,
                on = reach == ReinventedPulseViewModel.CLOSE,
                title = "Close circle",
                icon = PantopusIcon.Users,
                line = "The people you're connected with. Newest first.",
            ) { onPick(ReinventedPulseViewModel.CLOSE, shownMiles) }
            DialOption(
                key = ReinventedPulseViewModel.AROUND,
                on = reach == ReinventedPulseViewModel.AROUND,
                title = "Around me",
                icon = PantopusIcon.MapPin,
                line = "Within $shownMiles ${if (shownMiles == 1) "mile" else "miles"} of you. Nearest first.",
            ) { onPick(ReinventedPulseViewModel.AROUND, shownMiles) }
            Slider(
                value = picked,
                onValueChange = { picked = it },
                onValueChangeFinished = { onPick(ReinventedPulseViewModel.AROUND, picked.roundToInt()) },
                valueRange = 1f..MAX_MILES,
                steps = (MAX_MILES - 2).toInt(),
                colors = SliderDefaults.colors(thumbColor = PantopusColors.primary600, activeTrackColor = PantopusColors.primary600),
                modifier =
                    Modifier
                        .padding(horizontal = Spacing.s2)
                        .semantics {
                            contentDescription = "Miles around you"
                            stateDescription = "$shownMiles miles"
                        }.testTag("reinventedPulse.dial.miles"),
            )
        }
    }
}

@Composable
@Suppress("LongParameterList") // One option: its key, whether it is chosen, its words and icon, and the choice.
private fun DialOption(
    key: String,
    on: Boolean,
    title: String,
    icon: PantopusIcon,
    line: String,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(if (on) PantopusColors.primary50 else PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .selectable(selected = on, role = Role.RadioButton, onClick = onClick)
                .padding(Spacing.s3)
                .testTag("reinventedPulse.dial.$key"),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(
            modifier =
                Modifier.size(
                    40.dp,
                ).clip(CircleShape).background(if (on) PantopusColors.primary600 else PantopusColors.appSurfaceRaised),
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(
                icon = icon,
                contentDescription = null,
                size = 20.dp,
                strokeWidth = 2.2f,
                tint = if (on) Color.White else PantopusColors.primary600,
            )
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = PantopusColors.appText)
            Text(line, fontSize = 13.5.sp, color = PantopusColors.appTextSecondary)
        }
        if (on) {
            PantopusIconImage(
                icon = PantopusIcon.Check,
                contentDescription = null,
                size = 18.dp,
                strokeWidth = 2.4f,
                tint = PantopusColors.primary600,
            )
        }
    }
}

private const val MAX_MILES = 25f
