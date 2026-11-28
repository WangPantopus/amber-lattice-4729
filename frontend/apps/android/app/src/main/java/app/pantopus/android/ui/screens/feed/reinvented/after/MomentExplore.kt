package app.pantopus.android.ui.screens.feed.reinvented.after

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import app.pantopus.android.ui.screens.moments.compose.MomentsComposeUiState
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * "Also show in Explore" for a Moment (PHASE-1 §4; CONTRACT 6f): one row in the Studio's drawer, off by default, with
 * "People anywhere can see this, with its place." under it. Offered only where the server keeps it: a Moment with a
 * place, for people nearby, not at home, under the person's own name. Elsewhere the row isn't drawn and nothing is sent.
 */
internal object MomentExploreState {
    val on = mutableStateOf(false)
}

/** Holds the choice for the composer it belongs to; a new composer starts with it off. */
@HiltViewModel
class MomentExploreViewModel
    @Inject
    constructor() : ViewModel() {
        init {
            MomentExploreState.on.value = false
        }

        override fun onCleared() {
            MomentExploreState.on.value = false
        }
    }

/** Where the server keeps "Also show in Explore" for a Moment. */
internal val MomentsComposeUiState.offersExplore: Boolean
    get() = !noLocationOn && audience == "nearby" && !madeUp && place?.atHome != true

/** `explore` for `POST /api/moments`: `true` only when chosen here and offered; left out otherwise. */
val MomentsComposeUiState.sentExplore: Boolean?
    get() = true.takeIf { MomentExploreState.on.value && offersExplore }

/** The drawer's row (the Studio's drawer only: its caller passes `studio`). */
@Composable
fun MomentExploreRow(
    state: MomentsComposeUiState,
    @Suppress("UNUSED_PARAMETER") holder: MomentExploreViewModel = hiltViewModel(),
) {
    if (!state.offersExplore) return
    val on by MomentExploreState.on
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.s5)
                .padding(top = 6.dp)
                .heightIn(min = 52.dp)
                .clickable(role = Role.Switch) { MomentExploreState.on.value = !on }
                .testTag("moments.post.explore")
                .clearAndSetSemantics {
                    contentDescription = "Also show in Explore. People anywhere can see this, with its place."
                    role = Role.Switch
                    selected = on
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(text = "Also show in Explore", fontSize = 15.sp, fontWeight = FontWeight.Medium, color = PantopusColors.appText)
            Text(
                text = "People anywhere can see this, with its place.",
                fontSize = 12.5.sp,
                lineHeight = 16.sp,
                color = PantopusColors.appTextSecondary,
            )
        }
        Switch(
            checked = on,
            onCheckedChange = { MomentExploreState.on.value = it },
            colors =
                SwitchDefaults.colors(
                    checkedTrackColor = PantopusColors.primary600,
                    uncheckedTrackColor = PantopusColors.momentSwitchTrack,
                    uncheckedBorderColor = PantopusColors.momentSwitchTrack,
                    uncheckedThumbColor = Color.White,
                ),
        )
    }
}
