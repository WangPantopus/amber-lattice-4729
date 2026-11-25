package app.pantopus.android.data.pennames

import app.pantopus.android.data.api.models.feed.FeedMuteEntityType
import app.pantopus.android.data.api.models.pennames.PenNameCardDto
import app.pantopus.android.data.api.models.pennames.PenNameCheckResponse
import app.pantopus.android.data.api.models.pennames.PenNameDto
import app.pantopus.android.data.api.models.pennames.PenNameMeResponse
import app.pantopus.android.data.api.models.pennames.TakePenNameRequest
import app.pantopus.android.data.api.models.posts.PenNamePostsResponse
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.PenNamesApi
import app.pantopus.android.data.feed.FeedModerationStore
import app.pantopus.android.data.store.ScreenStore
import app.pantopus.android.data.store.StoreTopics
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A made-up-name refusal from the server (`{ error, code }`, contract "Refusal codes"): [message] is shown as it is.
 * [code] decides what the app does next ([NEEDED] opens the name screen).
 */
data class PenNameRefusal(
    val code: String,
    val message: String,
) {
    companion object {
        const val NEEDED = "PEN_NAME_NEEDED"
        const val TOO_SOON = "PEN_NAME_TOO_SOON"
        const val ONE_VOICE = "PEN_NAME_ONE_VOICE"

        /** The made-up-name refusal a failed call carries, or null when it isn't one. */
        fun from(error: NetworkError): PenNameRefusal? {
            val body =
                when (error) {
                    is NetworkError.Forbidden -> error.body
                    is NetworkError.ClientError -> error.body
                    is NetworkError.Server -> error.body
                    else -> null
                } ?: return null
            val json = runCatching { org.json.JSONObject(body) }.getOrNull() ?: return null
            val code = json.optString("code")
            val message = json.optString("error")
            if (!code.startsWith("PEN_NAME") || message.isBlank()) return null
            return PenNameRefusal(code, message)
        }
    }
}

/**
 * Made-up names: the person's own (read fresh by each screen that offers it, so a second account on the phone never
 * sees the first one's), the small card, mute and block. Mute and block also hide the name's rows here at once ([FeedModerationStore], as a muted
 * author's), and mark the post lists out of date so they read again without them.
 */
@Singleton
class PenNamesRepository
    @Inject
    constructor(
        private val api: PenNamesApi,
        private val store: ScreenStore,
        private val moderation: FeedModerationStore,
    ) {
        /** The last `/me` this phone read, and whose it was: a second account never sees the first one's. */
        @Volatile private var lastMe: Pair<String, PenNameMeResponse>? = null

        /** [userId]'s made-up name as last read on this phone, at once; null when it hasn't been read this run. */
        fun peekMe(userId: String?): PenNameMeResponse? = lastMe?.takeIf { userId != null && it.first == userId }?.second

        /** `GET /api/pen-names/me`; kept for [peekMe] under [userId]. */
        suspend fun loadMe(userId: String? = null): NetworkResult<PenNameMeResponse> =
            safeApiCall { api.me() }.also { result ->
                if (result is NetworkResult.Success && userId != null) lastMe = userId to result.data
            }

        /** `POST /api/pen-names`: [name] blank lets Pantopus give one; [replace] gives up the name in use. */
        suspend fun take(
            name: String?,
            replace: Boolean = false,
        ): NetworkResult<PenNameDto> {
            val request = TakePenNameRequest(name = name?.trim()?.ifEmpty { null }, replace = replace.takeIf { it })
            return when (val result = safeApiCall { api.take(request) }) {
                is NetworkResult.Success -> {
                    val taken = result.data.penName ?: return NetworkResult.Failure(NetworkError.RetriesExhausted)
                    lastMe = lastMe?.let { (owner, me) -> owner to me.copy(penName = taken, suggestions = emptyList()) }
                    NetworkResult.Success(taken)
                }
                is NetworkResult.Failure -> result
            }
        }

        /** `GET /api/pen-names/suggestions`. */
        suspend fun suggestions(): NetworkResult<List<String>> =
            when (val result = safeApiCall { api.suggestions() }) {
                is NetworkResult.Success -> NetworkResult.Success(result.data.suggestions)
                is NetworkResult.Failure -> result
            }

        /** `GET /api/pen-names/check`. */
        suspend fun check(
            latitude: Double,
            longitude: Double,
        ): NetworkResult<PenNameCheckResponse> = safeApiCall { api.check(latitude, longitude) }

        /** `GET /api/pen-names/me/posts`. */
        suspend fun myPosts(
            before: String?,
            limit: Int,
        ): NetworkResult<PenNamePostsResponse> = safeApiCall { api.myPosts(before, limit) }

        /** `GET /api/pen-names/:id`. */
        suspend fun card(id: String): NetworkResult<PenNameCardDto> =
            when (val result = safeApiCall { api.card(id) }) {
                is NetworkResult.Success -> NetworkResult.Success(result.data.penName)
                is NetworkResult.Failure -> result
            }

        /** Mute ([on]) or show again. */
        suspend fun setMuted(
            id: String,
            on: Boolean,
        ): NetworkResult<Unit> = hiding(id, on) { if (on) api.mute(id) else api.unmute(id) }

        /** Block ([on]) or unblock. */
        suspend fun setBlocked(
            id: String,
            on: Boolean,
        ): NetworkResult<Unit> = hiding(id, on) { if (on) api.block(id) else api.unblock(id) }

        private suspend fun hiding(
            id: String,
            on: Boolean,
            call: suspend () -> Unit,
        ): NetworkResult<Unit> {
            val result = safeApiCall { call() }
            if (result is NetworkResult.Success) {
                // A made-up name's rows carry its id where an author's id goes, so the feed's mute layer hides them.
                if (on) moderation.addMute(FeedMuteEntityType.User, id) else moderation.removeMute(FeedMuteEntityType.User, id)
                store.markEdited(StoreTopics.POSTS)
            }
            return result
        }
    }
