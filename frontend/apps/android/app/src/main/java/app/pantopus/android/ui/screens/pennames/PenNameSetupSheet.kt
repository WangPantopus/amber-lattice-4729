@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.pennames

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.api.models.pennames.PenNameDto
import app.pantopus.android.ui.components.PantopusFieldState
import app.pantopus.android.ui.components.PantopusTextField
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.components.sheetKeyboardRules
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/**
 * The made-up name screen: the first time "Post as" picks the made-up name (or the server says `PEN_NAME_NEEDED`), and
 * Settings' change of name ([replace]). A field for the name the person wants; left empty, Pantopus gives one (shown,
 * with Shuffle); the picture, always drawn; the promise; "Use this name". [onDone] gets the name kept.
 */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun PenNameSetupSheet(
    replace: Boolean,
    onDone: (PenNameDto) -> Unit,
    onDismiss: () -> Unit,
    viewModel: PenNameSetupViewModel = hiltViewModel(key = "penNameSetup"),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(replace) { viewModel.start(replace) }
    LaunchedEffect(state.taken) {
        state.taken?.let { taken ->
            viewModel.consumeTaken()
            onDone(taken)
        }
    }
    ModalBottomSheet(
        onDismissRequest = {
            viewModel.consumeTaken()
            onDismiss()
        },
        modifier = Modifier.sheetKeyboardRules(),
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PantopusColors.appSurface,
    ) {
        PenNameSetupContent(
            state = state,
            replace = replace,
            onType = viewModel::setTyped,
            onShuffle = viewModel::shuffle,
            onUse = viewModel::use,
        )
    }
}

@Composable
private fun PenNameSetupContent(
    state: PenNameSetupUi,
    replace: Boolean,
    onType: (String) -> Unit,
    onShuffle: () -> Unit,
    onUse: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.s4)
                .padding(bottom = Spacing.s4)
                .navigationBarsPadding()
                .testTag("penNameSetup"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s4),
    ) {
        Text(
            text = if (replace) PenNameCopy.CHANGE_TITLE else PenNameCopy.CHOOSE_TITLE,
            style = PantopusTextStyle.h3,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() },
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
            // The picture is always drawn by Pantopus; nobody uploads one. A name already taken shows its own.
            PenNamePicture(
                url = state.current?.avatarUrl?.takeIf { !replace },
                size = 56.dp,
                modifier = Modifier.testTag("penNameSetupPicture"),
            )
            Text(
                text = state.chosenName ?: state.current?.name.orEmpty(),
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
                modifier = Modifier.testTag("penNameSetupPreview"),
            )
        }
        PantopusTextField(
            label = PenNameCopy.FIELD_LABEL,
            value = state.typed,
            onValueChange = onType,
            placeholder = state.suggestion.orEmpty(),
            state = state.error?.let { PantopusFieldState.Error(it) } ?: PantopusFieldState.Default,
            fieldTestTag = "penNameSetupField",
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        state.suggestion?.takeIf { state.typed.isBlank() }?.let { SuggestionRow(it, onShuffle) }
        PromiseList(state.promise)
        PrimaryButton(
            title = PenNameCopy.USE_THIS_NAME,
            onClick = onUse,
            isLoading = state.isSaving,
            isEnabled = state.canUse,
            modifier = Modifier.fillMaxWidth().testTag("penNameSetupUse"),
        )
    }
}

/** The name Pantopus gives when the field is left empty, with Shuffle. */
@Composable
private fun SuggestionRow(
    suggestion: String,
    onShuffle: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = PenNameCopy.LEAVE_EMPTY, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary)
            Text(
                text = suggestion,
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
                modifier = Modifier.testTag("penNameSetupSuggestion"),
            )
        }
        Row(
            modifier =
                Modifier
                    .clickable(role = Role.Button, onClick = onShuffle)
                    .padding(Spacing.s2)
                    .testTag("penNameSetupShuffle"),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
        ) {
            PantopusIconImage(icon = PantopusIcon.Shuffle, contentDescription = null, size = 16.dp, tint = PantopusColors.primary600)
            Text(
                text = PenNameCopy.SHUFFLE,
                style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.primary600,
            )
        }
    }
}

/** The promise's three sentences, as the server sends them. */
@Composable
private fun PromiseList(promise: List<String>) {
    Column(
        modifier = Modifier.testTag("penNameSetupPromise"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        promise.forEach { sentence ->
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
                PantopusIconImage(icon = PantopusIcon.ShieldCheck, contentDescription = null, size = 14.dp, tint = PantopusColors.slate)
                Text(text = sentence, style = PantopusTextStyle.caption, color = PantopusColors.appTextStrong)
            }
        }
    }
}
