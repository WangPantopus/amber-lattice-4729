package app.pantopus.android.sharein

import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Bundle
import android.webkit.MimeTypeMap
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.IntentCompat
import androidx.lifecycle.lifecycleScope
import app.pantopus.android.MainActivity
import app.pantopus.android.ui.theme.PantopusTheme
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/**
 * Pantopus in another app's share sheet (founder, 2026-11-27): Photos, Chrome or any app that shares a photo, a
 * video, a link or words. It shows who is sharing and a card for each place in Pantopus the thing can go (Moment,
 * Pulse, Message, Mail, Plan); a tap copies it into the app and opens the tabs on that composer ([ShareInInbox]). A
 * place or a chat picked in the share sheet's top row ([ShareInShortcuts]) skips the cards. Parity twin of iOS `PantopusShare`.
 */
class ShareInActivity : ComponentActivity() {
    private var ui by mutableStateOf(ShareInUi())
    private var copying: Deferred<Shared?>? = null

    /** What was shared, once copied: the files' names in the share folder, and the words. */
    private class Shared(
        val files: List<String>,
        val text: String,
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val account = ShareInAccountStore.read(this)
        val uris = sharedUris()
        val text = sharedText()
        ui =
            ShareInUi(
                name = account?.name,
                signedIn = account != null,
                destinations =
                    account?.destinations.orEmpty().filter {
                        when (it) {
                            // A Moment is a photo or a video; a card carries a photo.
                            ShareInDestination.Moments -> uris.isNotEmpty()
                            ShareInDestination.Mail -> uris.any(::isImage)
                            else -> true
                        }
                    },
            )
        setContent {
            PantopusTheme {
                ShareInSheet(
                    ui = ui,
                    onPick = ::pick,
                    onOpenApp = ::openApp,
                    onCancel = ::finish,
                )
            }
        }
        if (account == null) return
        if (uris.isEmpty() && text.isBlank()) {
            ui = ui.copy(failure = "Pantopus can't open this.")
            return
        }
        copying = lifecycleScope.async { copy(uris, text) }
        // A place or a chat tapped in the share sheet's top row: no cards.
        val shortcut = intent.getStringExtra(SHORTCUT_ID)
        val chat = ShareInShortcuts.chat(this, shortcut)
        val destination = if (chat != null) ShareInDestination.Messages else ShareInShortcuts.destination(shortcut)
        if (destination != null && destination in ui.destinations) {
            ui = ui.copy(goingTo = chat?.name ?: destination.title)
            pick(destination, chat)
        }
    }

    private fun sharedUris(): List<Uri> =
        when (intent.action) {
            Intent.ACTION_SEND -> listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
            Intent.ACTION_SEND_MULTIPLE ->
                IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
            else -> emptyList()
        }.take(MOST_FILES)

    private fun isImage(uri: Uri): Boolean = (contentResolver.getType(uri) ?: intent.type.orEmpty()).startsWith("image/")

    /** A page's title and its link, or words: one under the other. */
    private fun sharedText(): String =
        listOfNotNull(intent.getStringExtra(Intent.EXTRA_SUBJECT), intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString())
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinct()
            .joinToString("\n")

    /** Copies each photo and video into the share folder: the other app's permission to read them ends with this screen. */
    private suspend fun copy(
        uris: List<Uri>,
        text: String,
    ): Shared? =
        withContext(Dispatchers.IO) {
            ShareInInbox.sweep(this@ShareInActivity)
            val folder = shareInFolder(this@ShareInActivity)
            val files =
                uris.mapNotNull { uri ->
                    runCatching {
                        val type = contentResolver.getType(uri) ?: intent.type.orEmpty()
                        val ending =
                            MimeTypeMap.getSingleton().getExtensionFromMimeType(type)
                                ?: if (type.startsWith("video/")) "mp4" else "jpg"
                        val file = File(folder, "${ShareInRequest.FILE_PREFIX}${UUID.randomUUID()}.$ending")
                        contentResolver.openInputStream(uri)?.use { input -> file.outputStream().use(input::copyTo) }
                            ?: return@runCatching null
                        if (ui.thumbnail == null) {
                            thumbnail(file, type)?.let { small -> withContext(Dispatchers.Main) { ui = ui.copy(thumbnail = small) } }
                        }
                        file.name
                    }.getOrNull()
                }
            if (files.isEmpty() && (uris.isNotEmpty() || text.isBlank())) {
                withContext(Dispatchers.Main) { ui = ui.copy(failure = "Couldn't read what you shared. Try again.") }
                null
            } else {
                Shared(files, text)
            }
        }

    /** The picture itself for a photo (the card draws it small); a video's first frame. */
    private fun thumbnail(
        file: File,
        type: String,
    ): Any? {
        if (!type.startsWith("video/")) return file
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.path)
            retriever.getFrameAtTime(0)?.let { frame ->
                val scale = THUMBNAIL_PX.toFloat() / maxOf(frame.width, frame.height, 1)
                if (scale >= 1f) {
                    frame
                } else {
                    Bitmap.createScaledBitmap(frame, (frame.width * scale).toInt(), (frame.height * scale).toInt(), true)
                }
            }
        } catch (_: RuntimeException) {
            null
        } finally {
            retriever.release()
        }
    }

    /** The card tapped: once the copy is done the tabs open on that composer. */
    private fun pick(
        destination: ShareInDestination,
        chat: ShareInChat? = null,
    ) {
        val account = ShareInAccountStore.read(this) ?: return
        if (ui.sending != null) return
        ui = ui.copy(sending = destination)
        lifecycleScope.launch {
            val shared = copying?.await()
            if (shared == null) {
                ui = ui.copy(sending = null, goingTo = null)
                return@launch
            }
            ShareInInbox.leave(ShareInRequest(destination, account.userId, shared.files, shared.text, chat))
            openApp()
        }
    }

    /** Brings the app's own screen forward; this one closes behind it. */
    private fun openApp() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }

    private companion object {
        /** `Intent.EXTRA_SHORTCUT_ID`, by its value: the constant is newer than the oldest Android the app runs on. */
        const val SHORTCUT_ID = "android.intent.extra.shortcut.ID"
        const val MOST_FILES = 10
        const val THUMBNAIL_PX = 600
    }
}

/** What the sheet shows. */
data class ShareInUi(
    val name: String? = null,
    val signedIn: Boolean = false,
    val destinations: List<ShareInDestination> = emptyList(),
    /** The first photo (its file) or the first video's first frame (a bitmap); null for a link or words. */
    val thumbnail: Any? = null,
    val failure: String? = null,
    /** The card that was tapped: it spins until the copy is done and the app opens. */
    val sending: ShareInDestination? = null,
    /** A place or chat picked in the share sheet itself: its name, shown instead of the cards. */
    val goingTo: String? = null,
)
