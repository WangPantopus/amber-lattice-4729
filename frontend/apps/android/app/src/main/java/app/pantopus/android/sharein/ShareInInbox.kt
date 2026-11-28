package app.pantopus.android.sharein

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

/*
 * What another app's share sheet handed to Pantopus (founder, 2026-11-27). ShareInActivity copies the photos and
 * videos into the app's share folder, keeps a shared link or words as a small text file there, and leaves here where
 * the person sent them; the tabs (RootTabScreen) read it and open that composer: the Moments composer, the Pulse
 * composer, a chat, one of the person's plans' chats ([ShareInPlansScreen]) or the Christmas card flow, where the
 * photo goes on the card at "Write on the back" ([ShareInCardPhoto]). Parity twin of iOS `ShareInbox.swift`
 * and `ShareInCoordinator.swift`. It lives in memory only: both ends are this app's own process.
 */

/** Where in Pantopus a shared thing goes: the cards ShareInActivity shows. */
enum class ShareInDestination(
    /** The button under the card. */
    val title: String,
    /** What TalkBack says for the card. */
    val spoken: String,
    val tag: String,
) {
    Moments("Moment", "Post as a Moment", "moments"),
    Pulse("Pulse", "Post to Pulse", "pulse"),
    Messages("Message", "Send in a message", "messages"),
    Mail("Mail", "Send as a card in Mail", "mail"),
    Plans("Plan", "Share with a plan", "plans"),
}

/** A chat the share sheet offered by name (a Direct Share target): the thing goes straight to it. */
data class ShareInChat(
    /** `room` or `person`, as the chat's route names them. */
    val kind: String,
    val id: String,
    val name: String,
)

/** One share: what was shared, by its files' names in the share folder, and where the person sent it. */
data class ShareInRequest(
    val destination: ShareInDestination,
    /** The account that was signed in when it was shared; another account never opens it. */
    val account: String,
    val files: List<String>,
    /** Shared words and a shared link, one under the other; empty with none. */
    val text: String,
    val chat: ShareInChat? = null,
) {
    /**
     * What a chat's composer takes: the first photo or video, or the words. A chat opens with one shared file
     * waiting, so words travel as a file too ([TEXT_SUFFIX]) and the chat puts them in its text box.
     */
    fun chatFile(context: Context): String? =
        files.firstOrNull() ?: text.takeIf { it.isNotBlank() }?.let { words ->
            val name = "$FILE_PREFIX${java.util.UUID.randomUUID()}$TEXT_SUFFIX"
            runCatching { File(shareInFolder(context), name).writeText(words) }.getOrNull()?.let { name }
        }

    companion object {
        /** Every file a share leaves in the share folder starts with this. */
        const val FILE_PREFIX = "shared-in-"

        /** Shared words, kept as a file for a chat to read into its text box. */
        const val TEXT_SUFFIX = ".words"
    }
}

/** The share folder: the one Today's sky uses for "Or share in Pantopus", which the composer and chats read by name. */
fun shareInFolder(context: Context): File = File(context.cacheDir, "share").apply { mkdirs() }

/** A file a share left in the share folder, by its name; null for any other name. */
fun shareInFile(
    context: Context,
    name: String?,
): File? {
    if (name.isNullOrBlank() || name.contains('/') || !name.startsWith(ShareInRequest.FILE_PREFIX)) return null
    return File(shareInFolder(context), name).takeIf { it.isFile }
}

object ShareInInbox {
    private val _pending = MutableStateFlow<ShareInRequest?>(null)

    /** The share waiting for the tabs to open it. */
    val pending: StateFlow<ShareInRequest?> = _pending.asStateFlow()

    fun leave(request: ShareInRequest) {
        _pending.value = request
    }

    /** The tabs took it: it opens once. */
    fun take(): ShareInRequest? = _pending.value.also { _pending.value = null }

    /** Files of shares nobody opened, older than an hour: dropped the next time something is shared. */
    fun sweep(
        context: Context,
        now: Long = System.currentTimeMillis(),
    ) {
        shareInFolder(context).listFiles { file -> file.name.startsWith(ShareInRequest.FILE_PREFIX) }?.forEach { file ->
            if (now - file.lastModified() > KEEP_MS) file.delete()
        }
    }

    private const val KEEP_MS = 60 * 60 * 1000L
}

/** Who is signed in, for the "Sharing as" line, and the places they can share to. */
data class ShareInAccount(
    val userId: String,
    val name: String,
    val destinations: List<ShareInDestination>,
)

/**
 * The share sheet can open ShareInActivity before the app has read its session (a cold start), so the tabs leave who
 * is signed in and where they can share here each time they open, and signing out clears it.
 */
object ShareInAccountStore {
    private const val PREFS = "share_in"
    private const val USER = "user"
    private const val NAME = "name"
    private const val DESTINATIONS = "destinations"

    fun read(context: Context): ShareInAccount? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val userId = prefs.getString(USER, null)?.takeIf { it.isNotBlank() } ?: return null
        val tags = prefs.getString(DESTINATIONS, "").orEmpty().split(',')
        return ShareInAccount(
            userId = userId,
            name = prefs.getString(NAME, "").orEmpty(),
            destinations = ShareInDestination.entries.filter { it.tag in tags },
        )
    }

    /** Also publishes the share sheet's shortcuts for the same places ([ShareInShortcuts]). */
    fun write(
        context: Context,
        account: ShareInAccount,
    ) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(USER, account.userId)
            .putString(NAME, account.name)
            .putString(DESTINATIONS, account.destinations.joinToString(",") { it.tag })
            .apply()
        ShareInShortcuts.publish(context, account.destinations)
    }

    /** Nobody is signed in: no name, no places, no shortcuts, and nothing shared stays on the phone. */
    fun clear(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(USER, null) == null) return
        prefs.edit().clear().apply()
        ShareInShortcuts.clear(context)
        ShareInInbox.take()
        ShareInCardPhoto.clear()
        ShareInInbox.sweep(context, now = Long.MAX_VALUE)
    }
}

/**
 * A photo shared from another app to Mail: it waits here while the person picks a card and who it's for, and goes on
 * the card when "Write on the back" shows its "Add a photo", as if picked there. A card carries one photo, for one
 * person, sent with a bought stamp; where the card can't take it, it stays here and the row says why, as it does for
 * a picked one. It waits an hour, then is dropped. Parity twin of iOS `ShareInCardPhoto.swift`.
 */
object ShareInCardPhoto {
    private val _waiting = MutableStateFlow<String?>(null)

    /** The photo's file name in the share folder while one is waiting for a card. */
    val waiting: StateFlow<String?> = _waiting.asStateFlow()
    private var leftAt = 0L

    fun leave(
        fileName: String,
        now: Long = System.currentTimeMillis(),
    ) {
        leftAt = now
        _waiting.value = fileName
    }

    /** The card takes it: once. */
    fun take(
        context: Context,
        now: Long = System.currentTimeMillis(),
    ): File? {
        val name = _waiting.value ?: return null
        _waiting.value = null
        if (now - leftAt > KEEP_MS) return null
        return shareInFile(context, name)
    }

    fun clear() {
        _waiting.value = null
    }

    private const val KEEP_MS = 60 * 60 * 1000L
}
