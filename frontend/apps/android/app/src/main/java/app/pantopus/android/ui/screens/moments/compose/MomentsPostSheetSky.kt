@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.compose

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.sky.SkyWords
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/*
 * The Post sheet's Sky rows (phase A, contract section 10.1), drawn only while the place preview answers `sky: true`:
 * "Pin it at a place" in place of "Show the area instead", the blue note at home, "Show elevation" greyed out at home,
 * and "Share later" with its times. The words are [SkyWords].
 */

/**
 * "Pin it at a place": off, "Pick a park, a shop or a venue nearby"; on, "Esther Short Park · Change" (Change opens the
 * place picker); at home greyed out, "Not available at home".
 */
@Composable
internal fun SkyPinRow(
    state: MomentsComposeUiState,
    onPinAtPlace: (Boolean) -> Unit,
    onFindPlace: () -> Unit,
) {
    val atHome = state.skyAtHome
    val enabled = !atHome && state.place?.canPin == true
    val name = state.skyPlaceName
    val line = name?.let { "$it · ${SkyWords.CHANGE}" } ?: if (atHome) SkyWords.PIN_NOT_AT_HOME else SkyWords.PIN_AT_PLACE_HINT
    SkySwitchRow(
        title = SkyWords.PIN_AT_PLACE,
        line = line,
        checked = state.pinsHere,
        enabled = enabled,
        tag = "moments.post.pin",
        onChange = onPinAtPlace,
    ) {
        if (name != null) {
            Text(
                text =
                    buildAnnotatedString {
                        append("$name · ")
                        withStyle(SpanStyle(color = PantopusColors.primary600, fontWeight = FontWeight.SemiBold)) {
                            append(SkyWords.CHANGE)
                        }
                    },
                fontSize = 12.5.sp,
                lineHeight = 16.sp,
                color = PantopusColors.appTextSecondary,
                maxLines = 1,
                modifier =
                    Modifier
                        .clickable(role = Role.Button, onClickLabel = SkyWords.CHANGE) { onFindPlace() }
                        .testTag("moments.post.pin.change"),
            )
        } else {
            SkyRowLine(line, muted = atHome)
        }
    }
}

/** At home: "You're at home, so this floats over the area". */
@Composable
internal fun SkyHomeNote() {
    Row(
        modifier =
            Modifier
                .padding(start = Spacing.s4, end = Spacing.s4, top = Spacing.s2)
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(PantopusColors.infoBg)
                .border(1.dp, PantopusColors.infoLight, RoundedCornerShape(14.dp))
                .padding(horizontal = 14.dp, vertical = Spacing.s3)
                .testTag("moments.post.home")
                .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PantopusIconImage(
            icon = PantopusIcon.Info,
            contentDescription = null,
            size = 20.dp,
            strokeWidth = 2.2f,
            tint = PantopusColors.info,
            modifier = Modifier.padding(top = 1.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = SkyWords.HOME_TITLE, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, color = PantopusColors.info)
            Text(text = SkyWords.HOME_BODY, fontSize = 13.sp, color = PantopusColors.appTextSecondary)
        }
    }
}

/** "Show elevation" at home: greyed out, "Not shown at home". */
@Composable
internal fun SkyGreyHeightRow() {
    SkySwitchRow(
        title = "Show elevation",
        line = SkyWords.HEIGHT_NOT_AT_HOME,
        checked = false,
        enabled = false,
        tag = "moments.post.height",
        onChange = {},
    )
}

/** "Share later": off, "Hold it until a time you pick"; on, "Shares at 6:40 pm" over the times on offer. */
@Composable
internal fun SkyShareLaterRow(
    state: MomentsComposeUiState,
    onShareLater: (Boolean) -> Unit,
    onChoice: (String) -> Unit,
) {
    val picked = state.shareLaterChoice
    SkySwitchRow(
        title = SkyWords.SHARE_LATER,
        line = state.sharesAt?.let(SkyWords::sharesAt) ?: SkyWords.SHARE_LATER_HINT,
        checked = picked != null,
        enabled = true,
        tag = "moments.post.shareLater",
        onChange = onShareLater,
    )
    if (picked == null) return
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s4).padding(top = Spacing.s1),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        state.shareLaterChoices.forEach { choice ->
            val on = choice.key == picked.key
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .height(36.dp)
                        .clip(RoundedCornerShape(Radii.lg))
                        .background(if (on) PantopusColors.primary600 else Color.Transparent)
                        .border(1.dp, if (on) PantopusColors.primary600 else PantopusColors.appBorder, RoundedCornerShape(Radii.lg))
                        .clickable(role = Role.RadioButton) { onChoice(choice.key) }
                        .testTag("moments.post.shareLater.${choice.key}")
                        .clearAndSetSemantics {
                            contentDescription = choice.label
                            role = Role.RadioButton
                            selected = on
                        },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = choice.label,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (on) Color.White else PantopusColors.appText,
                    maxLines = 1,
                )
            }
        }
    }
}

/** A switch row as the sheet's others are drawn, with its title and second line (or [line] drawn by [content]). */
@Composable
private fun SkySwitchRow(
    title: String,
    line: String,
    checked: Boolean,
    enabled: Boolean,
    tag: String,
    onChange: (Boolean) -> Unit,
    content: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.s5)
                .padding(top = 6.dp)
                .heightIn(min = 52.dp)
                .clickable(enabled = enabled, role = Role.Switch) { onChange(!checked) }
                .testTag(tag)
                .semantics(mergeDescendants = true) {
                    contentDescription = "$title. $line"
                    role = Role.Switch
                    selected = checked
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                text = title,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = if (enabled) PantopusColors.appText else PantopusColors.appTextMuted,
            )
            content?.invoke() ?: SkyRowLine(line, muted = !enabled)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            enabled = enabled,
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

@Composable
private fun SkyRowLine(
    line: String,
    muted: Boolean,
) {
    Text(
        text = line,
        fontSize = 12.5.sp,
        lineHeight = 16.sp,
        color = if (muted) PantopusColors.appTextMuted else PantopusColors.appTextSecondary,
    )
}
