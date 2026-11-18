@file:Suppress("PackageNaming", "MagicNumber", "LongMethod", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.mailbox.cards.table

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.rememberReduceMotion
import coil.compose.AsyncImage
import coil.memory.MemoryCache
import coil.request.CachePolicy
import coil.request.ImageRequest
import coil.size.Size
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * The photo a card's print opens: its reader-checked route, whose it is, the print's own small copy to show while the
 * full one is read ([thumbnail]), and where the print's photo lies in the window and how it's turned ([origin],
 * [originTilt]; null where no table is under it, and the photo fades in).
 */
internal data class CardPhotoOpened(
    val photo: CardPrintPhoto,
    val fromFirst: String,
    val thumbnail: MemoryCache.Key? = null,
    val origin: Rect? = null,
    val originTilt: Float = 0f,
)

/**
 * A card's own photo over the whole screen (the founder, November 16): dark like a photo viewer. It grows out of the
 * print it was opened from and goes back into it. Pinch or double-tap enlarges it, up to twice the photo's own size;
 * a finger moves around it; pulling it down, the close button or Back puts it back. Its bytes come only from the
 * print's route, read at their own size and kept in memory, never on disk.
 *
 * A Live Photo (contract section 13) moves once as it opens, without its sound, and again with its sound while it's
 * held or after its LIVE button ([CardLiveClip]).
 */
@Composable
internal fun CardPhotoViewer(
    opened: CardPhotoOpened,
    onClose: () -> Unit,
) {
    val reduceMotion = rememberReduceMotion()
    val scope = rememberCoroutineScope()
    val grown = remember { Animatable(0f) }
    val view = remember(opened) { PhotoView(scope) }
    var closing by remember { mutableStateOf(false) }
    val clip = rememberCardLiveClip(opened.photo.liveUrl)

    fun close() {
        if (closing) return
        closing = true
        clip?.stop()
        scope.launch {
            view.rest()
            grown.animateTo(0f, if (reduceMotion) tween(120) else spring(dampingRatio = 1f, stiffness = 420f))
            onClose()
        }
    }
    view.onPulledAway = ::close
    view.onHold = { held -> clip?.hold(held) }
    // It moves once as it opens, without its sound (nothing should startle); with Reduce Motion it waits to be asked.
    LaunchedEffect(clip?.ready) {
        if (clip?.ready == true && !reduceMotion) {
            delay(550)
            if (!closing) clip.playOnce(muted = true)
        }
    }
    LaunchedEffect(Unit) {
        grown.animateTo(1f, if (reduceMotion) tween(150) else spring(dampingRatio = 0.86f, stiffness = 380f))
    }
    BackHandler(onBack = ::close)
    val who = opened.fromFirst.ifBlank { "them" }
    val words = opened.photo.alt?.takeIf { it.isNotBlank() }?.let { "Photo: $it" } ?: "Photo from $who"
    BoxWithConstraints(
        modifier =
            Modifier
                .fillMaxSize()
                .drawBehind { drawRect(Color.Black, alpha = grown.value * (1f - view.pulledShare * 0.75f)) }
                // Nothing under the photo takes a touch while it's open.
                .pointerInput(Unit) { detectTapGestures {} }
                .semantics { paneTitle = "Photo" }
                .testTag("cardPhotoViewer"),
    ) {
        val wide = constraints.maxWidth.toFloat()
        val tall = constraints.maxHeight.toFloat()
        val ratio = opened.photo.ratio
        val fitted = min(wide, tall * ratio)
        view.fit(wide, tall, fitted, fitted / ratio)
        PhotoPicture(opened, view, words, reduceMotion) { grown.value }
        if (clip != null) {
            CardLiveMoving(clip, view, opened.photo.ratio) { grown.value }
            if (clip.ready) {
                val bottom = with(LocalDensity.current) { WindowInsets.safeDrawing.getBottom(this).toDp() }
                CardLiveButton(
                    onClick = { clip.playOnce(muted = false) },
                    modifier =
                        Modifier
                            .align(Alignment.BottomStart)
                            .padding(start = 8.dp, bottom = bottom + 10.dp)
                            .alpha((grown.value * (1f - view.pulledShare)).coerceIn(0f, 1f)),
                )
            }
        }
        val top = with(LocalDensity.current) { WindowInsets.safeDrawing.getTop(this).toDp() }
        Box(
            modifier =
                Modifier
                    .padding(start = 8.dp, top = top + 6.dp)
                    .alpha((grown.value * (1f - view.pulledShare)).coerceIn(0f, 1f)),
        ) {
            RoundButton(PantopusIcon.X, "Close the photo", "cardPhotoClose", enabled = !closing, onClick = ::close)
        }
    }
}

@Composable
private fun PhotoPicture(
    opened: CardPhotoOpened,
    view: PhotoView,
    words: String,
    reduceMotion: Boolean,
    grown: () -> Float,
) {
    val context = LocalContext.current
    var failed by remember(opened) { mutableStateOf(false) }
    val request =
        remember(opened) {
            ImageRequest
                .Builder(context)
                .data(opened.photo.url)
                // The photo at its own size, so enlarging shows what's really in it; the print's copy meanwhile.
                .size(Size.ORIGINAL)
                .placeholderMemoryCacheKey(opened.thumbnail)
                .diskCachePolicy(CachePolicy.DISABLED)
                .build()
        }
    AsyncImage(
        model = request,
        contentDescription = words,
        contentScale = ContentScale.Fit,
        onSuccess = { result ->
            failed = false
            view.ownWidth = result.result.drawable.intrinsicWidth.toFloat()
        },
        onError = { failed = true },
        modifier =
            Modifier
                .fillMaxSize()
                .photoGestures(view)
                .graphicsLayer {
                    val t = grown()
                    val from = opened.origin
                    if (from == null || reduceMotion) {
                        // No print to grow from: it fades in, a touch smaller.
                        alpha = t
                        val size = if (reduceMotion) 1f else 0.94f + 0.06f * t
                        scaleX = size * view.scale
                        scaleY = size * view.scale
                    } else {
                        val small = from.width / max(1f, view.fittedWide)
                        val size = small + (1f - small) * t
                        scaleX = size * view.scale
                        scaleY = size * view.scale
                        rotationZ = opened.originTilt * (1f - t)
                        translationX = (from.center.x - view.wide / 2f) * (1f - t)
                        translationY = (from.center.y - view.tall / 2f) * (1f - t)
                    }
                    translationX += view.offset.x
                    translationY += view.offset.y + view.pulled
                }.testTag("cardPhotoFull"),
    )
    if (failed) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                "This photo couldn’t be loaded. Check your connection.",
                color = PantopusColors.tableCream,
                fontSize = 15.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 32.dp).semantics { contentDescription = "This photo couldn’t be loaded." },
            )
        }
    }
}

/** The opened photo under the fingers: how much it's enlarged, where it's been moved to, and how far it's pulled down. */
@Stable
internal class PhotoView(
    private val scope: CoroutineScope,
) {
    var scale by mutableFloatStateOf(1f)
        private set
    var offset by mutableStateOf(Offset.Zero)
        private set

    /** Pulled down at its resting size, in px. */
    var pulled by mutableFloatStateOf(0f)
        private set

    /** The photo's own width in pixels, once it's read. */
    var ownWidth = 0f
    var onPulledAway: () -> Unit = {}

    /** A finger holds the photo still, or lets go. */
    var onHold: (Boolean) -> Unit = {}

    /** The window, and the photo fitted to it at its resting size, in px. */
    var wide = 0f
        private set
    var tall = 0f
        private set
    var fittedWide = 0f
        private set
    private var fittedTall = 0f

    /** 0 at rest, 1 once it's pulled well down. */
    val pulledShare: Float get() = if (tall <= 0f) 0f else (pulled / (tall * 0.3f)).coerceIn(0f, 1f)

    val enlarged: Boolean get() = scale > 1.01f

    /** Up to twice the photo's own size on this screen, and never less than three times the fitted one. */
    private val most: Float get() = max(3f, if (fittedWide > 0f) ownWidth / fittedWide * 2f else 3f)

    fun fit(
        width: Float,
        height: Float,
        photoWide: Float,
        photoTall: Float,
    ) {
        if (width == wide && height == tall) return
        wide = width
        tall = height
        fittedWide = photoWide
        fittedTall = photoTall
        scale = 1f
        offset = Offset.Zero
        pulled = 0f
    }

    /** Never so far that the photo's edge comes in from the screen's. */
    private fun kept(
        at: Offset,
        size: Float,
    ): Offset {
        val reachX = max(0f, (fittedWide * size - wide) / 2f)
        val reachY = max(0f, (fittedTall * size - tall) / 2f)
        return Offset(at.x.coerceIn(-reachX, reachX), at.y.coerceIn(-reachY, reachY))
    }

    /** Two fingers, or one on the enlarged photo: [zoom] about [centroid], moved by [pan]. */
    fun transform(
        centroid: Offset,
        pan: Offset,
        zoom: Float,
    ) {
        val next = (scale * zoom).coerceIn(1f, most)
        // The point under the fingers stays under them.
        val middle = Offset(wide / 2f, tall / 2f)
        val change = next / scale
        val moved = (offset - (centroid - middle)) * change + (centroid - middle) + pan
        scale = next
        offset = kept(moved, next)
        pulled = 0f
    }

    /** One finger on the photo at its resting size: only down, and it follows the finger. */
    fun pull(by: Float) {
        pulled = max(0f, pulled + by)
    }

    /** The finger lifted: far enough down or flicked down, it goes back to its print; otherwise it settles. */
    fun letGo(velocity: Float) {
        if (scale < 1.06f && scale != 1f) settle(1f, Offset.Zero)
        if (pulled <= 0f) return
        if (pulled > tall * 0.14f || (velocity > 900f && pulled > 24f)) onPulledAway() else rest()
    }

    /** A double-tap: enlarged about that spot, or back to its size. */
    fun doubleTap(at: Offset) {
        if (enlarged) {
            settle(1f, Offset.Zero)
            return
        }
        val size = min(most, 2.5f)
        val middle = Offset(wide / 2f, tall / 2f)
        settle(size, kept((middle - at) * (size - 1f), size))
    }

    /** Back from a pull that didn't close it. */
    fun rest() {
        val from = pulled
        if (from <= 0f) return
        scope.launch { Animatable(from).animateTo(0f, spring(dampingRatio = 1f, stiffness = 420f)) { pulled = value } }
    }

    private fun settle(
        size: Float,
        at: Offset,
    ) {
        val fromSize = scale
        val fromAt = offset
        scope.launch {
            Animatable(0f).animateTo(1f, spring(dampingRatio = 1f, stiffness = 380f)) {
                scale = fromSize + (size - fromSize) * value
                offset = fromAt + (at - fromAt) * value
            }
        }
    }
}

/**
 * The fingers on the opened photo: a pinch enlarges it about the fingers, a drag moves around it while it's enlarged
 * and pulls it down while it isn't, and a double-tap enlarges it or brings it back. A touch that hasn't moved past the
 * slop is left alone, so the double-tap still reads it.
 */
private fun Modifier.photoGestures(view: PhotoView): Modifier =
    pointerInput(view) {
        detectTapGestures(
            onDoubleTap = { view.doubleTap(it) },
            // Held still, a Live Photo plays for as long as it's held.
            onLongPress = { view.onHold(true) },
            onPress = {
                tryAwaitRelease()
                view.onHold(false)
            },
        )
    }
        .pointerInput(view) {
            val slop = viewConfiguration.touchSlop
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false)
                var moved = Offset.Zero
                var pinched = 1f
                var past = false
                var lastTime = 0L
                var speed = 0f
                do {
                    val event = awaitPointerEvent()
                    val fingers = event.changes.count { it.pressed }
                    val zoom = event.calculateZoom()
                    val pan = event.calculatePan()
                    if (!past) {
                        moved += pan
                        pinched *= zoom
                        past = moved.getDistance() > slop || abs(1f - pinched) * 200f > slop
                    }
                    if (past) {
                        if (fingers > 1 || view.enlarged) {
                            view.transform(event.calculateCentroid(useCurrent = false), pan, zoom)
                        } else {
                            view.pull(pan.y)
                            // How fast it's going down, in px a second, for a flick.
                            val now = event.changes.first().uptimeMillis
                            if (lastTime in 1 until now) speed = pan.y / (now - lastTime) * 1000f
                            lastTime = now
                        }
                        event.changes.forEach { if (it.positionChanged()) it.consume() }
                    }
                } while (event.changes.any { it.pressed })
                view.letGo(speed)
            }
        }
