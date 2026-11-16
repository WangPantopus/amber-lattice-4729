package app.pantopus.android.ui.screens.moments.map

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.ui.screens.moments.components.MomentFace
import app.pantopus.android.ui.sky.SkyWords
import app.pantopus.android.ui.theme.PantopusColors
import java.time.Instant

/*
 * The Sky's "Share later" (phase A, contract section 10.1): your own Moments waiting for their time show in your row on
 * the Moments map as your face with "Shares at 6:40 pm", and can be deleted from there. They come only in your own map
 * read (`scheduled`, while the Sky is on for you); nobody else receives them before their time, and they are never a
 * pin. The row keeps them under every time filter. The words are [SkyWords].
 */

/** When it shares; null when the server didn't say. */
internal val MomentDto.shareInstant: Instant?
    get() = shareAt?.let { runCatching { Instant.parse(it.replace("+00:00", "Z")) }.getOrNull() }

/** The ones still waiting now (one whose time has come leaves the row before the next read brings its ring). */
internal fun List<MomentDto>.stillWaiting(now: Instant = Instant.now()): List<MomentDto> =
    filter { (it.shareInstant ?: Instant.EPOCH).isAfter(now) }

/** Your face with "Shares at 6:40 pm"; a tap offers Delete. */
@Composable
internal fun MomentsScheduledCell(
    moment: MomentDto,
    onDelete: (String, (Boolean) -> Unit) -> Unit,
) {
    var asking by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val line = moment.shareInstant?.let(SkyWords::sharesAt) ?: SkyWords.SHARE_LATER
    Column(
        modifier =
            Modifier
                .width(70.dp)
                .clickable(role = Role.Button, onClickLabel = SkyWords.DELETE) { asking = true }
                .testTag("moments.strip.scheduled")
                .semantics(mergeDescendants = true) { contentDescription = line },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Box(modifier = Modifier.size(56.dp)) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val unit = size.width / FACE
                drawCircle(color = Color.White, radius = WHITE_R * unit, center = Offset(HALF * unit, HALF * unit))
                drawCircle(
                    color = PantopusColors.appTextMuted,
                    radius = RING_R * unit,
                    center = Offset(HALF * unit, HALF * unit),
                    style = Stroke(width = RING_W * unit, pathEffect = PathEffect.dashPathEffect(floatArrayOf(DASH * unit, GAP * unit))),
                )
            }
            MomentFace(author = moment.author, size = 44.dp, modifier = Modifier.offset(x = 6.dp, y = 6.dp), initialsSize = 15.sp)
        }
        Text(
            text = line,
            fontSize = 11.sp,
            lineHeight = 12.sp,
            fontWeight = FontWeight.Medium,
            color = PantopusColors.appText,
            maxLines = 2,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(66.dp),
        )
    }
    if (asking) {
        AlertDialog(
            onDismissRequest = { asking = false },
            title = { Text(SkyWords.DELETE_SCHEDULED_TITLE) },
            text = { Text(SkyWords.DELETE_SCHEDULED_BODY) },
            confirmButton = {
                TextButton(
                    onClick = {
                        asking = false
                        onDelete(moment.id) { ok -> failed = !ok }
                    },
                    modifier = Modifier.testTag("moments.strip.scheduled.delete"),
                ) { Text(SkyWords.DELETE, color = PantopusColors.error) }
            },
            dismissButton = { TextButton(onClick = { asking = false }) { Text("Cancel") } },
        )
    }
    if (failed) {
        AlertDialog(
            onDismissRequest = { failed = false },
            text = { Text(SkyWords.COULD_NOT_DELETE) },
            confirmButton = { TextButton(onClick = { failed = false }) { Text("OK") } },
        )
    }
}

private const val FACE = 56f
private const val HALF = 28f
private const val WHITE_R = 27.5f
private const val RING_R = 25.75f
private const val RING_W = 2.5f
private const val DASH = 4f
private const val GAP = 3.5f
