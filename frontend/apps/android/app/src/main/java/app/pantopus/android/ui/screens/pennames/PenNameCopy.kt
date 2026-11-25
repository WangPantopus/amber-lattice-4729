package app.pantopus.android.ui.screens.pennames

/**
 * The words made-up names put on screen (contract `docs/product/made-up-names/README.md`, "What each app builds"); the
 * same on the web and the iPhone. On screen it is always "made-up name".
 */
object PenNameCopy {
    const val POST_AS = "Post as"
    const val OWN_DETAIL = "your name and profile"
    const val MADE_UP_DETAIL = "others can't see it's you"
    const val MARK = "Made-up name"
    const val VERIFIED_HOME = "Verified home nearby"
    const val ONLY_YOU = "Only you can see this is you"
    const val USE_THIS_NAME = "Use this name"
    const val SHUFFLE = "Shuffle"
    const val CHOOSE_TITLE = "Choose your made-up name"
    const val CHANGE_TITLE = "Change your made-up name"
    const val FIELD_LABEL = "The name you want"
    const val LEAVE_EMPTY = "Leave it empty and Pantopus gives you one:"
    const val A_MADE_UP_NAME = "A made-up name"
    const val OWN_NAME_FALLBACK = "Your name"

    /** The made-up option's name before the person has one. */
    const val SETTINGS_TITLE = "Made-up name"
    const val SETTINGS_NONE = "Post or reply nearby without your name. Pantopus still knows it's you."
    const val SETTINGS_CHANGE = "Change"
    const val SETTINGS_CHOOSE = "Choose one"

    /** Under the photo button while a made-up name is chosen (the server's own sentence when a photo is attached). */
    const val WORDS_ONLY = "A post under a made-up name is words only for now."
    const val WORDS_ONLY_WITH_PHOTO =
        "A post or reply under a made-up name is words only for now. Take the photo off, or post under your own name."

    /** The made-up choice on a kind of post that can't carry one (the server's `PEN_NAME_POST_TYPE` sentence). */
    const val NOT_THIS_KIND = "This kind of post can't be made under a made-up name. An Ask, a recommendation or an update can."

    /** The small card's note when an older server sends none. */
    const val CARD_NOTE = "A made-up name. Pantopus knows who this is and holds them to the same rules as everyone."

    const val MUTE = "Mute"
    const val UNMUTE = "Unmute"
    const val BLOCK = "Block"
    const val UNBLOCK = "Unblock"
    const val REPORT = "Report"

    fun postingAs(name: String): String = "Posting as $name"

    fun replyingAs(name: String): String = "Replying as $name"

    fun postAsButton(name: String): String = "Post as $name"

    fun you(name: String): String = "$name (you)"

    fun muted(name: String): String = "Muted $name."

    fun unmuted(name: String): String = "Unmuted $name."

    fun blocked(name: String): String = "Blocked $name."

    fun unblocked(name: String): String = "Unblocked $name."
}

/** The badge the server puts on a made-up name whose writer has a verified home near the post. */
const val PEN_NAME_BADGE_VERIFIED_HOME = "verified_home"
