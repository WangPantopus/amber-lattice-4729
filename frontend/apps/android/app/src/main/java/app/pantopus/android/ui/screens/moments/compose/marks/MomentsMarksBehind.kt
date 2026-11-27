@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.compose.marks

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.components.keepsKeyboard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/*
 * "Pulse, reinvented"'s Studio, phase 0 step 4: words behind the photo's subject (iPhone #4985). In the Studio's Text, a
 * "Behind" button for the label being changed: the photo's subject is lifted on the phone ([MomentSubjects]) and the
 * label is drawn under it. Shown only when the editor opens from the Studio on a photo; today's composer never shows it.
 */

/** How long the picture rests after Resize moved it before its subject is lifted again. */
private const val RESTED_MS = 500L

/** Lifts the subject of the editor's picture at a placement (null: as taken); null when there is none. */
internal typealias SubjectLift = suspend (MomentPlacement?) -> MomentSubject?

/** The picked label goes behind [subject] (kept with the marks), or comes back in front. */
internal fun MomentMarksEditing.behind(
    id: Int,
    subject: MomentSubject?,
): MomentMarksEditing =
    copy(
        marks =
            marks.copy(
                labels = marks.labels.map { if (it.id == id) it.copy(behind = subject != null) else it },
                subject = subject ?: marks.subject.takeIf { marks.labels.any { it.behind && it.id != id } },
            ),
    )

/** Text's "Behind" for the picked label, with what the lift is doing beside it. */
@Composable
internal fun StudioBehindRow(
    editing: MomentMarksEditing,
    onEdit: ((MomentMarksEditing) -> MomentMarksEditing) -> Unit,
    lift: SubjectLift,
) {
    val label = editing.picked ?: return
    val scope = rememberCoroutineScope()
    var lifting by remember { mutableStateOf(false) }
    var none by remember(label.id) { mutableStateOf(false) }
    val current by rememberUpdatedState(editing)
    val on = label.behind && editing.marks.subject != null
    Row(
        modifier = Modifier.fillMaxWidth().keepsKeyboard(),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val shape = RoundedCornerShape(18.dp)
        Text(
            text = "Behind",
            color = if (on) PantopusColors.appText else Color.White,
            fontSize = 14.sp,
            modifier =
                Modifier
                    .height(36.dp)
                    .clip(shape)
                    .background(if (on) Color.White else PantopusColors.studioPillFill)
                    .then(if (on) Modifier else Modifier.border(1.dp, PantopusColors.studioPillOutline, shape))
                    .clickable(enabled = !lifting, role = Role.Switch) {
                        if (on) {
                            onEdit { it.behind(label.id, null) }
                            return@clickable
                        }
                        none = false
                        scope.launch {
                            val kept = current.marks.subject?.takeIf { it.placement == current.placement }
                            lifting = kept == null
                            val subject = kept ?: lift(current.placement)
                            lifting = false
                            if (subject == null) none = true else onEdit { it.behind(label.id, subject) }
                        }
                    }.padding(horizontal = 16.dp, vertical = 8.dp)
                    .testTag("moments.marks.behind")
                    .clearAndSetSemantics {
                        contentDescription = "Behind the subject"
                        role = Role.Switch
                        stateDescription = if (on) "On" else "Off"
                    },
        )
        val note =
            when {
                lifting -> MomentSubjectWords.FINDING
                none -> MomentSubjectWords.NONE
                else -> null
            }
        note?.let { Text(text = it, color = Color.White, fontSize = 13.sp, modifier = Modifier.weight(1f, fill = false)) }
    }
}

/**
 * Resize moved the picture after words went behind its subject: once it has rested a moment, the subject is lifted
 * again where the picture now sits, or with none there the words come back in front.
 */
@Composable
internal fun KeepSubjectInStep(
    editing: MomentMarksEditing,
    onEdit: ((MomentMarksEditing) -> MomentMarksEditing) -> Unit,
    lift: SubjectLift,
) {
    val subject = editing.marks.subject ?: return
    if (subject.placement == editing.placement) return
    LaunchedEffect(subject, editing.placement) {
        // A new placement while a finger still moves it calls this off and starts again.
        delay(RESTED_MS)
        val again = lift(editing.placement)
        onEdit { now ->
            val behind = now.marks.labels.filter { it.behind }.map { it.id }
            if (again != null) {
                now.copy(marks = now.marks.copy(subject = again))
            } else {
                behind.fold(now) { step, id -> step.behind(id, null) }
            }
        }
    }
}
