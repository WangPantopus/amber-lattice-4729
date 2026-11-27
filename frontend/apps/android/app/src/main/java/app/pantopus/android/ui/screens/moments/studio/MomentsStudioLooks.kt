@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.studio

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.screens.moments.compose.marks.MomentLook
import app.pantopus.android.ui.screens.moments.compose.marks.MomentLooks
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.max
import kotlin.math.roundToInt

/** The looks' small copies are read at this many pixels on their long side. */
private const val LOOK_SAMPLE = 192

/**
 * "Film looks" in the Studio's Stamps and Play tray (phase 0 step 5, iPhone #5019), for a photo: the eight looks, each
 * shown on a small copy of the photo as it came; the one on the photo is ringed. A tap puts it on (Original takes it
 * off). The copies wait for [picture] (the photo as it came, read when the tray opens).
 */
@Composable
internal fun StudioLooksRow(
    picture: Bitmap?,
    picked: MomentLook,
    onPick: (MomentLook) -> Unit,
) {
    val copies by produceState<Map<MomentLook, ImageBitmap>>(emptyMap(), picture) {
        val source = picture ?: return@produceState
        value =
            withContext(Dispatchers.Default) {
                val scale = LOOK_SAMPLE.toFloat() / max(source.width, source.height).coerceAtLeast(1)
                val small =
                    Bitmap.createScaledBitmap(
                        source,
                        (source.width * scale).roundToInt().coerceAtLeast(1),
                        (source.height * scale).roundToInt().coerceAtLeast(1),
                        true,
                    )
                MomentLook.entries.associateWith { MomentLooks.applied(small, it).asImageBitmap() }
            }
    }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Text(
            text = "Film looks",
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        LazyRow(
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Film looks" },
            horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            items(MomentLook.entries, key = { it.key }) { look ->
                LookChip(look = look, copy = copies[look], on = look == picked) { onPick(look) }
            }
        }
    }
}

/** One look: the small copy (a plain tile until it's ready) over its name, ringed white while it's on the photo. */
@Composable
private fun LookChip(
    look: MomentLook,
    copy: ImageBitmap?,
    on: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.s1),
        modifier =
            Modifier
                .clickable(role = Role.RadioButton, onClick = onClick)
                .testTag("moments.studio.look.${look.key}")
                .clearAndSetSemantics {
                    contentDescription = "${look.spoken} look"
                    role = Role.RadioButton
                    selected = on
                },
    ) {
        Box(
            modifier =
                Modifier
                    .size(64.dp)
                    .clip(shape)
                    .background(PantopusColors.studioPillFill)
                    .border(if (on) 3.dp else 1.dp, if (on) Color.White else PantopusColors.studioPillOutline, shape),
        ) {
            copy?.let { Image(bitmap = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(64.dp)) }
        }
        Text(
            text = look.spoken,
            color = if (on) Color.White else PantopusColors.studioPillSecondary,
            fontSize = 12.sp,
            fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

/** "Photostrip" in the tray, while photos picked with this one wait: [more] of them join it in one strip. */
@Composable
internal fun StudioPhotostripRow(
    more: Int,
    onMake: () -> Unit,
) {
    val words = if (more == 1) "This and the next photo in one strip" else "This and the next $more photos in one strip"
    val shape = RoundedCornerShape(19.dp)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Text(
            text = "Photostrip",
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = words,
            color = Color.White,
            fontSize = 14.5.sp,
            fontWeight = FontWeight.SemiBold,
            modifier =
                Modifier
                    .clip(shape)
                    .background(PantopusColors.studioPillFill)
                    .border(1.dp, PantopusColors.studioPillOutline, shape)
                    .clickable(role = Role.Button, onClick = onMake)
                    .padding(horizontal = 14.dp, vertical = Spacing.s2)
                    .testTag("moments.studio.photostrip"),
        )
    }
}
