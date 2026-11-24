package app.pantopus.android.ui.screens.homes.record

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.BuildConfig
import app.pantopus.android.data.homerecord.HomeRecordFixtures
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Radii
import coil.compose.AsyncImage

/**
 * The address a picture is read from: an https address as it is, a path starting with `/` on the API's own host,
 * and in a debug build a `fixture://` name from the debug assets.
 */
internal fun recordImageModel(url: String): String? =
    when {
        url.startsWith("https://") || url.startsWith("http://") -> url
        url.startsWith("fixture://") -> if (BuildConfig.DEBUG) HomeRecordFixtures.imageModel(url) else null
        url.startsWith("/") && !url.startsWith("//") -> BuildConfig.PANTOPUS_API_BASE_URL.trimEnd('/') + url
        else -> null
    }

/**
 * A photo from above, filling its box (cropped to fit), with the lot's [outline] drawn on it where the server sent
 * one: the photo outside the lot dims, and the lot is ringed white and green, as in the drawn screens.
 */
@Composable
internal fun RecordAerialPhoto(
    imageUrl: String,
    outline: List<List<Double>>?,
    height: Dp,
    description: String?,
    bottomStart: String? = null,
    bottomEnd: String? = null,
    bottomStartDark: Boolean = false,
) {
    var intrinsic by remember(imageUrl) { mutableStateOf<Size?>(null) }
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(height)
                .clip(RoundedCornerShape(Radii.lg))
                .background(PantopusColors.recordPhotoBg)
                .semantics { description?.let { contentDescription = it } },
    ) {
        recordImageModel(imageUrl)?.let { model ->
            AsyncImage(
                model = model,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                onSuccess = { state -> intrinsic = state.painter.intrinsicSize.takeIf { it.isSpecified() } },
                modifier = Modifier.fillMaxSize(),
            )
        }
        val points = outline?.mapNotNull { p -> if (p.size >= 2) Offset(p[0].toFloat(), p[1].toFloat()) else null }
        val source = intrinsic
        if (source != null && points != null && points.size >= MIN_OUTLINE_POINTS) {
            LotOutline(points, source)
        }
        bottomStart?.takeIf { it.isNotBlank() }?.let {
            PhotoChip(it, dark = bottomStartDark, modifier = Modifier.align(Alignment.BottomStart).padding(10.dp))
        }
        bottomEnd?.takeIf { it.isNotBlank() }?.let {
            PhotoChip(it, dark = true, modifier = Modifier.align(Alignment.BottomEnd).padding(10.dp))
        }
    }
}

/** A small photo for a year button. */
@Composable
internal fun RecordThumbnail(imageUrl: String) {
    Box(modifier = Modifier.fillMaxWidth().height(50.dp).background(PantopusColors.recordPhotoBg)) {
        recordImageModel(imageUrl)?.let {
            AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

private fun Size.isSpecified(): Boolean = width.isFinite() && height.isFinite() && width > 0f && height > 0f

/** The lot on a photo drawn with [ContentScale.Crop]: [points] are fractions of the whole photo ([source]). */
@Composable
private fun LotOutline(
    points: List<Offset>,
    source: Size,
) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val scale = maxOf(size.width / source.width, size.height / source.height)
        val dx = (size.width - source.width * scale) / 2f
        val dy = (size.height - source.height * scale) / 2f
        val lot =
            Path().apply {
                points.forEachIndexed { index, p ->
                    val x = dx + p.x * source.width * scale
                    val y = dy + p.y * source.height * scale
                    if (index == 0) moveTo(x, y) else lineTo(x, y)
                }
                close()
            }
        val dim =
            Path().apply {
                fillType = PathFillType.EvenOdd
                addRect(androidx.compose.ui.geometry.Rect(0f, 0f, size.width, size.height))
                addPath(lot)
            }
        drawPath(dim, PantopusColors.recordPhotoScrim.copy(alpha = SCRIM_ALPHA))
        val corner = PathEffect.cornerPathEffect(2.dp.toPx())
        drawPath(lot, PantopusColors.appSurface, style = Stroke(width = 3.dp.toPx(), join = StrokeJoin.Round, pathEffect = corner))
        drawPath(lot, PantopusColors.home, style = Stroke(width = 1.5.dp.toPx(), join = StrokeJoin.Round, pathEffect = corner))
    }
}

@Composable
private fun PhotoChip(
    text: String,
    dark: Boolean,
    modifier: Modifier,
) {
    val shape = RoundedCornerShape(Radii.pill)
    Text(
        text,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (dark) PantopusColors.appTextInverse else PantopusColors.appText,
        modifier =
            modifier
                .then(if (dark) Modifier else Modifier.shadow(2.dp, shape))
                .clip(shape)
                .background(if (dark) PantopusColors.appText else PantopusColors.appSurface)
                .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

private const val MIN_OUTLINE_POINTS = 3

/** The dimming outside the lot (34% in the drawn screens). */
private const val SCRIM_ALPHA = 0.34f
