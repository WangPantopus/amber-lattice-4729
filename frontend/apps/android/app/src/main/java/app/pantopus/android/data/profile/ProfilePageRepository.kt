package app.pantopus.android.data.profile

import app.pantopus.android.data.api.models.profile.ProfileShareDto
import app.pantopus.android.data.api.models.profile.ProfileShareLinkCreateBody
import app.pantopus.android.data.api.models.profile.ProfileShareLinkDto
import app.pantopus.android.data.api.models.profile.ProfileShareUpdateBody
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.ProfilePageApi
import app.pantopus.android.data.store.ScreenStore
import app.pantopus.android.data.store.StoreTopics
import app.pantopus.android.ui.screens.profile.sources.ProfileMonth
import app.pantopus.android.ui.screens.profile.sources.ProfilePage
import app.pantopus.android.ui.screens.profile.sources.mapProfileMonth
import app.pantopus.android.ui.screens.profile.sources.mapProfilePage
import com.squareup.moshi.Moshi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The profile with sources (`~/pantopus-profile-sources/CONTRACT.md`, frozen v1): the page for this viewer, one month
 * of the rings, and the owner's share parts. The page is never stored: the server composes it for each viewer, and a
 * block or a new connection changes it at once.
 */
@Singleton
class ProfilePageRepository
    @Inject
    constructor(
        private val api: ProfilePageApi,
        private val moshi: Moshi,
        private val store: ScreenStore,
    ) {
        /**
         * The page by account id or by username (a UUID reads `/id/:id`), as [audience] (`link`, `member`,
         * `connection`; the owner's Preview as) or as this viewer. A page with nothing to draw is a failure, so the
         * caller keeps today's screen.
         */
        suspend fun page(
            identifier: String,
            audience: String? = null,
        ): NetworkResult<ProfilePage> {
            val result =
                safeApiCall {
                    if (isUuid(identifier)) api.pageById(identifier, audience) else api.page(identifier.removePrefix("@"), audience)
                }
            return when (result) {
                is NetworkResult.Success ->
                    mapProfilePage(result.data, moshi)?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(NetworkError.NotFound)
                is NetworkResult.Failure -> result
            }
        }

        /** One month (`YYYY-MM`) of [userId]'s rings, as this viewer may see it (board 13). */
        suspend fun month(
            userId: String,
            month: String,
            audience: String? = null,
        ): NetworkResult<ProfileMonth> =
            when (val result = safeApiCall { api.month(userId, month, audience) }) {
                is NetworkResult.Success ->
                    mapProfileMonth(result.data)?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(NetworkError.NotFound)
                is NetworkResult.Failure -> result
            }

        /** The owner's parts, link and the page a visitor would see. */
        suspend fun share(): NetworkResult<ProfileShareDto> = safeApiCall { api.share() }

        /** Saves the main link's parts; the answer is the same as [share], read after the save. */
        suspend fun saveShare(body: ProfileShareUpdateBody): NetworkResult<ProfileShareDto> =
            safeApiCall { api.saveShare(body) }.also { if (it is NetworkResult.Success) store.markEdited(StoreTopics.PROFILE_ME) }

        fun visitorPage(share: ProfileShareDto): ProfilePage? = share.visitor?.let { mapProfilePage(it, moshi) }

        /** The page a link for one purpose opens (v1.3), exactly as a visitor gets it. */
        suspend fun pageByKey(
            username: String,
            key: String,
        ): NetworkResult<ProfilePage> =
            when (val result = safeApiCall { api.pageByKey(username, key) }) {
                is NetworkResult.Success ->
                    mapProfilePage(result.data, moshi)?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(NetworkError.NotFound)
                is NetworkResult.Failure -> result
            }

        /** Makes a link for one purpose (v1.3). */
        suspend fun createLink(body: ProfileShareLinkCreateBody): NetworkResult<ProfileShareLinkDto> = safeApiCall { api.createLink(body) }

        /**
         * Changes a link for one purpose (v1.3): only the keys given are sent; [clearEnd] sends `"ends_on": null`.
         */
        suspend fun updateLink(
            id: String,
            name: String? = null,
            parts: Map<String, Boolean>? = null,
            endsOn: String? = null,
            clearEnd: Boolean = false,
            switchedOff: Boolean? = null,
        ): NetworkResult<ProfileShareLinkDto> {
            val json = JSONObject()
            name?.let { json.put("name", it) }
            parts?.let { json.put("parts", JSONObject(it)) }
            when {
                clearEnd -> json.put("ends_on", JSONObject.NULL)
                endsOn != null -> json.put("ends_on", endsOn)
            }
            switchedOff?.let { json.put("switched_off", it) }
            val body = json.toString().toRequestBody(JSON)
            return safeApiCall { api.updateLink(id, body) }
        }

        suspend fun deleteLink(id: String): NetworkResult<Unit> = safeApiCall { api.deleteLink(id) }.let { result ->
            when (result) {
                is NetworkResult.Success -> NetworkResult.Success(Unit)
                is NetworkResult.Failure -> result
            }
        }

        private companion object {
            val JSON = "application/json; charset=utf-8".toMediaType()

            val UUID =
                Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)

            fun isUuid(value: String) = UUID.matches(value)
        }
    }
