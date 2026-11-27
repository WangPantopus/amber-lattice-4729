package app.pantopus.android.ui.screens.moments.compose.marks

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.components.keepsKeyboard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing

/**
 * "Pulse, reinvented"'s Studio, step 4: the ten letterings over Text's looks, each name written in its own font; the
 * picked one is filled. Shown only when the marks editor opens from the Studio.
 */
@Composable
internal fun StudioLetterings(
    picked: MomentFont,
    onPick: (MomentFont) -> Unit,
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth().keepsKeyboard().semantics { contentDescription = "Lettering" },
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        items(MomentFont.entries, key = { it.key }) { font ->
            val on = font == picked
            val family = remember(font) { FontFamily(font.typeface) }
            Box(
                modifier =
                    Modifier
                        .height(36.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (on) Color.White else PantopusColors.studioPillFill)
                        .then(if (on) Modifier else Modifier.border(1.dp, PantopusColors.studioPillOutline, RoundedCornerShape(18.dp)))
                        .clickable(role = Role.RadioButton) { onPick(font) }
                        .padding(horizontal = 14.dp)
                        .testTag("moments.marks.font.${font.key}")
                        .clearAndSetSemantics {
                            contentDescription = font.spoken
                            role = Role.RadioButton
                            selected = on
                        },
                contentAlignment = Alignment.Center,
            ) {
                Text(text = font.spoken, fontFamily = family, fontSize = 16.sp, color = if (on) PantopusColors.appText else Color.White)
            }
        }
    }
}
