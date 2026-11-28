package app.pantopus.android.sharein

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.net.Uri
import androidx.core.app.Person
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import app.pantopus.android.MainActivity
import app.pantopus.android.R

/*
 * Pantopus in the top row of Android's share sheet (founder, 2026-11-27). Android orders that row itself, by what the
 * person uses; what an app does to be offered there is publish sharing shortcuts. Pantopus publishes one for each
 * place a shared thing can go (Moment, Pulse, Message) and one for each chat the person sends a message in. A tap on
 * one opens ShareInActivity with the shortcut's id, and it goes straight there without the cards. They are ordinary
 * dynamic shortcuts: ones hidden from the launcher are kept apart by Android 13 and later and never reach the share
 * sheet (tried 2026-11-27). The app icon's long-press lists the app's five own actions first, which fill that menu.
 * Signing out removes them all.
 */
object ShareInShortcuts {
    /** The category `res/xml/shortcuts.xml` names for ShareInActivity's share targets. */
    const val CATEGORY = "app.pantopus.android.sharein.category.SHARE_TARGET"

    private const val DESTINATION_PREFIX = "sharein_to_"
    private const val CHAT_PREFIX = "sharein_chat_"
    private const val ICON_PX = 192
    private const val MOST_CHATS = 4

    /** The destination a shortcut's id names; null for any other id. */
    fun destination(shortcutId: String?): ShareInDestination? =
        shortcutId?.takeIf { it.startsWith(DESTINATION_PREFIX) }?.removePrefix(DESTINATION_PREFIX)?.let { tag ->
            ShareInDestination.entries.firstOrNull { it.tag == tag }
        }

    /** The chat a shortcut's id names, with the name the shortcut shows; null for any other id. */
    fun chat(
        context: Context,
        shortcutId: String?,
    ): ShareInChat? {
        val parts = shortcutId?.takeIf { it.startsWith(CHAT_PREFIX) }?.removePrefix(CHAT_PREFIX)?.split(':', limit = 2)
        if (parts?.size != 2) return null
        val name =
            ShortcutManagerCompat.getDynamicShortcuts(context).firstOrNull { it.id == shortcutId }?.shortLabel?.toString()
                ?: return null
        return ShareInChat(kind = parts[0], id = parts[1], name = name)
    }

    /** The places this account can share to, in the cards' order. Run when the tabs open and when a switch changes. */
    fun publish(
        context: Context,
        destinations: List<ShareInDestination>,
    ) {
        val gone = ShareInDestination.entries.filterNot { it in destinations }.map { DESTINATION_PREFIX + it.tag }
        if (gone.isNotEmpty()) runCatching { ShortcutManagerCompat.removeLongLivedShortcuts(context, gone) }
        destinations.forEachIndexed { index, destination ->
            // Each by itself: a phone that takes no more shortcuts refuses one without losing the others.
            runCatching {
                val shortcut =
                    ShortcutInfoCompat.Builder(context, DESTINATION_PREFIX + destination.tag)
                        .setShortLabel(destination.title)
                        .setLongLabel(destination.spoken)
                        .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
                        .setIntent(open(context))
                        .setCategories(setOf(CATEGORY))
                        .setLongLived(true)
                        .setRank(index)
                        .build()
                ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
            }
        }
    }

    /** A message was sent in a chat: the share sheet may offer that chat by name. */
    fun chatUsed(
        context: Context,
        kind: String,
        id: String,
        name: String,
    ) {
        if (id.isBlank() || name.isBlank()) return
        runCatching {
            val icon = IconCompat.createWithBitmap(initials(name))
            val shortcut =
                ShortcutInfoCompat.Builder(context, "$CHAT_PREFIX$kind:$id")
                    .setShortLabel(name)
                    .setIcon(icon)
                    .setIntent(open(context))
                    .setCategories(setOf(CATEGORY))
                    .setLongLived(true)
                    .setPerson(Person.Builder().setName(name).setIcon(icon).build())
                    .build()
            // The newest chats only: the ones sent in longest ago go.
            val chats = ShortcutManagerCompat.getDynamicShortcuts(context).filter { it.id.startsWith(CHAT_PREFIX) && it.id != shortcut.id }
            if (chats.size >= MOST_CHATS) {
                ShortcutManagerCompat.removeLongLivedShortcuts(context, chats.dropLast(MOST_CHATS - 1).map { it.id })
            }
            ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
        }
    }

    /** Nobody is signed in: the share sheet offers none of the last account's places or chats. */
    fun clear(context: Context) {
        runCatching {
            val mine =
                ShortcutManagerCompat.getDynamicShortcuts(context)
                    .filter { it.id.startsWith(DESTINATION_PREFIX) || it.id.startsWith(CHAT_PREFIX) }
                    .map { it.id }
            if (mine.isNotEmpty()) ShortcutManagerCompat.removeLongLivedShortcuts(context, mine)
        }
    }

    /** Every shortcut must carry an intent; nothing but the share sheet shows these, and it opens ShareInActivity. */
    private fun open(context: Context): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse("pantopus://today"), context, MainActivity::class.java)

    /** A chat's circle: the name's first letters on Pantopus blue. */
    private fun initials(name: String): Bitmap {
        val letters = name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }
        val bitmap = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = BLUE
        canvas.drawCircle(ICON_PX / 2f, ICON_PX / 2f, ICON_PX / 2f, paint)
        paint.color = android.graphics.Color.WHITE
        paint.textAlign = Paint.Align.CENTER
        paint.textSize = ICON_PX * LETTER_SCALE
        paint.isFakeBoldText = true
        canvas.drawText(letters, ICON_PX / 2f, ICON_PX / 2f - (paint.descent() + paint.ascent()) / 2f, paint)
        return bitmap
    }

    /** `PantopusColors.primary600`. */
    private const val BLUE = 0xFF0369A1.toInt()
    private const val LETTER_SCALE = 0.4f
}
