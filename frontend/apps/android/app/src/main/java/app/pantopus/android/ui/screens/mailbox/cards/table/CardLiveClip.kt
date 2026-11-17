@file:Suppress("PackageNaming", "MagicNumber")

package app.pantopus.android.ui.screens.mailbox.cards.table

import android.content.Context
import android.graphics.SurfaceTexture
import android.media.MediaPlayer
import android.view.Surface
import android.view.TextureView
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.pantopus.android.PantopusApplication
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.UUID

/**
 * A card photo's moving part when it's a Live Photo (contract section 13): read through the signed-in client from the
 * card's own reader-checked route into a file in the app's cache, as a voice greeting is, and deleted when the opened
 * photo goes. It plays over the opened photo: once without sound as the photo opens, and with its sound while the photo
 * is held or after its LIVE button.
 */
@Stable
internal class CardLiveClip(
    private val context: Context,
    private val client: OkHttpClient,
    private val url: String,
) {
    /** Read and ready to play. */
    var ready by mutableStateOf(false)
        private set

    /** The moving part shows over the still. */
    var showing by mutableStateOf(false)
        private set

    /** The clip's own shape, width over height, once it's read. */
    var ratio by mutableStateOf<Float?>(null)
        private set

    private var player: MediaPlayer? = null
    private var file: File? = null
    private var surface: Surface? = null
    private var held = false

    /** Reads the clip. Quietly does nothing when it can't: the photo is still a photo. */
    suspend fun prepare() {
        if (player != null) return
        val read =
            withContext(Dispatchers.IO) {
                runCatching {
                    client.newCall(Request.Builder().url(url).build()).execute().use { answer ->
                        if (!answer.isSuccessful) return@use null
                        val folder = File(context.cacheDir, "card-media").apply { mkdirs() }
                        val out = File(folder, "live-${UUID.randomUUID()}.mp4")
                        answer.body?.byteStream()?.use { input -> out.outputStream().use { input.copyTo(it) } } ?: return@use null
                        out
                    }
                }.getOrNull()
            } ?: return
        file = read
        val media = MediaPlayer()
        val opened =
            runCatching {
                media.setDataSource(read.path)
                media.setOnCompletionListener { if (!held) showing = false }
                media.prepare()
            }.isSuccess
        if (!opened) {
            media.release()
            read.delete()
            file = null
            return
        }
        player = media
        if (media.videoWidth > 0 && media.videoHeight > 0) ratio = media.videoWidth.toFloat() / media.videoHeight
        surface?.let { runCatching { media.setSurface(it) } }
        ready = true
    }

    /** Where it draws. */
    fun draw(on: Surface?) {
        surface = on
        runCatching { player?.setSurface(on) }
    }

    /** Plays it through once from its start. */
    fun playOnce(muted: Boolean) {
        held = false
        start(muted)
    }

    /** A finger holds the photo: it plays, with its sound, for as long as it's held. */
    fun hold(holding: Boolean) {
        if (holding) {
            held = true
            start(muted = false)
        } else if (held) {
            held = false
            stop()
        }
    }

    fun stop() {
        runCatching { player?.takeIf { it.isPlaying }?.pause() }
        showing = false
    }

    private fun start(muted: Boolean) {
        val media = player ?: return
        runCatching {
            val volume = if (muted) 0f else 1f
            media.setVolume(volume, volume)
            media.seekTo(0)
            media.start()
        }.onSuccess { showing = true }
    }

    fun release() {
        runCatching { player?.release() }
        player = null
        file?.delete()
        file = null
        ready = false
        showing = false
    }
}

/** The clip of the Live Photo at [url], read as soon as the photo opens and let go when it closes; null for a still. */
@Composable
internal fun rememberCardLiveClip(url: String?): CardLiveClip? {
    url ?: return null
    val context = LocalContext.current
    val clip =
        remember(url) {
            val client =
                EntryPointAccessors
                    .fromApplication(context.applicationContext, PantopusApplication.CoilNetworkEntryPoint::class.java)
                    .okHttpClient()
            CardLiveClip(context.applicationContext, client, url)
        }
    LaunchedEffect(clip) { clip.prepare() }
    DisposableEffect(clip) { onDispose { clip.release() } }
    return clip
}

/** The moving part over the opened photo: the same place and size, enlarged and moved with it, shown while it plays. */
@Composable
internal fun CardLiveMoving(
    clip: CardLiveClip,
    view: PhotoView,
    ratio: Float,
    grown: () -> Float,
) {
    val seen by animateFloatAsState(if (clip.showing) 1f else 0f, tween(220), label = "cardLive")
    val density = LocalDensity.current
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        // In the photo's place, in the clip's own shape (the two are the same for a Live Photo; never stretched).
        val shape = clip.ratio ?: ratio
        val wide = with(density) { (view.fittedWide * (shape / ratio).coerceAtMost(1f)).toDp() }
        AndroidView(
            factory = { context ->
                TextureView(context).apply {
                    isOpaque = false
                    surfaceTextureListener =
                        object : TextureView.SurfaceTextureListener {
                            override fun onSurfaceTextureAvailable(
                                texture: SurfaceTexture,
                                width: Int,
                                height: Int,
                            ) = clip.draw(Surface(texture))

                            override fun onSurfaceTextureSizeChanged(
                                texture: SurfaceTexture,
                                width: Int,
                                height: Int,
                            ) = Unit

                            override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
                                clip.draw(null)
                                return true
                            }

                            override fun onSurfaceTextureUpdated(texture: SurfaceTexture) = Unit
                        }
                }
            },
            modifier =
                Modifier
                    .size(wide, wide / shape)
                    .graphicsLayer {
                        alpha = seen * grown()
                        scaleX = view.scale
                        scaleY = view.scale
                        translationX = view.offset.x
                        translationY = view.offset.y + view.pulled
                    }.clearAndSetSemantics {},
        )
    }
}

/** The small LIVE mark: on a print whose photo is a Live Photo, and on the button that plays it in the opened photo. */
@Composable
internal fun CardLiveMark(
    size: Float,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .height((size * 2.1f).dp)
                .background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(percent = 50))
                .padding(horizontal = (size * 0.7f).dp)
                .clearAndSetSemantics {},
        horizontalArrangement = Arrangement.spacedBy((size * 0.36f).dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size((size * 0.9f).dp).border((size * 0.13f).coerceAtLeast(1f).dp, Color.White, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size((size * 0.3f).dp).background(Color.White, CircleShape))
        }
        Text("LIVE", color = Color.White, fontSize = size.sp, lineHeight = 1.em, fontWeight = FontWeight.Bold, letterSpacing = 0.06.em)
    }
}

/** Plays the Live Photo once more, with its sound. 48 dp to touch. */
@Composable
internal fun CardLiveButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics { contentDescription = "Play the Live Photo" }
                .testTag("cardPhotoLive"),
        contentAlignment = Alignment.Center,
    ) {
        CardLiveMark(size = 12f)
    }
}
