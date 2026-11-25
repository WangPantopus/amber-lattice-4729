package app.pantopus.android.ui.screens.place.launch

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.place.PlaceReading
import app.pantopus.android.ui.components.Shimmer
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.launch

/** "Ask Pantopus: what does this mean for me?" (LOOKUPORDER 5.2): opens the reading, or on a saved address the assistant. */
@Composable
internal fun PreviewAskRow(
    onAsk: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(12.dp))
                .clickable(role = Role.Button, onClick = onAsk)
                .heightIn(min = 48.dp)
                .padding(horizontal = 14.dp, vertical = 12.dp)
                .testTag("place.preview.ask"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PantopusIconImage(PantopusIcon.Sparkles, null, size = 18.dp, tint = PantopusColors.magic)
        Text(
            "Ask Pantopus: what does this mean for me?",
            fontSize = 14.5.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.primary600,
            modifier = Modifier.weight(1f),
        )
        PantopusIconImage(PantopusIcon.ChevronRight, null, size = 16.dp, tint = PantopusColors.appTextMuted)
    }
}

/** The reading sheet while [open] and once the Ask row has asked for a reading. */
@Composable
internal fun PreviewReadingSheet(
    open: Boolean,
    state: PlaceReadingState?,
    onSignUp: (() -> Unit)?,
    onDismiss: () -> Unit,
) {
    if (open && state != null) PlaceReadingSheet(state, onSignUp, onDismiss)
}

/**
 * Pantopus AI's reading of the lookup (LOOKUPORDER 5.2): what matters most, what to do in order with each step's
 * agency, what the page can't tell, then three questions that open to their answers. Signed out, "Ask your own
 * question" goes where the bar's button goes ([onSignUp], after the sheet is down). A reading that can't be had stays
 * here as one sentence; the Ask row stays on the page.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PlaceReadingSheet(
    state: PlaceReadingState,
    onSignUp: (() -> Unit)?,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    // Only a finished hide dismisses (Material's pattern), then the sign-up goes on.
    val hideThen: (() -> Unit) -> Unit = { next ->
        scope.launch { sheetState.hide() }.invokeOnCompletion {
            if (!sheetState.isVisible) {
                onDismiss()
                next()
            }
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = PantopusColors.appSurface) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = Spacing.s5)
                    .navigationBarsPadding()
                    .testTag("place.preview.reading"),
            verticalArrangement = Arrangement.spacedBy(Spacing.s4),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                PantopusIconImage(PantopusIcon.Sparkles, null, size = 18.dp, tint = PantopusColors.magic)
                Text(
                    "Ask Pantopus",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = PantopusColors.appText,
                    modifier = Modifier.semantics { heading() },
                )
            }
            when (state) {
                PlaceReadingState.Loading -> ReadingLoading()
                PlaceReadingState.Failed ->
                    Text(
                        "Pantopus AI couldn't read this page just now.",
                        fontSize = 14.5.sp,
                        lineHeight = 21.sp,
                        color = PantopusColors.appTextSecondary,
                        modifier = Modifier.testTag("place.preview.reading.failed"),
                    )
                is PlaceReadingState.Ready -> ReadingBody(state.reading, onSignUp?.let { signUp -> { hideThen(signUp) } })
            }
            Text(
                "Written by Pantopus AI from the public records on this page. It is not given your street address.",
                fontSize = 12.sp,
                lineHeight = 17.sp,
                color = PantopusColors.appTextMuted,
            )
        }
    }
}

/** Lines where the reading will be, while it is written. */
@Composable
private fun ReadingLoading() {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2), modifier = Modifier.fillMaxWidth()) {
        ReadingHeading("What matters most here")
        repeat(READING_SKELETON_LINES) { Shimmer(width = 300.dp, height = 14.dp) }
        Shimmer(width = 180.dp, height = 14.dp)
    }
}

@Composable
private fun ReadingHeading(text: String) {
    Text(
        text,
        fontSize = 15.sp,
        fontWeight = FontWeight.Bold,
        color = PantopusColors.appText,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun ReadingBody(
    reading: PlaceReading,
    onSignUp: (() -> Unit)?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        ReadingHeading("What matters most here")
        Text(reading.matters, fontSize = 14.5.sp, lineHeight = 21.sp, color = PantopusColors.appText)
    }
    if (reading.steps.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            ReadingHeading("What to do, in order")
            reading.steps.forEachIndexed { i, step ->
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                    Text(
                        "${i + 1}.",
                        fontSize = 14.5.sp,
                        lineHeight = 21.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = PantopusColors.appText,
                    )
                    Column {
                        Text(step.text, fontSize = 14.5.sp, lineHeight = 21.sp, color = PantopusColors.appText)
                        if (step.source.isNotBlank()) {
                            Text(step.source, fontSize = 12.5.sp, lineHeight = 17.sp, color = PantopusColors.appTextMuted)
                        }
                    }
                }
            }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        ReadingHeading("What this page can't tell you")
        Text(reading.cannotTell, fontSize = 14.5.sp, lineHeight = 21.sp, color = PantopusColors.appText)
    }
    Column {
        reading.questions.forEachIndexed { i, question ->
            if (i > 0) HorizontalDivider(color = PantopusColors.appBorderSubtle)
            ReadingQuestion(question.q, question.a, i)
        }
    }
    if (onSignUp != null) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clickable(role = Role.Button, onClick = onSignUp)
                    .heightIn(min = 44.dp)
                    .testTag("place.preview.reading.signUp"),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Ask your own question. Free with an account.",
                fontSize = 14.5.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
                color = PantopusColors.primary600,
                modifier = Modifier.weight(1f, fill = false),
            )
            PantopusIconImage(PantopusIcon.ChevronRight, null, size = 14.dp, strokeWidth = 2.25f, tint = PantopusColors.primary600)
        }
    }
}

/** One question; a tap opens it to its answer. */
@Composable
private fun ReadingQuestion(
    q: String,
    a: String,
    index: Int,
) {
    var open by rememberSaveable(q) { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxWidth().testTag("place.preview.reading.question.$index")) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clickable(role = Role.Button) { open = !open }
                    .semantics { stateDescription = if (open) "Open" else "Closed" }
                    .heightIn(min = 48.dp)
                    .padding(vertical = Spacing.s2),
            horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                q,
                fontSize = 14.5.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
                color = PantopusColors.appText,
                modifier = Modifier.weight(1f),
            )
            PantopusIconImage(
                if (open) PantopusIcon.ChevronUp else PantopusIcon.ChevronDown,
                null,
                size = 16.dp,
                tint = PantopusColors.appTextMuted,
            )
        }
        if (open) {
            Text(
                a,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.padding(bottom = Spacing.s3),
            )
        }
    }
}

/** Shimmer lines while the reading is written. */
private const val READING_SKELETON_LINES = 3
