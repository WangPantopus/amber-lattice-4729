@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.feed.reinvented.after

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.delay

/**
 * "Keep this?" under the author's name on their own Moment that drew replies, before it fades (CONTRACT 6d; iPhone's
 * `MomentKeepCard`, the web's `KeepThis`): "Keep it" or "Not now". Drawn only where the viewer has the switch on (its
 * caller's `studio`), and only while the server offers it; afterwards, for a few seconds, what the answer left to say.
 */
@Composable
fun MomentKeepThis(
    moment: MomentDto,
    mine: Boolean,
    modifier: Modifier = Modifier,
    viewModel: MomentKeepViewModel = hiltViewModel(),
) {
    val note by viewModel.note.collectAsStateWithLifecycle()
    LaunchedEffect(note) {
        if (note != null) {
            delay(NOTE_MS)
            viewModel.noteShown()
        }
    }
    note?.let { words ->
        Text(
            text = words,
            fontSize = 13.sp,
            color = Color.White,
            modifier =
                modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(PantopusColors.momentCaptionPill)
                    .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                    .semantics { liveRegion = LiveRegionMode.Polite }
                    .testTag("moments.viewer.keep.note"),
        )
        return
    }
    if (!moment.keepWaits(mine)) return
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .wrapContentHeight()
                .clip(RoundedCornerShape(16.dp))
                .background(Color.Black.copy(alpha = 0.6f))
                .padding(Spacing.s3)
                .testTag("moments.viewer.keep"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Text("Keep this?", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text(
            "It drew replies. Keep it as a post that stays, for the same people, until you remove it.",
            fontSize = 13.5.sp,
            color = Color.White.copy(alpha = 0.9f),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2), verticalAlignment = Alignment.CenterVertically) {
            KeepButton("Keep it", primary = true, tag = "moments.viewer.keep.yes") { viewModel.answer(moment.id, keep = true) }
            KeepButton("Not now", primary = false, tag = "moments.viewer.keep.no") { viewModel.answer(moment.id, keep = false) }
        }
    }
}

@Composable
private fun KeepButton(
    title: String,
    primary: Boolean,
    tag: String,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(percent = 50)
    Row(
        modifier =
            Modifier
                .height(36.dp)
                .clip(shape)
                .then(
                    if (primary) {
                        Modifier.background(PantopusColors.primary600)
                    } else {
                        Modifier.border(1.dp, Color.White.copy(alpha = 0.6f), shape)
                    },
                ).clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = Spacing.s4)
                .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            fontSize = 14.sp,
            fontWeight = if (primary) FontWeight.Bold else FontWeight.SemiBold,
            color = Color.White,
        )
    }
}

private const val NOTE_MS = 3_500L
