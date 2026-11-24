package app.pantopus.android.data.ai

import app.pantopus.android.core.LaunchFeatures
import app.pantopus.android.data.api.models.mail_compose.MailRecipientDto
import org.json.JSONObject

/**
 * A draft the assistant wrote for one of the app's own composers (Pantopus AI everywhere contract, section 4): a
 * Moment, a letter or a Christmas card. The chat only shows it; its button opens the composer with these values set,
 * and the person sends it there with that screen's own button.
 */
sealed interface AIComposerDraft {
    /** `moment`: a text card (its words and background), or a photo or video the person takes in the composer. */
    data class Moment(
        /** Kind `photo`: the composer opens on its camera; else on the text card. */
        val photo: Boolean,
        val text: String? = null,
        /** `teal`, `sky`, `green`, `amber`, `rose` or `slate`. */
        val background: String? = null,
        /** Kind `photo`: what goes under the photo or video. */
        val caption: String? = null,
        /** 1, 6, 24 or 48. */
        val hours: Int? = null,
        /** `nearby` or `connections`. */
        val audience: String? = null,
    ) : AIComposerDraft

    /** `letter`: who it is to (one row of the wizard's own recipient search), the kind of letter and the letter. */
    data class Letter(
        val recipient: MailRecipientDto,
        /** `say_hello`, `congratulations`, `condolences`, `business_note` or `just_because`. */
        val intent: String? = null,
        val body: String,
    ) : AIComposerDraft

    /** `christmas_card`: the picture, who it is to (a person, or an address by email), the note and the arrival. */
    data class ChristmasCard(
        val design: String,
        /** The words printed under the picture. */
        val caption: String? = null,
        val toUserId: String? = null,
        val toName: String? = null,
        val toEmail: String? = null,
        val message: String,
        /** `next_morning`, `sealed_christmas`, `christmas_morning` or, by email, `now`. */
        val arrival: String? = null,
        /** The arrival in words ("On Christmas morning"). */
        val arrivalLabel: String? = null,
        /** A sentence saying the arrival asked for has closed, when it has. */
        val arrivalChanged: String? = null,
    ) : AIComposerDraft

    companion object {
        /**
         * The names this build adds to the chat's `cards` (contract section 3): each says the build opens that draft
         * in its composer, so a build with letters or Christmas cards off never lists theirs.
         */
        fun cardNames(): List<String> =
            buildList {
                add("moment")
                if (LaunchFeatures.mailbox && LaunchFeatures.mailExtras) add("letter")
                if (LaunchFeatures.mailbox && LaunchFeatures.holidayCards) add("christmas_card")
            }

        /** The draft of a `moment`, `letter` or `christmas_card` card; null for any other type, or one that can't be opened. */
        fun of(
            type: String,
            draft: JSONObject,
        ): AIComposerDraft? =
            when (type) {
                "moment" -> moment(draft)
                "letter" -> letter(draft)
                "christmas_card" -> christmasCard(draft)
                else -> null
            }

        private fun moment(draft: JSONObject): Moment? {
            val photo = draft.words("kind") == "photo"
            val text = draft.words("text")
            if (!photo && text == null) return null
            return Moment(
                photo = photo,
                text = text.takeIf { !photo },
                background = draft.words("background"),
                caption = draft.words("caption").takeIf { photo },
                hours = draft.optInt("hours", 0).takeIf { it > 0 },
                audience = draft.words("audience"),
            )
        }

        private fun letter(draft: JSONObject): Letter? {
            val to = draft.optJSONObject("recipient") ?: return null
            val userId = to.words("userId") ?: return null
            val body = draft.words("body") ?: return null
            return Letter(
                recipient =
                    MailRecipientDto(
                        userId = userId,
                        name = to.words("name"),
                        username = to.words("username"),
                        homeId = to.words("homeId"),
                        homeAddress = to.words("homeAddress"),
                        isVerified = to.flag("isVerified"),
                        homeMediaUrl = to.words("homeMediaUrl"),
                        isOnPantopus = to.flag("isOnPantopus"),
                    ),
                intent = draft.words("intent"),
                body = body,
            )
        }

        private fun christmasCard(draft: JSONObject): ChristmasCard? {
            val design = draft.optJSONObject("design")
            val id = design?.words("id") ?: return null
            val to = draft.optJSONObject("to")
            val userId = to?.words("user_id")
            val email = to?.words("email").takeIf { userId == null }
            val message = draft.words("message")
            if (message == null || (userId == null && email == null)) return null
            return ChristmasCard(
                design = id,
                caption = design.words("caption"),
                toUserId = userId,
                toName = to?.words("name").takeIf { userId != null },
                toEmail = email,
                message = message,
                arrival = draft.words("arrival"),
                arrivalLabel = draft.words("arrival_label"),
                arrivalChanged = draft.words("arrival_changed"),
            )
        }

        /** A text field, or null when it is missing, blank or JSON null (`optString` reads JSON null as "null"). */
        private fun JSONObject.words(name: String): String? = if (isNull(name)) null else optString(name).trim().ifEmpty { null }

        private fun JSONObject.flag(name: String): Boolean? = if (isNull(name)) null else optBoolean(name)
    }
}

/**
 * Hands a draft from the chat to the composer its button opens. A letter runs to 4,000 characters, too long for a
 * route, so the draft stays here in memory and only its short id rides the route ([KEY]); the composer's view-model
 * reads it as it opens. After Android restarts the app the id finds nothing and the composer opens as usual.
 */
object AIComposerDrafts {
    /** The nav argument carrying a kept draft's id. */
    const val KEY = "aiDraft"

    /** The last few drafts opened: enough for the composers on the back stack. */
    private const val KEPT = 8

    private val kept = LinkedHashMap<String, AIComposerDraft>()

    /** Keeps [draft] for the composer about to open; the id goes in its route. */
    @Synchronized
    fun keep(draft: AIComposerDraft): String {
        val id = java.util.UUID.randomUUID().toString()
        kept[id] = draft
        while (kept.size > KEPT) kept.remove(kept.keys.first())
        return id
    }

    /** The draft kept under [id]; null for no id, or one from before the app restarted. */
    @Synchronized
    fun find(id: String?): AIComposerDraft? = id?.takeIf { it.isNotBlank() }?.let { kept[it] }
}
