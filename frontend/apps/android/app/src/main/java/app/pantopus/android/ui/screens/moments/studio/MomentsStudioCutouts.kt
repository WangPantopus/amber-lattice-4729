@file:Suppress("MagicNumber")
@file:OptIn(ExperimentalFoundationApi::class)

package app.pantopus.android.ui.screens.moments.studio

import android.graphics.BitmapFactory
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.moments.MomentMediaFile
import app.pantopus.android.ui.screens.moments.compose.MomentsComposeUiState
import app.pantopus.android.ui.screens.moments.compose.marks.MomentCutoutStore
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.max

/*
 * "Pulse, reinvented"'s Studio, phase 0 step 4: cutouts (iPhone #4985). A long press on the Studio's photo lifts the thing
 * under the finger ([MomentCutoutLift]) where it was; "Your cutouts" in the tray puts one kept on this phone in the middle.
 */

/**
 * Over the Studio's photo (filling the screen, cropped as it is drawn): a long press calls [onLift] with where the finger
 * was, as shares of the picture.
 */
@Composable
internal fun StudioCutoutPress(
    state: MomentsComposeUiState,
    onLift: (Float, Float) -> Unit,
) {
    val photo = (state.media as? MomentMediaFile.Photo)?.file ?: return
    val pictureSize by produceState<IntSize?>(null, photo) {
        value =
            withContext(Dispatchers.IO) {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(photo.path, bounds)
                IntSize(bounds.outWidth, bounds.outHeight).takeIf { it.width > 0 && it.height > 0 }
            }
    }
    val lift by rememberUpdatedState(onLift)
    val shown by rememberUpdatedState(pictureSize)
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures(onLongPress = { at ->
                        val picture = shown ?: return@detectTapGestures
                        // The photo fills the screen, cropped: where the finger was on the picture itself.
                        val scale = max(size.width / picture.width.toFloat(), size.height / picture.height.toFloat())
                        val left = (size.width - picture.width * scale) / 2
                        val top = (size.height - picture.height * scale) / 2
                        lift((at.x - left) / (picture.width * scale), (at.y - top) / (picture.height * scale))
                    })
                }.testTag("moments.studio.cutoutPress")
                .semantics {
                    customActions =
                        listOf(
                            CustomAccessibilityAction("Lift the thing in the middle as a cutout") {
                                lift(0.5f, 0.5f)
                                true
                            },
                        )
                },
    )
}

/** "Your cutouts" in the tray: the ones [account] kept on this phone, newest first. A tap places one; a long press offers Remove. */
@Composable
internal fun StudioYourCutoutsRow(
    account: String?,
    onPlace: (File) -> Unit,
) {
    val context = LocalContext.current
    var changed by remember { mutableIntStateOf(0) }
    val kept by produceState<List<Pair<File, ImageBitmap>>>(emptyList(), changed, account) {
        value =
            withContext(Dispatchers.IO) {
                MomentCutoutStore.list(context, account).mapNotNull { file ->
                    MomentCutoutStore.read(file)?.let { file to it.asImageBitmap() }
                }
            }
    }
    if (kept.isEmpty()) return
    var removing by remember { mutableStateOf<File?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Text(
            text = "Your cutouts",
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        LazyRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            items(kept, key = { it.first.name }) { (file, image) ->
                val shape = RoundedCornerShape(12.dp)
                Box(
                    contentAlignment = Alignment.Center,
                    modifier =
                        Modifier
                            .size(64.dp)
                            .clip(shape)
                            .background(PantopusColors.studioPillFill)
                            .border(1.dp, PantopusColors.studioPillOutline, shape)
                            .combinedClickable(
                                onClick = { if (removing == file) removing = null else onPlace(file) },
                                onLongClick = { removing = file },
                            ).testTag("moments.studio.yourCutout")
                            .clearAndSetSemantics {
                                contentDescription = "A cutout you kept. Puts it in the middle of the photo."
                                customActions =
                                    listOf(
                                        CustomAccessibilityAction("Remove from your cutouts") {
                                            MomentCutoutStore.remove(file)
                                            changed++
                                            true
                                        },
                                    )
                            },
                ) {
                    Image(bitmap = image, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(56.dp))
                    if (removing == file) {
                        Text(
                            text = "Remove",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier =
                                Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(PantopusColors.momentDim)
                                    .combinedClickable(onClick = {
                                        MomentCutoutStore.remove(file)
                                        removing = null
                                        changed++
                                    })
                                    .testTag("moments.studio.yourCutout.remove"),
                        )
                    }
                }
            }
        }
    }
}
