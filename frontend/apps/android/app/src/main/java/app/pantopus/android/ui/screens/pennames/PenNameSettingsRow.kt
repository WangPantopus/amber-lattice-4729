@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.pennames

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * Settings (Privacy, under "How others see you"): the person's made-up name with its picture, and Change, which opens
 * the name screen with `replace: true` (the server's sentence shows there when it is too soon). A person without one
 * who may have one can choose it here; an account that can't use one sees no row.
 */
@Composable
fun PenNameSettingsRow(viewModel: PenNameSettingsViewModel = hiltViewModel(key = "penNameSettings")) {
    LaunchedEffect(Unit) { viewModel.load() }
    val me by viewModel.me.collectAsStateWithLifecycle()
    var showsSetup by rememberSaveable { mutableStateOf(false) }
    val current = me ?: return
    val pen = current.penName
    if (pen == null && !current.allowed) return
    val shape = RoundedCornerShape(Radii.lg)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .clickable(
                    role = Role.Button,
                    onClickLabel = if (pen != null) PenNameCopy.SETTINGS_CHANGE else PenNameCopy.SETTINGS_CHOOSE,
                ) {
                    showsSetup = true
                }.padding(Spacing.s4)
                .testTag("settingsMadeUpName"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PenNamePicture(url = pen?.avatarUrl, size = 40.dp)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
            Text(text = PenNameCopy.SETTINGS_TITLE, style = PantopusTextStyle.h3, color = PantopusColors.appText)
            if (pen != null) {
                Text(
                    text = pen.name,
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                    modifier = Modifier.testTag("settingsMadeUpNameValue"),
                )
                Text(text = PenNameCopy.ONLY_YOU, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary)
            } else {
                Text(text = PenNameCopy.SETTINGS_NONE, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary)
            }
        }
        Text(
            text = if (pen != null) PenNameCopy.SETTINGS_CHANGE else PenNameCopy.SETTINGS_CHOOSE,
            style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.primary600,
            modifier = Modifier.testTag("settingsMadeUpNameChange"),
        )
        PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 18.dp, tint = PantopusColors.appTextMuted)
    }
    if (showsSetup) {
        PenNameSetupSheet(
            replace = pen != null,
            onDone = {
                showsSetup = false
                viewModel.load()
            },
            onDismiss = { showsSetup = false },
        )
    }
}
